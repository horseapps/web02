const router = require('express').Router();
const auth = require('snapmobile-authserver').authService;
const controller = require('./horse.controller');

router.get('/', auth.isAuthenticated(), controller.index);
router.get('/upcomingRequests', auth.isAuthenticated(), controller.upcomingRequests);
router.get('/:id', auth.isAuthenticated(), controller.show);
router.post('/', auth.isAuthenticated(), controller.create);
router.put('/:id', auth.isAuthenticated(), controller.update);
router.patch('/:id/updateMultipleOwners', auth.isAuthenticated(), controller.updateMultipleOwners);
router.delete('/:id', auth.isAuthenticated(), controller.destroy);

module.exports = router;
