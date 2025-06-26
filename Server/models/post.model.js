const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config({ path: '/Users/admin/BEAUTYPRIVILEGE V1/.env' });

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.POST_TABLE_NAME || 'Post-ecbqin3qw5h5jghkqsi5d7qrza-dev';

console.log('=== POST MODEL CONFIGURATION ===');
console.log('POST_TABLE_NAME:', process.env.POST_TABLE_NAME);
console.log('TABLE_NAME used:', TABLE_NAME);
console.log('================================');

class Post {
  static async create(postData) {
    // Filtrer les valeurs undefined pour éviter l'erreur DynamoDB
    const cleanMedia = postData.media && postData.media.key ? {
      type: postData.media.type,
      key: postData.media.key
    } : undefined;

    const params = {
      TableName: TABLE_NAME,
      Item: {
        id: postData.id || Date.now().toString(),
        content: postData.content,
        stylistId: postData.stylistId,
        stylistName: postData.stylistName,
        stylistAvatar: postData.stylistAvatar,
        media: cleanMedia,
        likes: postData.likes || [],
        comments: postData.comments || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    // Supprimer les propriétés undefined
    Object.keys(params.Item).forEach(key => {
      if (params.Item[key] === undefined) {
        delete params.Item[key];
      }
    });

    await docClient.send(new PutCommand(params));
    return params.Item;
  }

  static async findById(id) {
    const params = {
      TableName: TABLE_NAME,
      Key: { id }
    };

    const { Item } = await docClient.send(new GetCommand(params));
    return Item;
  }

  static async find(query = {}, options = {}) {
    const { page = 1, limit = 10 } = options;

    try {
      if (query.stylistId) {
        // Query par stylistId avec index GSI
        const params = {
          TableName: TABLE_NAME,
          IndexName: 'StylistIdIndex',
          KeyConditionExpression: 'stylistId = :stylistId',
          ExpressionAttributeValues: {
            ':stylistId': query.stylistId
          },
          Limit: limit,
          ScanIndexForward: false // Ordre décroissant
        };

        const { Items, Count } = await docClient.send(new QueryCommand(params));
        return {
          posts: Items || [],
          total: Count || 0
        };
      } else {
        // Pour récupérer tous les posts avec pagination
        const params = {
          TableName: TABLE_NAME,
          Limit: limit * page // Récupérer plus d'éléments pour pouvoir paginer
        };

        const { Items, Count } = await docClient.send(new ScanCommand(params));
        
        // Trier manuellement par createdAt décroissant
        const sortedItems = (Items || []).sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        );

        // Appliquer la pagination manuellement
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedItems = sortedItems.slice(startIndex, endIndex);

        return {
          posts: paginatedItems,
          total: sortedItems.length // Total réel des posts
        };
      }
    } catch (error) {
      console.error('Error in Post.find:', error);
      throw error;
    }
  }

  static async update(id, updateData) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updateData).forEach(([key, value]) => {
      if (key !== 'id') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const params = {
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const { Attributes } = await docClient.send(new UpdateCommand(params));
    return Attributes;
  }

  static async delete(id) {
    const params = {
      TableName: TABLE_NAME,
      Key: { id }
    };

    await docClient.send(new DeleteCommand(params));
  }
}

module.exports = Post; 