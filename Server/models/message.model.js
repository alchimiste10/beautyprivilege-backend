const { v4: uuidv4 } = require('uuid');
const { dynamoConfig } = require('../config/awsConfig');

class Message {
  static async getConversations(docClient, userId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    const result = await docClient.query(params).promise();
    return result.Items;
  }

  static async getConversation(docClient, userId, conversationId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      Key: {
        id: conversationId,
        userId: userId
      }
    };

    const result = await docClient.get(params).promise();
    return result.Item;
  }

  static async createConversation(docClient, userId, recipientId, initialMessage) {
    const conversationId = uuidv4();
    const timestamp = new Date().toISOString();

    const conversation = {
      id: conversationId,
      userId: userId,
      recipientId: recipientId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessage: initialMessage,
      unreadCount: 0
    };

    const message = {
      id: uuidv4(),
      conversationId: conversationId,
      senderId: userId,
      content: initialMessage,
      createdAt: timestamp,
      isRead: false
    };

    const params = {
      TransactItems: [
        {
          Put: {
            TableName: dynamoConfig.tables.conversation,
            Item: conversation
          }
        },
        {
          Put: {
            TableName: dynamoConfig.tables.message,
            Item: message
          }
        }
      ]
    };

    await docClient.transactWrite(params).promise();
    return conversation;
  }

  static async deleteConversation(docClient, userId, conversationId) {
    const params = {
      TransactItems: [
        {
          Delete: {
            TableName: dynamoConfig.tables.conversation,
            Key: {
              id: conversationId,
              userId: userId
            }
          }
        },
        {
          Delete: {
            TableName: dynamoConfig.tables.message,
            Key: {
              conversationId: conversationId
            }
          }
        }
      ]
    };

    await docClient.transactWrite(params).promise();
  }

  static async getMessages(docClient, userId, conversationId) {
    const params = {
      TableName: dynamoConfig.tables.message,
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId
      }
    };

    const result = await docClient.query(params).promise();
    return result.Items;
  }

  static async sendMessage(docClient, userId, conversationId, content) {
    const timestamp = new Date().toISOString();
    const messageId = uuidv4();

    const message = {
      id: messageId,
      conversationId: conversationId,
      senderId: userId,
      content: content,
      createdAt: timestamp,
      isRead: false
    };

    const params = {
      TransactItems: [
        {
          Put: {
            TableName: dynamoConfig.tables.message,
            Item: message
          }
        },
        {
          Update: {
            TableName: dynamoConfig.tables.conversation,
            Key: {
              id: conversationId,
              userId: userId
            },
            UpdateExpression: 'SET lastMessage = :content, updatedAt = :timestamp, unreadCount = unreadCount + :inc',
            ExpressionAttributeValues: {
              ':content': content,
              ':timestamp': timestamp,
              ':inc': 1
            }
          }
        }
      ]
    };

    await docClient.transactWrite(params).promise();
    return message;
  }

  static async markMessageAsRead(docClient, userId, conversationId, messageId) {
    const params = {
      TransactItems: [
        {
          Update: {
            TableName: dynamoConfig.tables.message,
            Key: {
              id: messageId,
              conversationId: conversationId
            },
            UpdateExpression: 'SET isRead = :isRead',
            ExpressionAttributeValues: {
              ':isRead': true
            }
          }
        },
        {
          Update: {
            TableName: dynamoConfig.tables.conversation,
            Key: {
              id: conversationId,
              userId: userId
            },
            UpdateExpression: 'SET unreadCount = unreadCount - :dec',
            ExpressionAttributeValues: {
              ':dec': 1
            }
          }
        }
      ]
    };

    await docClient.transactWrite(params).promise();
  }

  static async deleteMessage(docClient, userId, conversationId, messageId) {
    const params = {
      TableName: dynamoConfig.tables.message,
      Key: {
        id: messageId,
        conversationId: conversationId
      }
    };

    await docClient.delete(params).promise();
  }

  static async getUnreadCount(docClient, userId) {
    const params = {
      TableName: dynamoConfig.tables.conversation,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'unreadCount > :zero',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':zero': 0
      }
    };

    const result = await docClient.query(params).promise();
    return result.Items.reduce((total, conv) => total + conv.unreadCount, 0);
  }

  static async markAllAsRead(docClient, userId) {
    const conversations = await this.getConversations(docClient, userId);
    
    const params = {
      TransactItems: conversations.map(conv => ({
        Update: {
          TableName: dynamoConfig.tables.conversation,
          Key: {
            id: conv.id,
            userId: userId
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

module.exports = Message; 