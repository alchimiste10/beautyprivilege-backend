const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userRooms = new Map(); // userId -> rooms[]
  }

  initialize(io) {
    this.io = io;
    
    // Middleware d'authentification
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Token manquant'));
        }

        // Vérifier le token JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        socket.userName = decoded.name || decoded.pseudo;
        
        next();
      } catch (error) {
        console.error('Erreur d\'authentification Socket.IO:', error);
        next(new Error('Token invalide'));
      }
    });

    // Gestion de la connexion
    io.on('connection', (socket) => {
      console.log(`🔌 Utilisateur connecté: ${socket.userId} (${socket.userName})`);
      
      // Stocker la connexion utilisateur
      this.connectedUsers.set(socket.userId, socket.id);
      
      // Rejoindre les rooms spécifiques à l'utilisateur
      socket.join(`user:${socket.userId}`);
      socket.join(`role:${socket.userRole}`);
      
      // Room pour les stylistes
      if (socket.userRole === 'stylist') {
        socket.join('stylists');
      }
      
      // Room pour les clients
      if (socket.userRole === 'client') {
        socket.join('clients');
      }

      // Événements de commentaires
      socket.on('join-post-comments', (postId) => {
        socket.join(`post:${postId}`);
        console.log(`📝 ${socket.userName} rejoint les commentaires du post ${postId}`);
      });

      socket.on('leave-post-comments', (postId) => {
        socket.leave(`post:${postId}`);
        console.log(`📝 ${socket.userName} quitte les commentaires du post ${postId}`);
      });

      // Événements de messages
      socket.on('join-conversation', (conversationId) => {
        socket.join(`conversation:${conversationId}`);
        console.log(`💬 ${socket.userName} rejoint la conversation ${conversationId}`);
      });

      socket.on('leave-conversation', (conversationId) => {
        socket.leave(`conversation:${conversationId}`);
        console.log(`💬 ${socket.userName} quitte la conversation ${conversationId}`);
      });

      // Événements de réservations
      socket.on('join-stylist-bookings', (stylistId) => {
        socket.join(`stylist-bookings:${stylistId}`);
        console.log(`📅 ${socket.userName} rejoint les réservations du stylist ${stylistId}`);
      });

      // Gestion de la déconnexion
      socket.on('disconnect', () => {
        console.log(`🔌 Utilisateur déconnecté: ${socket.userId} (${socket.userName})`);
        this.connectedUsers.delete(socket.userId);
      });
    });
  }

  // Méthodes pour émettre des événements

  // Commentaires
  emitNewComment(postId, comment) {
    this.io.to(`post:${postId}`).emit('new-comment', {
      postId,
      comment,
      timestamp: new Date().toISOString()
    });
    console.log(`📝 Nouveau commentaire émis pour le post ${postId}`);
  }

  emitCommentDeleted(postId, commentId) {
    this.io.to(`post:${postId}`).emit('comment-deleted', {
      postId,
      commentId,
      timestamp: new Date().toISOString()
    });
    console.log(`🗑️ Commentaire supprimé émis pour le post ${postId}`);
  }

  // Messages
  emitNewMessage(conversationId, message) {
    this.io.to(`conversation:${conversationId}`).emit('new-message', {
      conversationId,
      message,
      timestamp: new Date().toISOString()
    });
    console.log(`💬 Nouveau message émis pour la conversation ${conversationId}`);
  }

  emitMessageRead(conversationId, messageId, userId) {
    this.io.to(`conversation:${conversationId}`).emit('message-read', {
      conversationId,
      messageId,
      userId,
      timestamp: new Date().toISOString()
    });
    console.log(`👁️ Message lu émis pour la conversation ${conversationId}`);
  }

  // Réservations
  emitNewBooking(stylistId, booking) {
    this.io.to(`stylist-bookings:${stylistId}`).emit('new-booking', {
      stylistId,
      booking,
      timestamp: new Date().toISOString()
    });
    console.log(`📅 Nouvelle réservation émie pour le stylist ${stylistId}`);
  }

  emitBookingStatusChanged(bookingId, newStatus, userId) {
    // Émettre à l'utilisateur qui a fait la réservation
    this.io.to(`user:${userId}`).emit('booking-status-changed', {
      bookingId,
      newStatus,
      timestamp: new Date().toISOString()
    });
    console.log(`📅 Statut de réservation changé émis pour l'utilisateur ${userId}`);
  }

  // Posts
  emitNewPost(post) {
    this.io.to('clients').emit('new-post', {
      post,
      timestamp: new Date().toISOString()
    });
    console.log(`📱 Nouveau post émis`);
  }

  emitPostLiked(postId, likes, userId) {
    this.io.to(`post:${postId}`).emit('post-liked', {
      postId,
      likes,
      userId,
      timestamp: new Date().toISOString()
    });
    console.log(`❤️ Post liké émis pour le post ${postId}`);
  }

  // Notifications générales
  emitNotification(userId, notification) {
    this.io.to(`user:${userId}`).emit('notification', {
      id: uuidv4(),
      ...notification,
      timestamp: new Date().toISOString()
    });
    console.log(`🔔 Notification émie pour l'utilisateur ${userId}`);
  }

  emitGlobalNotification(notification, role = null) {
    const room = role ? `role:${role}` : 'clients';
    this.io.to(room).emit('global-notification', {
      id: uuidv4(),
      ...notification,
      timestamp: new Date().toISOString()
    });
    console.log(`🌍 Notification globale émie pour ${room}`);
  }

  // Utilitaires
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  getUserSocketId(userId) {
    return this.connectedUsers.get(userId);
  }

  getOnlineUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  getOnlineStylists() {
    return this.getOnlineUsers().filter(userId => {
      const socket = this.io.sockets.sockets.get(this.connectedUsers.get(userId));
      return socket && socket.userRole === 'stylist';
    });
  }
}

const socketService = new SocketService();

const initializeSocketIO = (io) => {
  socketService.initialize(io);
};

module.exports = {
  socketService,
  initializeSocketIO
}; 