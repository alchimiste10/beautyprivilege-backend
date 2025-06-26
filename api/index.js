const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import des routes
const userRoutes = require('../Server/routes/users');
const serviceRouter = require('../Server/routes/service.routes');
const salonRouter = require('../Server/routes/salon.routes');
const stylistRouter = require('../Server/routes/stylist.routes');
const appointmentRouter = require('../Server/routes/appointment.routes');
const messageRouter = require('../Server/routes/message.routes');
const uploadRoutes = require('../Server/routes/upload.routes');
const postRoutes = require('../Server/routes/post.routes');
const paymentRoutes = require('../Server/routes/payment.routes');

const app = express();

// Middleware de sécurité
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.REACT_APP_FRONTEND_URL 
    : [
        process.env.FRONTEND_LOCAL_URL,
        process.env.REACT_APP_FRONTEND_URL,
        process.env.FRONTEND_STRIPE_URL,
        process.env.FRONTEND_EXPO_URL,
        process.env.FRONTEND_EXPO_DEV_URL
      ].filter(Boolean),
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Trop de requêtes, veuillez réessayer après 15 minutes"
});
app.use(limiter);

// Parser JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
app.use('/api/auth', require('../Server/routes/auth.routes'));
app.use('/api/users', userRoutes);
app.use('/api/salons', salonRouter);
app.use('/api/services', serviceRouter);
app.use('/api/stylists', stylistRouter);
app.use('/api/messages', messageRouter);
app.use('/api/dashboard', require('../Server/routes/dashboard.routes'));
app.use('/api/upload', uploadRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/appointments', appointmentRouter);
app.use('/api/payments', paymentRoutes);

// Route principale
app.get('/api', (req, res) => res.send('API BeautyPrivilege OK'));

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.message);
  res.status(500).json({
    message: 'Une erreur est survenue',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Export pour Vercel
module.exports = app; 