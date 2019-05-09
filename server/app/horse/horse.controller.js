const moment = require('moment');
const _ = require('lodash');
const Horse = require('./horse.model');
const Request = require('../request/request.model');
const Notification = require('../notification/notification.model');
const User = require('../user/user.model');
const utils = require('../../components/utils');
const Promise = require('bluebird');

const WHITELIST_ATTRIBUTES = [
  '_id',
  'barnName',
  'showName',
  'gender',
  'description',
  'avatar',
  '_owner',
  '_owners',
  '_leasedTo',
  '_trainer',
  '_createdBy',
  'registrations',
  'color',
  'dam',
  'sire',
  'height',
  'birthYear',
];

const WHITELIST_USER_ATTRIBUTES = [
  '_id',
  'email',
  'paymentApprovals',
  'trustedProviders',
  'provider',
  'services',
  'roles',
  'avatar',
  'barn',
  'location',
  'name',
  'phone',
];

const WHITELIST_REQUEST_ATTRIBUTES = [
  'fromCustomInvoice',
  'barnName',
  'showName',
  'gender',
  'description',
  'avatar',
  '_owner',
  '_owners',
  '_trainer',
  '_leasedTo',
  '_createdBy',
  'registrations',
  'color',
  'dam',
  'sire',
  'height',
  'birthYear',
];

/**
 * Add a single dummy owner to each horse in the array
 * @param  {array} horses Array of mongo document horse objects
 * @return {array}        Array of regular json horse objects with _owner property
 */
function horsesWithDummyOwner(horses) {
  const horseObjects = [];
  horses.forEach((horse) => {
    const dummyOwner = horse.getDummyOwner();
    const horseObj = horse.toObject();
    horseObj._owner = dummyOwner;
    horseObjects.push(horseObj);
  });

  return horseObjects;
}

/**
 * Check if the given user is either a trainer, leasee, or one of many owners
 * @param  {object} user  The authenticated user object
 * @param  {object} horse The horse object
 * @return {boolean}      True/false
 */
function userManagesHorse(user, horse) {
  let isHorseManager = false;

  if (String(user._id) === String(horse._trainer._id)) {
    isHorseManager = true;
  }

  if (horse._leasedTo && String(user._id) === String(horse._leasedTo._id)) {
    isHorseManager = true;
  }

  if (horse._owners && horse._owners.length) {
    horse._owners.forEach((owner) => {
      if (String(user._id) === String(owner._user._id)) {
        isHorseManager = true;
      }
    });
  }

  return isHorseManager;
}

/**
 * Check if the edited horse owner is different from the current horse owner
 * @param  {object} updatedHorse  The horse object with edited properties
 * @param  {object} originalHorse The original horse object prior to editing
 * @return {boolean}               True/false if owner is being changed
 */
function userIsEditingSingleOwner(updatedHorse, originalHorse) {
  return originalHorse._owners.length === 1 &&
    String(updatedHorse._owner._id) !== String(originalHorse._owners[0]._user);
}

const HorseController = {

  /**
   * Gets a list of horses
   */
  index: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const sort = req.query.sort || 'barnName';
      const select = WHITELIST_ATTRIBUTES.join(' ');
      const query = {};
      let horseCount;
      let horses = [];
      // When an owner or trainer is requesting, only send back horses they're paired with
      if (User.isManager(req.user)) {
        query.$or = [
          { _trainer: req.user },
          { _leasedTo: req.user },
          { '_owners._user': { $in: [req.user._id] } },
          { _trainer: req.user._id },
          { _leasedTo: req.user._id },
        ];

        if (req.query._trainer) {
          query._trainer = req.query._trainer;
        }

        if (req.query._owner) {
          query['_owners._user'] = req.query._owner;
        }

        if (req.query.searchTerm) {
          const nameSearches = [
            { barnName: { $regex: new RegExp(req.query.searchTerm, 'i') } },
            { showName: { $regex: new RegExp(req.query.searchTerm, 'i') } },
          ];
          query.$and = [{ $or: nameSearches }];
        }

        horseCount = await Horse
          .find(query)
          .count();
        horses = await Horse
          .find(query)
          .select(select)
          .sort(sort)
          .limit(limit)
          .skip(skip)
          .populate('_trainer _owner _leasedTo _createdBy')
          .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES });

        // Send back a dummy single owner for backwards compatibility with older app versions
        const horseObjects = horsesWithDummyOwner(horses);

        utils.respondWithResult(res)({ horses: horseObjects, horseCount });
      } else if (User.isServiceProvider(req.user) && req.query.searchTerm) {
        /**
         * When a service provider is requesting with a search, it means they're
         * creating an invoice, and providers can only invoice owners who have added them.
         * So we'll only show them those owners' horses
         */
        const trustingOwners = await User.find({
          roles: 'horse manager',
          trustedProviders: { $elemMatch: { _provider: req.user } } })
          .select(WHITELIST_USER_ATTRIBUTES.join(' '))
          .populate({ path: 'trustedProviders._provider' })
          .lean();

        const trustingOwnerIds = trustingOwners.map((owner) => {
          return owner._id;
        });

        query.$or = [
          { barnName: { $regex: new RegExp(req.query.searchTerm, 'i') } },
          { showName: { $regex: new RegExp(req.query.searchTerm, 'i') } },
        ];
        query['_owners._user'] = { $in: trustingOwnerIds };

        // Get the horses and populate select manager data
        const populateQuery = [
          { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES },
          { path: '_owner', select: WHITELIST_USER_ATTRIBUTES },
          { path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES },
          { path: '_leasedTo', select: WHITELIST_USER_ATTRIBUTES },
          { path: '_createdBy', select: WHITELIST_USER_ATTRIBUTES },
        ];
        horseCount = await Horse
          .find(query)
          .count();
        horses = await Horse
          .find(query)
          .select(select)
          .sort(sort)
          .limit(limit)
          .skip(skip)
          .populate(populateQuery);

        // Send back a dummy single owner for backwards compatibility with older app versions
        const horseObjects = horsesWithDummyOwner(horses);

        utils.respondWithResult(res)({ horses: horseObjects, horseCount });
      } else if (User.isServiceProvider(req.user) && req.query.serviceable) {
        /**
         * When a service provider is requesting with no search term present, it means they're
         * looking at their horse list. In the service provider view, horses are grouped by the
         * managers who have added that service provider. The provider will see the horses which are
         * owned/trained/leased by each horse manager who has added the service provider.
         */

        const populateQuery = [
          { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES },
          { path: '_owner', select: WHITELIST_USER_ATTRIBUTES },
          { path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES },
          { path: '_leasedTo', select: WHITELIST_USER_ATTRIBUTES },
          { path: '_createdBy', select: WHITELIST_USER_ATTRIBUTES },
        ];

        // Get the IDs of the owners who have this provider in their trusted providers list
        const trustingOwners = await User.find({
          roles: 'horse manager',
          trustedProviders: { $elemMatch: { _provider: req.user } } })
          .select(WHITELIST_USER_ATTRIBUTES.join(' '))
          .populate({ path: 'trustedProviders._provider' })
          .lean();

        // Use bluebird Promise to prevent race conditions during awaits
        Promise.each(trustingOwners, async (owner) => {
          // Get all the horses the trusting owner trains/leases/owns
          let horsesForOwner = await Horse.find({
            $or: [
              { _trainer: owner._id },
              { _leasedTo: owner._id },
              { '_owners._user': { $in: [owner._id] } },
            ],
          })
            .select(WHITELIST_ATTRIBUTES.join(' '))
            .sort(sort)
            .limit(limit)
            .skip(skip)
            .populate(populateQuery);

          horsesForOwner = horsesForOwner.filter((horse) => {
            // Clear out horses if the owner is leasing to someone else and not training
            return !(horse._leasedTo && String(horse._leasedTo._id) !== String(owner._id))
              || String(horse._trainer._id) === String(owner._id);
          });

          const groupObject = { _manager: owner, horses: horsesForOwner };
          horses.push(groupObject);
        })
          .then(() => {
            // Remove managers from the output list if they don't have any horses
            horses = horses.filter((group) => {
              return group.horses.length > 0;
            });
            horseCount = horses.length;
            utils.respondWithResult(res)({ horses, horseCount });
          });
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets a list of horses with upcoming services scheduled
   */
  upcomingRequests: async (req, res, next) => {
    try {
      const startOfToday = moment().startOf('day');

      // Get upcoming requests that have not yet been completed
      const requestQuery = {
        date: { $gte: startOfToday },
        paidAt: { $eq: null },
        deletedAt: { $eq: null },
        completedAt: { $eq: null },
      };

      // If _trainer or _owner sent as query params
      if (req.query._trainer) {
        requestQuery._trainer = req.query._trainer;
      }

      if (req.query._owner) {
        requestQuery['_owners._user'] = { $in: [req.query._owner] };
      }

      // If no _trainer or _owner sent as query params
      if (!req.query._trainer && !req.query._owner) {
        requestQuery.$or = [
          { '_owners._user': { $in: [req.user._id] } },
          { _trainer: req.user._id },
          { _horseManager: req.user._id },
        ];
      }

      // First get all requests whose date is in future and horse manager is req.user
      // or a given _owner/_trainer param
      const requests = await Request.find(requestQuery)
        .sort('date')
        .populate({ path: '_horse',
          populate: { path: '_trainer _owner _createdBy _leasedTo' } })
        .populate({ path: '_horse',
          populate: { path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES } });

      let horses = [];

      if (requests.length) {
        requests.forEach((request) => {
          const horse = request._horse.toObject();
          horse.nextBraiding = request.date;

          const ownerIds = horse._owners.map(owner => String(owner._user._id));

          // If _trainer and _owner are sent in params
          if (req.query._trainer && req.query._owner && userManagesHorse(req.user, horse)) {
            if (String(horse._trainer._id) === String(req.query._trainer)
                && ownerIds.includes(String(req.query._owner))) {
              horses.push(horse);
            }
          // If _trainer is sent in params
          } else if (req.query._trainer && !req.query._owner && userManagesHorse(req.user, horse)) {
            if (String(horse._trainer._id) === String(req.query._trainer)) {
              horses.push(horse);
            }
          // If _owner is sent in params
          } else if (!req.query._trainer && req.query._owner && userManagesHorse(req.user, horse)) {
            if (ownerIds.includes(String(req.query._owner))) {
              horses.push(horse);
            }
          // If neither _owner or _trainer are sent in params
          } else if (!req.query._trainer && !req.query._owner) {
            const index = horses.findIndex(o => String(o._id) === String(horse._id));
            if (index < 0) {
              horses.push(horse);
            }
          }
        });

        // Make sure horse list is unique
        horses = _.uniqBy(horses, 'showName');
      }

      utils.respondWithResult(res)({ horses, horseCount: horses.length });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets a single horse
   */
  show: async (req, res, next) => {
    try {
      const horse = await Horse.findOne({ _id: req.params.id })
        .populate('_owner _trainer _leasedTo _createdBy')
        .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES });

      if (horse) {
        // Send back a dummy single owner for backwards compatibility with older app versions
        const dummyOwner = horse.getDummyOwner();
        const horseObj = horse.toObject();
        horseObj._owner = dummyOwner;

        const response = utils.sanitizeObject(horseObj, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Create a new horse
   */
  create: async (req, res, next) => {
    try {
      const newHorse = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);

      // If the frontend is sending an _owner property, an old version of the app
      // is being used and we send an error asking them to update
      if (newHorse._owner) {
        return utils.respondWithError(res)(Horse.backwardsCompatibilityError());
      }

      newHorse._createdBy = req.user;

      // Remove any empty registration objects
      newHorse.registrations.forEach((registration, index) => {
        if (!registration.name && !registration.number) {
          newHorse.registrations.splice(index, 1);
        }
      });

      const horse = await Horse.create(newHorse);

      // Find horse so we can send back the populated horse
      const populatedHorse = await Horse.findById(horse._id)
        .populate('_trainer _owner _leasedTo _createdBy')
        .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES });

      const response = utils.sanitizeObject(populatedHorse, WHITELIST_ATTRIBUTES);
      return utils.respondWithResult(res)(response);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Update an existing horse
   */
  update: async (req, res, next) => {
    try {
      const updatedHorse = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);

      if (updatedHorse.registrations && updatedHorse.registrations.length) {
        // Remove any empty registration objects
        updatedHorse.registrations.forEach((registration, index) => {
          if (!registration.name && !registration.number) {
            updatedHorse.registrations.splice(index, 1);
          }
        });
      }
      // Find the original horse to be updated
      const horse = await Horse.findOne({ _id: req.params.id });

      // If user is sending back _owner, they are using the old app version 1.2.1
      // If the _owner is not the dummy owner, the user has changed the _owner property
      if (updatedHorse._owner && updatedHorse._owner._id !== 'multipleOwners' && horse._owners.length !== 1) {
        return utils.respondWithError(res)(Horse.backwardsCompatibilityError());

        // If there is only one owner, we need to see if _owner has changed
      } else if (updatedHorse._owner && updatedHorse._owner._id !== 'multipleOwners' && horse._owners.length === 1) {
        if (userIsEditingSingleOwner(updatedHorse, horse)) {
          return utils.respondWithError(res)(Horse.backwardsCompatibilityError());
        }
      }

      if (horse) {
        // Clear the whole leasedTo key if the lessee has just been removed
        const oldLesseeId = horse._leasedTo;
        const newLesseeId = updatedHorse._leasedTo ? updatedHorse._leasedTo._id : null;

        // Clear the whole leasedTo key if the lessee has just been removed
        if (updatedHorse._leasedTo === null) {
          _.omit(updatedHorse, '_leasedTo');
          _.omit(horse, '_leasedTo');
        }

        _.assign(horse, updatedHorse);
        await horse.save();

        // Send notifications if a lessee has been changed, added, or removed
        let lesseeAddedNotification;
        let lesseeRemovedNotification;
        const ownerName = updatedHorse._owner ? updatedHorse._owner.name : req.user.name;

        // Send notifications if a lessee has been changed, added, or removed
        if ((oldLesseeId && newLesseeId) && (String(oldLesseeId) !== String(newLesseeId))) {
          // Send notifications to the added and removed lessees if an existing lessee is changed
          lesseeAddedNotification = {
            message: `${ownerName} has leased ${updatedHorse.barnName} to you. You will be charged for this horse's service payments.`,
            _recipients: [updatedHorse._leasedTo._id],
          };
          await Notification.create(lesseeAddedNotification);

          lesseeRemovedNotification = {
            message: `You are no longer leasing ${updatedHorse.barnName}. ${ownerName} has resumed ownership and will be charged for service payments.`,
            _recipients: [horse._leasedTo],
          };

          await Notification.create(lesseeRemovedNotification);
        } else if (!oldLesseeId && newLesseeId) {

          // Notify the added lessee if one was added
          lesseeAddedNotification = {
            message: `${ownerName} has leased ${updatedHorse.barnName} to you. You will be charged for this horse's service payments.`,
            _recipients: [updatedHorse._leasedTo._id],
          };

          await Notification.create(lesseeAddedNotification);
        } else if (oldLesseeId && !newLesseeId) {
          // Notify the removed lessee if one was removed
          lesseeRemovedNotification = {
            message: `You are no longer leasing ${updatedHorse.barnName}. ${ownerName} has resumed ownership and will be charged for service payments.`,
            _recipients: [oldLesseeId],
          };
          await Notification.create(lesseeRemovedNotification);
        }

        // Re-populate horse
        const populatedHorse = await Horse.findOne({ _id: req.params.id })
          .populate('_owner _trainer _leasedTo _createdBy')
          .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES });

        // Send back a dummy single owner for backwards compatibility with older app versions
        const dummyOwner = populatedHorse.getDummyOwner();
        const horseObj = populatedHorse.toObject();
        horseObj._owner = dummyOwner;

        const response = utils.sanitizeObject(horseObj, WHITELIST_ATTRIBUTES);
        return utils.respondWithResult(res)(response);
      }

      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Update an existing horse's owners (for multiple owners)
   */
  updateMultipleOwners: async (req, res, next) => {
    try {
      const sanitizedObject = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);

      // Find the original horse
      const horse = await Horse.findOne({ _id: req.params.id });

      // Update the horse _owners
      if (horse) {
        horse._owners = sanitizedObject;
        horse.save();

        // Find and send the populated horse
        // Re-populate horse
        const populatedHorse = await Horse.findOne({ _id: req.params.id })
          .populate('_owner _trainer _leasedTo _createdBy')
          .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES });

        const response = utils.sanitizeObject(populatedHorse, WHITELIST_ATTRIBUTES);
        return utils.respondWithResult(res)(response);
      }

      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Delete an horse
   */
  destroy: async (req, res, next) => {
    try {
      const horse = await Horse.findOne({ _id: req.params.id });
      const ownerIds = horse._owners.map(owner => String(owner._user));

      // Check for user access
      if ((String(req.user._id) !== String(horse._owner)) &&
        (String(req.user._id) !== String(horse._trainer)) &&
        (!ownerIds.includes(String(req.user._id)))) {
        return utils.respondWithError(res)('You do not have access to delete this horse profile.');
      }

      // Get all unpaid requests for this horse
      const outstandingRequests = await Request.find({
        _horse: horse._id,
        paidAt: { $eq: null },
      });

      // Do not delete a horse with unpaid requests
      if (outstandingRequests.length) {
        return utils.respondWithError(res)('This horse still has unpaid requests.');
      }

      if (horse) {
        await horse.remove();
        return res.status(204).end();
      }

      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

};

module.exports = HorseController;
