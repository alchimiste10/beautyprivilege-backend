const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { docClient, s3, dynamoConfig, s3Config } = require('../config/awsConfig');
const { authMiddleware } = require('../middleware/authMiddleware');
const MessageController = require('../controllers/message.controller');
const AppointmentService = require('../services/appointment.service');

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

// Fonction utilitaire pour reconstruire les URLs S3 du profil styliste
const rebuildStylistUrls = (stylist) => {
  const bucket = s3Config.bucket;
  const region = s3Config.region;
  
  // Reconstruire l'URL de l'image de profil (profileImage contient la clé S3)
  if (stylist.profileImage && !stylist.profileImage?.includes('http')) {
    stylist.profileImage = `https://${bucket}.s3.${region}.amazonaws.com/${stylist.profileImage}`;
  }
  
  // Reconstruire les URLs des photos de travail (workPhotos contient les clés S3)
  if (stylist.workPhotos && stylist.workPhotos.length > 0) {
    stylist.workPhotos = stylist.workPhotos.map(photo => {
      if (photo && !photo.includes('http')) {
        return `https://${bucket}.s3.${region}.amazonaws.com/${photo}`;
      }
      return photo;
    });
  }
  
  return stylist;
};

// Route pour ajouter un styliste
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { userId, salonId, specialties, bio, experience } = req.body;
    
    const stylist = {
      id: `STY${Date.now()}`,
      userId,
      salonId,
      specialties,
      bio,
      experience,
      rating: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.put({
      TableName: dynamoConfig.tables.stylist,
      Item: stylist
    }).promise();

    res.status(201).json(stylist);
  } catch (error) {
    console.error('Erreur lors de l\'ajout du styliste:', error);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du styliste' });
  }
});

// Route pour récupérer tous les stylistes avec recherche
router.get('/', async (req, res) => {
  try {
    const { search, pseudo } = req.query;
    
    let result;
    
    if (search || pseudo) {
      // Recherche par nom, spécialité ou pseudo
      const scanParams = {
        TableName: dynamoConfig.tables.stylist
      };
      
      if (search) {
        scanParams.FilterExpression = 'contains(#name, :search) OR contains(#bio, :search) OR contains(#specialties, :search)';
        scanParams.ExpressionAttributeNames = {
          '#name': 'name',
          '#bio': 'bio',
          '#specialties': 'specialties'
        };
        scanParams.ExpressionAttributeValues = {
          ':search': search.toLowerCase()
        };
      } else if (pseudo) {
        scanParams.FilterExpression = 'contains(#pseudo, :pseudo)';
        scanParams.ExpressionAttributeNames = {
          '#pseudo': 'pseudo'
        };
        scanParams.ExpressionAttributeValues = {
          ':pseudo': pseudo.toLowerCase()
        };
      }
      
      result = await docClient.scan(scanParams).promise();
    } else {
      // Récupération de tous les stylistes
      result = await docClient.scan({
        TableName: dynamoConfig.tables.stylist
      }).promise();
    }

    // Enrichir les données des stylistes avec les informations des utilisateurs
    const enrichedStylists = await Promise.all(result.Items.map(async (stylist) => {
      const userResult = await docClient.get({
        TableName: dynamoConfig.tables.user,
        Key: { id: stylist.userId }
      }).promise();

      const enrichedStylist = {
        ...stylist,
        name: userResult.Item ? `${userResult.Item.firstName} ${userResult.Item.lastName}` : '',
        description: stylist.bio || '',
        profileImage: stylist.profileImage || '',
        rating: stylist.rating || 0,
        pseudo: stylist.pseudo || userResult.Item?.firstName || '',
        specialties: stylist.specialties || []
      };

      // Reconstruire les URLs S3
      return rebuildStylistUrls(enrichedStylist);
    }));

    // Filtrer les résultats si une recherche est effectuée
    let filteredStylists = enrichedStylists;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredStylists = enrichedStylists.filter(stylist => 
        stylist.name.toLowerCase().includes(searchLower) ||
        stylist.pseudo.toLowerCase().includes(searchLower) ||
        stylist.description.toLowerCase().includes(searchLower) ||
        stylist.specialties.some(specialty => 
          specialty.toLowerCase().includes(searchLower)
        )
      );
    }

    res.json({ data: filteredStylists });
  } catch (error) {
    console.error('Erreur lors de la récupération des stylistes:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des stylistes' });
  }
});

// Route pour récupérer les stylistes suggérés basés sur les réservations
router.get('/suggested', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Récupérer les réservations de l'utilisateur
    const bookingsResult = await docClient.query({
      TableName: dynamoConfig.tables.booking,
      IndexName: 'byUser',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise();

    if (!bookingsResult.Items || bookingsResult.Items.length === 0) {
      return res.json({ data: [] });
    }

    // Extraire les IDs des stylistes uniques
    const stylistIds = [...new Set(bookingsResult.Items.map(booking => booking.stylistId))];

    // Récupérer les informations des stylistes
    const stylistsData = await Promise.all(stylistIds.map(async (stylistId) => {
      const stylistResult = await docClient.get({
        TableName: dynamoConfig.tables.stylist,
        Key: { id: stylistId }
      }).promise();

      if (!stylistResult.Item) return null;

      const userResult = await docClient.get({
        TableName: dynamoConfig.tables.user,
        Key: { id: stylistResult.Item.userId }
      }).promise();

      // Compter le nombre de réservations avec ce styliste
      const bookingCount = bookingsResult.Items.filter(booking => booking.stylistId === stylistId).length;

      return {
        ...stylistResult.Item,
        name: userResult.Item ? `${userResult.Item.firstName} ${userResult.Item.lastName}` : '',
        description: stylistResult.Item.bio || '',
        profileImage: stylistResult.Item.profileImage || '',
        rating: stylistResult.Item.rating || 0,
        pseudo: stylistResult.Item.pseudo || userResult.Item?.firstName || '',
        specialties: stylistResult.Item.specialties || [],
        bookingCount,
        lastBookingDate: bookingsResult.Items
          .filter(booking => booking.stylistId === stylistId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt
      };
    }));

    // Filtrer les stylistes null et trier par nombre de réservations puis par date
    const suggestedStylists = stylistsData
      .filter(stylist => stylist !== null)
      .map(stylist => rebuildStylistUrls(stylist)) // Reconstruire les URLs S3
      .sort((a, b) => {
        if (b.bookingCount !== a.bookingCount) {
          return b.bookingCount - a.bookingCount;
        }
        return new Date(b.lastBookingDate).getTime() - new Date(a.lastBookingDate).getTime();
      });

    res.json({ data: suggestedStylists });
  } catch (error) {
    console.error('Erreur lors de la récupération des stylistes suggérés:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des stylistes suggérés' });
  }
});

// Route pour récupérer le profil du styliste
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Récupérer les informations de l'utilisateur
    const userResult = await docClient.get({
      TableName: dynamoConfig.tables.user,
      Key: { id: userId }
    }).promise();

    if (!userResult.Item) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Récupérer le styliste par userId
    const stylistResult = await docClient.scan({
      TableName: dynamoConfig.tables.stylist,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise();

    let stylist = null;
    if (stylistResult.Items && stylistResult.Items.length > 0) {
      stylist = stylistResult.Items[0];
      // Reconstruire les URLs S3
      stylist = rebuildStylistUrls(stylist);
    }

    // Construire la réponse du profil
    const profile = {
      firstName: userResult.Item.firstName || '',
      lastName: userResult.Item.lastName || '',
      phone: userResult.Item.phone || '',
      bio: stylist?.bio || '',
      experience: stylist?.experience || 0,
      specialties: stylist?.specialties || [],
      workingHours: stylist?.workingHours || { days: [], timeSlots: [] },
      pseudo: stylist?.pseudo || '',
      address: stylist?.address || '',
      city: stylist?.city || '',
      postalCode: stylist?.postalCode || '',
      country: stylist?.country || '',
      // Ajout des coordonnées
      latitude: stylist?.latitude || null,
      longitude: stylist?.longitude || null,
      profileImage: stylist?.profileImage || '',
      workPhotos: stylist?.workPhotos || [],
      rating: stylist?.rating || 0,
      id: stylist?.id || '',
      userId: stylist?.userId || '',
      salonId: stylist?.salonId || '',
      createdAt: stylist?.createdAt || '',
      updatedAt: stylist?.updatedAt || ''
    };

    res.json(profile);
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du profil' });
  }
});

// Route pour mettre à jour le profil du styliste
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      firstName,
      lastName,
      phone,
      bio,
      experience,
      specialties,
      pseudo,
      address,
      city,
      postalCode,
      country,
      profileImage,
      workPhotos,
      workingHours,
      location
    } = req.body;

    // Récupérer le styliste par userId
    const stylistResult = await docClient.query({
      TableName: dynamoConfig.tables.stylist,
      IndexName: 'byUser',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise();

    if (!stylistResult.Items || stylistResult.Items.length === 0) {
      // Création d'une nouvelle entrée styliste si elle n'existe pas
      const newStylist = {
        id: require('uuid').v4(),
        userId: userId,
        bio: bio || '',
        experience: experience || 0,
        specialties: specialties || [],
        workingHours: workingHours || { days: [], timeSlots: [] },
        workPhotos: workPhotos || [],
        profileImage: profileImage || '',
        address: address || '',
        city: city || '',
        postalCode: postalCode || '',
        country: country || '',
        // Ajout des coordonnées si disponibles
        ...(location && location.latitude && location.longitude && {
          latitude: location.latitude,
          longitude: location.longitude
        }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await docClient.put({
        TableName: dynamoConfig.tables.stylist,
        Item: newStylist
      }).promise();

      // Mettre à jour les informations de l'utilisateur
      const userUpdateFields = [];
      const userExpressionAttributeValues = {
        ':updatedAt': new Date().toISOString()
      };
      
      if (typeof firstName !== 'undefined' && firstName !== null && firstName !== '') {
        userUpdateFields.push('firstName = :firstName');
        userExpressionAttributeValues[':firstName'] = firstName;
      }
      if (typeof lastName !== 'undefined' && lastName !== null && lastName !== '') {
        userUpdateFields.push('lastName = :lastName');
        userExpressionAttributeValues[':lastName'] = lastName;
      }
      if (typeof phone !== 'undefined' && phone !== null && phone !== '') {
        userUpdateFields.push('phone = :phone');
        userExpressionAttributeValues[':phone'] = phone;
      }
      
      // Ajouter updatedAt à la fin
      userUpdateFields.push('updatedAt = :updatedAt');
      
      await docClient.update({
        TableName: dynamoConfig.tables.user,
        Key: { id: userId },
        UpdateExpression: `SET ${userUpdateFields.join(', ')}`,
        ExpressionAttributeValues: userExpressionAttributeValues
      }).promise();

      return res.json({ message: 'Profil styliste créé avec succès' });
    }

    const stylist = stylistResult.Items[0];

    // Mettre à jour les informations du styliste
    const updateFields = [];
    const expressionAttributeValues = {
      ':updatedAt': new Date().toISOString()
    };
    
    if (typeof bio !== 'undefined' && bio !== null) {
      updateFields.push('bio = :bio');
      expressionAttributeValues[':bio'] = bio;
    }
    if (typeof experience !== 'undefined' && experience !== null) {
      updateFields.push('experience = :experience');
      expressionAttributeValues[':experience'] = experience;
    }
    if (typeof specialties !== 'undefined' && specialties !== null) {
      updateFields.push('specialties = :specialties');
      expressionAttributeValues[':specialties'] = specialties;
    }
    if (typeof pseudo !== 'undefined' && pseudo !== null && pseudo !== '') {
      updateFields.push('pseudo = :pseudo');
      expressionAttributeValues[':pseudo'] = pseudo;
    }
    if (typeof address !== 'undefined' && address !== null && address !== '') {
      updateFields.push('address = :address');
      expressionAttributeValues[':address'] = address;
    }
    if (typeof city !== 'undefined' && city !== null && city !== '') {
      updateFields.push('city = :city');
      expressionAttributeValues[':city'] = city;
    }
    if (typeof postalCode !== 'undefined' && postalCode !== null && postalCode !== '') {
      updateFields.push('postalCode = :postalCode');
      expressionAttributeValues[':postalCode'] = postalCode;
    }
    if (typeof country !== 'undefined' && country !== null && country !== '') {
      updateFields.push('country = :country');
      expressionAttributeValues[':country'] = country;
    }
    // Ajout du traitement des coordonnées
    if (location && typeof location.latitude !== 'undefined' && typeof location.longitude !== 'undefined') {
      updateFields.push('latitude = :latitude');
      updateFields.push('longitude = :longitude');
      expressionAttributeValues[':latitude'] = location.latitude;
      expressionAttributeValues[':longitude'] = location.longitude;
    }
    if (typeof profileImage !== 'undefined' && profileImage !== null) {
      updateFields.push('profileImage = :profileImage');
      expressionAttributeValues[':profileImage'] = profileImage;
    }
    if (typeof workPhotos !== 'undefined' && workPhotos !== null) {
      updateFields.push('workPhotos = :workPhotos');
      expressionAttributeValues[':workPhotos'] = workPhotos;
    }
    if (typeof workingHours !== 'undefined' && workingHours !== null) {
      updateFields.push('workingHours = :workingHours');
      expressionAttributeValues[':workingHours'] = workingHours;
    }
    
    // Ajouter updatedAt à la fin
    updateFields.push('updatedAt = :updatedAt');
    
    // Ne faire l'update que s'il y a des champs à mettre à jour
    if (updateFields.length > 1) { // Plus que juste updatedAt
      await docClient.update({
        TableName: dynamoConfig.tables.stylist,
        Key: { id: stylist.id },
        UpdateExpression: `SET ${updateFields.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues
      }).promise();
    }

    // Mettre à jour les informations de l'utilisateur
    const userUpdateFields = [];
    const userExpressionAttributeValues = {
      ':updatedAt': new Date().toISOString()
    };
    
    if (typeof firstName !== 'undefined' && firstName !== null && firstName !== '') {
      userUpdateFields.push('firstName = :firstName');
      userExpressionAttributeValues[':firstName'] = firstName;
    }
    if (typeof lastName !== 'undefined' && lastName !== null && lastName !== '') {
      userUpdateFields.push('lastName = :lastName');
      userExpressionAttributeValues[':lastName'] = lastName;
    }
    if (typeof phone !== 'undefined' && phone !== null && phone !== '') {
      userUpdateFields.push('phone = :phone');
      userExpressionAttributeValues[':phone'] = phone;
    }
    
    // Ajouter updatedAt à la fin
    userUpdateFields.push('updatedAt = :updatedAt');
    
    // Ne faire l'update que s'il y a des champs à mettre à jour
    if (userUpdateFields.length > 1) { // Plus que juste updatedAt
      await docClient.update({
        TableName: dynamoConfig.tables.user,
        Key: { id: userId },
        UpdateExpression: `SET ${userUpdateFields.join(', ')}`,
        ExpressionAttributeValues: userExpressionAttributeValues
      }).promise();
    }

    // Mettre à jour les informations du salon si le styliste a un salonId et que l'adresse est fournie
    if (stylist.salonId && (address || city || postalCode)) {
      const updateExpression = [];
      const expressionAttributeValues = {};
      const expressionAttributeNames = {};

      if (address) {
        updateExpression.push('#address = :address');
        expressionAttributeValues[':address'] = address;
        expressionAttributeNames['#address'] = 'address';
      }
      if (city) {
        updateExpression.push('#city = :city');
        expressionAttributeValues[':city'] = city;
        expressionAttributeNames['#city'] = 'city';
      }
      if (postalCode) {
        updateExpression.push('#postalCode = :postalCode');
        expressionAttributeValues[':postalCode'] = postalCode;
        expressionAttributeNames['#postalCode'] = 'postalCode';
      }

      updateExpression.push('updatedAt = :updatedAt');
      expressionAttributeValues[':updatedAt'] = new Date().toISOString();

      await docClient.update({
        TableName: dynamoConfig.tables.salon,
        Key: { id: stylist.salonId },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames
      }).promise();
    }

    res.json({ message: 'Profil mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du profil' });
  }
});

// Route pour récupérer les stylistes en vedette
router.get('/featured', async (req, res) => {
  try {
    const result = await docClient.scan({
      TableName: dynamoConfig.tables.stylist,
      FilterExpression: 'rating >= :minRating',
      ExpressionAttributeValues: {
        ':minRating': 4
      },
      Limit: 5
    }).promise();

    res.json(result.Items);
  } catch (error) {
    console.error('Erreur lors de la récupération des stylistes en vedette:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des stylistes en vedette' });
  }
});

// Route pour récupérer les statistiques du tableau de bord
router.get('/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const stylistId = req.user.id;

    // Récupérer les services du styliste
    const servicesQueryParams = {
      TableName: dynamoConfig.tables.service,
      IndexName: 'byStylist',
      KeyConditionExpression: 'stylistId = :stylistId',
      ExpressionAttributeValues: {
        ':stylistId': stylistId
      }
    };

    const servicesResult = await docClient.query(servicesQueryParams).promise();
    const services = servicesResult.Items || [];

    // Récupérer les réservations du styliste
    const bookingsQueryParams = {
      TableName: dynamoConfig.tables.booking,
      IndexName: 'byStylist',
      KeyConditionExpression: 'stylistId = :stylistId',
      ExpressionAttributeValues: {
        ':stylistId': stylistId
      }
    };

    const bookingsResult = await docClient.query(bookingsQueryParams).promise();
    const bookings = bookingsResult.Items || [];

    // Calculer les statistiques
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter(b => b.status === 'pending').length;
    const totalRevenue = bookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    const stats = {
      totalBookings,
      pendingBookings,
      totalRevenue,
      totalServices: services.length
    };

    res.json(stats);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error.message);
    res.status(500).json({ message: 'Erreur lors de la récupération des statistiques' });
  }
});

// Route pour récupérer les services d'un styliste
router.get('/services', authMiddleware, async (req, res) => {
  try {
    const stylistId = req.user.id;

    // D'abord, récupérer les informations du styliste
    const stylistResult = await docClient.scan({
      TableName: dynamoConfig.tables.stylist,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': stylistId
      }
    }).promise();

    const stylist = stylistResult.Items && stylistResult.Items.length > 0 ? stylistResult.Items[0] : null;

    // Récupérer les services du styliste
    const result = await docClient.query({
      TableName: dynamoConfig.tables.service,
      IndexName: 'byStylist',
      KeyConditionExpression: 'stylistId = :stylistId',
      ExpressionAttributeValues: {
        ':stylistId': stylistId
      }
    }).promise();

    // Reconstruire les URLs S3 pour tous les services et ajouter les informations du styliste
    const servicesWithUrls = result.Items.map(service => {
      const serviceWithUrls = rebuildServiceUrls(service);
      
      // Ajouter les informations du styliste au service
      return {
        ...serviceWithUrls,
        stylistPseudo: stylist?.pseudo || '',
        stylistCity: stylist?.city || '',
        stylistPostalCode: stylist?.postalCode || ''
      };
    });

    // Trier les services : ceux avec des photos en premier, puis par date de création décroissante
    const sortedServices = servicesWithUrls.sort((a, b) => {
      // Vérifier si le service a des photos (images ou image)
      const aHasPhotos = (a.images && a.images.length > 0) || a.image;
      const bHasPhotos = (b.images && b.images.length > 0) || b.image;
      
      // Si l'un a des photos et l'autre non, prioriser celui avec des photos
      if (aHasPhotos && !bHasPhotos) return -1;
      if (!aHasPhotos && bHasPhotos) return 1;
      
      // Si les deux ont des photos ou aucun n'en a, trier par date de création décroissante
      const aDate = new Date(a.createdAt || 0);
      const bDate = new Date(b.createdAt || 0);
      return bDate.getTime() - aDate.getTime();
    });

    res.json(sortedServices);
  } catch (error) {
    console.error('Erreur lors de la récupération des services:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des services' });
  }
});

// Route pour récupérer les services d'une styliste spécifique (pour les clients)
router.get('/:stylistId/services', async (req, res) => {
  try {
    const { stylistId } = req.params;

    // D'abord, récupérer le styliste pour obtenir son userId
    const stylistResult = await docClient.get({
      TableName: dynamoConfig.tables.stylist,
      Key: { id: stylistId }
    }).promise();

    if (!stylistResult.Item) {
      return res.status(404).json({ message: 'Styliste non trouvé' });
    }

    const userId = stylistResult.Item.userId;

    // Récupérer les services de la styliste en utilisant l'userId
    const result = await docClient.query({
      TableName: dynamoConfig.tables.service,
      IndexName: 'byStylist',
      KeyConditionExpression: 'stylistId = :stylistId',
      ExpressionAttributeValues: {
        ':stylistId': userId
      }
    }).promise();

    // Reconstruire les URLs S3 pour tous les services
    const servicesWithUrls = result.Items.map(service => rebuildServiceUrls(service));

    // Trier les services : ceux avec des photos en premier, puis par date de création décroissante
    const sortedServices = servicesWithUrls.sort((a, b) => {
      // Vérifier si le service a des photos (images ou image)
      const aHasPhotos = (a.images && a.images.length > 0) || a.image;
      const bHasPhotos = (b.images && b.images.length > 0) || b.image;
      
      // Si l'un a des photos et l'autre non, prioriser celui avec des photos
      if (aHasPhotos && !bHasPhotos) return -1;
      if (!aHasPhotos && bHasPhotos) return 1;
      
      // Si les deux ont des photos ou aucun n'en a, trier par date de création décroissante
      const aDate = new Date(a.createdAt || 0);
      const bDate = new Date(b.createdAt || 0);
      return bDate.getTime() - aDate.getTime();
    });

    res.json({ data: sortedServices });
  } catch (error) {
    console.error('Erreur lors de la récupération des services de la styliste:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des services' });
  }
});

// Route pour créer un service
router.post('/services', authMiddleware, async (req, res) => {
  try {
    const stylistId = req.user.id;
    const serviceData = req.body;

    const service = {
      id: require('uuid').v4(),
      stylistId: stylistId,
      name: serviceData.name,
      description: serviceData.description,
      price: serviceData.price,
      duration: serviceData.duration,
      category: serviceData.category,
      images: serviceData.images || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.put({
      TableName: dynamoConfig.tables.service,
      Item: service
    }).promise();

    const serviceWithUrls = rebuildServiceUrls(service);
    res.status(201).json(serviceWithUrls);
  } catch (error) {
    console.error('Erreur lors de la création du service:', error.message);
    res.status(500).json({ message: 'Erreur lors de la création du service' });
  }
});

// Route pour récupérer un service par ID
router.get('/services/:id', authMiddleware, async (req, res) => {
  try {
    const stylistId = req.user.id;
    const { id } = req.params;

    const service = await docClient.get({
      TableName: dynamoConfig.tables.service,
      Key: { id: id }
    }).promise();

    if (!service.Item) {
      return res.status(404).json({ message: 'Service non trouvé' });
    }

    if (service.Item.stylistId !== stylistId) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const serviceWithUrls = rebuildServiceUrls(service.Item);
    res.json(serviceWithUrls);
  } catch (error) {
    console.error('Erreur lors de la récupération du service:', error.message);
    res.status(500).json({ message: 'Erreur lors de la récupération du service' });
  }
});

// Route pour mettre à jour un service
router.put('/services/:id', authMiddleware, async (req, res) => {
  try {
    const stylistId = req.user.id;
    const { id } = req.params;
    const updateData = req.body;

    const service = await docClient.get({
      TableName: dynamoConfig.tables.service,
      Key: { id: id }
    }).promise();

    if (!service.Item || service.Item.stylistId !== stylistId) {
      return res.status(404).json({ message: 'Service non trouvé ou accès non autorisé' });
    }

    const updatedService = {
      ...service.Item,
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    await docClient.put({
      TableName: dynamoConfig.tables.service,
      Item: updatedService
    }).promise();

    const serviceWithUrls = rebuildServiceUrls(updatedService);
    res.json(serviceWithUrls);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du service:', error.message);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du service' });
  }
});

// Route pour supprimer un service
router.delete('/services/:id', authMiddleware, async (req, res) => {
  try {
    const stylistId = req.user.id;
    const { id } = req.params;

    const service = await docClient.get({
      TableName: dynamoConfig.tables.service,
      Key: { id: id }
    }).promise();

    if (!service.Item || service.Item.stylistId !== stylistId) {
      return res.status(404).json({ message: 'Service non trouvé ou accès non autorisé' });
    }

    await docClient.delete({
      TableName: dynamoConfig.tables.service,
      Key: { id: id }
    }).promise();

    res.json({ message: 'Service supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du service:', error.message);
    res.status(500).json({ message: 'Erreur lors de la suppression du service' });
  }
});

// Route pour récupérer les réservations d'un styliste
router.get('/bookings', authMiddleware, async (req, res) => {
  try {
    const stylistId = req.user.id;

    // Utiliser le service avec vérification de refus automatique
    const appointments = await AppointmentService.getStylistAppointmentsWithRejectionCheck(stylistId);

    // Enrichir les réservations avec les informations du client et du service
    const bookings = await Promise.all(appointments.map(async (booking, index) => {
      const [client, service] = await Promise.all([
        docClient.get({
          TableName: dynamoConfig.tables.user,
          Key: { id: booking.userId }
        }).promise(),
        docClient.get({
          TableName: dynamoConfig.tables.service,
          Key: { id: booking.serviceId }
        }).promise()
      ]);

      return {
        ...booking,
        user: client.Item,
        service: service.Item
      };
    }));

    res.json(bookings);
  } catch (error) {
    console.error('=== ERREUR ROUTE /bookings ===');
    console.error('Erreur lors de la récupération des réservations:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ message: 'Erreur lors de la récupération des réservations' });
  }
});

// Route pour mettre à jour le statut d'une réservation
router.put('/bookings/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const stylistId = req.user.id;

    // Vérifier et refuser automatiquement le rendez-vous si nécessaire
    const rejectionResult = await AppointmentService.checkAndRejectAppointment(id);
    
    // Si le rendez-vous vient d'être refusé, retourner une erreur
    if (rejectionResult.rejected) {
      return res.status(400).json({ 
        message: 'Ce rendez-vous a été refusé automatiquement et ne peut plus être modifié',
        rejected: true,
        reason: rejectionResult.message
      });
    }

    // Vérifier que la réservation appartient au styliste
    const getParams = {
      TableName: dynamoConfig.tables.booking,
      Key: { id }
    };
    
    const booking = await docClient.get(getParams).promise();
    
    if (booking.Item) {
      console.log('Réservation trouvée:', booking.Item.id);
    }

    if (!booking.Item || booking.Item.stylistId !== stylistId) {
      return res.status(404).json({ message: 'Réservation non trouvée' });
    }

    // Vérifier que le rendez-vous n'est pas déjà refusé
    if (booking.Item.status === 'REJECTED') {
      return res.status(400).json({ 
        message: 'Ce rendez-vous a été refusé et ne peut plus être modifié',
        rejected: true,
        reason: booking.Item.rejectionReason || 'Refusé'
      });
    }

    const updatedBooking = {
      ...booking.Item,
      status,
      updatedAt: new Date().toISOString()
    };

    const putParams = {
      TableName: dynamoConfig.tables.booking,
      Item: updatedBooking
    };
    
    console.log('Paramètres de mise à jour:', JSON.stringify(putParams, null, 2));

    await docClient.put(putParams).promise();
    
    res.json(updatedBooking);
  } catch (error) {
    console.error('=== ERREUR ROUTE /bookings/:id/status ===');
    console.error('Erreur lors de la mise à jour du statut:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du statut' });
  }
});

// Routes des messages pour les coiffeuses
router.get('/conversations', authMiddleware, MessageController.getConversations);
router.get('/conversations/:id', authMiddleware, MessageController.getConversation);
router.post('/conversations/:id/messages', authMiddleware, MessageController.sendMessage);
router.put('/conversations/:id/messages/:messageId/read', authMiddleware, MessageController.markMessageAsRead);
router.get('/unread-messages', authMiddleware, MessageController.getUnreadCount);
router.put('/mark-all-read', authMiddleware, MessageController.markAllAsRead);

// Route pour connecter un styliste à Stripe Connect
router.post('/connect-stripe', authMiddleware, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un styliste (professional)
    if (req.user.role !== 'professional' && req.user.role !== 'Professional') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les stylistes peuvent se connecter à Stripe'
      });
    }

    const { stripe } = require('../config/stripe.config');
    const { getConnectClientId } = require('../config/stripe.config');

    // Créer un lien de connexion Stripe Connect
    const accountLink = await stripe.accountLinks.create({
      account: req.user.stripeAccountId || await createStripeAccount(req.user),
      refresh_url: `${process.env.REACT_APP_FRONTEND_URL}/stylist/connect-stripe/refresh`,
      return_url: `${process.env.REACT_APP_FRONTEND_URL}/stylist/connect-stripe/success`,
      type: 'account_onboarding',
    });

    res.json({
      success: true,
      data: {
        url: accountLink.url
      }
    });
  } catch (error) {
    console.error('Erreur lors de la connexion Stripe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion à Stripe',
      error: error.message
    });
  }
});

// Route pour vérifier le statut de connexion Stripe
router.get('/stripe-status', authMiddleware, async (req, res) => {
  try {
    console.log('=== STRIPE STATUS CHECK ===');
    console.log('User from auth:', req.user);
    console.log('User ID:', req.user.id);
    console.log('User role:', req.user.role);
    console.log('User stripeAccountId from auth:', req.user.stripeAccountId);

    if (req.user.role !== 'professional' && req.user.role !== 'Professional') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les stylistes peuvent vérifier leur statut Stripe'
      });
    }

    // Récupérer les données complètes de l'utilisateur depuis la base de données
    const { docClient } = require('../config/awsConfig');
    const User = require('../models/user.model');
    
    const user = await User.getById(docClient, req.user.id);
    console.log('User from database:', user);
    console.log('User stripeAccountId from database:', user?.stripeAccountId);

    const { stripe } = require('../config/stripe.config');

    if (!user || !user.stripeAccountId) {
      console.log('No stripeAccountId found, returning not_connected');
      return res.json({
        success: true,
        data: {
          connected: false,
          status: 'not_connected'
        }
      });
    }

    console.log('Retrieving Stripe account:', user.stripeAccountId);
    const account = await stripe.accounts.retrieve(user.stripeAccountId);
    console.log('Stripe account retrieved:', {
      id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled
    });

    const isConnected = account.charges_enabled && account.payouts_enabled;
    console.log('Account connected:', isConnected);

    res.json({
      success: true,
      data: {
        connected: isConnected,
        status: isConnected ? 'active' : 'pending',
        account: {
          id: account.id,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          requirements: account.requirements
        }
      }
    });
  } catch (error) {
    console.error('Erreur lors de la vérification du statut Stripe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification du statut Stripe',
      error: error.message
    });
  }
});

// Fonction pour créer un compte Stripe Connect
async function createStripeAccount(user) {
  const { stripe } = require('../config/stripe.config');
  
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'FR',
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    business_profile: {
      url: process.env.REACT_APP_FRONTEND_URL,
      mcc: '7299', // Code pour les services de coiffure
    },
  });

  // Mettre à jour l'utilisateur avec l'ID du compte Stripe
  const { docClient } = require('../config/awsConfig');
  const User = require('../models/user.model');
  
  await User.update(docClient, user.id, {
    stripeAccountId: account.id
  });

  return account.id;
}

module.exports = router;
