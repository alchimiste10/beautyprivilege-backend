const stripe = require('stripe')(process.env.REACT_APP_STRIPE_SECRET_KEY);

module.exports = {
  stripe,
  getPublicKey: () => process.env.REACT_APP_STRIPE_PUBLIC_KEY,
  getWebhookSecret: () => process.env.REACT_APP_STRIPE_WEBHOOK_SECRET
}; 