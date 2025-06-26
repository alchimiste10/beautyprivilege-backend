const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { docClient, dynamoConfig } = require('../config/awsConfig');
const { authenticateToken } = require('../middleware/auth');
const admin = require('../middleware/admin');

// Get all salons
router.get('/', async (req, res) => {
  try {
    const { 
      search, 
      minRating, 
      maxPrice, 
      services,
      latitude,
      longitude,
      radius
    } = req.query;

    let params = {
      TableName: dynamoConfig.tables.salon
    };

    // Si des filtres sont présents, utiliser FilterExpression
    if (search || minRating || maxPrice || services) {
      let filterExpressions = [];
      let expressionAttributeValues = {};
      let expressionAttributeNames = {};

      if (search) {
        filterExpressions.push('contains(#name, :search) OR contains(#description, :search)');
        expressionAttributeValues[':search'] = search;
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeNames['#description'] = 'description';
      }

      if (minRating) {
        filterExpressions.push('#rating >= :minRating');
        expressionAttributeValues[':minRating'] = parseFloat(minRating);
        expressionAttributeNames['#rating'] = 'rating';
      }

      if (maxPrice) {
        filterExpressions.push('#minPrice <= :maxPrice');
        expressionAttributeValues[':maxPrice'] = parseFloat(maxPrice);
        expressionAttributeNames['#minPrice'] = 'minPrice';
      }

      if (services) {
        const serviceArray = services.split(',');
        filterExpressions.push('contains(#specialties, :services)');
        expressionAttributeValues[':services'] = serviceArray;
        expressionAttributeNames['#specialties'] = 'specialties';
      }

      params.FilterExpression = filterExpressions.join(' AND ');
      params.ExpressionAttributeValues = expressionAttributeValues;
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    const data = await docClient.scan(params).promise();
    res.json({
      success: true,
      data: data.Items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching salons',
      error: error.message
    });
  }
});

// Get featured salons - IMPORTANT: Cette route doit être avant /:id
router.get('/featured', async (req, res) => {
  const params = {
    TableName: dynamoConfig.tables.salon,
    FilterExpression: 'isFeatured = :val',
    ExpressionAttributeValues: { ':val': true }
  };

  try {
    const data = await docClient.scan(params).promise();
    res.json({
      success: true,
      data: data.Items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching featured salons',
      error: error.message
    });
  }
});

// Get single salon - Cette route doit être après /featured
router.get('/:id', async (req, res) => {
  try {
    const params = {
      TableName: dynamoConfig.tables.salon,
      Key: {
        id: req.params.id
      }
    };

    const data = await docClient.get(params).promise();

    if (!data.Item) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    res.json({
      success: true,
      data: data.Item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching salon',
      error: error.message
    });
  }
});

// Create salon (admin only)
router.post('/', [authenticateToken, admin], async (req, res) => {
  const item = { 
    ...req.body, 
    id: uuidv4(), 
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const params = { 
    TableName: dynamoConfig.tables.salon, 
    Item: item 
  };

  try {
    await docClient.put(params).promise();
    res.status(201).json({
      success: true,
      message: 'Salon created successfully',
      data: item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating salon',
      error: error.message
    });
  }
});

// Update salon (admin only)
router.put('/:id', [authenticateToken, admin], async (req, res) => {
  try {
    const updateExpressions = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    // Construire dynamiquement l'expression de mise à jour
    Object.keys(req.body).forEach(key => {
      if (key !== 'id') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = req.body[key];
        expressionAttributeNames[`#${key}`] = key;
      }
    });

    // Ajouter updatedAt
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    expressionAttributeNames['#updatedAt'] = 'updatedAt';

    const params = {
      TableName: dynamoConfig.tables.salon,
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
      message: 'Salon updated successfully',
      data: data.Attributes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating salon',
      error: error.message
    });
  }
});

// Delete salon (admin only)
router.delete('/:id', [authenticateToken, admin], async (req, res) => {
  try {
    const params = {
      TableName: dynamoConfig.tables.salon,
      Key: {
        id: req.params.id
      }
    };

    await docClient.delete(params).promise();

    res.json({
      success: true,
      message: 'Salon deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting salon',
      error: error.message
    });
  }
});

module.exports = router; 