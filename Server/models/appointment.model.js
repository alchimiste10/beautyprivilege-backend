const { v4: uuidv4 } = require('uuid');
const { dynamoConfig } = require('../config/awsConfig');

// Interface pour les rendez-vous
const Appointment = {
  // Créer un nouveau rendez-vous
  create: async (docClient, appointmentData) => {
    const appointment = {
      id: uuidv4(),
      ...appointmentData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const params = {
      TableName: dynamoConfig.tables.booking,
      Item: appointment
    };

    await docClient.put(params).promise();
    return appointment;
  },

  // Obtenir un rendez-vous par ID
  getById: async (docClient, id) => {
    const params = {
      TableName: dynamoConfig.tables.booking,
      Key: { id }
    };

    const { Item } = await docClient.get(params).promise();
    return Item;
  },

  // Mettre à jour un rendez-vous
  update: async (docClient, id, updateData) => {
    const updateExpressions = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    Object.keys(updateData).forEach(key => {
      if (key !== 'id') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = updateData[key];
        expressionAttributeNames[`#${key}`] = key;
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    expressionAttributeNames['#updatedAt'] = 'updatedAt';

    const params = {
      TableName: dynamoConfig.tables.booking,
      Key: { id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW'
    };

    const { Attributes } = await docClient.update(params).promise();
    return Attributes;
  },

  // Supprimer un rendez-vous
  delete: async (docClient, id) => {
    const params = {
      TableName: dynamoConfig.tables.booking,
      Key: { id }
    };

    await docClient.delete(params).promise();
  },

  // Obtenir les rendez-vous d'un client
  getByClientId: async (docClient, clientId) => {
    const params = {
      TableName: dynamoConfig.tables.booking,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': clientId
      }
    };

    const { Items } = await docClient.scan(params).promise();
    return Items;
  },

  // Obtenir les rendez-vous d'un salon
  getBySalonId: async (docClient, salonId) => {
    const params = {
      TableName: dynamoConfig.tables.booking,
      FilterExpression: 'salonId = :salonId',
      ExpressionAttributeValues: {
        ':salonId': salonId
      }
    };

    const { Items } = await docClient.scan(params).promise();
    return Items;
  },

  // Obtenir les rendez-vous d'un styliste
  getByStylistId: async (docClient, stylistId) => {
    const params = {
      TableName: dynamoConfig.tables.booking,
      FilterExpression: 'stylistId = :stylistId',
      ExpressionAttributeValues: {
        ':stylistId': stylistId
      }
    };

    const { Items } = await docClient.scan(params).promise();
    return Items;
  },

  // Vérifier si un rendez-vous est dans le passé
  isPast: (appointment) => {
    return new Date(appointment.date) < new Date();
  },

  // Vérifier si un rendez-vous est expiré (date + heure)
  isExpired: (appointment) => {
    const now = new Date();
    const appointmentDateTime = new Date(`${appointment.date}T${appointment.startTime || appointment.timeSlot || '00:00'}`);
    return appointmentDateTime < now;
  },

  // Vérifier si un rendez-vous est passé (date seulement)
  isPastDate: (appointment) => {
    const now = new Date();
    const appointmentDate = new Date(appointment.date);
    // Comparer seulement les dates (année, mois, jour)
    return appointmentDate.getFullYear() < now.getFullYear() ||
           (appointmentDate.getFullYear() === now.getFullYear() && appointmentDate.getMonth() < now.getMonth()) ||
           (appointmentDate.getFullYear() === now.getFullYear() && appointmentDate.getMonth() === now.getMonth() && appointmentDate.getDate() < now.getDate());
  },

  // Vérifier si un rendez-vous est passé (date + heure)
  isPastDateTime: (appointment) => {
    const now = new Date();
    const appointmentDateTime = new Date(`${appointment.date}T${appointment.startTime || appointment.timeSlot || '00:00'}`);
    return appointmentDateTime < now;
  },

  // Vérifier si un rendez-vous a dépassé 2 jours sans réponse
  isOverdue: (appointment) => {
    const now = new Date();
    const createdAt = new Date(appointment.createdAt);
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000; // 2 jours en millisecondes
    return (now - createdAt) > twoDaysInMs;
  },

  // Calculer le temps restant avant refus automatique (en millisecondes)
  getTimeUntilAutoRejection: (appointment) => {
    const now = new Date();
    const createdAt = new Date(appointment.createdAt);
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    const timeElapsed = now - createdAt;
    const timeRemaining = twoDaysInMs - timeElapsed;
    return Math.max(0, timeRemaining); // Ne pas retourner de valeur négative
  },

  // Formater le temps restant pour l'affichage
  formatTimeRemaining: (milliseconds) => {
    if (milliseconds <= 0) {
      return { days: 0, hours: 0, minutes: 0, expired: true };
    }

    const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
    const hours = Math.floor((milliseconds % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));

    return {
      days,
      hours,
      minutes,
      expired: false,
      totalSeconds: Math.floor(milliseconds / 1000)
    };
  },

  // Vérifier si un rendez-vous peut être annulé
  canBeCancelled: (appointment) => {
    const hoursUntilAppointment = (new Date(appointment.date) - new Date()) / (1000 * 60 * 60);
    return hoursUntilAppointment > 24 && appointment.status === 'pending';
  },

  // Refuser automatiquement les rendez-vous passés ou en retard
  rejectPastAppointments: async (docClient) => {
    try {
      console.log('=== REFUS AUTOMATIQUE DES RENDEZ-VOUS PASSÉS OU EN RETARD ===');
      
      // Récupérer tous les rendez-vous en attente ou confirmés
      const params = {
        TableName: dynamoConfig.tables.booking,
        FilterExpression: '#status IN (:pending, :confirmed)',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':pending': 'PENDING',
          ':confirmed': 'CONFIRMED'
        }
      };

      const { Items: appointments } = await docClient.scan(params).promise();
      
      if (!appointments || appointments.length === 0) {
        console.log('Aucun rendez-vous à vérifier');
        return { rejected: 0, total: 0, reasons: {} };
      }

      let rejectedCount = 0;
      const reasons = { datePassed: 0, timePassed: 0, overdue: 0 };
      const now = new Date();

      for (const appointment of appointments) {
        let shouldReject = false;
        let reason = '';

        // Vérifier si la date est passée (date seulement)
        const isPastDate = Appointment.isPastDate(appointment);
        
        // Vérifier si la date + heure est passée
        const isPastDateTime = Appointment.isPastDateTime(appointment);
        
        // Vérifier si le RDV a dépassé 2 jours sans réponse
        const isOverdue = Appointment.isOverdue(appointment);

        // Déterminer la raison du refus
        if (isPastDate) {
          shouldReject = true;
          reason = 'Date passée';
          reasons.datePassed++;
        } else if (isPastDateTime) {
          shouldReject = true;
          reason = 'Heure passée';
          reasons.timePassed++;
        } else if (isOverdue && appointment.status === 'PENDING') {
          shouldReject = true;
          reason = '2 jours sans réponse';
          reasons.overdue++;
        }

        // Si le rendez-vous doit être refusé
        if (shouldReject) {
          console.log(`Refus automatique du rendez-vous ${appointment.id} - Date: ${appointment.date} ${appointment.startTime || appointment.timeSlot} (${reason})`);
          
          // Mettre à jour le statut à REJECTED (refusé automatiquement)
          const updateParams = {
            TableName: dynamoConfig.tables.booking,
            Key: { id: appointment.id },
            UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #rejectedAt = :rejectedAt, #rejectionReason = :rejectionReason',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#updatedAt': 'updatedAt',
              '#rejectedAt': 'rejectedAt',
              '#rejectionReason': 'rejectionReason'
            },
            ExpressionAttributeValues: {
              ':status': 'REJECTED',
              ':updatedAt': new Date().toISOString(),
              ':rejectedAt': new Date().toISOString(),
              ':rejectionReason': `Refusé automatiquement - ${reason}`
            }
          };

          await docClient.update(updateParams).promise();
          rejectedCount++;
        }
      }

      console.log(`Refus automatique terminé: ${rejectedCount}/${appointments.length} rendez-vous refusés`);
      console.log(`Répartition: ${reasons.datePassed} dates passées, ${reasons.timePassed} heures passées, ${reasons.overdue} en retard`);
      return { rejected: rejectedCount, total: appointments.length, reasons };
    } catch (error) {
      console.error('Erreur lors du refus automatique:', error);
      throw error;
    }
  },

  // Vérifier et refuser un rendez-vous spécifique
  checkAndRejectAppointment: async (docClient, appointmentId) => {
    try {
      const appointment = await Appointment.getById(docClient, appointmentId);
      
      if (!appointment) {
        return { rejected: false, message: 'Rendez-vous non trouvé' };
      }

      const isPastDate = Appointment.isPastDate(appointment);
      const isPastDateTime = Appointment.isPastDateTime(appointment);
      const isOverdue = Appointment.isOverdue(appointment);
      
      let shouldReject = false;
      let reason = '';

      if (isPastDate) {
        shouldReject = true;
        reason = 'Date passée';
      } else if (isPastDateTime) {
        shouldReject = true;
        reason = 'Heure passée';
      } else if (isOverdue && appointment.status === 'PENDING') {
        shouldReject = true;
        reason = '2 jours sans réponse';
      }
      
      if (shouldReject && (appointment.status === 'PENDING' || appointment.status === 'CONFIRMED')) {
        const updateParams = {
          TableName: dynamoConfig.tables.booking,
          Key: { id: appointmentId },
          UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #rejectedAt = :rejectedAt, #rejectionReason = :rejectionReason',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
            '#rejectedAt': 'rejectedAt',
            '#rejectionReason': 'rejectionReason'
          },
          ExpressionAttributeValues: {
            ':status': 'REJECTED',
            ':updatedAt': new Date().toISOString(),
            ':rejectedAt': new Date().toISOString(),
            ':rejectionReason': `Refusé automatiquement - ${reason}`
          }
        };

        await docClient.update(updateParams).promise();
        return { rejected: true, message: `Rendez-vous refusé automatiquement - ${reason}` };
      }

      return { rejected: false, message: 'Rendez-vous toujours valide' };
    } catch (error) {
      console.error('Erreur lors de la vérification de refus:', error);
      throw error;
    }
  },

  // Ajoute cette méthode utilitaire pour le calcul dynamique des créneaux
  parseTime: (str) => {
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m;
  },

  formatTime: (minutes) => {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  },

  // Ajouter cette fonction utilitaire pour la conversion des jours
  getDayName: (dayNumber) => {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[dayNumber];
  },

  // Ajouter cette fonction pour formater l'heure
  formatHour: (date) => {
    const hours = date.getHours();
    return `${hours}h00`;
  },

  getAvailableSlots: async (docClient, { salonId, stylistId }, date, duration) => {
    try {
     

      // 1. Obtenir le jour de la semaine (0-6, où 0 est dimanche)
      const dayOfWeek = new Date(date).getDay();
      const dayName = Appointment.getDayName(dayOfWeek);

      // 2. Charger les horaires du styliste
      let daySchedule;
      let workingDays = [];
      if (stylistId) {
        // Récupérer le styliste via l'index byUser
        const stylistParams = {
          TableName: dynamoConfig.tables.stylist,
          IndexName: 'byUser',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': stylistId
          }
        };
        const { Items: stylists } = await docClient.query(stylistParams).promise();
        console.log('Stylists trouvés:', JSON.stringify(stylists, null, 2));

        if (stylists && stylists.length > 0) {
          const stylist = stylists[0];
          const workingHours = stylist.workingHours;
          console.log('Horaires du styliste:', JSON.stringify(workingHours, null, 2));

          // Sauvegarder les jours travaillés
          workingDays = workingHours.days;

          // Trouver les horaires pour le jour demandé
          const dayIndex = workingHours.days.findIndex(d => d === dayName);
          daySchedule = dayIndex !== -1 ? workingHours.timeSlots[dayIndex] : null;
        }
      } else {
        // Pour un salon, utiliser les horaires d'ouverture du salon
        const salonParams = {
          TableName: dynamoConfig.tables.salon,
          Key: { id: salonId }
        };
        const { Item: salon } = await docClient.get(salonParams).promise();
        daySchedule = salon?.openingHours?.find(h => h.day === dayOfWeek);
      }

      console.log('Horaires du jour:', JSON.stringify(daySchedule, null, 2));

      if (!daySchedule) {
        console.log('Pas d\'horaires pour ce jour');
        return {
          available: false,
          workingDays: workingDays,
          slots: []
        };
      }

      // 3. Récupérer les réservations existantes pour cette date
      console.log('=== RÉCUPÉRATION DES RÉSERVATIONS EXISTANTES ===');
      const existingBookings = [];
      
      if (stylistId) {
        // Récupérer les réservations du styliste pour cette date
        const bookingParams = {
          TableName: dynamoConfig.tables.booking,
          IndexName: 'byStylist',
          KeyConditionExpression: 'stylistId = :stylistId',
          FilterExpression: '#date = :date AND (#status = :pending OR #status = :confirmed)',
          ExpressionAttributeNames: {
            '#date': 'date',
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':stylistId': stylistId,
            ':date': date,
            ':pending': 'PENDING',
            ':confirmed': 'CONFIRMED'
          }
        };
        
        const { Items: stylistBookings } = await docClient.query(bookingParams).promise();
        existingBookings.push(...(stylistBookings || []));
        console.log('Réservations du styliste trouvées:', stylistBookings?.length || 0);
      } else if (salonId) {
        // Récupérer les réservations du salon pour cette date
        const bookingParams = {
          TableName: dynamoConfig.tables.booking,
          IndexName: 'bySalon',
          KeyConditionExpression: 'salonId = :salonId',
          FilterExpression: '#date = :date AND (#status = :pending OR #status = :confirmed)',
          ExpressionAttributeNames: {
            '#date': 'date',
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':salonId': salonId,
            ':date': date,
            ':pending': 'PENDING',
            ':confirmed': 'CONFIRMED'
          }
        };
        
        const { Items: salonBookings } = await docClient.query(bookingParams).promise();
        existingBookings.push(...(salonBookings || []));
      }


      // 4. Calculer les heures de début possibles en excluant les créneaux réservés
      const startTime = new Date(`${date}T${daySchedule.start}`);
      const endTime = new Date(`${date}T${daySchedule.end}`);
      const slots = [];

      // Générer les heures de début possibles
      let currentTime = new Date(startTime);
      while (currentTime < endTime) {
        // Vérifier si le service peut être complété avant la fin des horaires
        const serviceEndTime = new Date(currentTime.getTime() + (duration * 60000));
        if (serviceEndTime <= endTime) {
          // Vérifier si ce créneau chevauche une réservation existante
          const slotStart = currentTime.getTime();
          const slotEnd = serviceEndTime.getTime();
          
          let isSlotAvailable = true;
          
          for (const booking of existingBookings) {
            // Convertir les heures de réservation en timestamps
            const bookingStart = new Date(`${date}T${booking.startTime}`).getTime();
            const bookingEnd = new Date(`${date}T${booking.endTime}`).getTime();
            
            // Vérifier s'il y a un chevauchement
            if ((slotStart < bookingEnd) && (slotEnd > bookingStart)) {
              console.log(`Créneau ${Appointment.formatHour(currentTime)} exclu - chevauche avec réservation ${booking.startTime}-${booking.endTime}`);
              isSlotAvailable = false;
              break;
            }
          }
          
          if (isSlotAvailable) {
            slots.push(Appointment.formatHour(currentTime));
          }
        }
        // Avancer d'une heure
        currentTime = new Date(currentTime.getTime() + (60 * 60000));
      }

      return {
        available: true,
        workingDays: workingDays,
        slots: slots
      };
    } catch (error) {
      console.error('Erreur dans getAvailableSlots:', error);
      throw error;
    }
  },

  // Obtenir les rendez-vous d'un client avec tous les détails
  getByClientIdWithDetails: async (docClient, clientId) => {
    try {
      // 1. Récupérer les bookings du client
      const params = {
        TableName: dynamoConfig.tables.booking,
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': clientId
        }
      };

      const { Items: bookings } = await docClient.scan(params).promise();
      
      if (!bookings || bookings.length === 0) {
        return [];
      }

      // 2. Enrichir chaque booking avec les détails
      const enrichedBookings = await Promise.all(
        bookings.map(async (booking) => {
          const enrichedBooking = { ...booking };

          // Récupérer les détails du service
          if (booking.serviceId) {
            try {
              const serviceResult = await docClient.get({
                TableName: dynamoConfig.tables.service,
                Key: { id: booking.serviceId }
              }).promise();
              
              if (serviceResult.Item) {
                enrichedBooking.service = {
                  id: serviceResult.Item.id,
                  name: serviceResult.Item.name,
                  description: serviceResult.Item.description,
                  price: serviceResult.Item.price,
                  duration: serviceResult.Item.duration,
                  category: serviceResult.Item.category,
                  imageUrl: serviceResult.Item.imageUrl
                };
              }
            } catch (error) {
              console.error('Erreur récupération service:', error);
              enrichedBooking.service = {
                id: booking.serviceId,
                name: 'Service inconnu',
                price: booking.amount || 0,
                duration: 60
              };
            }
          }

          // Récupérer les détails du stylist
          if (booking.stylistId) {
            try {
              // D'abord récupérer le stylist via l'index byUser
              const stylistResult = await docClient.query({
                TableName: dynamoConfig.tables.stylist,
                IndexName: 'byUser',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                  ':userId': booking.stylistId
                }
              }).promise();

              if (stylistResult.Items && stylistResult.Items.length > 0) {
                const stylist = stylistResult.Items[0];
                
                // Récupérer les informations de l'utilisateur stylist
                const userResult = await docClient.get({
                  TableName: dynamoConfig.tables.user,
                  Key: { id: stylist.userId }
                }).promise();

                const user = userResult.Item;
                
                enrichedBooking.stylist = {
                  id: stylist.id,
                  userId: stylist.userId,
                  pseudo: stylist.pseudo,
                  firstName: user?.firstName,
                  lastName: user?.lastName,
                  profileImage: stylist.profileImage || user?.profileImage,
                  address: stylist.address,
                  city: stylist.city,
                  postalCode: stylist.postalCode,
                  rating: stylist.rating,
                  specialties: stylist.specialties,
                  phone: user?.phone
                };
              }
            } catch (error) {
              console.error('Erreur récupération stylist:', error);
              enrichedBooking.stylist = {
                id: booking.stylistId,
                pseudo: 'Stylist inconnu'
              };
            }
          }

          // Ajouter les informations de prix et devise
          enrichedBooking.price = booking.amount || 0;
          enrichedBooking.currency = booking.currency || 'eur';
          enrichedBooking.paymentStatus = booking.paymentStatus || 'pending';

          return enrichedBooking;
        })
      );

      return enrichedBookings;
    } catch (error) {
      console.error('Erreur dans getByClientIdWithDetails:', error);
      throw error;
    }
  },

  // Enrichir un booking avec tous les détails
  enrichBookingWithDetails: async (docClient, booking) => {
    try {
      const enrichedBooking = { ...booking };

      // Récupérer les détails du service
      if (booking.serviceId) {
        try {
          const serviceResult = await docClient.get({
            TableName: dynamoConfig.tables.service,
            Key: { id: booking.serviceId }
          }).promise();
          
          if (serviceResult.Item) {
            enrichedBooking.service = {
              id: serviceResult.Item.id,
              name: serviceResult.Item.name,
              description: serviceResult.Item.description,
              price: serviceResult.Item.price,
              duration: serviceResult.Item.duration,
              category: serviceResult.Item.category,
              imageUrl: serviceResult.Item.imageUrl
            };
          }
        } catch (error) {
          console.error('Erreur récupération service:', error);
          enrichedBooking.service = {
            id: booking.serviceId,
            name: 'Service inconnu',
            price: booking.amount || 0,
            duration: 60
          };
        }
      }

      // Récupérer les détails du stylist
      if (booking.stylistId) {
        try {
          // D'abord récupérer le stylist via l'index byUser
          const stylistResult = await docClient.query({
            TableName: dynamoConfig.tables.stylist,
            IndexName: 'byUser',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
              ':userId': booking.stylistId
            }
          }).promise();

          if (stylistResult.Items && stylistResult.Items.length > 0) {
            const stylist = stylistResult.Items[0];
            
            // Récupérer les informations de l'utilisateur stylist
            const userResult = await docClient.get({
              TableName: dynamoConfig.tables.user,
              Key: { id: stylist.userId }
            }).promise();

            const user = userResult.Item;
            
            enrichedBooking.stylist = {
              id: stylist.id,
              userId: stylist.userId,
              pseudo: stylist.pseudo,
              firstName: user?.firstName,
              lastName: user?.lastName,
              profileImage: stylist.profileImage || user?.profileImage,
              address: stylist.address,
              city: stylist.city,
              postalCode: stylist.postalCode,
              rating: stylist.rating,
              specialties: stylist.specialties,
              phone: user?.phone
            };
          }
        } catch (error) {
          console.error('Erreur récupération stylist:', error);
          enrichedBooking.stylist = {
            id: booking.stylistId,
            pseudo: 'Stylist inconnu'
          };
        }
      }

      // Ajouter les informations de prix et devise
      enrichedBooking.price = booking.amount || 0;
      enrichedBooking.currency = booking.currency || 'eur';
      enrichedBooking.paymentStatus = booking.paymentStatus || 'pending';

      return enrichedBooking;
    } catch (error) {
      console.error('Erreur dans enrichBookingWithDetails:', error);
      throw error;
    }
  },

  // Enrichir un rendez-vous avec les informations de compte à rebours
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
    } else {
      enriched.countdown = null;
    }
    
    return enriched;
  }
};

module.exports = Appointment; 