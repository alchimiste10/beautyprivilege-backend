require('dotenv').config({ path: '/Users/admin/beautyprivilege-backend/.env' });

// Log de la date au démarrage
console.log('=== DATE DU SERVEUR ===');
console.log('Date système:', new Date().toISOString());
console.log('Date locale:', new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));
console.log('========================');

// Log des variables d'environnement importantes
console.log('=== VARIABLES D\'ENVIRONNEMENT ===');
console.log('REACT_APP_FRONTEND_URL:', process.env.REACT_APP_FRONTEND_URL ? 'Défini' : 'Non défini');
console.log('REACT_APP_SESSION_SECRET:', process.env.REACT_APP_SESSION_SECRET ? 'Défini' : 'Non défini');
console.log('REACT_APP_PORT:', process.env.REACT_APP_PORT);
console.log('REACT_APP_AWS_USER_FILES_S3_BUCKET_REGION:', process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET_REGION);
console.log('REACT_APP_AWS_USER_FILES_S3_BUCKET:', process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET);
console.log('REACT_APP_STRIPE_SECRET_KEY:', process.env.REACT_APP_STRIPE_SECRET_KEY ? 'Défini' : 'Non défini');
console.log('REACT_APP_STRIPE_PUBLIC_KEY:', process.env.REACT_APP_STRIPE_PUBLIC_KEY ? 'Défini' : 'Non défini');
console.log('REACT_APP_STRIPE_WEBHOOK_SECRET:', process.env.REACT_APP_STRIPE_WEBHOOK_SECRET ? 'Défini' : 'Non défini');
console.log('REACT_APP_STRIPE_WEBHOOK_SECRET length:', process.env.REACT_APP_STRIPE_WEBHOOK_SECRET ? process.env.REACT_APP_STRIPE_WEBHOOK_SECRET.length : 'N/A');
console.log('REACT_APP_STRIPE_WEBHOOK_SECRET preview:', process.env.REACT_APP_STRIPE_WEBHOOK_SECRET ? process.env.REACT_APP_STRIPE_WEBHOOK_SECRET.substring(0, 10) + '...' : 'N/A');
console.log('Chemin du .env:', '/Users/admin/beautyprivilege-backend/.env');
console.log('==============================');

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { corsMiddleware } = require('./config/awsConfig');
const { docClient, s3 } = require('./config/awsConfig');
const cors = require('cors');
const { cognitoConfig, dynamoConfig } = require('./config/awsConfig');
const userRoutes = require('./routes/users');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const serviceRouter = require('./routes/service.routes');
const salonRouter = require('./routes/salon.routes');
const stylistRouter = require('./routes/stylist.routes');
const appointmentRouter = require('./routes/appointment.routes');
const messageRouter = require('./routes/message.routes');
const uploadRoutes = require('./routes/upload.routes');
const postRoutes = require('./routes/post.routes');
const paymentRoutes = require('./routes/payment.routes');

const app = express();
const server = createServer(app);

// Configuration spéciale pour les webhooks Stripe (body brut) - TOUT AU DÉBUT
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Configuration spéciale pour les webhooks Stripe Connect (body brut)
app.use('/api/payments/connect-webhook', express.raw({ type: 'application/json' }));

// Middleware de logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(helmet());
app.set('trust proxy', true);
app.use(corsMiddleware);

app.use(session({
  secret: process.env.REACT_APP_SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Trop de requêtes, veuillez réessayer après 15 minutes",
  skip: (req) => req.path === '/api/payments/webhook'
});
app.use(limiter);

// Parser JSON pour toutes les autres routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users'));
app.use('/api/salons', require('./routes/salon.routes'));
app.use('/api/services', require('./routes/service.routes'));
app.use('/api/stylists', require('./routes/stylist.routes'));
app.use('/api/messages', require('./routes/message.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/upload', uploadRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/appointments', appointmentRouter);
app.use('/api/payments', paymentRoutes);

app.get('/api', (req, res) => res.send('API BeautyPrivilege OK'));

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Configuration CORS pour Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.EXPO_PUBLIC_API_URL || process.env.BACKEND_LOCAL_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialiser Socket.IO
const { initializeSocketIO } = require('./services/socket.service');
initializeSocketIO(io);

// Initialiser le refus automatique des rendez-vous
const AppointmentService = require('./services/appointment.service');
AppointmentService.startAutomaticRejection();

// Initialiser les transferts automatiques
const PaymentService = require('./services/payment.service');

// Fonction pour exécuter les transferts automatiques
const runAutomaticTransfers = async () => {
  try {
    console.log('🔄 Exécution des transferts automatiques...');
    await PaymentService.processAutomaticTransfers();
  } catch (error) {
    console.error('❌ Erreur lors des transferts automatiques:', error);
  }
};

// Exécuter les transferts automatiques toutes les heures
setInterval(runAutomaticTransfers, 60 * 60 * 1000); // 1 heure

// Exécuter une première fois au démarrage (après 5 minutes)
setTimeout(runAutomaticTransfers, 5 * 60 * 1000);

console.log('💰 Transferts automatiques configurés (toutes les heures)');

// Gestion des erreurs globale
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.message);
  console.error('URL:', req.url, 'Method:', req.method);

  res.status(500).json({
    message: 'Une erreur est survenue',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.REACT_APP_PORT || 4242;
server.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📡 WebSocket: ws://${process.env.BACKEND_HOST}:${PORT}`);
  console.log(`🌐 API: http://${process.env.BACKEND_HOST}:${PORT}`);
});

module.exports = { app, server, io }; 