const stripe = require('stripe')(process.env.REACT_APP_STRIPE_SECRET_KEY);
const { docClient, dynamoConfig } = require('../config/awsConfig');
const { getPublicKey } = require('../config/stripe.config');
const { getStylistInfo, stylistExists } = require('../utils/stylistHelper');

class PaymentController {
    // Créer une session de paiement
    async createPaymentSession(req, res) {
        try {
            const { bookingId } = req.body;

            // Récupérer les détails de la réservation
            const bookingParams = {
                TableName: dynamoConfig.tables.booking,
                Key: {
                    id: bookingId
                }
            };

            const bookingResult = await docClient.get(bookingParams).promise();
            const booking = bookingResult.Item;

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Réservation non trouvée'
                });
            }

            // Récupérer les détails du service
            const serviceParams = {
                TableName: dynamoConfig.tables.service,
                Key: {
                    id: booking.serviceId
                }
            };

            const serviceResult = await docClient.get(serviceParams).promise();
            const service = serviceResult.Item;

            // Récupérer les détails du stylist
            const stylistParams = {
                TableName: dynamoConfig.tables.stylist,
                Key: {
                    id: booking.stylistId
                }
            };

            const stylistResult = await docClient.get(stylistParams).promise();
            const stylist = stylistResult.Item;

            // Calculer le montant total
            const amount = service.price;

            // Créer l'intention de paiement
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(amount * 100), // Stripe utilise les centimes
                currency: 'eur',
                metadata: {
                    bookingId,
                    serviceId: service.id,
                    serviceName: service.name,
                    stylistId: stylist.id,
                    stylistName: `${stylist.firstName} ${stylist.lastName}`,
                    clientId: booking.clientId,
                    date: booking.date,
                    timeSlot: booking.timeSlot
                },
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            res.json({
                success: true,
                data: {
                    clientSecret: paymentIntent.client_secret,
                    paymentIntentId: paymentIntent.id,
                    amount,
                    service: {
                        name: service.name,
                        price: service.price,
                        duration: service.duration
                    },
                    stylist: {
                        name: `${stylist.firstName} ${stylist.lastName}`,
                        profileImage: stylist.profileImage
                    },
                    booking: {
                        date: booking.date,
                        timeSlot: booking.timeSlot
                    }
                }
            });
        } catch (error) {
            console.error('Erreur création session paiement:', error);
            res.status(500).json({
                success: false,
                message: 'Erreur lors de la création de la session de paiement',
                error: error.message
            });
        }
    }

    // Créer une session de paiement à partir des informations de réservation
    async createPaymentSessionFromReservation(req, res) {
        try {
            const { bookingId, serviceId, stylistId, date, timeSlot, clientId } = req.body;

            console.log('=== DEBUG PAYMENT SESSION ===');
            console.log('stylistId reçu:', stylistId);
            console.log('serviceId reçu:', serviceId);
            console.log('bookingId reçu:', bookingId);
            console.log('date reçue:', date);
            console.log('timeSlot reçu:', timeSlot);
            console.log('clientId reçu:', clientId);
            console.log('============================');

            // Récupérer les détails du stylist avec la même logique que les routes de service
            console.log('Fetching stylist with userId:', stylistId);
            const stylistResult = await docClient.query({
                TableName: dynamoConfig.tables.stylist,
                IndexName: 'byUser',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': stylistId
                }
            }).promise();

            console.log('Stylist result:', stylistResult);

            if (!stylistResult.Items || stylistResult.Items.length === 0) {
                console.error('Stylist non trouvé avec stylistId:', stylistId);
                return res.status(404).json({
                    success: false,
                    message: 'Stylist non trouvé',
                    debug: { stylistId }
                });
            }

            const stylist = stylistResult.Items[0];
            console.log('Stylist trouvé:', stylist.id);

            // Récupérer les informations de l'utilisateur
            console.log('Fetching user with ID:', stylist.userId);
            const userResult = await docClient.get({
                TableName: dynamoConfig.tables.user,
                Key: { id: stylist.userId }
            }).promise();

            console.log('User result:', userResult);

            const user = userResult.Item;
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Utilisateur non trouvé',
                    debug: { stylistId }
                });
            }

            // Récupérer les détails du service
            const serviceParams = {
                TableName: dynamoConfig.tables.service,
                Key: {
                    id: serviceId
                }
            };

            console.log('Recherche service avec params:', serviceParams);

            const serviceResult = await docClient.get(serviceParams).promise();
            const service = serviceResult.Item;

            console.log('Service trouvé:', service ? 'OK' : 'NULL');

            if (!service) {
                return res.status(404).json({
                    success: false,
                    message: 'Service non trouvé',
                    debug: { serviceId }
                });
            }

            // Calculer le montant total
            const amount = service.price;

            // Construire le nom du stylist
            const stylistName = stylist.pseudo || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Professionnel';

            // Créer une session de checkout Stripe (pas un PaymentIntent)
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: service.name,
                                description: `Réservation avec ${stylistName} - ${date} à ${timeSlot}`,
                            },
                            unit_amount: Math.round(amount * 100), // Stripe utilise les centimes
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${process.env.REACT_APP_FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&service_name=${encodeURIComponent(service.name)}&stylist_name=${encodeURIComponent(stylistName)}&date=${encodeURIComponent(date)}&time_slot=${encodeURIComponent(timeSlot)}&amount=${amount}&service_duration=${service.duration}`,
                cancel_url: `${process.env.REACT_APP_FRONTEND_URL}/payment-cancel`,
                metadata: {
                    bookingId,
                    serviceId: service.id,
                    serviceName: service.name,
                    stylistId: stylist.userId,
                    stylistName: stylistName,
                    clientId,
                    date,
                    timeSlot
                },
            });

            res.json({
                success: true,
                data: {
                    sessionId: session.id,
                    url: session.url,
                    status: session.status,
                    amount,
                    service: {
                        name: service.name,
                        price: service.price,
                        duration: service.duration
                    },
                    stylist: {
                        name: stylistName,
                        profileImage: stylist.profileImage || user.profileImage
                    },
                    booking: {
                        date,
                        timeSlot
                    }
                }
            });
        } catch (error) {
            console.error('Erreur création session paiement:', error);
            res.status(500).json({
                success: false,
                message: 'Erreur lors de la création de la session de paiement',
                error: error.message
            });
        }
    }

    // Confirmer un paiement
    async confirmPayment(req, res) {
        try {
            const { paymentIntentId } = req.body;
            
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            
            if (paymentIntent.status === 'succeeded') {
                // Mettre à jour le statut de la réservation
                const updateParams = {
                    TableName: dynamoConfig.tables.booking,
                    Key: {
                        id: paymentIntent.metadata.bookingId
                    },
                    UpdateExpression: 'SET paymentStatus = :status, paymentId = :paymentId',
                    ExpressionAttributeValues: {
                        ':status': 'completed',
                        ':paymentId': paymentIntentId
                    },
                    ReturnValues: 'ALL_NEW'
                };

                await docClient.update(updateParams).promise();
                
                res.json({
                    success: true,
                    data: {
                        status: paymentIntent.status,
                        amount: paymentIntent.amount / 100,
                        currency: paymentIntent.currency,
                        bookingId: paymentIntent.metadata.bookingId,
                        serviceName: paymentIntent.metadata.serviceName,
                        stylistName: paymentIntent.metadata.stylistName
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Le paiement n\'a pas été confirmé',
                    status: paymentIntent.status
                });
            }
        } catch (error) {
            console.error('Erreur confirmation paiement:', error);
            res.status(500).json({
                success: false,
                message: 'Erreur lors de la confirmation du paiement',
                error: error.message
            });
        }
    }

    // Vérifier le statut d'une session
    async checkSessionStatus(req, res) {
        try {
            const { sessionId } = req.params;
            
            // Récupérer une checkout session au lieu d'un payment intent
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            
            // Déterminer le statut basé sur le statut de la session
            let status = 'unpaid';
            if (session.payment_status === 'paid') {
                status = 'paid';
            } else if (session.status === 'expired') {
                status = 'expired';
            }
            
            res.json({
                success: true,
                data: {
                    status,
                    amount: session.amount_total ? session.amount_total / 100 : 0,
                    currency: session.currency,
                    bookingId: session.metadata?.bookingId
                }
            });
        } catch (error) {
            console.error('Erreur vérification statut session:', error);
            res.status(500).json({
                success: false,
                message: 'Erreur lors de la vérification du statut de la session',
                error: error.message
            });
        }
    }

    // Webhook pour les événements Stripe
    async handleWebhook(req, res) {
        const sig = req.headers['stripe-signature'];
        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.REACT_APP_STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error('Erreur signature webhook:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Gérer les différents types d'événements
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                try {
                    console.log('=== WEBHOOK CHECKOUT.SESSION.COMPLETED ===');
                    console.log('Session metadata:', session.metadata);
                    
                    // Extraire les informations de la session
                    const {
                        serviceId,
                        stylistId,
                        salonId,
                        serviceName,
                        date,
                        timeSlot,
                        clientId
                    } = session.metadata;

                    console.log('Données extraites:', {
                        serviceId,
                        stylistId,
                        salonId,
                        serviceName,
                        date,
                        timeSlot,
                        clientId
                    });

                    // Vérifier que toutes les données nécessaires sont présentes
                    if (!serviceId || !stylistId || !date || !timeSlot) {
                        console.error('Données manquantes dans les métadonnées:', session.metadata);
                        throw new Error('Données manquantes pour créer le booking');
                    }

                    // Récupérer les informations du stylist
                    console.log('Récupération du stylist avec stylistId (userId):', stylistId);
                    const stylistResult = await docClient.query({
                        TableName: dynamoConfig.tables.stylist,
                        IndexName: 'byUser',
                        KeyConditionExpression: 'userId = :userId',
                        ExpressionAttributeValues: {
                            ':userId': stylistId
                        }
                    }).promise();

                    console.log('Résultat de la requête stylist:', stylistResult);

                    if (!stylistResult.Items || stylistResult.Items.length === 0) {
                        console.error('Stylist non trouvé avec stylistId:', stylistId);
                        throw new Error('Stylist non trouvé');
                    }

                    const stylist = stylistResult.Items[0];
                    console.log('Stylist trouvé:', stylist.id);

                    // Récupérer les informations de l'utilisateur stylist
                    const stylistUserResult = await docClient.get({
                        TableName: dynamoConfig.tables.user,
                        Key: { id: stylist.userId }
                    }).promise();

                    const stylistUser = stylistUserResult.Item;
                    if (!stylistUser) {
                        console.error('Utilisateur stylist non trouvé:', stylist.userId);
                        throw new Error('Utilisateur stylist non trouvé');
                    }

                    // Récupérer les informations du service
                    const serviceResult = await docClient.get({
                        TableName: dynamoConfig.tables.service,
                        Key: { id: serviceId }
                    }).promise();

                    const service = serviceResult.Item;
                    if (!service) {
                        console.error('Service non trouvé:', serviceId);
                        throw new Error('Service non trouvé');
                    }

                    console.log('Service trouvé:', service);

                    // Récupérer les informations du client
                    let clientUser = null;
                    if (clientId && clientId !== 'unknown') {
                        console.log('Récupération du client avec clientId:', clientId);
                        const clientResult = await docClient.get({
                            TableName: dynamoConfig.tables.user,
                            Key: { id: clientId }
                        }).promise();
                        clientUser = clientResult.Item;
                        console.log('Client trouvé:', clientUser ? 'OUI' : 'NON');
                    }

                    // Calculer l'heure de fin basée sur la durée du service
                    const startTime = timeSlot;
                    const serviceDurationMinutes = service.duration || 60; // Durée par défaut 60 min
                    
                    // Convertir l'heure de début en minutes depuis minuit
                    const [startHour, startMinute] = startTime.split('h').map(Number);
                    const startMinutes = startHour * 60 + startMinute;
                    
                    // Calculer l'heure de fin
                    const endMinutes = startMinutes + serviceDurationMinutes;
                    const endHour = Math.floor(endMinutes / 60);
                    const endMinute = endMinutes % 60;
                    const endTime = `${endHour}h${endMinute.toString().padStart(2, '0')}`;

                    console.log('Calcul de la durée:', {
                        startTime,
                        serviceDurationMinutes,
                        startMinutes,
                        endMinutes,
                        endTime
                    });

                    // Créer le booking
                    const bookingId = `BK${Date.now()}`;
                    const booking = {
                        id: bookingId,
                        userId: clientId || 'unknown', // ID du client (compatible avec le schéma GraphQL)
                        stylistId: stylist.userId, // ID du stylist (userId dans la table stylist)
                        serviceId: serviceId,
                        salonId: salonId || 'none',
                        date: date,
                        startTime: startTime,
                        endTime: endTime, // Calculé selon la durée du service
                        timeSlot: timeSlot, // Garder pour compatibilité
                        status: 'PENDING', // En attente d'acceptation par le stylist
                        paymentStatus: 'completed',
                        paymentId: session.id,
                        amount: session.amount_total ? session.amount_total / 100 : service.price,
                        currency: session.currency || 'eur',
                        // Ajouter les informations du client si disponibles
                        clientFirstName: clientUser?.firstName || null,
                        clientLastName: clientUser?.lastName || null,
                        clientPhone: clientUser?.phone || null,
                        notes: `Réservation créée via Stripe - Session: ${session.id}`,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };

                    console.log('Booking à créer:', JSON.stringify(booking, null, 2));

                    // Sauvegarder le booking
                    await docClient.put({
                        TableName: dynamoConfig.tables.booking,
                        Item: booking
                    }).promise();

                    console.log('Booking créé avec succès:', bookingId);
                    console.log('Détails du booking créé:', {
                        id: bookingId,
                        userId: booking.userId, // Compatible avec le schéma GraphQL
                        stylistId: booking.stylistId,
                        serviceId: booking.serviceId,
                        salonId: booking.salonId,
                        date: booking.date,
                        startTime: booking.startTime,
                        endTime: booking.endTime,
                        timeSlot: booking.timeSlot,
                        status: booking.status,
                        paymentStatus: booking.paymentStatus,
                        amount: booking.amount,
                        clientFirstName: booking.clientFirstName,
                        clientLastName: booking.clientLastName,
                        clientPhone: booking.clientPhone,
                        serviceName: service.name,
                        serviceDuration: service.duration
                    });
                    console.log('=== FIN WEBHOOK CHECKOUT.SESSION.COMPLETED ===');

                } catch (error) {
                    console.error('Erreur lors de la création du booking:', error);
                    console.error('Stack trace:', error.stack);
                }
                break;
            
            case 'checkout.session.expired':
                const expiredSession = event.data.object;
                try {
                    console.log('Session expirée:', expiredSession.id);
                    // Pas besoin de créer un booking pour une session expirée
                } catch (error) {
                    console.error('Erreur lors du traitement de la session expirée:', error);
                }
                break;

            // Garder la compatibilité avec les PaymentIntents pour l'ancienne méthode
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                try {
                    // Mettre à jour le statut de la réservation
                    const updateParams = {
                        TableName: dynamoConfig.tables.booking,
                        Key: {
                            id: paymentIntent.metadata.bookingId
                        },
                        UpdateExpression: 'SET paymentStatus = :status, paymentId = :paymentId',
                        ExpressionAttributeValues: {
                            ':status': 'completed',
                            ':paymentId': paymentIntent.id
                        }
                    };
                    await docClient.update(updateParams).promise();
                    console.log('Paiement réussi et réservation mise à jour:', paymentIntent.id);
                } catch (error) {
                    console.error('Erreur mise à jour réservation:', error);
                }
                break;
            
            case 'payment_intent.payment_failed':
                const failedPayment = event.data.object;
                try {
                    // Mettre à jour le statut de la réservation
                    const updateParams = {
                        TableName: dynamoConfig.tables.booking,
                        Key: {
                            id: failedPayment.metadata.bookingId
                        },
                        UpdateExpression: 'SET paymentStatus = :status',
                        ExpressionAttributeValues: {
                            ':status': 'failed'
                        }
                    };
                    await docClient.update(updateParams).promise();
                    console.log('Paiement échoué et réservation mise à jour:', failedPayment.id);
                } catch (error) {
                    console.error('Erreur mise à jour réservation:', error);
                }
                break;
        }

        res.json({ received: true });
    }

    getStripePublicKey = async (req, res) => {
        try {
            res.json({ publicKey: getPublicKey() });
        } catch (error) {
            console.error('Error getting Stripe public key:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération de la clé publique Stripe' });
        }
    };
}

module.exports = new PaymentController(); 