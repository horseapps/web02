const mongoose = require('mongoose');
const OneSignal = require('../../components/push');

const NotificationSchema = new mongoose.Schema({
  _recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  message: { type: String, required: true },
  sendPush: { type: Boolean, required: true, default: true },
}, { timestamps: true, usePushEach: true });

/**
 * Send push notification
 * @param {Array} recipients Array of user objects
 * @param {String} message Push message
 */
function sendPushNotification(recipients, message) {
  let deviceIds = [];
  recipients.forEach(recipient => (deviceIds = deviceIds.concat(recipient.deviceIds)));

  if (deviceIds.length) {
    const oneSignal = new OneSignal();

    oneSignal.createNotification({
      include_player_ids: deviceIds,
      headings: { en: 'HorseLinc' },
      contents: { en: message },
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
    });
  }
}

// Send a push notification whenever a notification is created
NotificationSchema.pre('save', async function(next) {
  try {
    if (this.isNew && this.sendPush) {
      // Find User(s)
      const recipients = await mongoose.model('User').find({ _id: { $in: this._recipients } });

      if (recipients.length) {
        sendPushNotification(recipients, this.message);
      }
    }

    next();
  } catch (err) {
    console.log(err);
    next();
  }
});

/**
 * Statics
 */
NotificationSchema.statics = {

  populateForAdmin() {
    return '_recipients';
  },

};

module.exports = mongoose.model('Notification', NotificationSchema);
