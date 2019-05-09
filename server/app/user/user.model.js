const awsHelper = require('snapjs-aws').awsHelper;
const crypto = require('crypto');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const validator = require('validator');
const PaymentApprovalSchema = require('../payment-approver/payment-approver.schema');

const HORSE_MANAGER = 'horse manager';
const SERVICE_PROVIDER = 'service provider';

const TrustedProviderSchema = new mongoose.Schema({
  _provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  label: { type: String, required: true },
  customLabel: { type: String },
}, { timestamps: true });

const PrivateNoteSchema = new mongoose.Schema({
  _horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
  note: { type: String },
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, lowercase: true, trim: true, required: true, index: true, unique: true },
  barn: { type: String },
  phone: { type: String },
  location: { type: String },
  stripeSellerId: { type: String, default: null },
  stripeCustomerId: { type: String },
  stripeLast4: { type: String },
  stripeExpMonth: { type: String },
  stripeExpYear: { type: String },
  stripeAccountApproved: { type: Boolean },
  roles: Array,
  accountSetupComplete: Boolean,
  services: [{ service: String, rate: Number }],
  avatar: { type: Object },
  password: { type: String, required: true },
  salt: String,
  provider: { type: String, default: 'local' },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  deviceIds: Array,
  paymentApprovals: [PaymentApprovalSchema],
  trustedProviders: [TrustedProviderSchema],
  privateNotes: [PrivateNoteSchema],
}, { timestamps: true, usePushEach: true });

/**
 * Validators
 */
UserSchema.path('email').validate(function(email) {
  validator.isEmail(email);
}, 'The e-mail is not a valid format.');

UserSchema.path('email').validate(function(email, done) {
  mongoose.model('User').count({ email, _id: { $ne: this._id } }, (err, count) => {
    if (err) {
      done(err);
      return;
    }

    done(!count);
  });
}, 'Email already exists');

/**
 * Pre-save hooks
 */

// Add the other file urls for any images
UserSchema.pre('save', function(next) {
  if (this.avatar && this.avatar.url) {
    this.avatar.styles = awsHelper.stylesForImage(this.avatar.url);
  }

  next();
});

// Arrays cannot have a 'default:' value in the schema definition
UserSchema.pre('save', function(next) {
  // Remove empty strings
  this.roles = this.roles.filter(n => !!n);

  // Set default role(s) here
  if (!this.roles.length) {
    this.roles = ['user'];
  }

  next();
});

// Create encrypted password
UserSchema.pre('save', function(next) {
  if (!this || !this.isModified('password')) {
    next();
    return;
  }

  this.generateSalt((err, salt) => {
    if (err) { next(err); }

    this.salt = salt;

    this.encryptPassword(this.password, (error, encryptedPassword) => {
      if (error) { next(error); }

      this.password = encryptedPassword;
      next();
    });
  });
});

/**
 * Methods
 */
UserSchema.methods = {

  /**
   * Check if the unencrypted password matches the saved encyrpted password
   * @param  {String} Unencrypted password
   * @param  {Function} Callback(error, Boolean)
   */
  authenticate(password, callback) {
    this.encryptPassword(password, (err, encryptedPassword) => {
      if (encryptedPassword === this.password) {
        callback(null, true);
      } else {
        callback(new Error('Incorrect password'), false);
      }
    });
  },

  /**
   * Encrypt a password
   * @param  {String} Unencrypted password
   * @param  {Function} Callback(error, encryptedPassword)
   */
  encryptPassword(password, callback) {
    const salt = this.salt;
    const defaultIterations = 10000;
    const defaultKeyLength = 64;
    const saltBase64 = new Buffer(salt, 'base64');
    const digest = 'sha512';

    crypto.pbkdf2(password, saltBase64, defaultIterations, defaultKeyLength, digest, (err, key) => {
      if (err) { callback(err); }

      callback(null, key.toString('base64'));
    });
  },

  /**
   * Generate a salt string
   * @param  {Function} Callback(error, salt)
   */
  generateSalt(callback) {
    const byteSize = 16;
    crypto.randomBytes(byteSize, (err, salt) => {
      if (err) { callback(err); }

      callback(null, salt.toString('base64'));
    });
  },

  /**
   * Generate reset password token
   * @param  {Function} Callback(error, resetToken)
   */
  generateResetToken(callback) {
    const byteSize = 16;
    crypto.randomBytes(byteSize, (err, resetToken) => {
      if (err) { callback(err); }

      callback(null, resetToken.toString('hex'));
    });
  },

  /**
   * Creates and saves a new reset token for a user
   * @return {Promise} User.save() promise
   */
  saveResetToken() {
    return new Promise((resolve, reject) => {
      this.generateResetToken((err, resetToken) => {
        if (err) { reject(err); }

        this.resetPasswordToken = resetToken;
        this.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        resolve(this.save());
      });
    });
  },

  /**
   * Convenience method to know if the customer stripe account is setup
   */
  isStripeCustomerSetup() {
    return !!this.stripeCustomerId;
  },
};

/**
 * Statics
 */
UserSchema.statics = {
  /**
   * Check if user is a service provider
   * @param  {Object} user The user object
   * @return {Boolean} true/false
   */
  isServiceProvider(user) {
    return user.roles.includes(SERVICE_PROVIDER);
  },

  /**
   * Check if user is a horse manager
   * @param  {Object} user The user object
   * @return {Boolean} true/false
   */
  isManager(user) {
    return user.roles.includes(HORSE_MANAGER);
  },

};

module.exports = mongoose.model('User', UserSchema);
