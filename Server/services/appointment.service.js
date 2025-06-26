const { docClient } = require('../config/awsConfig');
const Appointment = require('../models/appointment.model');

class AppointmentService {
  // Exécuter le refus automatique des rendez-vous passés
  static async runRejectionCheck() {
    try {
      console.log('🕐 Début de la vérification de refus automatique...');
      const result = await Appointment.rejectPastAppointments(docClient);
      console.log(`✅ Vérification terminée: ${result.rejected} rendez-vous refusés sur ${result.total} vérifiés`);
      return result;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de refus:', error);
      throw error;
    }
  }

  // Vérifier et refuser un rendez-vous spécifique
  static async checkAndRejectAppointment(appointmentId) {
    try {
      const result = await Appointment.checkAndRejectAppointment(docClient, appointmentId);
      if (result.rejected) {
        console.log(`❌ Rendez-vous ${appointmentId} refusé automatiquement`);
      }
      return result;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de refus du rendez-vous:', error);
      throw error;
    }
  }

  // Démarrer le processus de refus automatique (toutes les heures)
  static startAutomaticRejection() {
    console.log('🚀 Démarrage du processus de refus automatique...');
    
    // Exécuter immédiatement
    this.runRejectionCheck();
    
    // Puis toutes les heures
    setInterval(() => {
      this.runRejectionCheck();
    }, 60 * 60 * 1000); // 1 heure en millisecondes
    
    console.log('⏰ Processus de refus automatique configuré (toutes les heures)');
  }

  // Obtenir un rendez-vous avec vérification de refus
  static async getAppointmentWithRejectionCheck(appointmentId) {
    try {
      // D'abord vérifier s'il faut refuser le rendez-vous
      await this.checkAndRejectAppointment(appointmentId);
      
      // Puis récupérer le rendez-vous (potentiellement mis à jour)
      const appointment = await Appointment.getById(docClient, appointmentId);
      
      // Enrichir avec les informations de compte à rebours
      return appointment ? Appointment.enrichWithCountdown(appointment) : null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du rendez-vous avec vérification:', error);
      throw error;
    }
  }

  // Obtenir tous les rendez-vous d'un styliste avec vérification de refus
  static async getStylistAppointmentsWithRejectionCheck(stylistId) {
    try {
      // D'abord exécuter le refus automatique
      await this.runRejectionCheck();
      
      // Puis récupérer les rendez-vous du styliste
      const appointments = await Appointment.getByStylistId(docClient, stylistId);
      
      // Enrichir chaque rendez-vous avec les informations de compte à rebours
      return appointments.map(appointment => Appointment.enrichWithCountdown(appointment));
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des rendez-vous du styliste:', error);
      throw error;
    }
  }

  // Obtenir tous les rendez-vous d'un client avec vérification de refus
  static async getClientAppointmentsWithRejectionCheck(clientId) {
    try {
      // D'abord exécuter le refus automatique
      await this.runRejectionCheck();
      
      // Puis récupérer les rendez-vous du client
      const appointments = await Appointment.getByClientIdWithDetails(docClient, clientId);
      
      // Enrichir chaque rendez-vous avec les informations de compte à rebours
      return appointments.map(appointment => Appointment.enrichWithCountdown(appointment));
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des rendez-vous du client:', error);
      throw error;
    }
  }

  // Obtenir les statistiques de compte à rebours pour un utilisateur
  static async getCountdownStats(userId, userType = 'client') {
    try {
      let appointments;
      
      if (userType === 'stylist') {
        appointments = await this.getStylistAppointmentsWithRejectionCheck(userId);
      } else {
        appointments = await this.getClientAppointmentsWithRejectionCheck(userId);
      }

      const pendingAppointments = appointments.filter(app => app.status === 'PENDING');
      
      const stats = {
        total: pendingAppointments.length,
        expiringSoon: 0, // Moins de 24h
        critical: 0, // Moins de 6h
        averageTimeRemaining: 0
      };

      let totalTimeRemaining = 0;

      pendingAppointments.forEach(app => {
        if (app.countdown) {
          if (app.countdown.willExpireSoon) {
            stats.expiringSoon++;
          }
          if (app.countdown.timeRemaining < (6 * 60 * 60 * 1000)) { // Moins de 6h
            stats.critical++;
          }
          totalTimeRemaining += app.countdown.timeRemaining;
        }
      });

      if (pendingAppointments.length > 0) {
        stats.averageTimeRemaining = Math.floor(totalTimeRemaining / pendingAppointments.length);
      }

      return stats;
    } catch (error) {
      console.error('❌ Erreur lors du calcul des statistiques de compte à rebours:', error);
      throw error;
    }
  }
}

module.exports = AppointmentService; 