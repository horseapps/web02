const Notification = require('./notification.model');
const utils = require('../../components/utils');

const WHITELIST_ATTRIBUTES = [
  '_id',
  'message',
  '_recipients',
  'createdAt',
];

const NotificationController = {

  /**
   * Gets a list of notifications
   */
  index: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const sort = req.query.sort || '-createdAt';
      const select = WHITELIST_ATTRIBUTES.join(' ');

      // Only return the notifications for the authenticated user
      const query = { _recipients: { $in: [req.user._id] } };

      const notificationCount = await Notification
        .find(query)
        .count();
      const notifications = await Notification
        .find(query)
        .select(select)
        .sort(sort)
        .limit(limit)
        .skip(skip);

      utils.respondWithResult(res)({ notifications, notificationCount });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },
};

module.exports = NotificationController;
