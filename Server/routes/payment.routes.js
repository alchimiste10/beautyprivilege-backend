const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

// Route pour créer une session de paiement
router.post('/create-session', paymentController.createPaymentSession);

// Route pour créer une session de paiement à partir des informations de réservation
router.post('/create-session-from-reservation', paymentController.createPaymentSessionFromReservation);

// Route pour vérifier le statut d'une session
router.get('/check-session/:sessionId', paymentController.checkSessionStatus);

// Route pour confirmer un paiement
router.post('/confirm', paymentController.confirmPayment);

// Route pour le webhook Stripe
router.post('/webhook', paymentController.handleWebhook);

// Route pour le webhook Stripe Connect
router.post('/connect-webhook', paymentController.handleConnectWebhook);

router.get('/stripe-key', paymentController.getStripePublicKey);

module.exports = router; 