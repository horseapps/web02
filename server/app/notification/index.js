const router = require('express').Router();
const auth = require('snapmobile-authserver').authService;
const controller = require('./notification.controller');

router.get('/', auth.isAuthenticated(), controller.index);

module.exports = router;
