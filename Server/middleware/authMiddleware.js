const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { cognitoConfig, dynamoConfig, docClient } = require('../config/awsConfig');

// Configuration du client JWKS
const client = jwksClient({
  jwksUri: `https://cognito-idp.${process.env.REACT_APP_AWS_REGION}.amazonaws.com/${cognitoConfig.userPoolId}/.well-known/jwks.json`
});

// Fonction pour obtenir la clé publique
const getKey = (header, callback) => {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
};

// Middleware d'authentification
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ message: 'Token d\'authentification manquant' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token d\'authentification manquant' });
    }

    // Vérification du token
    jwt.verify(token, getKey, {
      algorithms: ['RS256'],
      issuer: `https://cognito-idp.${process.env.REACT_APP_AWS_REGION}.amazonaws.com/${cognitoConfig.userPoolId}`,
      audience: cognitoConfig.clientId
    }, async (err, decoded) => {
      if (err) {
        console.error('Erreur de vérification du token:', err.message);
        return res.status(401).json({ 
          message: 'Token invalide',
          error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }

      // Récupération de l'utilisateur avec son rôle
      const params = {
        TableName: dynamoConfig.tables.user,
        Key: {
          id: decoded.sub
        },
        ProjectionExpression: 'id, email, username, #userRole',
        ExpressionAttributeNames: {
          '#userRole': 'role'
        }
      };

      const { Item: user } = await docClient.get(params).promise();

      if (!user) {
        // Au lieu de retourner une erreur, on continue avec les informations du token
        req.user = {
          id: decoded.sub,
          email: decoded.email,
          username: decoded['cognito:username'] || decoded.email,
          groups: decoded['cognito:groups'] || []
        };
      } else {
        req.user = {
          ...user,
          id: user.id || decoded.sub,
          groups: decoded['cognito:groups'] || []
        };
      }

      next();
    });
  } catch (error) {
    console.error('Erreur dans le middleware d\'authentification:', error.message);
    
    res.status(500).json({ 
      message: 'Erreur lors de la vérification du token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Middleware de vérification des rôles
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const hasRole = roles.some(role => req.user.groups.includes(role));
    if (!hasRole) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  checkRole
}; 