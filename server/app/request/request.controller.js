const moment = require('moment');
const Promise = require('bluebird');
const _ = require('lodash');
const Request = require('./request.model');
const Show = require('../show/show.model');
const Notification = require('../notification/notification.model');
const Horse = require('../horse/horse.model');
const User = require('../user/user.model');
const utils = require('../../components/utils');

const ACCEPTED = 'accept';
const COMPLETED = 'complete';
const DECLINED = 'decline';
const LEFT = 'leave';
const HORSE_PROPERTIES = ['barnName', '-barnName', 'showName', '-showName'];

const WHITELIST_ATTRIBUTES = [
  '_id',
  'date',
  'fromCustomInvoice',
  '_show',
  '_horse',
  '_owners',
  '_horseManager',
  '_serviceProvider',
  '_reassignedTo',
  '_previousReassignees',
  '_payingUser',
  '_paymentApprovers',
  '_trainer',
  'services',
  'instructions',
  'total',
  'deletedAt',
  'declinedAt',
  'paidAt',
  'acceptedAt',
  'completedAt',
  'competitionClass',
  '_dismissedBy',
  'declinedByHeadServiceProvider',
  'providerNotes',
];

const WHITELIST_REQUEST_ATTRIBUTES = [
  'date',
  'fromCustomInvoice',
  '_show',
  '_horse',
  '_horseManager',
  '_serviceProvider',
  '_reassignedTo',
  '_previousReassignees',
  'services',
  'instructions',
  'competitionClass',
  'providerNotes',
  'addedToInvoice',
];

const WHITELIST_SHOW_ATTRIBUTES = ['_id', 'name'];

const WHITELIST_USER_ATTRIBUTES = [
  '_id',
  'deviceIds',
  'email',
  'paymentApprovals',
  'trustedProviders',
  'privateNotes',
  'provider',
  'services',
  'roles',
  'avatar',
  'barn',
  'location',
  'name',
  'phone',
  'accountSetupComplete',
  'stripeAccountApproved',
];

const WHITELIST_HORSE_ATTRIBUTES = [
  '_id',
  'avatar',
  'barnName',
  'showName',
  'gender',
  'description',
  '_trainer',
  '_owner',
  '_owners',
  '_createdBy',
  'registrations',
];

/*
   * Add mixin function to lodash to support invoice grouping
   * Splits a collection into sets, grouped by the result of running each value
   * through iteratee.
   *
   * @param {array|object} seq - The collection to iterate over.
   * @param {(string|function)[]} keys - The keys to nest by.
   *
   * @returns {Object} - Returns the nested aggregate object.
   */
_.mixin({
  nest: (seq, keys) => {
    if (!keys.length) { return seq; }
    const first = keys[0];
    const rest = keys.slice(1);
    return _.mapValues(_.groupBy(seq, first), (value) => {
      return _.nest(value, rest);
    });
  },
});

/**
 * Use moment to format a given date
 * @param  {String} date Datetime string
 * @return {String}      Formatted date string
 */
function formatDate(date) {
  return moment(date).format('ddd, MMM D');
}

/**
 * Sort array of requests by horse
 * @param  {Array} requests  Array of Request objects
 * @param  {String} sortParam Property to sort by
 * @param  {String} direction Should be ascending or descending
 * @return {Array}           Sorted array of requests
 */
function sortByHorse(requests, sortParam, direction) {
  const sorted = requests.sort((a, b) => {
    const nameA = a._horse[sortParam].toUpperCase(); // ignore upper and lowercase
    const nameB = b._horse[sortParam].toUpperCase(); // ignore upper and lowercase
    // Ascending order
    if (direction === 'ascending') {
      if (nameA < nameB) {
        return -1;
      }

      if (nameA > nameB) {
        return 1;
      }
    }

    // Descending order
    if (direction === 'descending') {
      if (nameA < nameB) {
        return 1;
      }

      if (nameA > nameB) {
        return -1;
      }
    }

    return 0;
  });

  return sorted;
}

/**
 * Check if a given sort param is a property on the Horse schema
 * @param  {String}  sortParam sortParam as a string from req.query
 * @return {Boolean}           True/false
 */
function isHorseProperty(sortParam) {
  return HORSE_PROPERTIES.includes(sortParam);
}

/**
 * Get the service provider for a group of requests
 * @param  {Array} requests Array of Request objects
 * @return {User}           User who is the service provider for the group
 */
function getServiceProvider(requests) {
  return requests[0]._serviceProvider;
}

/**
 * Check if authenticated user is the main service provider on a requst
 * @return {Boolean} True/false if user is main service provider
 */
function isMainServiceProvider(user, request) {
  // If no _reassignedTo field
  if (!request._reassignedTo) {
    return String(user._id) === String(request._serviceProvider._id);
  }

  // If _reassignedTo field
  if (request._reassignedTo) {
    const reassigneeId = request._reassignedTo._id || request._reassignedTo;

    return String(user._id) === String(request._serviceProvider._id) &&
    String(user._id) !== String(reassigneeId);
  }

  // Otherwise, return false
  return false;
}

/**
 * Check if currentUser is the reassigned service provider
 * @return {Boolean} True/false if user is main service provider
 */
function isReassignedServiceProvider(user, request) {
  if (!request._reassignedTo) {
    return false;
  }

  const reassigneeId = request._reassignedTo._id || request._reassignedTo;
  if (request._reassignedTo) {
    return (String(user._id) !== String(request._serviceProvider._id)) &&
    (String(request._reassignedTo) && String(user._id) === String(reassigneeId));
  }

  return false;
}

/**
 * Get total number of services for a group of requests,
 * while accounting for multiple service quantities
 * @param  {Array} requests Array of Request objects
 * @return {Number}          Total number of services
 */
function getServiceTotal(requests) {
  let serviceTotal = 0;

  requests.forEach((request) => {
    request.services.forEach((service) => {
      serviceTotal += (service.quantity || 1);
    });
  });

  return serviceTotal;
}

/**
 * Get min date from array of dates
 * @param  {Array} requests Array of Request objects
 * @return {Number}         The earliest date in a given range
 */
function getMinDate(requests) {
  const dates = requests.map(request => request.date);
  const min = _.min(dates);
  return min;
}

/**
 * Get min date from array of dates
 * @param  {Array} requests Array of Request objects
 * @return {Number}         The latest date in a given range
 */
function getMaxDate(requests) {
  const dates = requests.map(request => request.date);
  const max = _.max(dates);
  return max;
}

/**
 * Get total amount of services for a group of requests
 * @param  {Array} requests Array of Request objects
 * @return {Number}         Total dollar amount of services for a request
 */
function getTotal(requests) {
  let total = 0;

  requests.forEach((request) => {
    total += +request.total;
  });

  return total;
}

function userIsOwner(request, user) {
  let isOwner = false;
  request._owners.forEach((owner) => {
    if (String(owner._user._id) === String(user._id)) {
      isOwner = true;
    }
  });

  return isOwner;
}

const RequestController = {

  /**
   * Gets a list of requests
   */
  index: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const sort = req.query.sort || 'date';
      const select = WHITELIST_ATTRIBUTES.join(' ');

      const startOfToday = moment().startOf('day');

      const query = {
        $or: [
          { _leasedTo: req.user._id },
          { _trainer: req.user._id },
          { '_owners._user': { $in: [req.user._id] } },
        ],
      };

      // Only send back requests in the future
      if (req.query.upcoming) {
        query.date = { $gte: startOfToday };
      }

      // If we want outstanding requests they should be unpaid without a request
      if (req.query.outstanding) {
        query.paidAt = { $eq: null };
        query.deletedAt = { $eq: null };
      }

      if (req.query.horse) {
        query._horse = req.query.horse;
      }

      const requestCount = await Request
        .find(query)
        .count();
      const requests = await Request
        .find(query)
        .select(select)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .populate('_show _horseManager _serviceProvider _horse')
        .lean();

      // Send back a date only field for grouping by date on the frontend
      if (req.query.upcoming) {
        requests.forEach((request) => {
          request.dateOnly = moment(request.date).startOf('day');
        });
      }

      utils.respondWithResult(res)({ requests, requestCount });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets a list of requests grouped by given params
   */
  grouped: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const select = WHITELIST_ATTRIBUTES.join(' ');
      const query = {};
      let groupByFields;

      if (req.query.horseManager) {
        query.$or = [
          { _payingUser: req.user._id },
          { _paymentApprovers: req.user._id },
          { '_owners._user': req.user._id },
        ];
      }

      if (req.query.serviceProvider) {
        // Get all requests where user is the main service provider with no reassign
        // OR user is the reassignee
        query.$or = [
          { $and: [{ _serviceProvider: req.user._id }, { _reassignedTo: { $eq: null } }] },
          { _reassignedTo: req.user._id },
        ];
      }
      // Build query for outstanding, completed requests
      // Set field that results should be grouped by
      if (req.query.outstanding) {
        query.paidAt = { $eq: null };
        query.completedAt = { $ne: null };
        groupByFields = ['fromCustomInvoice', '_payingUser._id', '_serviceProvider._id'];
      }

      // If we want completed requests
      if (req.query.completed) {
        query.paidAt = { $ne: null };
        groupByFields = ['fromCustomInvoice', '_payingUser._id', '_serviceProvider._id'];
      }

      // Get all requests that match the query
      const requestCount = await Request
        .find(query)
        .count();
      const populateQuery = [
        { path: '_show', select: WHITELIST_SHOW_ATTRIBUTES },
        { path: '_horseManager', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_serviceProvider', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_horse', select: WHITELIST_HORSE_ATTRIBUTES },
        { path: '_payingUser', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_owner', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_owners._user' },
        { path: '_reassignedTo', select: WHITELIST_USER_ATTRIBUTES },
      ];
      const requests = await Request
        .find(query)
        .select(select)
        .populate(populateQuery)
        .lean();

      // For every request, add a paying user if there isn't one
      requests.forEach((request) => {
        if (!request._payingUser && userIsOwner(request, req.user)) {
          request._payingUser = req.user;
        } else if (!request._payingUser) {
          request._payingUser = Request.getDummyPayingUser(request);
        }
      });

      // Sort requests
      const sortedRequests = _.sortBy(requests, (result) => {
        let name = null;
        if (result._payingUser) {
          name = result._payingUser.name;
        } else if (result._owner) {
          name = result._owner.name;
        } else {
          name = result._horseManager.name;
        }
        return name;
      });

      // Use lodash mixin nest() to subgroup requests by the fields given
      const rawGroupedRequests = _.chain(sortedRequests).nest(groupByFields).toPairs().value();
      const requestsForResponse = [];
      // Work within each distinct invoice type - traditional request vs custom invoice
      await Promise.map(rawGroupedRequests, ((invoiceTypeGroup) => {
        // The view will decide to mark subgrouped invoices as direct requests based on this value
        const isFromCustomInvoice = invoiceTypeGroup[0] === 'true';
        // In each invoice type group, drill down into the provider groups separated by who's paying
        Object.entries(invoiceTypeGroup[1]).forEach((payerGroup) => {
          Object.entries(payerGroup[1]).forEach((providerGroup) => {
            // Each provider group has its own request data, use it to build group metadata for view
            let mainManager;
            if (providerGroup[1][0]._payingUser) {
              mainManager = providerGroup[1][0]._payingUser;
            } else if (providerGroup[1][0]._owner) {
              mainManager = providerGroup[1][0]._owner;
            } else {
              mainManager = providerGroup[1][0]._horseManager;
            }
            const providerGroupData = {
              _id: providerGroup[0],
              fromCustomInvoice: isFromCustomInvoice,
              name: mainManager.name,
              _payingUser: mainManager,
              _serviceProvider: getServiceProvider(providerGroup[1]),
              _currentUser: req.user,
              serviceCount: getServiceTotal(providerGroup[1]),
              minDate: getMinDate(providerGroup[1]),
              maxDate: getMaxDate(providerGroup[1]),
              total: getTotal(providerGroup[1]),
              horses: Request.getHorses(providerGroup[1]),
            };

            if (req.query.horseManager && req.query.outstanding) {
              providerGroupData.name = mainManager.name;
            }

            if (req.query.serviceProvider && req.query.outstanding) {
              providerGroupData.name = providerGroup[1][0]._horseManager.name;
            }

            requestsForResponse.push([providerGroupData, providerGroup[1]]);
          });
        });
      }));
      /**
       * Do our own limiting/skipping for pagination instead of using .limit() and .skip()
       * Because of our custom sorting
       */
      const paginatedRequests = requestsForResponse.slice(skip, limit + skip);
      utils.respondWithResult(res)({ requests: paginatedRequests, requestCount });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets a list of requests grouped by horse
   */
  groupedByHorse: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const select = WHITELIST_ATTRIBUTES.join(' ');

      // We should always be getting completed requests that have not been deleted and
      // have not been added to an invoice or paid
      const query = {
        $and: [
          { $or: [{ addedToInvoice: false }, { addedToInvoice: { $exists: false } }] },
        ],
        deletedAt: null,
        completedAt: { $ne: null },
        paidAt: { $eq: null },
      };

      // Get all requests where user is the main service provider or the reasignee
      query.$and.push(
        {
          $or: [
            { _serviceProvider: req.user._id },
            { _reassignedTo: req.user._id },
          ],
        },
      );

      // Get all requests that match the query
      const requestCount = await Request
        .find(query)
        .count();
      const populateQuery = [
        { path: '_show', select: WHITELIST_SHOW_ATTRIBUTES },
        { path: '_horseManager', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_serviceProvider', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_reassignedTo', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_horse',
          populate: { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES },
        },
      ];
      const requests = await Request
        .find(query)
        .select(select)
        .populate(populateQuery)
        .lean();

      // Sort requests by service provider name and then group by service provider
      const sortedRequests = _.sortBy(requests, result => result._serviceProvider.name);
      const groupedRequests = _.chain(sortedRequests).groupBy('_serviceProvider._id').toPairs().value();

      // Within each service provider group, group requests by horse
      await Promise.map(groupedRequests, (async (providerGroup) => {
        const providerGroupClone = providerGroup;

        // Sort, then group by horse
        const sortedByHorse = _.sortBy(providerGroup[1], result => result._horse.barnName);
        const groupedByHorse = _.chain(sortedByHorse).groupBy('_horse._id').toPairs().value();

        // Add metadata to the horse groupings so we can display on the frontend
        // Building the data structure: [ {metadataObject}, [ {requestObject}, {requestObject} ] ]
        await Promise.map(groupedByHorse, ((horseGroup) => {
          const horseGroupClone = horseGroup;
          const groupMetadata = {
            _id: horseGroup[0],
            serviceCount: getServiceTotal(horseGroup[1]),
            minDate: getMinDate(horseGroup[1]),
            maxDate: getMaxDate(horseGroup[1]),
            total: getTotal(horseGroup[1]),
          };

          horseGroupClone[0] = groupMetadata;
        }));

        providerGroupClone[1] = groupedByHorse;
      }));

      /**
       * Do our own limiting/skipping for pagination instead of using .limit() and .skip()
       * Because of our custom sorting
       */
      const paginatedRequests = groupedRequests.slice(skip, limit + skip);
      return utils.respondWithResult(res)({ requests: paginatedRequests, requestCount });
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Gets a list of requests as a service provider's schedule
   */
  schedule: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const sort = req.query.sort || 'date';
      const select = WHITELIST_ATTRIBUTES.join(' ');

      const startOfToday = moment().startOf('day');
      const endOfToday = moment().endOf('day');

      // Get requests where req.user is the main provider or the reassignee
      const query = { $or:
        [{ _serviceProvider: req.user._id },
          { _reassignedTo: req.user._id },
          { _previousReassignees: req.user.id }],
      date: {},
      };

      if (req.query.today || req.query.upcoming) {
        query._dismissedBy = { $nin: [req.user._id] };
      }

      // Today's outstanding requests
      if (req.query.today) {
        query.date = { $gte: startOfToday, $lte: endOfToday };
      }

      // Upcoming outstanding requests
      if (req.query.upcoming && !req.query.endDate) {
        query.date = { $gt: endOfToday };
      }

      // Past requests
      if (req.query.past) {
        query.date = { $lt: startOfToday };
        query.deletedAt = { $eq: null };
      }

      // If startDate/endDate param sent via filter
      if (req.query.startDate || req.query.endDate) {
        // If no start/end date given, default to today's date
        const filterStartDate = moment(req.query.startDate).startOf('day') || startOfToday;
        const filterEndDate = moment(req.query.endDate).endOf('day') || endOfToday;

        // Basic date query with start/end date date range params
        query.date = {
          $gte: filterStartDate,
          $lte: filterEndDate,
        };

        // If in the past segment - requests must always be < today
        if (req.query.past) {
          // If filter start date is in the future
          if (filterStartDate > startOfToday) {
            delete query.date.$gte;
          }

          // Filter end date is in the future
          // But filter start date is in the past
          if (filterEndDate > startOfToday && filterStartDate < startOfToday) {
            query.date.$lt = startOfToday;
            delete query.date.$lte;
          }

          // Filter start date and end date are both in the future
          if (filterStartDate >= startOfToday && filterEndDate > startOfToday) {
            query.date = {
              $lt: startOfToday,
              $gte: filterStartDate,
            };
          }
        }

        // If in the upcoming segment - requests must always be >= than today
        if (req.query.upcoming) {
          // If no filter end date sent
          if (!req.query.endDate) {
            delete query.date.$lte;
          }

          // Filter start date is in the past
          // But filter end date is in the future
          if (filterStartDate < startOfToday && filterEndDate >= startOfToday) {
            query.date.$gte = startOfToday;
          }

          // Filter start date and end date are both in the past
          if (filterStartDate < startOfToday && filterEndDate < startOfToday) {
            query.date = {
              $lt: filterStartDate,
              $gte: startOfToday,
            };
          }
        }
      }

      const requestCount = await Request
        .find(query)
        .count();
      const populateQuery = [
        { path: '_show', select: WHITELIST_SHOW_ATTRIBUTES },
        { path: '_horseManager', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_serviceProvider', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_reassignedTo', select: WHITELIST_USER_ATTRIBUTES },
      ];
      let requests = await Request
        .find(query)
        .select(select)
        .sort(sort)
        .populate(populateQuery)
        .populate({ path: '_horse',
          populate: { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES } })
        .lean();

      // If sorting by horse property - we have to do our own custom
      // sorting on either horse barn or show name in ascending or descending
      if (isHorseProperty(sort)) {
        // Trim the '-' off the sort param for use in our sort function
        let sortProperty;
        let sortDirection;
        if (sort[0] !== '-') {
          sortProperty = sort;
          sortDirection = 'ascending';
        } else if (sort[0] === '-') {
          sortProperty = sort.substring(1, sort.length);
          sortDirection = 'descending';
        }

        // Custom sort by horse barn or show name
        requests = sortByHorse(requests, sortProperty, sortDirection);
      }

      // Do our own limiting/skipping for pagination instead of using .limit() and .skip()
      // Because of our custom sorting
      requests = requests.slice(skip, limit + skip);

      // Send back a date only field for grouping by date on the frontend
      if (req.query.upcoming || req.query.past) {
        requests.forEach((request) => {
          request.dateOnly = moment(request.date).startOf('day');
        });
      }

      utils.respondWithResult(res)({ requests, requestCount });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets a single request
   */
  show: async (req, res, next) => {
    try {
      const populateQuery = [
        { path: '_show', select: WHITELIST_SHOW_ATTRIBUTES },
        { path: '_horseManager', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_serviceProvider', select: WHITELIST_USER_ATTRIBUTES },
        { path: '_reassignedTo', select: WHITELIST_USER_ATTRIBUTES },
      ];
      const request = await Request.findOne({ _id: req.params.id })
        .populate(populateQuery)
        .populate({ path: '_horse',
          populate: { path: '_trainer' } });

      if (request) {
        const response = utils.sanitizeObject(request, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets the last request created by req.user
   */
  showLastRequest: async (req, res, next) => {
    try {
      const query = { _horseManager: req.user.id };
      if (req.params.horseId) { query._horse = req.params.horseId; }

      const request = await Request.findOne(query)
        .sort('-createdAt')
        .populate('_serviceProvider _show');

      if (request) {
        const response = utils.sanitizeObject(request, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.respondWithSuccess(res)('No requests for user');
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Create a new request
   */
  create: async (req, res, next) => {
    try {
      const newRequest = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);

      const creatingCustomInvoice = newRequest.fromCustomInvoice;
      if (creatingCustomInvoice) {
        newRequest._serviceProvider = req.user;
        if (newRequest._horse._trainer) {
          // If this is being created as part of a custom invoice, find and set the horse manager
          newRequest._horseManager = newRequest._horse._trainer;
        }
      } else {
        // Set req.user as horse manager otherwise
        newRequest._horseManager = req.user;
      }

      // Find or create the show if necessary
      if (newRequest._show) {
        try {
          newRequest._show = await Show.findOrCreate(newRequest._show);
        } catch (err) {
          return utils.handleError(next)(err);
        }
      }

      // Add the user that will make payment as a separate field on Request
      // Horse owner will pay unless there is no owner - then trainer pays
      const horse = await Horse.findById(newRequest._horse)
        .populate('_owner _trainer _leasedTo')
        .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES });

      // Add _payingUser for backwards compatibility
      // If there are multiple owners, set _payingUser to null
      if (horse && horse._leasedTo) {
        newRequest._payingUser = horse._leasedTo;
      } else if (horse && horse._owners && horse._owners.length === 1) {
        newRequest._payingUser = horse._owners[0]._user;
      } else if (horse && horse._owners && horse._owners.length > 1) {
        newRequest._payingUser = null;
      } else if (horse && horse._trainer) {
        newRequest._payingUser = horse._trainer;
      }

      /**
      * Add all _payingUser payment approver ids to the request
      */
      if (newRequest._payingUser) {
        newRequest._paymentApprovers = newRequest._payingUser.paymentApprovals.map((approval) => {
          return approval._approver;
        });
      }

      // Add the horse _leasedTo, _owners, and _trainer to the request to make querying easier
      if (horse && horse._leasedTo) {
        newRequest._leasedTo = horse._leasedTo;
      }

      if (horse && horse._owners.length) {
        newRequest._owners = horse._owners;
      }

      if (horse && horse._trainer) {
        newRequest._trainer = horse._trainer;
      }

      // Update total;
      newRequest.total = 0;
      newRequest.services.forEach((service) => {
        newRequest.total += (+service.rate * (service.quantity || 1));
      });

      // Make sure the total is two decimal places
      newRequest.total = newRequest.total.toFixed(2);

      // When a provider submits a custom invoice, the work has already been done.
      if (creatingCustomInvoice) {
        newRequest.acceptedAt = moment();
        newRequest.completedAt = moment();
      }

      const request = await Request.create(newRequest);

      if (!creatingCustomInvoice) {
        // If manager is requesting, create a new notification in the db
        // First, build up the message
        const requestDate = formatDate(newRequest.date);
        let serviceNames = '';
        newRequest.services.forEach((service, index) => {
          serviceNames += `${service.service}`;
          if (index !== newRequest.services.length - 1) {
            serviceNames += ', ';
          }
        });

        let notificationMessage = `${serviceNames} for ${horse.barnName} on ${requestDate} `;
        if (newRequest.services.length > 1) {
          notificationMessage += 'have';
        } else {
          notificationMessage += 'has';
        }

        notificationMessage += ' been requested.';

        // Send notification if data is present, and if this user isn't creating a custom invoice
        if (newRequest._serviceProvider && notificationMessage) {
          const newNotification = {
            message: notificationMessage,
            _recipients: [newRequest._serviceProvider._id],
          };

          // If date of request is not same day, do not send a push notification
          if (!Request.isSameDay(newRequest)) {
            newNotification.sendPush = false;
          }

          await Notification.create(newNotification);
        }
      }

      const response = utils.sanitizeObject(request, WHITELIST_ATTRIBUTES);
      return utils.respondWithResult(res)(response);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Update an existing request
   */
  update: async (req, res, next) => {
    try {
      // First find the original request
      const originalRequest = await Request.findById(req.body._id);

      // Return error if request is already paid
      if (originalRequest.paidAt) {
        return utils.respondWithError(res)('This request has already been paid');
      }

      // See if the total has changed
      const oldTotal = originalRequest.total;

      // See if the service provider has changed
      const originalServiceProviderId = String(originalRequest._serviceProvider);

      // Get ids for comparison
      const newServiceProviderId = String(req.body._serviceProvider._id);

      // See if the main service provider or reassignee have changed
      const hasNewServiceProvider = originalServiceProviderId !== newServiceProviderId;

      // Make sure we're not setting "undefined" when we determine originalReassigneeId
      let originalReassigneeId;
      if (originalRequest._reassignedTo) {
        originalReassigneeId = String(originalRequest._reassignedTo);
      }

      // See if _reassignedTo field has changed to someone different than the main service provider
      let newReassigneeId;
      let hasNewReassignee = false;
      if (req.body._reassignedTo && req.body._reassignedTo._id !== req.body._serviceProvider._id) {
        newReassigneeId = String(req.body._reassignedTo._id || req.body._reassignedTo);
        hasNewReassignee = String(originalReassigneeId) !== String(newReassigneeId);
      }

      const updatedRequest = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);
      // If the request is being reassigned away from a previous reassignee,
      // keep track of that user in the request's list of previous assignees
      if (originalReassigneeId && originalReassigneeId !== newReassigneeId) {
        if (updatedRequest._previousReassignees &&
            !updatedRequest._previousReassignees.includes(originalReassigneeId)) {
          updatedRequest._previousReassignees.push(originalReassigneeId);
        }
      }

      // Find or create the show if one is present
      if (updatedRequest._show && updatedRequest._show._id) {
        try {
          updatedRequest._show = await Show.findOrCreate(updatedRequest._show);
        } catch (err) {
          return utils.handleError(next)(err);
        }
      }

      // If the service provider reassigns back to themselves, remove duplicate reassignee info
      let hasOriginalProviderAsReassignee = false;
      if (updatedRequest._serviceProvider &&
        updatedRequest._reassignedTo &&
        updatedRequest._serviceProvider._id === updatedRequest._reassignedTo._id) {
        // For readability, this is where the condition ends and the work begins
        updatedRequest._reassignedTo = null;
        hasOriginalProviderAsReassignee = true;
      }

      // If there is a new service provider we set the declinedAt date back to null
      if (hasNewServiceProvider || hasNewReassignee || hasOriginalProviderAsReassignee) {
        updatedRequest.declinedAt = null;
        updatedRequest.acceptedAt = null;
      }

      // Update total;
      updatedRequest.total = 0;

      updatedRequest.services.forEach((service) => {
        updatedRequest.total += (+service.rate * (service.quantity || 1));
      });

      const request = await Request.findOne({ _id: req.params.id })
        .populate('_show _horse')
        .populate({ path: '_reassignedTo _payingUser _serviceProvider _horseManager _trainer', select: WHITELIST_USER_ATTRIBUTES });

      if (request) {
        const horseName = request._horse.barnName;

        _.assign(request, updatedRequest);
        await request.save();

        // Get recipient and build message to create a new notification
        const recipients = [];
        let notificationMessage;
        const horseManagerName = updatedRequest._horseManager.name;
        const serviceProviderName = updatedRequest._serviceProvider.name;

        // Start to build notification
        const newNotification = {};

        // If main service provider reassigned a request - send push to the reassignee
        if (hasNewReassignee && User.isServiceProvider(req.user)) {
          recipients.push(updatedRequest._reassignedTo._id);
          notificationMessage = `${serviceProviderName} has requested your assignment for` +
          ` ${horseName} on ${formatDate(updatedRequest.date)}.`;

          // Do not send a push if request more than a day out
          if (!Request.isSameDay(updatedRequest)) {
            newNotification.sendPush = false;
          }

        // If request was updated by the main service provider or reassignee
        // Send push to horse manager - this would be a change to services which changes the total
        } else if (!hasNewReassignee &&
                  (isMainServiceProvider(req.user, updatedRequest) ||
                  isReassignedServiceProvider(req.user, updatedRequest))) {
          // If the total of the request has changed - send push
          if (oldTotal !== updatedRequest.total) {
            recipients.push(updatedRequest._horseManager._id);
            notificationMessage = `${serviceProviderName} updated the requested services for ${horseName}` +
            ` on ${formatDate(updatedRequest.date)}.`;
          }

          // Otherwise, send push to main service provider and _reassignee
        } else {
          recipients.push(updatedRequest._serviceProvider._id);
          if (updatedRequest._reassignedTo) {
            recipients.push(updatedRequest._reassignedTo._id || updatedRequest._reassignedTo);
          }

          notificationMessage = `${horseManagerName} updated an appointment for ${horseName}` +
            ` on ${formatDate(updatedRequest.date)}.`;
        }

        if (recipients.length && notificationMessage) {
          newNotification._recipients = recipients;
          newNotification.message = notificationMessage;

          await Notification.create(newNotification);
        }

        const response = utils.sanitizeObject(request, WHITELIST_ATTRIBUTES);
        return utils.respondWithResult(res)(response);
      }

      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Update status of a request
   */
  updateStatus: async (req, res, next) => {
    try {
      const request = await Request.findOne({ _id: req.params.id })
        .populate('_horseManager _serviceProvider _reassignedTo _show')
        .populate({ path: '_horse',
          populate: { path: '_trainer' } });

      if (request) {
        let status;

        if (req.params.status === ACCEPTED) {
          request.acceptedAt = new Date();
          status = 'accepted';
        }

        if (req.params.status === COMPLETED) {
          request.completedAt = new Date();
          status = 'completed';
        }

        // If request is declined
        if (req.params.status === DECLINED) {
          request.declinedAt = new Date();
          status = 'declined';

          // Add user to the request _dismissedBy array so they do not
          // See it in their schedule view
          const index = request._dismissedBy.findIndex(id => String(id) === String(req.user._id));
          if (index < 0) {
            request._dismissedBy.push(req.user._id);
            await request.save();
          }

          // Mark request if main service provider was the one to decline a request
          if (isMainServiceProvider(req.user, request)) {
            request.declinedByHeadServiceProvider = true;
          }
        }

        // If user leaves a previously accepted request and user is the main service provider
        if (req.params.status === LEFT && isMainServiceProvider(req.user, request)) {
          request.declinedAt = new Date();
          status = 'left';
          request.declinedByHeadServiceProvider = true;

          // Add user to the request _dismissedBy array so they do not
          // See it in their schedule view
          const index = request._dismissedBy.findIndex(id => String(id) === String(req.user._id));
          if (index < 0) {
            request._dismissedBy.push(req.user._id);
            await request.save();
          }
        }

        // If user leaves a previously accepted request and user is the reassignee
        if (req.params.status === LEFT && isReassignedServiceProvider(req.user, request)) {
          request.declinedAt = new Date();
          request.acceptedAt = null;
          status = 'left';

          // Add user to the request _dismissedBy array so they do not
          // See it in their schedule view
          const index = request._dismissedBy.findIndex(id => String(id) === String(req.user._id));
          if (index < 0) {
            request._dismissedBy.push(req.user._id);
            await request.save();
          }
        }

        await request.save();

        // Send push notification to _horseManager or main service provider
        // Change message based on status param
        let recipient;

        // If a reassignee has declined/left a request - send push to main service provider
        if (
          (req.params.status === DECLINED || req.params.status === LEFT)
          && (isReassignedServiceProvider(req.user, request))
        ) {
          recipient = request._serviceProvider._id;
        } else {
          recipient = request._horseManager._id;
        }

        let serviceProvider;
        if (request._reassignedTo) {
          serviceProvider = request._reassignedTo.name;
        } else {
          serviceProvider = request._serviceProvider.name;
        }

        // Build service names for notification
        let serviceNames = '';
        request.services.forEach((service, index) => {
          serviceNames += `${service.service}`;
          if (index !== request.services.length - 1) {
            serviceNames += ', ';
          }
        });

        const notificationMessage = `${serviceProvider} has ${status} request for ` +
        `${serviceNames} on ${formatDate(request.date)} for ${request._horse.barnName}.`;

        if (recipient && notificationMessage) {
          const newNotification = {
            _recipients: [recipient],
            message: notificationMessage,
          };

          // Only send push if request is rejected
          if (req.params.status !== DECLINED && req.params.status !== LEFT) {
            newNotification.sendPush = false;
          }

          await Notification.create(newNotification);
        }

        const response = utils.sanitizeObject(request, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Add req.user to dismissedBy array
   */
  dismiss: async (req, res, next) => {
    try {
      const request = await Request.findOne({ _id: req.params.id })
        .populate('_horseManager _serviceProvider _reassignedTo _show _horse');

      if (request) {
        // If user doesn't already exist in request._dismissedBy, add them
        const index = request._dismissedBy.findIndex(id => String(id) === String(req.user._id));
        if (index < 0) {
          request._dismissedBy.push(req.user._id);
          await request.save();
        }

        const response = utils.sanitizeObject(request, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Delete a request
   * We are really just updating the deletedAt property so we can keep it in our database
   */
  destroy: async (req, res, next) => {
    try {
      const request = await Request.findOne({ _id: req.params.id })
        .populate('_serviceProvider _horseManager _horse');

      if (request) {
        // Update deletedAt property
        request.deletedAt = moment();
        await request.save();

        const horseManagerName = request._horseManager.name;

        // Recipient is main service provider and reassignee
        const recipients = [];
        recipients.push(request._serviceProvider._id);
        if (request._reassignedTo) {
          recipients.push(request._reassignedTo);
        }

        // Build service names for notification message
        let serviceNames = '';
        request.services.forEach((service, index) => {
          serviceNames += `${service.service}`;
          if (index !== request.services.length - 1) {
            serviceNames += ', ';
          }
        });

        const notificationMessage = `${serviceNames} cancelled for ${request._horse.barnName} by ` +
        `${horseManagerName} on ${formatDate(request.date)}.`;

        // Create a new notification in our db
        if (recipients.length && notificationMessage) {
          await Notification.create({
            _recipients: recipients,
            message: notificationMessage,
          });
        }

        const response = utils.sanitizeObject(request, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Mark multiple requests as deleted
   */
  destroyMultiple: async (req, res, next) => {
    try {
      const requests = await Request.find({ _id: { $in: req.body.ids } })
        .populate('_serviceProvider _horseManager _horse');

      if (requests.length) {
        requests.forEach(async (request) => {
          // Update deletedAt property
          request.deletedAt = moment();
          await request.save();
        });

        utils.respondWithSuccess(res)('Invoice successfully deleted');
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

};

module.exports = RequestController;
