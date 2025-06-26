const { Amplify } = require('aws-amplify');
const { uploadData, getUrl, remove } = require('aws-amplify/storage');
const { v4: uuidv4 } = require('uuid');
const Post = require('../models/post.model');
const { buildPostMediaKey } = require('../utils/s3Utils');
const { socketService } = require('../services/socket.service');
const { s3Config } = require('../config/awsConfig');

// Configuration d'Amplify pour S3
Amplify.configure({
  Storage: {
    AWSS3: {
      bucket: s3Config.bucket,
      region: s3Config.region
    }
  }
});

// Fonction utilitaire pour construire l'URL S3
const buildS3Url = (key) => {
  const bucket = s3Config.bucket;
  const region = s3Config.region;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

console.log('=== POST CONTROLLER S3 CONFIG ===');
console.log('S3 Bucket:', s3Config.bucket);
console.log('S3 Region:', s3Config.region);
console.log('================================');

// Récupérer les posts avec pagination
exports.getPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10, stylistId } = req.query;
    const { posts, total } = await Post.find(
      stylistId ? { stylistId } : {},
      { page: parseInt(page), limit: parseInt(limit) }
    );

    // S'assurer que tous les posts ont l'URL dans leur média
    const postsWithUrls = posts.map(post => {
      if (post.media && post.media.key && !post.media.url) {
        return {
          ...post,
          media: {
            ...post.media,
            url: buildS3Url(post.media.key)
          }
        };
      }
      return post;
    });

    res.json({
      success: true,
      data: {
        posts: postsWithUrls,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting posts:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des posts'
    });
  }
};

// Créer un nouveau post
exports.createPost = async (req, res) => {
  try {
    const { content, media } = req.body;

    console.log('=== CREATE POST ===');
    console.log('Content:', content);
    console.log('Media object:', JSON.stringify(media, null, 2));
    console.log('User:', req.user.id);
    console.log('==================');

    const post = await Post.create({
      id: uuidv4(),
      content,
      stylistId: req.user.id,
      stylistName: req.user.name || req.user.pseudo,
      stylistAvatar: req.user.avatar,
      media: media ? { 
        type: media.type, 
        key: media.key,
        url: buildS3Url(media.key)
      } : undefined
    });

    console.log('Post created with media key:', media?.key);

    // Émettre le nouveau post via WebSocket
    socketService.emitNewPost(post);

    res.status(201).json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du post'
    });
  }
};

// Mettre à jour un post
exports.updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, media } = req.body;

    console.log('=== UPDATE POST ===');
    console.log('Post ID:', postId);
    console.log('Content:', content);
    console.log('Media:', media);
    console.log('==================');

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    if (post.stylistId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à modifier ce post'
      });
    }

    const updateData = {};
    if (content) updateData.content = content;
    if (media) {
      updateData.media = { 
        type: media.type, 
        key: media.key,
        url: buildS3Url(media.key)
      };
    }

    const updatedPost = await Post.update(postId, updateData);

    res.json({
      success: true,
      data: updatedPost
    });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du post'
    });
  }
};

// Supprimer un post
exports.deletePost = async (req, res) => {
  try {
    const { postId } = req.params;

    console.log('=== DELETE POST ===');
    console.log('Post ID:', postId);
    console.log('==================');

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    if (post.stylistId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à supprimer ce post'
      });
    }

    // Supprimer le média associé s'il existe
    if (post.media && post.media.key) {
      try {
        await remove({ key: post.media.key });
        console.log('Media deleted from S3:', post.media.key);
      } catch (s3Error) {
        console.error('Error deleting media from S3:', s3Error);
        // On continue même si la suppression S3 échoue
      }
    }

    await Post.delete(postId);

    res.json({
      success: true,
      message: 'Post supprimé avec succès'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du post'
    });
  }
};

// Liker/Unliker un post
exports.likePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    const likeIndex = post.likes.indexOf(userId);
    const newLikes = [...post.likes];
    if (likeIndex === -1) {
      newLikes.push(userId);
    } else {
      newLikes.splice(likeIndex, 1);
    }

    const updatedPost = await Post.update(postId, { likes: newLikes });

    // Émettre le like via WebSocket
    socketService.emitPostLiked(postId, newLikes, userId);

    res.json({
      success: true,
      data: {
        likes: updatedPost.likes
      }
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du like du post'
    });
  }
};

// Ajouter un commentaire
exports.addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    console.log('=== ADD COMMENT ===');
    console.log('Post ID:', postId);
    console.log('Content:', content);
    console.log('User:', req.user.id);
    console.log('==================');

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    const newComment = {
      id: Date.now().toString(),
      content: content.trim(),
      userId: req.user.id,
      userName: req.user.name || req.user.pseudo || req.user.email || 'Utilisateur',
      userAvatar: req.user.avatar,
      createdAt: new Date().toISOString()
    };

    const updatedPost = await Post.update(postId, {
      comments: [...post.comments, newComment]
    });

    // Émettre le nouveau commentaire via WebSocket
    socketService.emitNewComment(postId, newComment);

    res.status(201).json({
      success: true,
      comment: newComment
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'ajout du commentaire'
    });
  }
};

// Supprimer un commentaire
exports.deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    console.log('=== DELETE COMMENT ===');
    console.log('Post ID:', postId);
    console.log('Comment ID:', commentId);
    console.log('User:', req.user.id);
    console.log('=====================');

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Commentaire non trouvé'
      });
    }

    if (comment.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à supprimer ce commentaire'
      });
    }

    const updatedComments = post.comments.filter(c => c.id !== commentId);
    await Post.update(postId, { comments: updatedComments });

    // Émettre la suppression du commentaire via WebSocket
    socketService.emitCommentDeleted(postId, commentId);

    res.json({
      success: true,
      message: 'Commentaire supprimé avec succès'
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du commentaire'
    });
  }
};

// Récupérer les commentaires d'un post
exports.getComments = async (req, res) => {
  try {
    const { postId } = req.params;

    console.log('=== GET COMMENTS ===');
    console.log('Post ID:', postId);
    console.log('===================');

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    res.json({
      success: true,
      comments: post.comments || []
    });
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des commentaires'
    });
  }
}; 