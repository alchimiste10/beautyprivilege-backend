const { stripe, getApplicationFeeAmount, getApplicationFeePercent } = require('../config/stripe.config');
const { docClient } = require('../config/awsConfig');
const User = require('../models/user.model');
const Appointment = require('../models/appointment.model');

class PaymentService {
  /**
   * Vérifier si un rendez-vous peut être payé
   */
  static async canPayStylist(appointmentId) {
    try {
      const appointment = await Appointment.getById(docClient, appointmentId);
      if (!appointment) {
        throw new Error('Rendez-vous non trouvé');
      }

      // Vérifier que le rendez-vous est terminé
      const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}`);
      const now = new Date();
      const appointmentEndTime = new Date(appointmentDateTime.getTime() + (appointment.duration * 60 * 1000));

      if (now < appointmentEndTime) {
        return {
          canPay: false,
          reason: 'Le rendez-vous n\'est pas encore terminé',
          remainingTime: appointmentEndTime - now
        };
      }

      // Vérifier qu'il n'y a pas de litige
      if (appointment.disputeStatus === 'open' || appointment.disputeStatus === 'pending') {
        return {
          canPay: false,
          reason: 'Un litige est en cours pour ce rendez-vous'
        };
      }

      // Vérifier que le paiement n'a pas déjà été effectué
      if (appointment.paymentTransferred) {
        return {
          canPay: false,
          reason: 'Le paiement a déjà été transféré'
        };
      }

      // Vérifier que le styliste est connecté à Stripe
      const stylist = await User.getById(docClient, appointment.stylistId);
      if (!stylist || !stylist.stripeAccountId) {
        return {
          canPay: false,
          reason: 'Le styliste n\'est pas connecté à Stripe'
        };
      }

      return {
        canPay: true,
        appointment,
        stylist
      };

    } catch (error) {
      console.error('Erreur lors de la vérification du paiement:', error);
      throw error;
    }
  }

  /**
   * Effectuer un paiement à un styliste après validation du service
   */
  static async payStylist(appointmentId, clientId) {
    try {
      // Vérifier si le paiement peut être effectué
      const paymentCheck = await this.canPayStylist(appointmentId);
      
      if (!paymentCheck.canPay) {
        throw new Error(paymentCheck.reason);
      }

      const { appointment, stylist } = paymentCheck;

      // Vérifier que le client est bien celui qui a payé
      if (appointment.userId !== clientId) {
        throw new Error('Non autorisé à valider ce paiement');
      }

      // Calculer le montant à verser (prix du service moins les frais)
      const serviceAmount = appointment.price * 100; // Stripe utilise les centimes
      const applicationFee = Math.max(
        getApplicationFeeAmount(),
        Math.round(serviceAmount * (getApplicationFeePercent() / 100))
      );
      const transferAmount = serviceAmount - applicationFee;

      // Créer le transfert vers le compte du styliste
      const transfer = await stripe.transfers.create({
        amount: transferAmount,
        currency: 'eur',
        destination: stylist.stripeAccountId,
        description: `Paiement pour le service ${appointment.serviceName} - RDV ${appointmentId}`,
        metadata: {
          appointmentId: appointmentId,
          stylistId: appointment.stylistId,
          clientId: clientId,
          serviceName: appointment.serviceName
        }
      });

      // Mettre à jour le statut du rendez-vous
      await Appointment.update(docClient, appointmentId, {
        status: 'completed',
        paymentTransferred: true,
        transferId: transfer.id,
        transferAmount: transferAmount / 100,
        applicationFee: applicationFee / 100,
        transferDate: new Date().toISOString()
      });

      console.log(`✅ Paiement transféré au styliste ${stylist.id} pour le RDV ${appointmentId}: ${transferAmount / 100}€`);

      return {
        success: true,
        transferId: transfer.id,
        amount: transferAmount / 100,
        fee: applicationFee / 100
      };

    } catch (error) {
      console.error('Erreur lors du paiement au styliste:', error);
      throw error;
    }
  }

  /**
   * Vérifier automatiquement les rendez-vous éligibles au paiement
   */
  static async checkEligiblePayments() {
    try {
      console.log('🔄 Vérification des paiements éligibles...');
      
      // Récupérer tous les rendez-vous terminés non payés
      const appointments = await Appointment.getCompletedUnpaid(docClient);
      
      let processedCount = 0;
      let errorCount = 0;

      for (const appointment of appointments) {
        try {
          const paymentCheck = await this.canPayStylist(appointment.id);
          
          if (paymentCheck.canPay) {
            console.log(`💰 Rendez-vous ${appointment.id} éligible au paiement automatique`);
            // Note: Le paiement automatique peut être activé ici si nécessaire
            // await this.payStylist(appointment.id, appointment.userId);
          }
          
          processedCount++;
        } catch (error) {
          console.error(`❌ Erreur pour le RDV ${appointment.id}:`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ Vérification terminée: ${processedCount} traités, ${errorCount} erreurs`);
      
      return {
        processed: processedCount,
        errors: errorCount
      };

    } catch (error) {
      console.error('Erreur lors de la vérification des paiements éligibles:', error);
      throw error;
    }
  }

  /**
   * Marquer un rendez-vous comme terminé et programmer le transfert
   */
  static async markAppointmentCompleted(appointmentId) {
    try {
      const appointment = await Appointment.getById(docClient, appointmentId);
      if (!appointment) {
        throw new Error('Rendez-vous non trouvé');
      }

      // Calculer les dates
      const now = new Date();
      const paymentHeldUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h
      const disputeDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

      // Mettre à jour le rendez-vous
      await Appointment.update(docClient, appointmentId, {
        status: 'completed',
        paymentHeldUntil: paymentHeldUntil.toISOString(),
        disputeDeadline: disputeDeadline.toISOString(),
        completedAt: now.toISOString()
      });

      console.log(`✅ Rendez-vous ${appointmentId} marqué comme terminé. Transfert prévu le ${paymentHeldUntil.toLocaleString()}`);

      return {
        success: true,
        paymentHeldUntil: paymentHeldUntil,
        disputeDeadline: disputeDeadline
      };

    } catch (error) {
      console.error('Erreur lors de la finalisation du rendez-vous:', error);
      throw error;
    }
  }

  /**
   * Vérifier et transférer automatiquement les paiements éligibles
   */
  static async processAutomaticTransfers() {
    try {
      console.log('🔄 Vérification des transferts automatiques...');
      
      // Récupérer les rendez-vous éligibles au transfert
      const eligibleAppointments = await Appointment.getEligibleForTransfer(docClient);
      
      let transferredCount = 0;
      let errorCount = 0;

      for (const appointment of eligibleAppointments) {
        try {
          await this.transferToStylist(appointment);
          transferredCount++;
        } catch (error) {
          console.error(`❌ Erreur transfert RDV ${appointment.id}:`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ Transferts automatiques: ${transferredCount} effectués, ${errorCount} erreurs`);
      
      return {
        transferred: transferredCount,
        errors: errorCount
      };

    } catch (error) {
      console.error('Erreur lors des transferts automatiques:', error);
      throw error;
    }
  }

  /**
   * Transférer l'argent au styliste avec commission
   */
  static async transferToStylist(appointment) {
    try {
      // Vérifier que le styliste est connecté à Stripe
      const stylist = await User.getById(docClient, appointment.stylistId);
      if (!stylist || !stylist.stripeAccountId) {
        throw new Error('Styliste non connecté à Stripe');
      }

      // Vérifier qu'il n'y a pas de litige
      if (appointment.disputeStatus === 'open' || appointment.disputeStatus === 'pending') {
        throw new Error('Transfert bloqué - Litige en cours');
      }

      // Calculer le montant avec commission
      const serviceAmount = appointment.price * 100; // Stripe utilise les centimes
      const grossCommission = Math.max(
        getApplicationFeeAmount(),
        Math.round(serviceAmount * (getApplicationFeePercent() / 100))
      );
      
      // Calculer les frais Stripe (2.9% + 30¢)
      const stripeFee = Math.round(serviceAmount * 0.029) + 30;
      
      // Commission nette après déduction des frais Stripe
      const netCommission = Math.max(0, grossCommission - stripeFee);
      
      // Montant à transférer au styliste (inchangé)
      const transferAmount = serviceAmount - grossCommission;

      // Créer le transfert vers le compte du styliste
      const transfer = await stripe.transfers.create({
        amount: transferAmount,
        currency: 'eur',
        destination: stylist.stripeAccountId,
        description: `Paiement pour le service ${appointment.serviceName} - RDV ${appointment.id}`,
        metadata: {
          appointmentId: appointment.id,
          stylistId: appointment.stylistId,
          clientId: appointment.userId,
          serviceName: appointment.serviceName
        }
      });

      // Mettre à jour le statut du rendez-vous
      await Appointment.update(docClient, appointment.id, {
        paymentTransferred: true,
        transferId: transfer.id,
        transferAmount: transferAmount / 100,
        grossCommission: grossCommission / 100,
        stripeFee: stripeFee / 100,
        netCommission: netCommission / 100,
        transferDate: new Date().toISOString()
      });

      console.log(`💰 Transfert effectué: ${transferAmount / 100}€ au styliste ${stylist.id}`);
      console.log(`💸 Commission brute: ${grossCommission / 100}€, Frais Stripe: ${stripeFee / 100}€, Commission nette: ${netCommission / 100}€`);

      return {
        success: true,
        transferId: transfer.id,
        amount: transferAmount / 100,
        grossCommission: grossCommission / 100,
        stripeFee: stripeFee / 100,
        netCommission: netCommission / 100
      };

    } catch (error) {
      console.error('Erreur lors du transfert au styliste:', error);
      throw error;
    }
  }

  /**
   * Ouvrir un litige (bloque le transfert automatique)
   */
  static async openDispute(appointmentId, userId, reason) {
    try {
      const appointment = await Appointment.getById(docClient, appointmentId);
      if (!appointment) {
        throw new Error('Rendez-vous non trouvé');
      }

      // Vérifier que l'utilisateur est autorisé
      if (appointment.userId !== userId && appointment.stylistId !== userId) {
        throw new Error('Non autorisé à ouvrir un litige sur ce rendez-vous');
      }

      // Vérifier que le transfert n'a pas déjà été effectué
      if (appointment.paymentTransferred) {
        throw new Error('Impossible d\'ouvrir un litige après le transfert');
      }

      // Vérifier que le délai de litige n'est pas expiré
      const disputeDeadline = new Date(appointment.disputeDeadline);
      if (new Date() > disputeDeadline) {
        throw new Error('Le délai pour ouvrir un litige est expiré');
      }

      // Mettre à jour le statut du litige
      await Appointment.update(docClient, appointmentId, {
        disputeStatus: 'open',
        disputeReason: reason,
        disputeOpenedBy: userId,
        disputeOpenedAt: new Date().toISOString()
      });

      console.log(`⚠️ Litige ouvert sur le RDV ${appointmentId} par l'utilisateur ${userId}`);

      return {
        success: true,
        message: 'Litige ouvert avec succès'
      };

    } catch (error) {
      console.error('Erreur lors de l\'ouverture du litige:', error);
      throw error;
    }
  }

  /**
   * Résoudre un litige (admin seulement)
   */
  static async resolveDispute(appointmentId, resolution, resolvedBy) {
    try {
      const appointment = await Appointment.getById(docClient, appointmentId);
      if (!appointment) {
        throw new Error('Rendez-vous non trouvé');
      }

      // Vérifier que l'utilisateur est admin
      if (!resolvedBy.isAdmin) {
        throw new Error('Seuls les administrateurs peuvent résoudre les litiges');
      }

      // Mettre à jour le statut du litige
      await Appointment.update(docClient, appointmentId, {
        disputeStatus: 'resolved',
        disputeResolution: resolution,
        disputeResolvedBy: resolvedBy.id,
        disputeResolvedAt: new Date().toISOString()
      });

      console.log(`✅ Litige résolu sur le RDV ${appointmentId} par l'admin ${resolvedBy.id}`);

      return {
        success: true,
        message: 'Litige résolu avec succès'
      };

    } catch (error) {
      console.error('Erreur lors de la résolution du litige:', error);
      throw error;
    }
  }

  /**
   * Récupérer l'historique des paiements d'un styliste
   */
  static async getStylistPayments(stylistId, limit = 20) {
    try {
      const stylist = await User.getById(docClient, stylistId);
      if (!stylist || !stylist.stripeAccountId) {
        throw new Error('Styliste non connecté à Stripe');
      }

      // Récupérer les transferts depuis Stripe
      const transfers = await stripe.transfers.list({
        destination: stylist.stripeAccountId,
        limit: limit
      });

      // Récupérer les rendez-vous correspondants
      const appointments = await Appointment.getByStylistId(docClient, stylistId);
      const appointmentMap = new Map(appointments.map(apt => [apt.id, apt]));

      // Enrichir les transferts avec les détails des rendez-vous
      const enrichedTransfers = transfers.data.map(transfer => {
        const appointment = appointmentMap.get(transfer.metadata.appointmentId);
        return {
          id: transfer.id,
          amount: transfer.amount / 100,
          currency: transfer.currency,
          status: transfer.status,
          created: transfer.created,
          description: transfer.description,
          appointment: appointment ? {
            id: appointment.id,
            serviceName: appointment.serviceName,
            clientName: appointment.clientName,
            date: appointment.date,
            time: appointment.time
          } : null
        };
      });

      return {
        success: true,
        data: enrichedTransfers
      };

    } catch (error) {
      console.error('Erreur lors de la récupération des paiements:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques de paiement d'un styliste
   */
  static async getStylistPaymentStats(stylistId) {
    try {
      const stylist = await User.getById(docClient, stylistId);
      if (!stylist || !stylist.stripeAccountId) {
        throw new Error('Styliste non connecté à Stripe');
      }

      // Récupérer tous les transferts
      const transfers = await stripe.transfers.list({
        destination: stylist.stripeAccountId,
        limit: 100
      });

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      let totalAmount = 0;
      let monthlyAmount = 0;
      let transferCount = 0;
      let monthlyCount = 0;

      transfers.data.forEach(transfer => {
        const transferDate = new Date(transfer.created * 1000);
        const amount = transfer.amount / 100;

        totalAmount += amount;
        transferCount++;

        if (transferDate >= thirtyDaysAgo) {
          monthlyAmount += amount;
          monthlyCount++;
        }
      });

      return {
        success: true,
        data: {
          totalAmount: Math.round(totalAmount * 100) / 100,
          monthlyAmount: Math.round(monthlyAmount * 100) / 100,
          totalTransfers: transferCount,
          monthlyTransfers: monthlyCount,
          averageTransfer: transferCount > 0 ? Math.round((totalAmount / transferCount) * 100) / 100 : 0
        }
      };

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  /**
   * Annuler un transfert (en cas de litige)
   */
  static async reverseTransfer(transferId, reason) {
    try {
      const reversal = await stripe.transfers.createReversal(transferId, {
        amount: 'full',
        description: `Annulation: ${reason}`
      });

      console.log(`🔄 Transfert ${transferId} annulé: ${reason}`);

      return {
        success: true,
        reversalId: reversal.id,
        amount: reversal.amount / 100
      };

    } catch (error) {
      console.error('Erreur lors de l\'annulation du transfert:', error);
      throw error;
    }
  }
}

module.exports = PaymentService; 