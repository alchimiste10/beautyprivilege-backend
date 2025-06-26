const express = require('express');
const router = express.Router();
const { docClient, dynamoConfig } = require('../config/awsConfig');
const { authenticateToken } = require('../middleware/auth');

// Récupérer les statistiques du tableau de bord pour un styliste
router.get('/stylist', authenticateToken, async (req, res) => {
  try {
    const stylistId = req.user.id;

    // Récupérer les services du styliste
    const servicesResult = await docClient.query({
      TableName: dynamoConfig.tables.service,
      IndexName: 'byStylist',
      KeyConditionExpression: 'stylistId = :stylistId',
      ExpressionAttributeValues: {
        ':stylistId': stylistId
      }
    }).promise();

    // Récupérer les réservations du styliste
    const bookingsResult = await docClient.scan({
      TableName: dynamoConfig.tables.booking,
      FilterExpression: 'stylistId = :stylistId',
      ExpressionAttributeValues: {
        ':stylistId': stylistId
      }
    }).promise();

    // Récupérer les avis du styliste
    const reviewsResult = await docClient.scan({
      TableName: dynamoConfig.tables.review,
      FilterExpression: 'stylistId = :stylistId',
      ExpressionAttributeValues: {
        ':stylistId': stylistId
      }
    }).promise();

    const bookings = bookingsResult.Items;
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter(b => b.status === 'PENDING').length;
    const completedBookings = bookings.filter(b => b.status === 'COMPLETED').length;
    const totalRevenue = bookings
      .filter(b => b.status === 'COMPLETED')
      .reduce((sum, b) => sum + (b.service?.price || 0), 0);

    const reviews = reviewsResult.Items;
    const averageRating = reviews.length > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
      : 0;

    const stats = {
      totalRevenue,
      totalBookings,
      pendingBookings,
      completedBookings,
      averageRating,
      totalServices: servicesResult.Items.length,
      totalReviews: reviews.length,
      recentBookings: bookings.slice(0, 5),
      recentReviews: reviews.slice(0, 5)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

// Récupérer les statistiques du tableau de bord pour un client
router.get('/client', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;

    // Récupérer les réservations du client
    const bookingsResult = await docClient.query({
      TableName: dynamoConfig.tables.booking,
      IndexName: 'byUser',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': clientId
      }
    }).promise();

    // Récupérer les avis du client
    const reviewsResult = await docClient.query({
      TableName: dynamoConfig.tables.review,
      IndexName: 'byUser',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': clientId
      }
    }).promise();

    const bookings = bookingsResult.Items;
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter(b => b.status === 'PENDING').length;
    const completedBookings = bookings.filter(b => b.status === 'COMPLETED').length;

    const stats = {
      totalBookings,
      pendingBookings,
      completedBookings,
      totalReviews: reviewsResult.Items.length,
      recentBookings: bookings.slice(0, 5),
      recentReviews: reviewsResult.Items.slice(0, 5)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

// Récupérer les statistiques du tableau de bord pour un salon
router.get('/salon', authenticateToken, async (req, res) => {
  try {
    const salonId = req.user.salonId;

    // Récupérer les services du salon
    const servicesResult = await docClient.query({
      TableName: dynamoConfig.tables.service,
      IndexName: 'bySalon',
      KeyConditionExpression: 'salonId = :salonId',
      ExpressionAttributeValues: {
        ':salonId': salonId
      }
    }).promise();

    // Récupérer les stylistes du salon
    const stylistsResult = await docClient.query({
      TableName: dynamoConfig.tables.stylist,
      IndexName: 'bySalon',
      KeyConditionExpression: 'salonId = :salonId',
      ExpressionAttributeValues: {
        ':salonId': salonId
      }
    }).promise();

    // Récupérer les réservations du salon
    const bookingsResult = await docClient.query({
      TableName: dynamoConfig.tables.booking,
      IndexName: 'bySalon',
      KeyConditionExpression: 'salonId = :salonId',
      ExpressionAttributeValues: {
        ':salonId': salonId
      }
    }).promise();

    // Récupérer les avis du salon
    const reviewsResult = await docClient.query({
      TableName: dynamoConfig.tables.review,
      IndexName: 'bySalon',
      KeyConditionExpression: 'salonId = :salonId',
      ExpressionAttributeValues: {
        ':salonId': salonId
      }
    }).promise();

    const bookings = bookingsResult.Items;
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter(b => b.status === 'PENDING').length;
    const completedBookings = bookings.filter(b => b.status === 'COMPLETED').length;
    const totalRevenue = bookings
      .filter(b => b.status === 'COMPLETED')
      .reduce((sum, b) => sum + (b.service?.price || 0), 0);

    const reviews = reviewsResult.Items;
    const averageRating = reviews.length > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
      : 0;

    const stats = {
      totalRevenue,
      totalBookings,
      pendingBookings,
      completedBookings,
      averageRating,
      totalServices: servicesResult.Items.length,
      totalStylists: stylistsResult.Items.length,
      totalReviews: reviews.length,
      recentBookings: bookings.slice(0, 5),
      recentReviews: reviews.slice(0, 5)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

module.exports = router; 