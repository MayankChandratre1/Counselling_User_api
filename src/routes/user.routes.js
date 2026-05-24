import express from 'express';
import UserController from '../controllers/user.controller.js';
import NotificationController from '../controllers/notification.controller.js';
import authMiddleware from '../middleware/auth.js';
import cacheMiddleware from '../middleware/cacheMiddleware.js';

const router = express.Router();

// Public routes
router.post('/sendotp', UserController.sendOTP);
router.post('/login', UserController.login);
router.post('/ispremium', UserController.checkPremiumStatusByPhone);
router.post('/updateName', UserController.updateName);
router.post('/verifyPhone', UserController.verifyPhone);
router.post('/', UserController.createUser);
router.post('/saveOneSignalId', UserController.saveOneSignalId);
router.get('/get-premium-plans',cacheMiddleware('premiumplans'), UserController.getPremiumPlans);
router.get("/landing",cacheMiddleware('landingpage'), UserController.getLandingPageData);
router.get("/gethomepage",cacheMiddleware('homepage'), UserController.getHomePageData);
router.get("/getenabledfeatures",cacheMiddleware('enabled'), UserController.getEnabledFeatures);
router.get("/getcontact",cacheMiddleware('contact'), UserController.getContactData);
router.get("/getdynamiccontent",cacheMiddleware('dynamic'), UserController.getDynamicContent);
router.get("/getreviews",cacheMiddleware('reviews'), UserController.getReviews);    
router.get("/feature-flags", UserController.getFeatureFlags);

//Forgot password
router.get('/forgot-pass-otp/:phone', UserController.forgotPasswordOTP);
router.post('/verify-pass-otp/:phone', UserController.verifyForgotPasswordOTP);
router.post('/new-password/:phone', UserController.newPassword);


// Protected routes (require authentication)
router.post('/sendpushnotification/:playedId', UserController.sendPushNotification);
router.use(authMiddleware);
router.post('/logout', UserController.logout);
router.post('/book-appointment', UserController.bookAppointment);

// User notification inbox
router.get('/notification-inbox', NotificationController.getNotifications);
router.patch('/notification-inbox/read-all', NotificationController.markAllAsRead);
router.get('/notification-inbox/by-notification/:notificationId', NotificationController.getNotificationByBroadcastId);
router.get('/notification-inbox/:id', NotificationController.getNotificationById);
router.patch('/notification-inbox/:id/read', NotificationController.markAsRead);
router.get('/get-updates/:plan', NotificationController.getPlanUpdates);
router.patch('/get-updates/:plan/read-all', NotificationController.markPlanUpdatesAsRead);
router.get('/notifications', NotificationController.getNotifications);
router.patch('/notifications/read-all', NotificationController.markAllAsRead);
router.get('/notifications/by-notification/:notificationId', NotificationController.getNotificationByBroadcastId);
router.get('/notifications/:id', NotificationController.getNotificationById);
router.patch('/notifications/:id/read', NotificationController.markAsRead);

// Cached routes
router.get("/lists/:id", UserController.getUserLists);
router.get("/registrationForm", UserController.getRegistrationForm);




// User registration and retrieval
router.get('/:id', UserController.getUserById);
router.get('/phone/:phone', UserController.getUserByPhone);

// Premium plan management
router.patch('/:id/premium', UserController.updatePremiumPlan);
router.put('/:id/updateCounsellingData', UserController.updateCounsellingData);
router.get('/:id/premium-status', UserController.checkPremiumStatus);

//formsteps
router.post('/formsteps', UserController.createFormSteps);
router.get('/formsteps',  UserController.getFormSteps);
router.get('/formsteps/:id',  UserController.getFormStepsById);
router.patch('/formsteps/:id', UserController.updateFormSteps);
router.delete('/formsteps/:id', UserController.deleteFormSteps);

// User-specific form data
router.get('/formdata/:phone/:formId', UserController.getUserFormData);
router.post('/formdata/:phone/:formId', UserController.updateUserFormData);




export default router;
