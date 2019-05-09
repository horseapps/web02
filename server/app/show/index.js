const router = require('express').Router();
const auth = require('snapmobile-authserver').authService;
const controller = require('./show.controller');

router.get('/', auth.isAuthenticated(), controller.index);

module.exports = router;
