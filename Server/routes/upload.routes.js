const express = require('express');
const router = express.Router();
const { 
  uploadToS3, 
  getFileUrl, 
  listFiles, 
  deleteFile, 
  uploadGeneric 
} = require('../controllers/upload.controller');
const { authenticateToken } = require('../middleware/auth');

// Routes pour l'upload de fichiers
router.post('/image', authenticateToken, uploadToS3);
router.post('/video', authenticateToken, uploadToS3);
router.post('/generic', authenticateToken, uploadGeneric);

// Routes pour la gestion des fichiers
router.get('/url/:key', authenticateToken, getFileUrl);
router.get('/list', authenticateToken, listFiles);
router.delete('/:key', authenticateToken, deleteFile);

module.exports = router; 