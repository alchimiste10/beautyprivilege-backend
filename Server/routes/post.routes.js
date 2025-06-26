const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const postController = require('../controllers/post.controller');

// Protéger toutes les routes avec l'authentification
router.use(authenticateToken);

// Routes pour les posts
router.get('/', postController.getPosts);
router.post('/', postController.createPost);
router.put('/:postId', postController.updatePost);
router.delete('/:postId', postController.deletePost);

// Routes pour les likes
router.post('/:postId/like', postController.likePost);

// Routes pour les commentaires
router.get('/:postId/comments', postController.getComments);
router.post('/:postId/comments', postController.addComment);
router.delete('/:postId/comments/:commentId', postController.deleteComment);

module.exports = router; 