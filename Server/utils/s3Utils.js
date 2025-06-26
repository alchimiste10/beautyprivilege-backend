const { v4: uuidv4 } = require('uuid');

/**
 * Construit une clé S3 pour les posts
 * @param {string} stylistId - ID du stylist
 * @param {string} mediaType - Type de média (image/video)
 * @param {string} fileExtension - Extension du fichier
 * @returns {string} Clé S3
 */
const buildPostMediaKey = (stylistId, mediaType, fileExtension) => {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const uniqueId = uuidv4().split('-')[0]; // Première partie de l'UUID
  const extension = fileExtension.startsWith('.') ? fileExtension : `.${fileExtension}`;
  
  return `posts/${stylistId}/${timestamp}/${mediaType}_${uniqueId}${extension}`;
};

/**
 * Construit une clé S3 pour les avatars de stylists
 * @param {string} stylistId - ID du stylist
 * @param {string} fileExtension - Extension du fichier
 * @returns {string} Clé S3
 */
const buildStylistAvatarKey = (stylistId, fileExtension) => {
  const extension = fileExtension.startsWith('.') ? fileExtension : `.${fileExtension}`;
  return `stylists/${stylistId}/avatar${extension}`;
};

/**
 * Construit une clé S3 pour les photos de salons
 * @param {string} salonId - ID du salon
 * @param {string} fileExtension - Extension du fichier
 * @returns {string} Clé S3
 */
const buildSalonPhotoKey = (salonId, fileExtension) => {
  const timestamp = new Date().toISOString().split('T')[0];
  const uniqueId = uuidv4().split('-')[0];
  const extension = fileExtension.startsWith('.') ? fileExtension : `.${fileExtension}`;
  
  return `salons/${salonId}/${timestamp}/photo_${uniqueId}${extension}`;
};

/**
 * Extrait les informations d'une clé S3 de post
 * @param {string} key - Clé S3
 * @returns {object} Informations extraites
 */
const parsePostMediaKey = (key) => {
  const parts = key.split('/');
  if (parts.length < 4) return null;
  
  return {
    stylistId: parts[1],
    date: parts[2],
    filename: parts[3],
    mediaType: parts[3].split('_')[0]
  };
};

/**
 * Génère une URL signée pour un fichier S3
 * @param {string} key - Clé S3
 * @param {number} expiresIn - Durée d'expiration en secondes (défaut: 3600)
 * @returns {string} URL signée
 */
const generateSignedUrl = async (key, expiresIn = 3600) => {
  // Cette fonction sera implémentée avec AWS SDK
  // Pour l'instant, on utilise Amplify Storage
  return null;
};

module.exports = {
  buildPostMediaKey,
  buildStylistAvatarKey,
  buildSalonPhotoKey,
  parsePostMediaKey,
  generateSignedUrl
}; 