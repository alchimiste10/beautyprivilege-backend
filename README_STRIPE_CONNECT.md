# 🏦 Stripe Connect - Guide d'implémentation

## 📋 Vue d'ensemble

Stripe Connect permet aux stylistes de recevoir des paiements directement sur leur compte Stripe après validation du service par le client.

## 🔧 Configuration

### 1. Variables d'environnement

Ajoutez ces variables dans votre `.env` :

```env
# Configuration Stripe Connect
REACT_APP_STRIPE_CONNECT_CLIENT_ID=your_stripe_connect_client_id
REACT_APP_STRIPE_CONNECT_WEBHOOK_SECRET=your_stripe_connect_webhook_secret
REACT_APP_STRIPE_APPLICATION_FEE_AMOUNT=500
REACT_APP_STRIPE_APPLICATION_FEE_PERCENT=10
```

### 2. Configuration Stripe Dashboard

1. Allez sur [Stripe Dashboard](https://dashboard.stripe.com)
2. Activez Stripe Connect
3. Configurez votre application Connect
4. Récupérez votre `Connect Client ID`
5. Configurez les webhooks pour les événements Connect

## 🚀 Endpoints disponibles

### Pour les stylistes

#### 1. Se connecter à Stripe Connect
```
POST /api/stylists/connect-stripe
```
- **Headers**: `Authorization: Bearer <token>`
- **Retourne**: URL de connexion Stripe Connect

#### 2. Vérifier le statut de connexion
```
GET /api/stylists/stripe-status
```
- **Headers**: `Authorization: Bearer <token>`
- **Retourne**: Statut de la connexion Stripe

#### 3. Historique des paiements
```
GET /api/payments/stylist/payments?limit=20
```
- **Headers**: `Authorization: Bearer <token>`
- **Retourne**: Liste des transferts reçus

#### 4. Statistiques de paiement
```
GET /api/payments/stylist/stats
```
- **Headers**: `Authorization: Bearer <token>`
- **Retourne**: Statistiques des paiements

### Pour les clients

#### 1. Payer un styliste après validation
```
POST /api/payments/pay-stylist/:appointmentId
```
- **Headers**: `Authorization: Bearer <token>`
- **Retourne**: Confirmation du transfert

### Pour les admins

#### 1. Annuler un transfert
```
POST /api/payments/reverse-transfer/:transferId
```
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "reason": "Raison de l'annulation" }`

## 🔄 Flux de paiement

### 1. Réservation
1. Client réserve un service
2. Client paie via Stripe (paiement vers votre compte)
3. Rendez-vous créé avec statut `pending`

### 2. Validation du service
1. Client et styliste confirment le service
2. Client appelle `/api/payments/pay-stylist/:appointmentId`
3. Système transfère l'argent au styliste (moins les frais)
4. Rendez-vous marqué comme `completed`

### 3. Calcul des frais
- **Frais fixes**: 5€ minimum
- **Frais variables**: 10% du montant
- **Frais retenus**: Le maximum entre les deux

## 💰 Exemple de calcul

**Service à 50€**
- Frais fixes : 5€
- Frais variables : 50€ × 10% = 5€
- Frais retenus : 5€ (le maximum)
- Montant versé au styliste : 50€ - 5€ = **45€**

## 📊 Réponses API

### Connexion Stripe Connect
```json
{
  "success": true,
  "data": {
    "url": "https://connect.stripe.com/setup/s/..."
  }
}
```

### Statut de connexion
```json
{
  "success": true,
  "data": {
    "connected": true,
    "status": "active",
    "account": {
      "id": "acct_...",
      "charges_enabled": true,
      "payouts_enabled": true
    }
  }
}
```

### Paiement au styliste
```json
{
  "success": true,
  "message": "Paiement transféré au styliste avec succès",
  "data": {
    "transferId": "tr_...",
    "amount": 45.00,
    "fee": 5.00
  }
}
```

### Statistiques styliste
```json
{
  "success": true,
  "data": {
    "totalAmount": 1250.50,
    "monthlyAmount": 450.00,
    "totalTransfers": 25,
    "monthlyTransfers": 9,
    "averageTransfer": 50.02
  }
}
```

## 🔧 Configuration frontend

### 1. Bouton de connexion Stripe
```javascript
const connectToStripe = async () => {
  try {
    const response = await fetch('/api/stylists/connect-stripe', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Rediriger vers Stripe Connect
      window.location.href = data.data.url;
    }
  } catch (error) {
    console.error('Erreur de connexion Stripe:', error);
  }
};
```

### 2. Vérifier le statut
```javascript
const checkStripeStatus = async () => {
  try {
    const response = await fetch('/api/stylists/stripe-status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      if (data.data.connected) {
        console.log('Styliste connecté à Stripe');
      } else {
        console.log('Styliste non connecté');
      }
    }
  } catch (error) {
    console.error('Erreur de vérification:', error);
  }
};
```

### 3. Payer un styliste (côté client)
```javascript
const payStylist = async (appointmentId) => {
  try {
    const response = await fetch(`/api/payments/pay-stylist/${appointmentId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Styliste payé:', data.data.amount + '€');
    }
  } catch (error) {
    console.error('Erreur de paiement:', error);
  }
};
```

## 🚨 Gestion des erreurs

### Erreurs courantes

1. **Styliste non connecté**
   - Erreur : `Styliste non connecté à Stripe`
   - Solution : Rediriger vers la connexion Stripe Connect

2. **Compte Stripe non activé**
   - Erreur : `Compte Stripe non activé`
   - Solution : Attendre l'activation du compte

3. **Transfert échoué**
   - Erreur : `Transfert échoué`
   - Solution : Vérifier les informations bancaires du styliste

## 🔒 Sécurité

- Tous les endpoints nécessitent une authentification
- Seuls les stylistes peuvent voir leurs paiements
- Seuls les admins peuvent annuler des transferts
- Les webhooks sont signés par Stripe

## 📝 Notes importantes

1. **Frais Stripe** : Stripe prélève des frais sur chaque transfert
2. **Délais** : Les transferts peuvent prendre 1-3 jours ouvrables
3. **Devises** : Actuellement configuré pour l'EUR
4. **Limites** : Vérifiez les limites de votre compte Stripe

## 🆘 Support

En cas de problème :
1. Vérifiez les logs du serveur
2. Consultez le dashboard Stripe
3. Vérifiez la configuration des webhooks
4. Contactez le support Stripe si nécessaire 