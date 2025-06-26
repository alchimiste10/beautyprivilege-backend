const { v4: uuidv4 } = require('uuid');
const { s3, s3Config } = require('../config/awsConfig');
const { getUrl, list, remove } = require('aws-amplify/storage');

// Fonction utilitaire pour construire l'URL S3
const buildS3Url = (key) => {
  const bucket = s3Config.bucket;
  const region = s3Config.region;
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  
  console.log('=== BUILD S3 URL ===');
  console.log('Key:', key);
  console.log('Bucket:', bucket);
  console.log('Region:', region);
  console.log('Generated URL:', url);
  console.log('====================');
  
  return url;
};

// Upload de fichier vers S3
exports.uploadToS3 = async (req, res) => {
  try {
    const file = req.body.file;
    console.log('=== UPLOAD S3 ===');
    console.log('File received:', file ? 'Yes' : 'No');
    console.log('File length:', file?.length);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier n\'a été uploadé' });
    }

    const fileType = req.path === '/image' ? 'image' : 'video';
    const fileExtension = fileType === 'image' ? 'webp' : 'mp4';
    const fileName = `${uuidv4()}.${fileExtension}`;
    const folder = fileType === 'image' ? 'images' : 'videos';
    const key = `public/${folder}/${fileName}`;

    console.log('File type:', fileType);
    console.log('Key:', key);
    console.log('Bucket:', s3Config.bucket);
    console.log('================');

    // Décoder le base64
    const buffer = Buffer.from(file, 'base64');
    console.log('Buffer size:', buffer.length);

    // Upload du fichier avec AWS SDK
    const uploadParams = {
      Bucket: s3Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: fileType === 'image' ? 'image/webp' : 'video/mp4'
    };

    const result = await s3.upload(uploadParams).promise();

    console.log('Upload successful, key:', result.Key);

    res.status(200).json({
      success: true,
      key: result.Key,
      type: fileType,
      filename: fileName
    });

  } catch (error) {
    console.error('=== ERREUR UPLOAD S3 ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body length:', req.body?.file?.length);
    console.error('========================');
    
    res.status(500).json({ 
      error: 'Erreur lors de l\'upload du fichier',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Récupérer l'URL d'un fichier
exports.getFileUrl = async (req, res) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({ error: 'Clé du fichier manquante' });
    }

    console.log('=== GET URL S3 ===');
    console.log('Key:', key);
    console.log('==================');

    const urlResult = await getUrl({
      key: key
    });

    res.status(200).json({
      success: true,
      url: urlResult.url.toString(),
      key: key
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de l\'URL:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération de l\'URL',
      details: error.message 
    });
  }
};

// Lister les fichiers dans un dossier
exports.listFiles = async (req, res) => {
  try {
    const { prefix = '' } = req.query;
    
    console.log('=== LIST S3 ===');
    console.log('Prefix:', prefix);
    console.log('===============');

    const result = await list({
      prefix: prefix
    });

    const files = result.results.map(item => ({
      key: item.key,
      size: item.size,
      lastModified: item.lastModified,
      eTag: item.eTag
    }));

    res.status(200).json({
      success: true,
      files: files,
      count: files.length
    });

  } catch (error) {
    console.error('Erreur lors de la liste des fichiers:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la liste des fichiers',
      details: error.message 
    });
  }
};

// Supprimer un fichier
exports.deleteFile = async (req, res) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({ error: 'Clé du fichier manquante' });
    }

    console.log('=== DELETE S3 ===');
    console.log('Key:', key);
    console.log('=================');

    await remove({ key: key });

    res.status(200).json({
      success: true,
      message: 'Fichier supprimé avec succès',
      key: key
    });

  } catch (error) {
    console.error('Erreur lors de la suppression du fichier:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression du fichier',
      details: error.message 
    });
  }
};

// Upload de fichier générique (pour posts, profils, etc.)
exports.uploadGeneric = async (req, res) => {
  try {
    const { file, folder = 'uploads', type = 'image' } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier n\'a été uploadé' });
    }

    const fileExtension = type === 'image' ? 'webp' : 'mp4';
    const fileName = `${uuidv4()}.${fileExtension}`;
    const key = `public/${folder}/${fileName}`;

    console.log('=== UPLOAD GENERIC S3 ===');
    console.log('Folder:', folder);
    console.log('Type:', type);
    console.log('Key:', key);
    console.log('Bucket:', s3Config.bucket);
    console.log('========================');

    // Décoder le base64
    const buffer = Buffer.from(file, 'base64');

    // Upload du fichier avec AWS SDK
    const uploadParams = {
      Bucket: s3Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: type === 'image' ? 'image/webp' : 'video/mp4'
    };

    const result = await s3.upload(uploadParams).promise();

    // Construire l'URL complète
    const url = buildS3Url(result.Key);

    res.status(200).json({
      success: true,
      key: result.Key,
      url: url,
      type: type,
      filename: fileName,
      folder: folder
    });

  } catch (error) {
    console.error('Erreur lors de l\'upload générique vers S3:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'upload du fichier',
      details: error.message 
    });
  }
}; 