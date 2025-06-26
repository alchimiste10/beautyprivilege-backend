const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { docClient } = require('../config/awsConfig');
const { dynamoConfig } = require('../config/awsConfig');
const Appointment = require('../models/appointment.model');
const { authenticateToken } = require('../middleware/auth');
const { getStylistInfo } = require('../utils/stylistHelper');
const AppointmentService = require('../services/appointment.service');

// Get available slots for a salon or stylist on a given date and duration
router.get('/available-slots', async (req, res) => {
  try {
    const { salonId, stylistId, date, duration } = req.query;

    if ((!salonId && !stylistId) || !date || !duration) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing salonId/stylistId, date or duration',
        receivedParams: { salonId, stylistId, date, duration }
      });
    }

    console.log('Appel de getAvailableSlots avec:', {
      salonId,
      stylistId,
      date,
      duration: parseInt(duration, 10)
    });

    const slots = await Appointment.getAvailableSlots(
      docClient, 
      { salonId, stylistId }, 
      date, 
      parseInt(duration, 10)
    );

    res.json({ success: true, slots: slots || [] });
  } catch (error) {
    console.error('Erreur dans la route available-slots:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available slots',
      error: error.message
    });
  }
});

// Get all appointments for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const appointments = await Appointment.getByClientIdWithDetails(docClient, req.user.id);
    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching appointments',
      error: error.message
    });
  }
});

// Get single appointment
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const appointment = await Appointment.getById(docClient, req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user is authorized to view this appointment
    if (appointment.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this appointment'
      });
    }

    // Enrichir l'appointment avec les détails
    const enrichedAppointment = await Appointment.enrichBookingWithDetails(docClient, appointment);

    res.json({
      success: true,
      data: enrichedAppointment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching appointment',
      error: error.message
    });
  }
});

// Create appointment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const appointmentData = {
      ...req.body,
      userId: req.user.id
    };

    const appointment = await Appointment.create(docClient, appointmentData);
    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: appointment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating appointment',
      error: error.message
    });
  }
});

// Update appointment
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const appointment = await Appointment.getById(docClient, req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user is authorized to update this appointment
    if (appointment.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this appointment'
      });
    }

    // Only allow certain status updates
    if (req.body.status) {
      if (req.user.isAdmin) {
        // Admin can update to any status
      } else {
        // Clients can only cancel their appointments
        if (req.body.status !== 'cancelled') {
          return res.status(403).json({
            success: false,
            message: 'Clients can only cancel appointments'
          });
        }
      }
    }

    const updatedAppointment = await Appointment.update(docClient, req.params.id, req.body);

    res.json({
      success: true,
      message: 'Appointment updated successfully',
      data: updatedAppointment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating appointment',
      error: error.message
    });
  }
});

// Delete appointment
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const appointment = await Appointment.getById(docClient, req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user is authorized to delete this appointment
    if (appointment.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this appointment'
      });
    }

    await Appointment.delete(docClient, req.params.id);

    res.json({
      success: true,
      message: 'Appointment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting appointment',
      error: error.message
    });
  }
});

// Route pour récupérer une réservation par ID (pour les pages de paiement)
router.get('/booking/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Récupérer la réservation depuis la table booking
    const bookingParams = {
      TableName: dynamoConfig.tables.booking,
      Key: {
        id: id
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

    // Enrichir avec toutes les informations
    const enrichedBooking = await Appointment.enrichBookingWithDetails(docClient, booking);

    res.json({
      success: true,
      data: enrichedBooking
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de la réservation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la réservation',
      error: error.message
    });
  }
});

// Route pour déclencher manuellement le refus automatique (admin seulement)
router.post('/reject-past', authenticateToken, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé. Seuls les administrateurs peuvent déclencher le refus manuel.'
      });
    }

    console.log('🔄 Refus manuel déclenché par l\'administrateur');
    const result = await AppointmentService.runRejectionCheck();
    
    res.json({
      success: true,
      message: 'Refus automatique exécuté avec succès',
      data: result
    });
  } catch (error) {
    console.error('Erreur lors du refus manuel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du refus automatique',
      error: error.message
    });
  }
});

// Route pour vérifier le refus d'un rendez-vous spécifique
router.get('/:id/check-rejection', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await AppointmentService.checkAndRejectAppointment(id);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erreur lors de la vérification de refus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de refus',
      error: error.message
    });
  }
});

// Route pour obtenir les statistiques de compte à rebours (client)
router.get('/countdown/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await AppointmentService.getCountdownStats(userId, 'client');
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques de compte à rebours:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

// Route pour obtenir les statistiques de compte à rebours (styliste)
router.get('/countdown/stylist/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await AppointmentService.getCountdownStats(userId, 'stylist');
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques de compte à rebours styliste:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

// Route pour obtenir les informations de compte à rebours d'un rendez-vous spécifique
router.get('/:id/countdown', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await AppointmentService.getAppointmentWithRejectionCheck(id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Rendez-vous non trouvé'
      });
    }

    res.json({
      success: true,
      data: {
        appointment,
        countdown: appointment.countdown
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du compte à rebours:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du compte à rebours',
      error: error.message
    });
  }
});

module.exports = router; 