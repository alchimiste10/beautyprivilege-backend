const stripe = require('stripe')(process.env.REACT_APP_STRIPE_SECRET_KEY);

module.exports = {
  stripe,
  getPublicKey: () => process.env.REACT_APP_STRIPE_PUBLIC_KEY,
  getWebhookSecret: () => process.env.REACT_APP_STRIPE_WEBHOOK_SECRET,
  
  // Configuration Stripe Connect
  getConnectClientId: () => process.env.REACT_APP_STRIPE_CONNECT_CLIENT_ID,
  getConnectWebhookSecret: () => process.env.REACT_APP_STRIPE_CONNECT_WEBHOOK_SECRET,
  getApplicationFeeAmount: () => parseInt(process.env.REACT_APP_STRIPE_APPLICATION_FEE_AMOUNT) || 500,
  getApplicationFeePercent: () => parseFloat(process.env.REACT_APP_STRIPE_APPLICATION_FEE_PERCENT) || 10
}; 