const AWS = require('aws-sdk');
require('dotenv').config({ path: '/Users/admin/beautyprivilege-backend/.env' });
const cors = require('cors');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

// Debug log pour les variables S3
console.log('=== VARIABLES D\'ENVIRONNEMENT S3 ===');
console.log('REACT_APP_AWS_USER_FILES_S3_BUCKET:', process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET);
console.log('REACT_APP_AWS_USER_FILES_S3_BUCKET_REGION:', process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET_REGION);
console.log('Type de REACT_APP_AWS_USER_FILES_S3_BUCKET:', typeof process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET);
console.log('====================================');

// Configuration AWS
AWS.config.update({
  region: process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET_REGION || 'eu-west-1',
  accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
});

// Configuration Cognito
const cognitoConfig = {
  userPoolId: process.env.REACT_APP_AWS_USER_POOLS_ID || 'eu-west-1_wv2R0W2yq',
  clientId: process.env.REACT_APP_AWS_USER_POOLS_WEB_CLIENT_ID || 'c7l3va380oetfg5dm3lrdrdi',
  identityPoolId: process.env.REACT_APP_AWS_IDENTITY_POOL_ID || 'eu-west-1:afb2a5ac-d4f2-4163-b54b-e1ffa724bcc7'
};

// Configuration DynamoDB
const dynamoConfig = {
  tables: {
    user: process.env.USER_TABLE || 'UserTable',
    stylist: process.env.STYLIST_TABLE || 'StylistTable',
    salon: process.env.SALON_TABLE || 'SalonTable',
    service: process.env.SERVICE_TABLE || 'ServiceTable',
    booking: process.env.BOOKING_TABLE || 'BookingTable',
    message: process.env.MESSAGE_TABLE || 'MessageTable',
    conversation: process.env.CONVERSATION_TABLE || 'ConversationTable',
    post: process.env.POST_TABLE || 'PostTable',
    comment: process.env.COMMENT_TABLE || 'CommentTable',
    payment: process.env.PAYMENT_TABLE || 'PaymentTable',
    availability: process.env.AVAILABILITY_TABLE || 'AvailabilityTable',
    category: process.env.CATEGORY_TABLE || 'CategoryTable'
  }
};

// Debug log pour les variables d'environnement
console.log('=== VARIABLES D\'ENVIRONNEMENT DYNAMODB ===');
console.log('AVAILABILITY_TABLE:', process.env.AVAILABILITY_TABLE);
console.log('BOOKING_TABLE:', process.env.BOOKING_TABLE);
console.log('CATEGORY_TABLE:', process.env.CATEGORY_TABLE);
console.log('PAYMENT_TABLE:', process.env.PAYMENT_TABLE);
console.log('PHOTO_TABLE:', process.env.PHOTO_TABLE);
console.log('POST_TABLE_NAME:', process.env.POST_TABLE_NAME);
console.log('REVIEW_TABLE:', process.env.REVIEW_TABLE);
console.log('SALON_TABLE:', process.env.SALON_TABLE);
console.log('SERVICE_TABLE:', process.env.SERVICE_TABLE);
console.log('STYLIST_TABLE:', process.env.STYLIST_TABLE);
console.log('USER_TABLE:', process.env.USER_TABLE);
console.log('MESSAGE_TABLE:', process.env.MESSAGE_TABLE);
console.log('CONVERSATION_TABLE:', process.env.CONVERSATION_TABLE);
console.log('DYNAMO_TABLE_APPOINTMENTS:', process.env.DYNAMO_TABLE_APPOINTMENTS);
console.log('========================================');

// Log spécifique pour la table booking
console.log('=== CONFIGURATION TABLE BOOKING ===');
console.log('process.env.BOOKING_TABLE:', process.env.BOOKING_TABLE);
console.log('dynamoConfig.tables.booking:', dynamoConfig.tables.booking);
console.log('Type de BOOKING_TABLE:', typeof process.env.BOOKING_TABLE);
console.log('Type de dynamoConfig.tables.booking:', typeof dynamoConfig.tables.booking);
console.log('====================================');

// Configuration S3
const s3Config = {
  bucket: process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET,
  region: process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET_REGION || 'eu-west-1'
};

// Initialisation des services AWS
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const s3 = new AWS.S3({
  region: s3Config.region
});
const docClient = new AWS.DynamoDB.DocumentClient({
  region: process.env.REACT_APP_AWS_USER_FILES_S3_BUCKET_REGION || 'eu-west-1'
});

// CORS Configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.REACT_APP_FRONTEND_URL 
    : ['http://localhost:8081', 'https://beautyprivilege.vercel.app', 'http://localhost:4242', 'http://localhost:19006', 'http://localhost:19000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200
};

const corsMiddleware = cors(corsOptions);

// Log de la configuration
console.log('=== CONFIGURATION AWS ===');
console.log('Region:', process.env.REACT_APP_AWS_REGION || 'eu-west-1');
console.log('S3 Bucket:', s3Config.bucket);
console.log('Cognito User Pool:', cognitoConfig.userPoolId);
console.log('DynamoDB Tables:', dynamoConfig.tables);
console.log('CORS Origins:', corsOptions.origin);
console.log('========================');

module.exports = {
  s3,
  docClient,
  corsMiddleware,
  AWS,
  cognito,
  dynamoDB,
  cognitoConfig,
  dynamoConfig,
  s3Config
};
