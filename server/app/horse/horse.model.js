const awsHelper = require('snapjs-aws').awsHelper;
const mongoose = require('mongoose');
const OwnerSchema = require('../owner/owner.schema');

const HorseSchema = new mongoose.Schema({
  barnName: { type: String, required: true },
  showName: { type: String, required: true },
  gender: { type: String, required: true },
  birthYear: { type: String },
  description: { type: String },
  color: { type: String },
  sire: { type: String },
  dam: { type: String },
  height: { type: Number },
  avatar: { type: Object },
  _owners: [OwnerSchema],
  _leasedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  _trainer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  registrations: [{ name: String, number: String }],
  _createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, usePushEach: true });

/**
 * Validators
 */
HorseSchema.path('_owners').validate((owners) => {
  if (owners.length) {
    const sum = owners.reduce(
      (accumulator, currentValue) => {
        return accumulator + +currentValue.percentage;
      },
      0,
    );

    return sum === 100;
  }
}, 'Ownership must total 100%');

/**
 * Pre-save hooks
 */
// Add the other file urls for any images
HorseSchema.pre('save', function(next) {
  if (this.avatar && this.avatar.url) {
    this.avatar.styles = awsHelper.stylesForImage(this.avatar.url);
  }

  next();
});

/**
 * Methods
 */
HorseSchema.methods = {
  /**
   * Build and return a dummy single owner object
   * This is to support older versions of the app where the frontend expects a horse
   * to have a single _owner instead of an array of owners
   */
  getDummyOwner() {
    let dummyOwner;

    // If horse only has one owner, set _owners to the only item in the _owners array
    // Otherwise, concatenate all owner names and barn names so the frontend can see all the names
    if (this._owners.length === 1) {
      dummyOwner = this._owners[0]._user;
    } else if (this._owners.length > 1) {
      const ownerNames = this._owners.map(owner => owner._user.name);
      const joinedNames = ownerNames.join(', ');
      const barnNames = this._owners.map(owner => owner._user.barn);
      const joinedBarnNames = barnNames.join(', ');

      dummyOwner = {
        _id: 'multipleOwners',
        name: joinedNames,
        barn: joinedBarnNames,
      };
    }

    return dummyOwner;
  },

};

HorseSchema.statics = {

  backwardsCompatibilityError() {
    return 'An important update to this app has been released, please upgrade before using this feature.';
  },

  populateForAdmin() {
    return '_trainer _leasedTo _createdBy';
  },

};

module.exports = mongoose.model('Horse', HorseSchema);
