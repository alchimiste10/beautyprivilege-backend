const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { cognitoConfig } = require('../config/awsConfig');

const verifier = CognitoJwtVerifier.create({
  userPoolId: cognitoConfig.userPoolId,
  tokenUse: 'id',
  clientId: cognitoConfig.clientId,
});

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token d\'authentification manquant' });
  }

  try {
    const payload = await verifier.verify(token);
    
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload['custom:role'] || 'client'
    };
    next();
  } catch (error) {
    console.error('Erreur d\'authentification:', error.message);
    return res.status(403).json({ 
      message: 'Token invalide',
      error: error.message
    });
  }
};

module.exports = {
  authenticateToken
}; 