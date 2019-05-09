const mongoose = require('mongoose');
const moment = require('moment');

const OwnerSchema = new mongoose.Schema({
  _user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  percentage: { type: Number, required: true },
}, { timestamps: true });

const RequestSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  fromCustomInvoice: { type: Boolean, required: true, default: false },
  _show: { type: mongoose.Schema.Types.ObjectId, ref: 'Show' },
  competitionClass: { type: String },
  _horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
  _horseManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  _payingUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  _trainer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  _paymentApprovers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  _owners: [OwnerSchema],
  _leasedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  _serviceProvider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  _reassignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  services: { type: [{ service: String, rate: Number, quantity: Number }], required: true },
  instructions: { type: String },
  providerNotes: { type: String },
  total: { type: Number, required: true },
  deletedAt: Date,
  declinedAt: Date,
  acceptedAt: Date,
  completedAt: Date,
  paidAt: Date,
  declinedByHeadServiceProvider: { type: Boolean, required: true, default: false },
  _dismissedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  _previousReassignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  addedToInvoice: { type: Boolean, default: false },
}, { timestamps: true, usePushEach: true });

RequestSchema.statics = {

  populateForAdmin() {
    return '_payingUser _show _horse _horseManager _serviceProvider _reassignedTo _dismissedBy _owners _trainer _leasedTo _previousReassignees';
  },

  /**
   * Get a total count of all services included in an array of requests
   * @param  {Array} requests Array of Request objects
   * @return {Number}         The count of services
   */
  getServiceCount(requests) {
    let serviceTotal = 0;
    requests.forEach((request) => {
      request.services.forEach((service) => {
        serviceTotal += (service.quantity || 1);
      });
    });

    return serviceTotal;
  },

  getServices(requests) {
    const outputServices = [];
    requests.forEach((request) => {
      request.services.forEach((service) => {
        outputServices.push(service);
      });
    });
    return outputServices;
  },

  /**
   * Check if a given request is same day as today
   * @param  {Object} request A request object objec
   * @return {Boolean} True/False
   */
  isSameDay(request) {
    const startOfToday = moment().startOf('day');
    const startOfRequest = moment(request.date).startOf('day');
    const diff = startOfRequest.diff(startOfToday, 'hours');

    return diff <= 24;
  },

  /**
   * Build and return a dummy payingUser
   * This is to support older versions of the app that grouped requests by paying user
   */
  getDummyPayingUser(request) {
    const dummyUser = {};

    if (request._owners && request._owners.length) {
      const ownerNames = request._owners.map(owner => owner._user.name);
      const joinedNames = ownerNames.join(', ');
      dummyUser._id = 'multipleOwners';
      dummyUser.name = joinedNames;
    }

    return dummyUser;
  },

  /**
   * Get an unique array of horses for a group of requests
   * @param  {Array} requests Array of Request objects
   * @return {Array}          Array of unique horse objects
   */
  getHorses(requests) {
    const horses = [];

    requests.forEach((request) => {
      if (request._horse) {
        const index = horses.findIndex((o) => {
          return String(o._id) === String(request._horse._id);
        });

        if (index === -1) {
          horses.push(request._horse);
        }
      }
    });

    return horses;
  },

};

module.exports = mongoose.model('Request', RequestSchema);
