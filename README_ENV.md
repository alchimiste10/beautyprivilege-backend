# Configuration des Variables d'Environnement

## 🚀 Installation

1. Copiez le fichier `env.example` vers `.env` :
```bash
cp env.example .env
```

2. Modifiez le fichier `.env` avec vos vraies valeurs

## 📋 Variables Requises

### URLs Frontend
- `REACT_APP_FRONTEND_URL` : URL de production du frontend
- `FRONTEND_LOCAL_URL` : URL locale du frontend (développement)
- `FRONTEND_EXPO_URL` : URL Expo
- `FRONTEND_EXPO_DEV_URL` : URL Expo développement
- `FRONTEND_STRIPE_URL` : URL Stripe locale

### URLs Backend
- `BACKEND_LOCAL_URL` : URL locale du backend
- `BACKEND_HOST` : Host du backend
- `BACKEND_PORT` : Port du backend

### URLs de Paiement
- `PAYMENT_SUCCESS_URL` : URL de succès après paiement
- `PAYMENT_CANCEL_URL` : URL d'annulation de paiement

### Configuration AWS
- `REACT_APP_AWS_REGION` : Région AWS
- `REACT_APP_AWS_ACCESS_KEY_ID` : Clé d'accès AWS
- `REACT_APP_AWS_SECRET_ACCESS_KEY` : Clé secrète AWS
- `REACT_APP_AWS_USER_FILES_S3_BUCKET` : Nom du bucket S3
- `REACT_APP_AWS_USER_FILES_S3_BUCKET_REGION` : Région du bucket S3
- `REACT_APP_AWS_USER_POOLS_ID` : ID du pool utilisateur Cognito
- `REACT_APP_AWS_USER_POOLS_WEB_CLIENT_ID` : ID client web Cognito
- `REACT_APP_AWS_IDENTITY_POOL_ID` : ID du pool d'identité

### Configuration DynamoDB
- `USER_TABLE` : Table des utilisateurs
- `STYLIST_TABLE` : Table des stylistes
- `SALON_TABLE` : Table des salons
- `SERVICE_TABLE` : Table des services
- `BOOKING_TABLE` : Table des réservations
- `MESSAGE_TABLE` : Table des messages
- `CONVERSATION_TABLE` : Table des conversations
- `POST_TABLE` : Table des posts
- `COMMENT_TABLE` : Table des commentaires
- `PAYMENT_TABLE` : Table des paiements
- `AVAILABILITY_TABLE` : Table des disponibilités
- `CATEGORY_TABLE` : Table des catégories

### Configuration Stripe
- `REACT_APP_STRIPE_SECRET_KEY` : Clé secrète Stripe
- `REACT_APP_STRIPE_PUBLIC_KEY` : Clé publique Stripe
- `REACT_APP_STRIPE_WEBHOOK_SECRET` : Secret webhook Stripe

### Configuration Session
- `REACT_APP_SESSION_SECRET` : Secret de session

### Configuration Expo
- `EXPO_PUBLIC_API_URL` : URL publique de l'API pour Expo

## ⚠️ Important

- **AUCUNE URL localhost** n'est plus utilisée dans le code
- Toutes les URLs sont maintenant configurées via des variables d'environnement
- Le code utilise `.filter(Boolean)` pour ignorer les variables non définies
- Assurez-vous que toutes les variables requises sont définies dans votre `.env`

## 🔧 Démarrage

```bash
# Installer les dépendances
npm install

# Démarrer le serveur
npm start
``` 