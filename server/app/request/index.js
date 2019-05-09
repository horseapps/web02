const router = require('express').Router();
const auth = require('snapmobile-authserver').authService;
const controller = require('./request.controller');

router.get('/', auth.isAuthenticated(), controller.index);
router.get('/schedule', auth.isAuthenticated(), controller.schedule);
router.get('/grouped', auth.isAuthenticated(), controller.grouped);
router.get('/groupedByHorse', auth.isAuthenticated(), controller.groupedByHorse);
router.get('/last/:horseId?', auth.isAuthenticated(), controller.showLastRequest);
router.get('/:id', auth.isAuthenticated(), controller.show);
router.post('/', auth.isAuthenticated(), controller.create);
router.post('/deleteMultiple', auth.isAuthenticated(), controller.destroyMultiple);
router.put('/:id', auth.isAuthenticated(), controller.update);
router.put('/:id/status/:status', auth.isAuthenticated(), controller.updateStatus);
router.put('/:id/dismiss', auth.isAuthenticated(), controller.dismiss);
router.patch('/:id', auth.isAuthenticated(), controller.update);
router.delete('/:id', auth.isAuthenticated(), controller.destroy);

module.exports = router;
