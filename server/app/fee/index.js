const router = require('express').Router();
const controller = require('./fee.controller');

router.get('/', controller.fee);

module.exports = router;
