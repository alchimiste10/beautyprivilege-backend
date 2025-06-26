const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { docClient, dynamoConfig } = require('../config/awsConfig');
const User = require('../models/user.model');
const { authMiddleware, checkRole } = require('../middleware/authMiddleware');

// Récupérer le rôle d'un utilisateur
router.get('/role', authMiddleware, async (req, res) => {
  try {
    const params = {
      TableName: dynamoConfig.tables.user,
      Key: {
        id: req.user.id
      }
    };

    console.log('Recherche de l\'utilisateur avec les paramètres:', params);

    const { Item } = await docClient.get(params).promise();
    console.log('Utilisateur trouvé:', Item);

    if (!Item) {
      // Si l'utilisateur n'existe pas, retourner 404 pour que le client gère la création
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    res.json({ role: Item.role });
  } catch (error) {
    console.error('Erreur complète:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// Mettre à jour le rôle d'un utilisateur
router.put('/role', authMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    let user = await User.getById(docClient, req.user.id);
    
    if (!user) {
      // Créer un nouvel utilisateur avec le rôle sélectionné
      const newUser = {
        id: req.user.id,
        email: req.user.email,
        username: req.user.email,
        role: role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const params = {
        TableName: dynamoConfig.tables.user,
        Item: newUser
      };

      await docClient.put(params).promise();
      user = newUser;
    } else {
      // Mettre à jour le rôle de l'utilisateur existant
      user = await User.updateRole(docClient, req.user.id, role);
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du rôle:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur serveur',
      error: error.message 
    });
  }
});

// Routes de profil
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    let user = await User.getById(docClient, req.user.id);
    
    if (!user) {
      // Si l'utilisateur n'existe pas, retourner 404
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const updatedUser = await User.update(docClient, req.user.id, req.body);
    res.json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
});

// Routes des favoris
router.get('/favorites', authMiddleware, async (req, res) => {
  try {
    const favorites = await User.getFavorites(docClient, req.user.id);
    res.json({
      success: true,
      data: favorites
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching favorites',
      error: error.message
    });
  }
});

router.post('/favorites/:salonId', authMiddleware, async (req, res) => {
  try {
    await User.addFavorite(docClient, req.user.id, req.params.salonId);
    res.json({
      success: true,
      message: 'Salon added to favorites'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding favorite',
      error: error.message
    });
  }
});

router.delete('/favorites/:salonId', authMiddleware, async (req, res) => {
  try {
    await User.removeFavorite(docClient, req.user.id, req.params.salonId);
    res.json({
      success: true,
      message: 'Salon removed from favorites'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing favorite',
      error: error.message
    });
  }
});

// Routes des notifications
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await User.getNotifications(docClient, req.user.id);
    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
});

router.put('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await User.markNotificationAsRead(docClient, req.user.id, req.params.id);
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
});

router.delete('/notifications/:id', authMiddleware, async (req, res) => {
  try {
    await User.deleteNotification(docClient, req.user.id, req.params.id);
    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: error.message
    });
  }
});

// Routes des paramètres
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const settings = await User.getSettings(docClient, req.user.id);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching settings',
      error: error.message
    });
  }
});

router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const updatedSettings = await User.updateSettings(docClient, req.user.id, req.body);
    res.json({
      success: true,
      data: updatedSettings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating settings',
      error: error.message
    });
  }
});

// Route admin pour lister tous les utilisateurs
router.get('/all', authMiddleware, checkRole(['admin']), async (req, res) => {
  try {
    const params = {
      TableName: dynamoConfig.tables.user,
      Limit: 100 // Limite pour éviter de surcharger la réponse
    };

    const result = await docClient.scan(params).promise();
    res.json(result.Items);
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router; 