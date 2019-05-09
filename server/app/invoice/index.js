const router = require('express').Router();
const auth = require('snapmobile-authserver').authService;
const controller = require('./invoice.controller');

router.get('/', auth.isAuthenticated(), controller.index);
router.get('/:id', auth.isAuthenticated(), controller.show);
router.post('/', auth.isAuthenticated(), controller.create);
router.post('/requestSubmission', auth.isAuthenticated(), controller.requestSubmission);
router.post('/requestApproval', auth.isAuthenticated(), controller.requestApproval);
router.post('/requestPayment', auth.isAuthenticated(), controller.requestPayment);
router.post('/requestApprovalIncrease', auth.isAuthenticated(), controller.requestApprovalIncrease);
router.post('/exportToCsv', auth.isAuthenticated(), controller.exportToCsv);
router.put('/:id', auth.isAuthenticated(), controller.update);
router.delete('/:id', auth.isAuthenticated(), controller.destroy);

module.exports = router;
