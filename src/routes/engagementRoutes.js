const express = require('express');
const router = express.Router();
const engagementController = require('../controllers/engagementController');

// Booking Module
router.get('/bookings', engagementController.getBookings);
router.post('/bookings', engagementController.createBooking);
router.put('/bookings/:id/status', engagementController.updateBookingStatus);
router.put('/bookings/:id/time', engagementController.assignBookingTime);

// Help Module
router.get('/help', engagementController.getHelpContent);

// About Us Module
router.get('/about', engagementController.getAboutInfo);

// Feedback Module
router.get('/feedback', engagementController.getFeedback);
router.post('/feedback', engagementController.createFeedback);
router.put('/feedback/:id', engagementController.updateFeedback);

// Contact Us Module
router.get('/contact', engagementController.getContactInquiries);
router.post('/contact', engagementController.createContactInquiry);
router.put('/contact/:id', engagementController.updateContactInquiry);

module.exports = router;

