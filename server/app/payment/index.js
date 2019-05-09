const router = require('express').Router();
const auth = require('snapmobile-authserver').authService;
const controller = require('./payment.controller');

router.get('/', auth.isAuthenticated(), controller.index);
router.get('/requestPayment', auth.isAuthenticated(), controller.requestPayment);
router.get('/:id', auth.isAuthenticated(), controller.show);
router.post('/markAsPaid', auth.isAuthenticated(), controller.markAsPaid);
router.post('/reportUnapproved', auth.isAuthenticated(), controller.reportUnapproved);
router.post('/', auth.isAuthenticated(), controller.create);
router.put('/:id', auth.isAuthenticated(), controller.update);
router.patch('/:id', auth.isAuthenticated(), controller.update);

module.exports = router;
