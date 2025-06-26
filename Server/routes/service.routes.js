const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { docClient, dynamoConfig, s3Config } = require('../config/awsConfig');
const { authenticateToken } = require('../middleware/auth');
const admin = require('../middleware/admin');

// Fonction utilitaire pour reconstruire les URLs S3 à partir des clés
const rebuildServiceUrls = (service) => {
  const bucket = s3Config.bucket;
  const region = s3Config.region;
  
  // Reconstruire l'URL de l'image principale
  if (service.imageKey && !service.image?.includes('undefined')) {
    service.image = `https://${bucket}.s3.${region}.amazonaws.com/${service.imageKey}`;
  }
  
  // Reconstruire les URLs des images multiples
  if (service.imageKeys && service.imageKeys.length > 0) {
    service.images = service.imageKeys.map(key => 
      `https://${bucket}.s3.${region}.amazonaws.com/${key}`
    );
  }
  
  return service;
};

// Debug logs
console.log('=== SERVICE ROUTES DEBUG ===');
console.log('DynamoDB Tables Config:', dynamoConfig.tables);
console.log('Service Table Name:', dynamoConfig.tables.service);
console.log('S3 Config:', s3Config);
console.log('==========================');

// Get all services
router.get('/', async (req, res) => {
  try {
    const { 
      search, 
      category,
      minPrice,
      maxPrice
    } = req.query;

    // Debug log
    console.log('Table Name:', dynamoConfig.tables.service);

    let params = {
      TableName: dynamoConfig.tables.service
    };

    if (search || category || minPrice || maxPrice) {
      let filterExpressions = [];
      let expressionAttributeValues = {};
      let expressionAttributeNames = {};

      if (search) {
        filterExpressions.push('contains(#name, :search) OR contains(#description, :search)');
        expressionAttributeValues[':search'] = search;
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeNames['#description'] = 'description';
      }

      if (category) {
        filterExpressions.push('#category = :category');
        expressionAttributeValues[':category'] = category;
        expressionAttributeNames['#category'] = 'category';
      }

      if (minPrice) {
        filterExpressions.push('#price >= :minPrice');
        expressionAttributeValues[':minPrice'] = parseFloat(minPrice);
        expressionAttributeNames['#price'] = 'price';
      }

      if (maxPrice) {
        filterExpressions.push('#price <= :maxPrice');
        expressionAttributeValues[':maxPrice'] = parseFloat(maxPrice);
        expressionAttributeNames['#price'] = 'price';
      }

      params.FilterExpression = filterExpressions.join(' AND ');
      params.ExpressionAttributeValues = expressionAttributeValues;
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    const data = await docClient.scan(params).promise();

    // Enrichir les données des services avec les informations des stylistes et reconstruire les URLs
    const enrichedServices = await Promise.all(data.Items.map(async (service) => {
      // Reconstruire les URLs S3
      const serviceWithUrls = rebuildServiceUrls(service);
      
      if (service.stylistId) {
        console.log('Fetching stylist with userId:', service.stylistId);
        const stylistResult = await docClient.query({
          TableName: dynamoConfig.tables.stylist,
          IndexName: 'byUser',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': service.stylistId
          }
        }).promise();

        console.log('Stylist result:', stylistResult);

        if (stylistResult.Items && stylistResult.Items.length > 0) {
          const stylist = stylistResult.Items[0];
          console.log('Fetching user with ID:', stylist.userId);
          // Récupérer les informations de l'utilisateur
          const userResult = await docClient.get({
            TableName: dynamoConfig.tables.user,
            Key: { id: stylist.userId }
          }).promise();

          console.log('User result:', userResult);

          const enrichedService = {
            ...serviceWithUrls,
            stylistPseudo: stylist.pseudo || userResult.Item?.firstName || '',
            stylistCity: stylist.city || '',
            stylistPostalCode: stylist.postalCode || '',
            stylistLocation: stylist.latitude && stylist.longitude ? {
              latitude: stylist.latitude,
              longitude: stylist.longitude
            } : null
          };

          console.log('Enriched service:', enrichedService);
          return enrichedService;
        }
      }
      return serviceWithUrls;
    }));

    // Calculer les disponibilités pour la prochaine semaine
    const availabilityMap = new Map();
    const stylistIds = [...new Set(enrichedServices.map(s => s.stylistId).filter(Boolean))];
    
    // Récupérer les réservations pour la prochaine semaine
    const nextWeekStart = new Date();
    nextWeekStart.setDate(nextWeekStart.getDate() + 1);
    const nextWeekEnd = new Date();
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
    
    for (const stylistId of stylistIds) {
      try {
        // Récupérer les réservations du styliste pour la prochaine semaine
        const bookingsResult = await docClient.query({
          TableName: dynamoConfig.tables.booking,
          IndexName: 'byStylist',
          KeyConditionExpression: 'stylistId = :stylistId',
          FilterExpression: 'bookingDate BETWEEN :startDate AND :endDate',
          ExpressionAttributeValues: {
            ':stylistId': stylistId,
            ':startDate': nextWeekStart.toISOString().split('T')[0],
            ':endDate': nextWeekEnd.toISOString().split('T')[0]
          }
        }).promise();
        
        // Considérer qu'il y a des disponibilités si moins de 80% des créneaux sont réservés
        const totalSlots = 7 * 8; // 7 jours * 8 créneaux par jour (exemple)
        const bookedSlots = bookingsResult.Items ? bookingsResult.Items.length : 0;
        const availabilityPercentage = ((totalSlots - bookedSlots) / totalSlots) * 100;
        
        availabilityMap.set(stylistId, availabilityPercentage > 20); // Au moins 20% de disponibilités
      } catch (error) {
        console.log(`Erreur lors du calcul des disponibilités pour le styliste ${stylistId}:`, error);
        availabilityMap.set(stylistId, true); // Par défaut, considérer comme disponible
      }
    }

    // Trier les services : photos ET disponibilités en premier, puis par date de création décroissante
    const sortedServices = enrichedServices.sort((a, b) => {
      // Vérifier si le service a des photos (images ou image)
      const aHasPhotos = (a.images && a.images.length > 0) || a.image;
      const bHasPhotos = (b.images && b.images.length > 0) || b.image;
      
      // Vérifier les disponibilités
      const aHasAvailability = availabilityMap.get(a.stylistId) || false;
      const bHasAvailability = availabilityMap.get(b.stylistId) || false;
      
      // Calculer les scores de priorité (plus élevé = plus prioritaire)
      const getPriorityScore = (hasPhotos, hasAvailability) => {
        if (hasPhotos && hasAvailability) return 4; // Priorité 1
        if (hasPhotos && !hasAvailability) return 3; // Priorité 2
        if (!hasPhotos && hasAvailability) return 2; // Priorité 3
        return 1; // Priorité 4
      };
      
      const aScore = getPriorityScore(aHasPhotos, aHasAvailability);
      const bScore = getPriorityScore(bHasPhotos, bHasAvailability);
      
      // Si les scores sont différents, trier par score décroissant
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      // Si les scores sont identiques, trier par date de création décroissante
      const aDate = new Date(a.createdAt || 0);
      const bDate = new Date(b.createdAt || 0);
      return bDate.getTime() - aDate.getTime();
    });

    res.json({
      success: true,
      data: sortedServices
    });
  } catch (error) {
    console.error('Error in /api/services:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services',
      error: error.message
    });
  }
});

// Get popular services - IMPORTANT: Cette route doit être avant /:id
router.get('/popular', async (req, res) => {
  try {
    const params = {
      TableName: dynamoConfig.tables.service,
      FilterExpression: 'isPopular = :val',
      ExpressionAttributeValues: { ':val': true }
    };

    const data = await docClient.scan(params).promise();

    // Enrichir les données des services avec les informations des stylistes et reconstruire les URLs
    const enrichedServices = await Promise.all(data.Items.map(async (service) => {
      // Reconstruire les URLs S3
      const serviceWithUrls = rebuildServiceUrls(service);
      
      if (service.stylistId) {
        console.log('Fetching stylist with userId:', service.stylistId);
        const stylistResult = await docClient.query({
          TableName: dynamoConfig.tables.stylist,
          IndexName: 'byUser',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': service.stylistId
          }
        }).promise();

        console.log('Stylist result:', stylistResult);

        if (stylistResult.Items && stylistResult.Items.length > 0) {
          const stylist = stylistResult.Items[0];
          console.log('Fetching user with ID:', stylist.userId);
          // Récupérer les informations de l'utilisateur
          const userResult = await docClient.get({
            TableName: dynamoConfig.tables.user,
            Key: { id: stylist.userId }
          }).promise();

          console.log('User result:', userResult);

          const enrichedService = {
            ...serviceWithUrls,
            stylistPseudo: stylist.pseudo || userResult.Item?.firstName || '',
            stylistCity: stylist.city || '',
            stylistPostalCode: stylist.postalCode || '',
            stylistLocation: stylist.latitude && stylist.longitude ? {
              latitude: stylist.latitude,
              longitude: stylist.longitude
            } : null
          };

          console.log('Enriched service:', enrichedService);
          return enrichedService;
        }
      }
      return serviceWithUrls;
    }));

    // Calculer les disponibilités pour la prochaine semaine
    const availabilityMap = new Map();
    const stylistIds = [...new Set(enrichedServices.map(s => s.stylistId).filter(Boolean))];
    
    // Récupérer les réservations pour la prochaine semaine
    const nextWeekStart = new Date();
    nextWeekStart.setDate(nextWeekStart.getDate() + 1);
    const nextWeekEnd = new Date();
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
    
    for (const stylistId of stylistIds) {
      try {
        // Récupérer les réservations du styliste pour la prochaine semaine
        const bookingsResult = await docClient.query({
          TableName: dynamoConfig.tables.booking,
          IndexName: 'byStylist',
          KeyConditionExpression: 'stylistId = :stylistId',
          FilterExpression: 'bookingDate BETWEEN :startDate AND :endDate',
          ExpressionAttributeValues: {
            ':stylistId': stylistId,
            ':startDate': nextWeekStart.toISOString().split('T')[0],
            ':endDate': nextWeekEnd.toISOString().split('T')[0]
          }
        }).promise();
        
        // Considérer qu'il y a des disponibilités si moins de 80% des créneaux sont réservés
        const totalSlots = 7 * 8; // 7 jours * 8 créneaux par jour (exemple)
        const bookedSlots = bookingsResult.Items ? bookingsResult.Items.length : 0;
        const availabilityPercentage = ((totalSlots - bookedSlots) / totalSlots) * 100;
        
        availabilityMap.set(stylistId, availabilityPercentage > 20); // Au moins 20% de disponibilités
      } catch (error) {
        console.log(`Erreur lors du calcul des disponibilités pour le styliste ${stylistId}:`, error);
        availabilityMap.set(stylistId, true); // Par défaut, considérer comme disponible
      }
    }

    // Trier les services : photos ET disponibilités en premier, puis par date de création décroissante
    const sortedServices = enrichedServices.sort((a, b) => {
      // Vérifier si le service a des photos (images ou image)
      const aHasPhotos = (a.images && a.images.length > 0) || a.image;
      const bHasPhotos = (b.images && b.images.length > 0) || b.image;
      
      // Vérifier les disponibilités
      const aHasAvailability = availabilityMap.get(a.stylistId) || false;
      const bHasAvailability = availabilityMap.get(b.stylistId) || false;
      
      // Calculer les scores de priorité (plus élevé = plus prioritaire)
      const getPriorityScore = (hasPhotos, hasAvailability) => {
        if (hasPhotos && hasAvailability) return 4; // Priorité 1
        if (hasPhotos && !hasAvailability) return 3; // Priorité 2
        if (!hasPhotos && hasAvailability) return 2; // Priorité 3
        return 1; // Priorité 4
      };
      
      const aScore = getPriorityScore(aHasPhotos, aHasAvailability);
      const bScore = getPriorityScore(bHasPhotos, bHasAvailability);
      
      // Si les scores sont différents, trier par score décroissant
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      // Si les scores sont identiques, trier par date de création décroissante
      const aDate = new Date(a.createdAt || 0);
      const bDate = new Date(b.createdAt || 0);
      return bDate.getTime() - aDate.getTime();
    });

    res.json({
      success: true,
      data: sortedServices
    });
  } catch (error) {
    console.error('Error in /api/services/popular:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching popular services',
      error: error.message
    });
  }
});

// Get service by ID - Cette route doit être après /popular
router.get('/:id', async (req, res) => {
  try {
    const params = {
      TableName: dynamoConfig.tables.service,
      Key: {
        id: req.params.id
      }
    };

    const data = await docClient.get(params).promise();

    if (!data.Item) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Reconstruire les URLs S3
    const serviceWithUrls = rebuildServiceUrls(data.Item);

    res.json({
      success: true,
      data: serviceWithUrls
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching service',
      error: error.message
    });
  }
});

// Create service (admin only)
router.post('/', [authenticateToken, admin], async (req, res) => {
  const item = { 
    ...req.body, 
    id: uuidv4(), 
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const params = { 
    TableName: dynamoConfig.tables.service, 
    Item: item 
  };

  try {
    await docClient.put(params).promise();
    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating service',
      error: error.message
    });
  }
});

// Update service (admin only)
router.put('/:id', [authenticateToken, admin], async (req, res) => {
  try {
    const updateExpressions = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    Object.keys(req.body).forEach(key => {
      if (key !== 'id') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = req.body[key];
        expressionAttributeNames[`#${key}`] = key;
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    expressionAttributeNames['#updatedAt'] = 'updatedAt';

    const params = {
      TableName: dynamoConfig.tables.service,
      Key: {
        id: req.params.id
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW'
    };

    const data = await docClient.update(params).promise();

    res.json({
      success: true,
      message: 'Service updated successfully',
      data: data.Attributes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating service',
      error: error.message
    });
  }
});

// Delete service (admin only)
router.delete('/:id', [authenticateToken, admin], async (req, res) => {
  try {
    const params = {
      TableName: dynamoConfig.tables.service,
      Key: {
        id: req.params.id
      }
    };

    await docClient.delete(params).promise();

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting service',
      error: error.message
    });
  }
});

module.exports = router; 