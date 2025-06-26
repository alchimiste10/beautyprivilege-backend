const { v4: uuidv4 } = require('uuid');
const { dynamoConfig } = require('../config/awsConfig');

class Conversation {
  static async create(docClient, conversationData) {
    const conversation = {
      id: uuidv4(),
      ...conversationData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const params = {
      TableName: dynamoConfig.tables.conversation,
      Item: conversation
    };

    await docClient.put(params).promise();
    return conversation;
  }

  static async getById(docClient, conversationId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      Key: { id: conversationId }
    };

    const { Item } = await docClient.get(params).promise();
    return Item;
  }

  static async getByUserId(docClient, userId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      FilterExpression: 'participants = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    const { Items } = await docClient.scan(params).promise();
    return Items;
  }

  static async update(docClient, conversationId, updateData) {
    const updateExpressions = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    Object.keys(updateData).forEach(key => {
      if (key !== 'id') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = updateData[key];
        expressionAttributeNames[`#${key}`] = key;
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    expressionAttributeNames['#updatedAt'] = 'updatedAt';

    const params = {
      TableName: dynamoConfig.tables.conversation,
      Key: { id: conversationId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW'
    };

    const { Attributes } = await docClient.update(params).promise();
    return Attributes;
  }

  static async delete(docClient, conversationId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      Key: { id: conversationId }
    };

    await docClient.delete(params).promise();
  }

  static async addParticipant(docClient, conversationId, participantId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      Key: { id: conversationId },
      UpdateExpression: 'ADD participants :participantId',
      ExpressionAttributeValues: {
        ':participantId': docClient.createSet([participantId])
      },
      ReturnValues: 'ALL_NEW'
    };

    const { Attributes } = await docClient.update(params).promise();
    return Attributes;
  }

  static async removeParticipant(docClient, conversationId, participantId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      Key: { id: conversationId },
      UpdateExpression: 'DELETE participants :participantId',
      ExpressionAttributeValues: {
        ':participantId': docClient.createSet([participantId])
      },
      ReturnValues: 'ALL_NEW'
    };

    const { Attributes } = await docClient.update(params).promise();
    return Attributes;
  }

  static async updateLastMessage(docClient, conversationId, messageContent) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      Key: { id: conversationId },
      UpdateExpression: 'SET lastMessage = :lastMessage, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':lastMessage': messageContent,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    const { Attributes } = await docClient.update(params).promise();
    return Attributes;
  }

  static async getUnreadCount(docClient, userId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      FilterExpression: 'participants = :userId AND unreadCount > :zero',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':zero': 0
      }
    };

    const { Items } = await docClient.scan(params).promise();
    return Items.reduce((total, conv) => total + conv.unreadCount, 0);
  }

  static async markAllAsRead(docClient, userId) {
    const conversations = await this.getByUserId(docClient, userId);
    
    const params = {
      TransactItems: conversations.map(conv => ({
        Update: {
          TableName: dynamoConfig.tables.conversation,
          Key: {
            id: conv.id
          },
          UpdateExpression: 'SET unreadCount = :zero',
          ExpressionAttributeValues: {
            ':zero': 0
          }
        }
      }))
    };

    if (params.TransactItems.length > 0) {
      await docClient.transactWrite(params).promise();
    }
  }
}

module.exports = Conversation; 