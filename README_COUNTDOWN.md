# Système de Compte à Rebours et Refus Automatique

## 🎯 Objectif

Le système de compte à rebours permet de :
- **Refuser automatiquement** les RDV après 2 jours sans réponse
- **Afficher un compte à rebours** pour les RDV en attente
- **Notifier les utilisateurs** quand un RDV va expirer

## ⏰ Fonctionnement

### Refus Automatique
- **Délai** : 2 jours (48 heures) après création du RDV
- **Condition** : RDV avec statut `PENDING` uniquement
- **Action** : Statut passe à `REJECTED` avec raison "2 jours sans réponse"

### Compte à Rebours
- **Calcul** : Temps restant avant refus automatique
- **Format** : Jours, heures, minutes
- **Alertes** : Moins de 24h et moins de 6h

## 🔧 Implémentation

### 1. Modèle Appointment (`Server/models/appointment.model.js`)

```javascript
// Vérifier si un RDV a dépassé 2 jours sans réponse
isOverdue: (appointment) => {
  const now = new Date();
  const createdAt = new Date(appointment.createdAt);
  const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
  return (now - createdAt) > twoDaysInMs;
}

// Calculer le temps restant avant refus automatique
getTimeUntilAutoRejection: (appointment) => {
  const now = new Date();
  const createdAt = new Date(appointment.createdAt);
  const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
  const timeElapsed = now - createdAt;
  return Math.max(0, twoDaysInMs - timeElapsed);
}

// Formater le temps restant pour l'affichage
formatTimeRemaining: (milliseconds) => {
  return {
    days: Math.floor(milliseconds / (24 * 60 * 60 * 1000)),
    hours: Math.floor((milliseconds % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
    minutes: Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000)),
    expired: milliseconds <= 0,
    totalSeconds: Math.floor(milliseconds / 1000)
  };
}
```

### 2. Enrichissement des RDV

```javascript
// Enrichir un RDV avec les informations de compte à rebours
enrichWithCountdown: (appointment) => {
  const enriched = { ...appointment };
  
  if (appointment.status === 'PENDING') {
    const timeRemaining = Appointment.getTimeUntilAutoRejection(appointment);
    const formattedTime = Appointment.formatTimeRemaining(timeRemaining);
    
    enriched.countdown = {
      timeRemaining: timeRemaining,
      formatted: formattedTime,
      willExpireSoon: timeRemaining < (24 * 60 * 60 * 1000), // Moins de 24h
      isOverdue: formattedTime.expired
    };
  }
  
  return enriched;
}
```

## 📡 Routes API

### Statistiques de Compte à Rebours (Client)
```http
GET /api/appointments/countdown/stats
Authorization: Bearer <token>
```

**Réponse :**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "expiringSoon": 2,
    "critical": 1,
    "averageTimeRemaining": 86400000
  }
}
```

### Statistiques de Compte à Rebours (Styliste)
```http
GET /api/appointments/countdown/stylist/stats
Authorization: Bearer <token>
```

### Compte à Rebours d'un RDV Spécifique
```http
GET /api/appointments/:id/countdown
Authorization: Bearer <token>
```

**Réponse :**
```json
{
  "success": true,
  "data": {
    "appointment": {
      "id": "BK123456",
      "status": "PENDING",
      "date": "2024-01-25",
      "countdown": {
        "timeRemaining": 86400000,
        "formatted": {
          "days": 1,
          "hours": 0,
          "minutes": 0,
          "expired": false,
          "totalSeconds": 86400
        },
        "willExpireSoon": true,
        "isOverdue": false
      }
    }
  }
}
```

## 🎨 Utilisation Frontend

### Affichage du Compte à Rebours

```javascript
// Exemple d'affichage
const formatCountdown = (countdown) => {
  if (!countdown) return null;
  
  const { days, hours, minutes } = countdown.formatted;
  
  if (countdown.isOverdue) {
    return "⚠️ Expiré";
  } else if (countdown.willExpireSoon) {
    return `⏰ ${days}j ${hours}h ${minutes}m (Expire bientôt)`;
  } else {
    return `⏱️ ${days}j ${hours}h ${minutes}m`;
  }
};

// Affichage avec couleurs
const getCountdownColor = (countdown) => {
  if (countdown.isOverdue) return 'red';
  if (countdown.timeRemaining < (6 * 60 * 60 * 1000)) return 'orange';
  if (countdown.willExpireSoon) return 'yellow';
  return 'green';
};
```

### Mise à Jour en Temps Réel

```javascript
// Mettre à jour le compte à rebours toutes les minutes
setInterval(() => {
  updateCountdown();
}, 60 * 1000);

// Ou utiliser WebSocket pour les mises à jour en temps réel
socket.on('countdown-update', (data) => {
  updateCountdownDisplay(data);
});
```

## 📊 Statistiques Disponibles

### Pour les Clients
- **total** : Nombre total de RDV en attente
- **expiringSoon** : RDV qui expirent dans moins de 24h
- **critical** : RDV qui expirent dans moins de 6h
- **averageTimeRemaining** : Temps moyen restant en millisecondes

### Pour les Stylistes
- Mêmes statistiques mais pour leurs RDV en attente

## 🔄 Flux Complet

### Création d'un RDV
1. **RDV créé** → Statut `PENDING`, `createdAt` enregistré
2. **Compte à rebours** → 48h restantes affichées

### Pendant les 2 Jours
3. **Compte à rebours** → Décrémente en temps réel
4. **Alertes** → Moins de 24h, puis moins de 6h
5. **Notifications** → Possibilité d'envoyer des notifications

### Après 2 Jours
6. **Refus automatique** → Statut `REJECTED`
7. **Raison** → "Refusé automatiquement - 2 jours sans réponse"
8. **Créneau libéré** → Disponible pour d'autres réservations

## 🎯 Avantages

✅ **Urgence** : Les stylistes voient les RDV qui expirent bientôt  
✅ **Transparence** : Les clients savent combien de temps il reste  
✅ **Automatisation** : Plus de RDV qui traînent indéfiniment  
✅ **Performance** : Créneaux libérés automatiquement  
✅ **UX** : Interface dynamique avec compte à rebours  
✅ **Flexibilité** : Différents niveaux d'alerte  

## ⚠️ Points d'Attention

- **Timezone** : Utilise le timezone du serveur
- **Performance** : Calculs en temps réel pour chaque RDV
- **Concurrence** : Gestion des mises à jour simultanées
- **Récupération** : Impossible de "récupérer" un RDV refusé

## 🚀 Exemples d'Utilisation

### Dashboard Styliste
```javascript
// Afficher les RDV critiques
const criticalAppointments = appointments.filter(app => 
  app.countdown && app.countdown.timeRemaining < (6 * 60 * 60 * 1000)
);

// Badge avec nombre de RDV qui expirent bientôt
const expiringSoonCount = appointments.filter(app => 
  app.countdown && app.countdown.willExpireSoon
).length;
```

### Interface Client
```javascript
// Afficher le temps restant
const timeLeft = appointment.countdown?.formatted;
if (timeLeft) {
  displayCountdown(`${timeLeft.days}j ${timeLeft.hours}h ${timeLeft.minutes}m`);
}
``` 