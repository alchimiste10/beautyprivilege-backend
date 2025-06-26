# Système d'Expiration Automatique des Rendez-vous

## 🎯 Objectif

Le système d'expiration automatique permet de **refuser automatiquement** les rendez-vous qui ont dépassé leur date et heure, évitant ainsi les rendez-vous "fantômes" dans le système.

## ⏰ Fonctionnement

### Expiration Automatique
- **Fréquence** : Toutes les heures
- **Démarrage** : Automatique au lancement du serveur
- **Vérification** : Date + Heure du rendez-vous vs Date + Heure actuelle

### Statuts Gérés
- `PENDING` → `EXPIRED` (si passé)
- `CONFIRMED` → `EXPIRED` (si passé)
- `CANCELLED` → Non affecté
- `COMPLETED` → Non affecté
- `EXPIRED` → Non affecté

## 🔧 Implémentation

### 1. Modèle Appointment (`Server/models/appointment.model.js`)

```javascript
// Vérifier si un rendez-vous est expiré (date + heure)
isExpired: (appointment) => {
  const now = new Date();
  const appointmentDateTime = new Date(`${appointment.date}T${appointment.startTime || appointment.timeSlot || '00:00'}`);
  return appointmentDateTime < now;
}

// Expirer automatiquement les rendez-vous passés
expirePastAppointments: async (docClient) => {
  // Logique d'expiration automatique
}
```

### 2. Service AppointmentService (`Server/services/appointment.service.js`)

```javascript
// Démarrer le processus d'expiration automatique
startAutomaticExpiration() {
  // Exécution immédiate + toutes les heures
}

// Vérifier et expirer un rendez-vous spécifique
checkAndExpireAppointment(appointmentId) {
  // Vérification individuelle
}
```

### 3. Intégration Serveur (`Server/server.js`)

```javascript
// Initialiser l'expiration automatique des rendez-vous
const AppointmentService = require('./services/appointment.service');
AppointmentService.startAutomaticExpiration();
```

## 📡 Routes API

### Expiration Manuelle (Admin)
```http
POST /api/appointments/expire-past
Authorization: Bearer <token>
```

**Réponse :**
```json
{
  "success": true,
  "message": "Expiration automatique exécutée avec succès",
  "data": {
    "expired": 5,
    "total": 25
  }
}
```

### Vérification d'Expiration
```http
GET /api/appointments/:id/check-expiration
Authorization: Bearer <token>
```

**Réponse :**
```json
{
  "success": true,
  "data": {
    "expired": true,
    "message": "Rendez-vous expiré automatiquement"
  }
}
```

## 🛡️ Sécurité

### Vérifications Automatiques
- **Routes styliste** : Vérification avant affichage des rendez-vous
- **Mise à jour statut** : Vérification avant modification
- **Récupération rendez-vous** : Vérification avant affichage

### Protection contre les Modifications
```javascript
// Impossible de modifier un rendez-vous expiré
if (booking.Item.status === 'EXPIRED') {
  return res.status(400).json({ 
    message: 'Ce rendez-vous a expiré et ne peut plus être modifié',
    expired: true
  });
}
```

## 📊 Monitoring

### Logs Automatiques
```
🕐 Début de la vérification d'expiration automatique...
⏰ Rendez-vous BK123456 expiré automatiquement
✅ Vérification terminée: 3 rendez-vous expirés sur 15 vérifiés
```

### Métriques Disponibles
- Nombre de rendez-vous expirés
- Nombre total de rendez-vous vérifiés
- Timestamp d'expiration
- Durée d'exécution

## 🚀 Utilisation

### Démarrage Automatique
Le système se lance automatiquement avec le serveur. Aucune action manuelle requise.

### Test Manuel
```bash
# Déclencher l'expiration manuellement (admin seulement)
curl -X POST http://localhost:4242/api/appointments/expire-past \
  -H "Authorization: Bearer <admin_token>"

# Vérifier l'expiration d'un rendez-vous spécifique
curl -X GET http://localhost:4242/api/appointments/123/check-expiration \
  -H "Authorization: Bearer <token>"
```

## 🔄 Flux Complet

1. **Création** : Rendez-vous créé avec statut `PENDING`
2. **Vérification** : Toutes les heures, le système vérifie les rendez-vous
3. **Expiration** : Si date/heure passée → statut `EXPIRED`
4. **Protection** : Impossible de modifier un rendez-vous `EXPIRED`
5. **Notification** : Logs détaillés pour le monitoring

## ⚠️ Points d'Attention

- **Performance** : Scan de tous les rendez-vous toutes les heures
- **Timezone** : Utilise le timezone du serveur
- **Concurrence** : Gestion des mises à jour simultanées
- **Récupération** : Impossible de "récupérer" un rendez-vous expiré

## 🎯 Avantages

✅ **Automatisation** : Plus besoin de refuser manuellement  
✅ **Cohérence** : État toujours à jour  
✅ **Performance** : Créneaux libérés automatiquement  
✅ **Monitoring** : Logs détaillés  
✅ **Sécurité** : Protection contre les modifications  
✅ **Flexibilité** : Expiration manuelle possible 