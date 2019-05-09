const router = require('express').Router();
const auth = require('snapmobile-authserver').authService;
const userController = require('./user.controller');

// Authenticated user routes
router.get('/', auth.isAuthenticated(), userController.index);
router.post('/signup', userController.create);
router.get('/stripeRedirect', userController.stripeRedirect);
router.get('/:id', auth.isAuthenticated(), userController.show);
router.put('/me', auth.isAuthenticated(), userController.update);
router.delete('/me', auth.isAuthenticated(), userController.destroy);

// Stripe routes
router.post('/me/stripePaymentSetup', auth.isAuthenticated(), userController.setupStripePayment);
router.get('/stripe/dashboardUrl', auth.isAuthenticated(), userController.stripeDashboardUrl);
router.post('/stripe/webhookConnect', userController.stripeWebhookConnect);
router.post('/stripe/webhookMaster', userController.stripeWebhookMaster);

// Reset password routes
router.put('/me/password', auth.isAuthenticated(), userController.changePassword);
router.put('/me/forgot', userController.forgotPassword);
router.get('/me/reset/:token', userController.resetToken);
router.put('/me/reset/:token', userController.resetPassword);

// Add OneSignal device id
router.post('/addDevice', auth.isAuthenticated(), userController.addDevice);

// Routes for payment approvers
router.post('/approvals/addPaymentApproval', auth.isAuthenticated(), userController.addPaymentApproval);
router.put('/approvals/updatePaymentApproval', auth.isAuthenticated(), userController.updatePaymentApproval);
router.delete('/approvals/deletePaymentApproval/:id', auth.isAuthenticated(), userController.deletePaymentApproval);
router.get('/approvals/ownerAuthorizations', auth.isAuthenticated(), userController.ownerAuthorizations);

// Routes for trusted service providers
router.get('/providers/grouped', auth.isAuthenticated(), userController.groupedProviders);
router.post('/providers/addServiceProvider', auth.isAuthenticated(), userController.addServiceProvider);
router.delete('/providers/deleteServiceProvider/:id', auth.isAuthenticated(), userController.deleteServiceProvider);

module.exports = router;
