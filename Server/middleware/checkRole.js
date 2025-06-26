const { docClient, dynamoConfig } = require('../config/awsConfig');

const checkRole = async (req, res, next) => {
  try {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'ROLE_REQUIRED',
        redirectTo: '/role-selection'
      });
    }

    // Ajouter le rôle à la requête pour l'utiliser dans les routes
    req.userRole = req.user.role;
    next();
  } catch (error) {
    console.error('Error checking user role:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking user role',
      error: error.message
    });
  }
};

module.exports = checkRole; 