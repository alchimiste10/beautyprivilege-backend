const { dynamoConfig } = require('../config/awsConfig');

class User {
  static async getById(docClient, userId) {
    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId }
    };
    const result = await docClient.get(params).promise();
    return result.Item;
  }

  static async update(docClient, userId, updateData) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updateData).forEach(key => {
      if (key !== 'id') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = updateData[key];
      }
    });

    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const result = await docClient.update(params).promise();
    return result.Attributes;
  }

  static async getFavorites(docClient, userId) {
    const user = await this.getById(docClient, userId);
    return user?.favorites || [];
  }

  static async addFavorite(docClient, userId, salonId) {
    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId },
      UpdateExpression: 'ADD favorites :salonId',
      ExpressionAttributeValues: {
        ':salonId': docClient.createSet([salonId])
      },
      ReturnValues: 'ALL_NEW'
    };

    await docClient.update(params).promise();
  }

  static async removeFavorite(docClient, userId, salonId) {
    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId },
      UpdateExpression: 'DELETE favorites :salonId',
      ExpressionAttributeValues: {
        ':salonId': docClient.createSet([salonId])
      },
      ReturnValues: 'ALL_NEW'
    };

    await docClient.update(params).promise();
  }

  static async getNotifications(docClient, userId) {
    const user = await this.getById(docClient, userId);
    return user?.notifications || [];
  }

  static async markNotificationAsRead(docClient, userId, notificationId) {
    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId },
      UpdateExpression: 'SET notifications[?].read = :read',
      ExpressionAttributeValues: {
        ':read': true
      },
      ConditionExpression: 'contains(notifications, :notificationId)',
      ReturnValues: 'ALL_NEW'
    };

    await docClient.update(params).promise();
  }

  static async deleteNotification(docClient, userId, notificationId) {
    const user = await this.getById(docClient, userId);
    const notifications = user.notifications.filter(n => n.id !== notificationId);

    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId },
      UpdateExpression: 'SET notifications = :notifications',
      ExpressionAttributeValues: {
        ':notifications': notifications
      },
      ReturnValues: 'ALL_NEW'
    };

    await docClient.update(params).promise();
  }

  static async getSettings(docClient, userId) {
    const user = await this.getById(docClient, userId);
    return user?.settings || {};
  }

  static async updateSettings(docClient, userId, settings) {
    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId },
      UpdateExpression: 'SET settings = :settings',
      ExpressionAttributeValues: {
        ':settings': settings
      },
      ReturnValues: 'ALL_NEW'
    };

    const result = await docClient.update(params).promise();
    return result.Attributes.settings;
  }

  static async updateRole(docClient, userId, role) {
    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId },
      UpdateExpression: 'SET #role = :role, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#role': 'role'
      },
      ExpressionAttributeValues: {
        ':role': role,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    const result = await docClient.update(params).promise();
    return result.Attributes;
  }

  static async updateLocation(docClient, userId, location) {
    const params = {
      TableName: dynamoConfig.tables.user,
      Key: { id: userId },
      UpdateExpression: 'SET latitude = :latitude, longitude = :longitude, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':latitude': location.latitude,
        ':longitude': location.longitude,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    const result = await docClient.update(params).promise();
    return result.Attributes;
  }

  static async getNearbyStylists(docClient, latitude, longitude, radiusInKm) {
    // Note: Cette implémentation est simplifiée. Dans un environnement de production,
    // il faudrait utiliser une base de données qui supporte les requêtes géospatiales
    // comme MongoDB avec des index géospatiaux ou DynamoDB avec des index secondaires
    const params = {
      TableName: dynamoConfig.tables.user,
      FilterExpression: 'role = :role',
      ExpressionAttributeValues: {
        ':role': 'stylist'
      }
    };

    const result = await docClient.scan(params).promise();
    const stylists = result.Items;

    // Filtrer les stylistes dans le rayon spécifié
    return stylists.filter(stylist => {
      if (!stylist.latitude || !stylist.longitude) return false;
      
      const distance = this.calculateDistance(
        latitude,
        longitude,
        stylist.latitude,
        stylist.longitude
      );
      
      return distance <= radiusInKm;
    });
  }

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  static toRad(value) {
    return value * Math.PI / 180;
  }
}

module.exports = User; 