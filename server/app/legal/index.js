const router = require('express').Router();
const controller = require('./legal.controller');

router.get('/terms', controller.termsOfService);
router.get('/privacy', controller.privacyPolicy);

module.exports = router;
