const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/message.controller');
const { authenticateToken } = require('../middleware/auth');

// Routes des conversations
router.get('/conversations', authenticateToken, MessageController.getConversations);
router.get('/conversations/:id', authenticateToken, MessageController.getConversation);
router.post('/conversations', authenticateToken, MessageController.createConversation);
router.delete('/conversations/:id', authenticateToken, MessageController.deleteConversation);

// Routes des messages
router.get('/conversations/:id/messages', authenticateToken, MessageController.getMessages);
router.post('/conversations/:id/messages', authenticateToken, MessageController.sendMessage);
router.post('/conversations/:id/read', authenticateToken, MessageController.markConversationAsRead);
router.put('/conversations/:id/messages/:messageId/read', authenticateToken, MessageController.markMessageAsRead);
router.delete('/conversations/:id/messages/:messageId', authenticateToken, MessageController.deleteMessage);

// Routes des notifications de message
router.get('/unread-count', authenticateToken, MessageController.getUnreadCount);
router.put('/mark-all-read', authenticateToken, MessageController.markAllAsRead);

module.exports = router; 