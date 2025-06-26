const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { docClient, dynamoConfig } = require('../config/awsConfig');
const { socketService } = require('../services/socket.service');

// Récupérer toutes les conversations de l'utilisateur (client ou coiffeuse)
const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role.toUpperCase();
    
    // Mapper le rôle professional vers STYLIST
    const mappedRole = userRole === 'PROFESSIONAL' ? 'STYLIST' : userRole;

    console.log('Récupération des conversations pour:', userId, 'rôle:', userRole, 'rôle mappé:', mappedRole);

    // Utiliser l'index approprié selon le rôle de l'utilisateur
    const queryParams = {
      TableName: dynamoConfig.tables.conversation,
      IndexName: mappedRole === 'STYLIST' ? 'byStylist' : 'byClient',
      KeyConditionExpression: mappedRole === 'STYLIST' ? 'stylistId = :userId' : 'clientId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    console.log('Paramètres de requête:', JSON.stringify(queryParams, null, 2));

    const result = await docClient.query(queryParams).promise();
    
    console.log('Conversations trouvées:', result.Items ? result.Items.length : 0);
    
    // Enrichir les conversations avec les informations des participants
    const conversations = await Promise.all(result.Items.map(async (conversation) => {
      const otherUserId = mappedRole === 'STYLIST' ? conversation.clientId : conversation.stylistId;
      
      let otherUser;
      if (mappedRole === 'STYLIST') {
        // Si l'utilisateur est un styliste, l'autre personne est un client (table user)
        const userResult = await docClient.get({
          TableName: dynamoConfig.tables.user,
          Key: { id: otherUserId }
        }).promise();
        otherUser = userResult.Item;
      } else {
        // Si l'utilisateur est un client, l'autre personne est un styliste (table stylist)
        const stylistResult = await docClient.get({
          TableName: dynamoConfig.tables.stylist,
          Key: { id: otherUserId }
        }).promise();
        otherUser = stylistResult.Item;
      }
      
      const lastMessage = await docClient.query({
        TableName: dynamoConfig.tables.message,
        IndexName: 'byConversation',
        KeyConditionExpression: 'conversationId = :conversationId',
        ExpressionAttributeValues: {
          ':conversationId': conversation.id
        },
        ScanIndexForward: false,
        Limit: 1
      }).promise();

      return {
        ...conversation,
        otherUser: otherUser,
        lastMessage: lastMessage.Items[0] || null
      };
    }));

    console.log('Conversations enrichies:', conversations.length);

    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des conversations',
      error: error.message
    });
  }
};

// Récupérer une conversation spécifique
const getConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role.toUpperCase();
    
    // Mapper le rôle professional vers STYLIST
    const mappedRole = userRole === 'PROFESSIONAL' ? 'STYLIST' : userRole;

    console.log('Récupération de la conversation:', id, 'pour:', userId, 'rôle:', userRole, 'rôle mappé:', mappedRole);

    const conversation = await docClient.get({
      TableName: dynamoConfig.tables.conversation,
      Key: { id }
    }).promise();

    if (!conversation.Item) {
      console.log('Conversation non trouvée:', id);
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur a accès à cette conversation
    if (mappedRole === 'STYLIST' && conversation.Item.stylistId !== userId) {
      console.log('Accès refusé - styliste:', conversation.Item.stylistId, 'utilisateur:', userId);
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }
    if (mappedRole === 'CLIENT' && conversation.Item.clientId !== userId) {
      console.log('Accès refusé - client:', conversation.Item.clientId, 'utilisateur:', userId);
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    // Enrichir la conversation avec les informations des participants
    const otherUserId = mappedRole === 'STYLIST' ? conversation.Item.clientId : conversation.Item.stylistId;
    
    let otherUser;
    if (mappedRole === 'STYLIST') {
      // Si l'utilisateur est un styliste, l'autre personne est un client (table user)
      const userResult = await docClient.get({
        TableName: dynamoConfig.tables.user,
        Key: { id: otherUserId }
      }).promise();
      otherUser = userResult.Item;
    } else {
      // Si l'utilisateur est un client, l'autre personne est un styliste (table stylist)
      const stylistResult = await docClient.get({
        TableName: dynamoConfig.tables.stylist,
        Key: { id: otherUserId }
      }).promise();
      otherUser = stylistResult.Item;
    }
    
    const messages = await docClient.query({
      TableName: dynamoConfig.tables.message,
      IndexName: 'byConversation',
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': id
      },
      ScanIndexForward: false,
      Limit: 50
    }).promise();

    console.log('Messages trouvés:', messages.Items ? messages.Items.length : 0);

    res.json({
      success: true,
      data: {
        ...conversation.Item,
        otherUser: otherUser,
        messages: messages.Items
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la conversation',
      error: error.message
    });
  }
};

// Créer une nouvelle conversation
const createConversation = async (req, res) => {
  try {
    const { stylistId, clientId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log('Création de conversation:', { stylistId, clientId, userId, userRole });

    // Vérifier que l'utilisateur a le droit de créer cette conversation
    if (userRole === 'STYLIST' && userId !== stylistId) {
      console.log('Accès refusé pour la création de conversation');
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }
    if (userRole === 'client' && userId !== clientId) {
      console.log('Accès refusé pour la création de conversation');
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    // Vérifier que la coiffeuse existe
    const stylist = await docClient.get({
      TableName: dynamoConfig.tables.stylist,
      Key: { id: stylistId }
    }).promise();

    if (!stylist.Item) {
      console.log('Styliste non trouvé:', stylistId);
      return res.status(404).json({
        success: false,
        message: 'Coiffeuse non trouvée'
      });
    }

    // Vérifier que le client existe
    const client = await docClient.get({
      TableName: dynamoConfig.tables.user,
      Key: { id: clientId }
    }).promise();

    if (!client.Item) {
      console.log('Client non trouvé:', clientId);
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    // Vérifier si une conversation existe déjà
    const existingConversation = await docClient.query({
      TableName: dynamoConfig.tables.conversation,
      IndexName: 'byStylist',
      KeyConditionExpression: 'stylistId = :stylistId',
      FilterExpression: 'clientId = :clientId',
      ExpressionAttributeValues: {
        ':stylistId': stylistId,
        ':clientId': clientId
      }
    }).promise();

    if (existingConversation.Items && existingConversation.Items.length > 0) {
      console.log('Conversation existante trouvée:', existingConversation.Items[0].id);
      return res.json({
        success: true,
        data: existingConversation.Items[0]
      });
    }

    // Créer la conversation
    const conversation = {
      id: uuidv4(),
      stylistId,
      clientId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('Nouvelle conversation à créer:', conversation);

    await docClient.put({
      TableName: dynamoConfig.tables.conversation,
      Item: conversation
    }).promise();

    console.log('Conversation créée avec succès:', conversation.id);

    res.status(201).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Erreur lors de la création de la conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la conversation',
      error: error.message
    });
  }
};

// Supprimer une conversation
const deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const conversation = await docClient.get({
      TableName: dynamoConfig.tables.conversation,
      Key: { id }
    }).promise();

    if (!conversation.Item) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur a le droit de supprimer cette conversation
    if (userRole === 'STYLIST' && conversation.Item.stylistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }
    if (userRole === 'client' && conversation.Item.clientId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    // Supprimer la conversation et tous ses messages
    await Promise.all([
      docClient.delete({
        TableName: dynamoConfig.tables.conversation,
        Key: { id }
      }).promise(),
      docClient.query({
        TableName: dynamoConfig.tables.message,
        KeyConditionExpression: 'conversationId = :conversationId',
        ExpressionAttributeValues: {
          ':conversationId': id
        }
      }).then(result => {
        return Promise.all(result.Items.map(message => 
          docClient.delete({
            TableName: dynamoConfig.tables.message,
            Key: { id: message.id }
          }).promise()
        ));
      })
    ]);

    res.json({
      success: true,
      message: 'Conversation supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la conversation',
      error: error.message
    });
  }
};

// Récupérer les messages d'une conversation
const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log('Récupération des messages pour la conversation:', id);

    const conversation = await docClient.get({
      TableName: dynamoConfig.tables.conversation,
      Key: { id }
    }).promise();

    if (!conversation.Item) {
      console.log('Conversation non trouvée:', id);
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur a accès à cette conversation
    if (userRole === 'STYLIST' && conversation.Item.stylistId !== userId) {
      console.log('Accès refusé aux messages - styliste:', conversation.Item.stylistId, 'utilisateur:', userId);
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }
    if (userRole === 'client' && conversation.Item.clientId !== userId) {
      console.log('Accès refusé aux messages - client:', conversation.Item.clientId, 'utilisateur:', userId);
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    const result = await docClient.query({
      TableName: dynamoConfig.tables.message,
      IndexName: 'byConversation',
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': id
      },
      ScanIndexForward: false,
      Limit: 50
    }).promise();

    console.log('Messages trouvés:', result.Items ? result.Items.length : 0);

    res.json({
      success: true,
      data: result.Items
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des messages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des messages',
      error: error.message
    });
  }
};

// Envoyer un message
const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role.toUpperCase();
    
    // Mapper le rôle professional vers STYLIST
    const mappedRole = userRole === 'PROFESSIONAL' ? 'STYLIST' : userRole;

    console.log('Envoi de message dans la conversation:', id, 'par:', userId, 'rôle:', userRole, 'rôle mappé:', mappedRole);

    const conversation = await docClient.get({
      TableName: dynamoConfig.tables.conversation,
      Key: { id }
    }).promise();

    if (!conversation.Item) {
      console.log('Conversation non trouvée pour l\'envoi:', id);
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur a accès à cette conversation
    if (mappedRole === 'STYLIST' && conversation.Item.stylistId !== userId) {
      console.log('Accès refusé pour l\'envoi - styliste:', conversation.Item.stylistId, 'utilisateur:', userId);
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }
    if (mappedRole === 'CLIENT' && conversation.Item.clientId !== userId) {
      console.log('Accès refusé pour l\'envoi - client:', conversation.Item.clientId, 'utilisateur:', userId);
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    const message = {
      id: uuidv4(),
      conversationId: id,
      senderId: userId,
      content,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    console.log('Message à envoyer:', message);

    await docClient.put({
      TableName: dynamoConfig.tables.message,
      Item: message
    }).promise();

    // Mettre à jour la date de dernière mise à jour de la conversation
    await docClient.update({
      TableName: dynamoConfig.tables.conversation,
      Key: { id },
      UpdateExpression: 'SET updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':updatedAt': new Date().toISOString()
      }
    }).promise();

    console.log('Message envoyé avec succès:', message.id);

    // Déterminer qui est l'autre personne dans la conversation
    let otherUserId;
    
    console.log('=== DEBUG SEND MESSAGE ===');
    console.log('userRole:', userRole);
    console.log('mappedRole:', mappedRole);
    console.log('userId (expéditeur):', userId);
    console.log('conversation.stylistId:', conversation.Item.stylistId);
    console.log('conversation.clientId:', conversation.Item.clientId);
    
    if (mappedRole === 'STYLIST') {
      // Si l'expéditeur est un styliste, l'autre personne est le client
      otherUserId = conversation.Item.clientId;
      console.log('Expéditeur est STYLIST, destinataire (client):', otherUserId);
    } else {
      // Si l'expéditeur est un client, l'autre personne est le styliste
      // Mais il faut récupérer l'userId du styliste depuis la table stylist
      console.log('Expéditeur est CLIENT, récupération du styliste:', conversation.Item.stylistId);
      
      const stylist = await docClient.get({
        TableName: dynamoConfig.tables.stylist,
        Key: { id: conversation.Item.stylistId }
      }).promise();
      
      if (stylist.Item) {
        otherUserId = stylist.Item.userId;
        console.log('Styliste trouvé, userId:', otherUserId);
        console.log('Styliste pseudo:', stylist.Item.pseudo);
      } else {
        console.error('Styliste non trouvé:', conversation.Item.stylistId);
        otherUserId = conversation.Item.stylistId; // Fallback
      }
    }
    
    console.log('otherUserId final:', otherUserId);
    console.log('=== FIN DEBUG ===');
    
    // Émettre l'événement new-message à l'autre personne spécifiquement
    socketService.emitNotification(otherUserId, {
      type: 'new-message',
      title: 'Nouveau message',
      body: content,
      data: {
        conversationId: id,
        message: message
      }
    });

    // Émettre aussi à la room de conversation pour ceux qui sont déjà connectés
    socketService.emitNewMessage(id, message);

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi du message:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi du message',
      error: error.message
    });
  }
};

// Marquer un message comme lu
const markMessageAsRead = async (req, res) => {
  try {
    const { id, messageId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const conversation = await docClient.get({
      TableName: dynamoConfig.tables.conversation,
      Key: { id }
    }).promise();

    if (!conversation.Item) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur a accès à cette conversation
    if (userRole === 'STYLIST' && conversation.Item.stylistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }
    if (userRole === 'client' && conversation.Item.clientId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    const message = await docClient.get({
      TableName: dynamoConfig.tables.message,
      Key: { id: messageId }
    }).promise();

    if (!message.Item) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }

    // Ne marquer comme lu que si le message n'est pas déjà lu
    if (!message.Item.isRead) {
      await docClient.update({
        TableName: dynamoConfig.tables.message,
        Key: { id: messageId },
        UpdateExpression: 'SET isRead = :isRead',
        ExpressionAttributeValues: {
          ':isRead': true
        }
      }).promise();
    }

    res.json({
      success: true,
      message: 'Message marqué comme lu'
    });
  } catch (error) {
    console.error('Erreur lors du marquage du message comme lu:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du marquage du message comme lu',
      error: error.message
    });
  }
};

// Marquer toute une conversation comme lue
const markConversationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const conversation = await docClient.get({
      TableName: dynamoConfig.tables.conversation,
      Key: { id }
    }).promise();

    if (!conversation.Item) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur a accès à cette conversation
    if (userRole === 'STYLIST' && conversation.Item.stylistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }
    if (userRole === 'client' && conversation.Item.clientId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    // Récupérer tous les messages non lus de cette conversation envoyés par l'autre utilisateur
    const messages = await docClient.scan({
      TableName: dynamoConfig.tables.message,
      FilterExpression: 'conversationId = :conversationId AND isRead = :isRead AND senderId <> :userId',
      ExpressionAttributeValues: {
        ':conversationId': id,
        ':isRead': false,
        ':userId': userId
      }
    }).promise();

    // Marquer tous ces messages comme lus
    if (messages.Items && messages.Items.length > 0) {
      const updatePromises = messages.Items.map(message => 
        docClient.update({
          TableName: dynamoConfig.tables.message,
          Key: { id: message.id },
          UpdateExpression: 'SET isRead = :isRead',
          ExpressionAttributeValues: {
            ':isRead': true
          }
        }).promise()
      );

      await Promise.all(updatePromises);
    }

    res.json({
      success: true,
      message: 'Conversation marquée comme lue',
      updatedCount: messages.Items ? messages.Items.length : 0
    });
  } catch (error) {
    console.error('Erreur lors du marquage de la conversation comme lue:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du marquage de la conversation comme lue',
      error: error.message
    });
  }
};

// Supprimer un message
const deleteMessage = async (req, res) => {
  try {
    const { id, messageId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const conversation = await docClient.get({
      TableName: dynamoConfig.tables.conversation,
      Key: { id }
    }).promise();

    if (!conversation.Item) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur a accès à cette conversation
    if (userRole === 'STYLIST' && conversation.Item.stylistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }
    if (userRole === 'client' && conversation.Item.clientId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    const message = await docClient.get({
      TableName: dynamoConfig.tables.message,
      Key: { id: messageId }
    }).promise();

    if (!message.Item) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }

    // Vérifier que l'utilisateur est l'expéditeur du message
    if (message.Item.senderId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer ce message'
      });
    }

    await docClient.delete({
      TableName: dynamoConfig.tables.message,
      Key: { id: messageId }
    }).promise();

    res.json({
      success: true,
      message: 'Message supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du message:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du message',
      error: error.message
    });
  }
};

// Récupérer le nombre de messages non lus
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Récupérer toutes les conversations de l'utilisateur
    const conversations = await docClient.scan({
      TableName: dynamoConfig.tables.conversation,
      FilterExpression: userRole === 'STYLIST' ? 'stylistId = :userId' : 'clientId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise();

    // Pour chaque conversation, compter les messages non lus
    const unreadCounts = await Promise.all(conversations.Items.map(async (conversation) => {
      const result = await docClient.scan({
        TableName: dynamoConfig.tables.message,
        FilterExpression: 'conversationId = :conversationId AND isRead = :isRead AND senderId <> :userId',
        ExpressionAttributeValues: {
          ':conversationId': conversation.id,
          ':isRead': false,
          ':userId': userId
        }
      }).promise();

      return {
        conversationId: conversation.id,
        unreadCount: result.Count
      };
    }));

    res.json({
      success: true,
      data: unreadCounts
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du nombre de messages non lus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du nombre de messages non lus',
      error: error.message
    });
  }
};

// Marquer tous les messages comme lus
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Récupérer toutes les conversations de l'utilisateur
    const conversations = await docClient.scan({
      TableName: dynamoConfig.tables.conversation,
      FilterExpression: userRole === 'STYLIST' ? 'stylistId = :userId' : 'clientId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise();

    // Pour chaque conversation, marquer tous les messages non lus comme lus
    await Promise.all(conversations.Items.map(async (conversation) => {
      const messages = await docClient.scan({
        TableName: dynamoConfig.tables.message,
        FilterExpression: 'conversationId = :conversationId AND isRead = :isRead AND senderId <> :userId',
        ExpressionAttributeValues: {
          ':conversationId': conversation.id,
          ':isRead': false,
          ':userId': userId
        }
      }).promise();

      return Promise.all(messages.Items.map(message =>
        docClient.update({
          TableName: dynamoConfig.tables.message,
          Key: { id: message.id },
          UpdateExpression: 'SET isRead = :isRead',
          ExpressionAttributeValues: {
            ':isRead': true
          }
        }).promise()
      ));
    }));

    res.json({
      success: true,
      message: 'Tous les messages ont été marqués comme lus'
    });
  } catch (error) {
    console.error('Erreur lors du marquage de tous les messages comme lus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du marquage de tous les messages comme lus',
      error: error.message
    });
  }
};

module.exports = {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  getMessages,
  sendMessage,
  markMessageAsRead,
  deleteMessage,
  getUnreadCount,
  markAllAsRead,
  markConversationAsRead
}; 