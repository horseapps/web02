const _ = require('lodash');
const moment = require('moment');
const OneSignal = require('../../components/push');
const Mailer = require('../../components/mailer');
const Invoice = require('./invoice.model');
const User = require('../user/user.model');
const Request = require('../request/request.model');
const Payment = require('../payment/payment.model');
const Horse = require('../horse/horse.model');
const utils = require('../../components/utils');
const Promise = require('bluebird');

const SERVICE_FEE_PERCENT = process.env.STRIPE_SERVICE_FEE_PERCENTAGE;

const WHITELIST_ATTRIBUTES = [
  '_id',
  'amount',
  'tip',
  'paidOutsideAppAt',
  'paidInFullAt',
  '_owners',
  '_payingUsers',
  'paymentApprovals',
  '_leasee',
  '_horse',
  '_requests',
  '_serviceProvider',
  'createdAt',
  'deletedAt',
  'serviceCount',
  'minDate',
  'maxDate',
  '_trainer',
  '_payments',
  'totalForUser',
  'fromDataMigration',
  '_reassignees',
];

const WHITELIST_REQUEST_ATTRIBUTES = [
  'amount',
  'tip',
  'paidOutsideAppAt',
  'paidInFullAt',
  '_owners',
  '_payingUsers',
  'paymentApprovals',
  '_leasee',
  '_horse',
  '_requests',
  '_serviceProvider',
  '_reassignees',
  '_trainer',
  '_id',
  'fromDataMigration',
];

const WHITELIST_USER_ATTRIBUTES = [
  '_id',
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
  'deviceIds',
];

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
 * Get the invoice total the auth user should see
 * @param  {object} invoice  The invoice object
 * @param  {object} user     The user we need the total for
 * @return {number}          The invoice total for the auth user
 */
function getTotalForUser(invoice, user) {
  let totalForUser = 0;

  // If I'm the main service provider on the invoice, I see everything
  // If I'm a reassignee, I only see the requests I completed
  if (String(user._id) === String(invoice._serviceProvider._id) || User.isManager(user)) {
    totalForUser = invoice.amount + (invoice.tip || 0);
  } else {
    invoice._requests.forEach((request) => {
      if (request._reassignedTo && String(user._id === String(request._reassignedTo._id))) {
        totalForUser += request.total;
      }
    });
  }

  return totalForUser;
}

/**
 * Get all the reassignees for an invoice
 * @param  {object} invoice The invoice object
 * @return {array}          Array of reassignee objects
 */
function getInvoiceReassignees(invoice) {
  const reassignees = [];
  invoice._requests.forEach((request) => {
    const index = reassignees.findIndex(o =>
      request._reassignedTo &&
      String(o._id) === String(request._reassignedTo._id),
    );
    if (request._reassignedTo && index < 0) {
      reassignees.push(request._reassignedTo);
    }
  });

  return reassignees;
}

function sendPushNotification(recipients, message) {
  // Get array of unique device ids
  let deviceIds = [];
  recipients.forEach((recipient) => {
    deviceIds = deviceIds.concat(recipient.deviceIds);
  });
  deviceIds = _.uniq(deviceIds);

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

function formatDate(date) {
  return moment(date).format('ddd, MMM D');
}

/**
 * Wrapper to send email
 * @param  {Object} options      Can include any options for Mailer
 * @param  {Object} templateData The data to be used in the template
 */
function sendEmail(options, templateData = {}) {
  const mailer = new Mailer(options);
  return mailer.sendMail(templateData);
}

const InvoiceController = {

  /**
   * Gets a list of invoices
   */
  index: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      let sort = req.query.sort || '-createdAt';
      const select = WHITELIST_ATTRIBUTES.join(' ');

      // Sort by paid at date if looking at completed invoice list
      if (req.query.complete) {
        sort = '-paidInFullAt';
      }

      // Do not return any deleted invoices
      const query = {
        deletedAt: null,
      };

      // Get outstanding or completed invoices
      if (req.query.outstanding) {
        query.paidInFullAt = null;
        query.paidOutsideAppAt = null;
      } else if (req.query.complete) {
        query.$and = [
          {
            $or: [
              { paidInFullAt: { $ne: null } },
              { paidOutsideAppAt: { $ne: null } },
            ],
          },
        ];
      }

      // If user is a horse manager, get all invoices where either:
      // 1. user is a paying user on the invoice
      // 2. user is a payment approver
      if (req.query.horseManager) {
        const horseManagerQuery = [
          { '_payingUsers._user': req.user._id },
          { 'paymentApprovals._approver': req.user._id },
        ];

        if (req.query.complete) {
          query.$and.push(
            { $or: horseManagerQuery },
          );
        } else if (req.query.outstanding) {
          query.$or = horseManagerQuery;
        }
      }

      // If a user is a service provider, get all invoices where either:
      // 1. user is the main service provider
      // 2. user is a reassigned service provider
      if (req.query.serviceProvider) {
        if (req.query.complete) {
          query.$and.push(
            {
              $or: [
                { _serviceProvider: req.user._id },
                { _reassignees: req.user._id },
              ],
            },
          );
        } else if (req.query.outstanding) {
          query.$or = [
            { _serviceProvider: req.user._id },
            { _reassignees: req.user._id },
          ];
        }
      }

      const invoiceCount = await Invoice
        .find(query)
        .count();
      const invoices = await Invoice
        .find(query)
        .select(select)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .populate({ path: '_requests',
          populate: { path: '_reassignedTo', select: WHITELIST_USER_ATTRIBUTES } })
        .populate({ path: '_requests',
          populate: { path: '_horse _show' } })
        .populate({ path: '_serviceProvider _leasee _trainer', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_horse',
          populate: { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES } })
        .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES })
        .lean();

      // For each invoice, add a min/max date of requests and
      // a service count for displaying on the frontend
      await Promise.map(invoices, (async (invoice) => {
        const invoiceClone = invoice;

        // Get the requests where the auth user is the main service provider or the reassignee
        // If user is a horse manager they will see all requests
        let requests;
        const isInvoiceProvider = String(req.user._id) === String(invoice._serviceProvider._id);
        if (User.isManager(req.user) || isInvoiceProvider) {
          requests = invoice._requests;
        } else {
          requests = invoice._requests.filter(request => request._reassignedTo &&
            String(req.user._id) === String(request._reassignedTo._id));
        }

        invoiceClone._requests = requests;

        if (invoice._requests.length > 1) {
          invoiceClone.minDate = getMinDate(requests);
          invoiceClone.maxDate = getMaxDate(requests);
        }

        invoiceClone.serviceCount = Request.getServiceCount(requests);
        invoiceClone.totalForUser = getTotalForUser(invoice, req.user);

        // Send all the payments associated with this invoice to the frontend
        invoiceClone._payments = await Payment.find({ _invoice: invoice._id });

        // For backwards compatibility with version 1.2.1
        // If all the requests on an old invoice only have one horse,
        // Send that horse back as part of the invoice
        if (invoiceClone.fromDataMigration) {
          const horses = [];
          invoice._requests.forEach((request) => {
            const index = horses.findIndex(o =>
              request._horse &&
              String(o._id) === String(request._horse._id),
            );
            if (index < 0) {
              horses.push(request._horse);
            }

            if (horses.length === 1) {
              invoiceClone._horse = horses[0];
            }
          });
        }
      }));

      utils.respondWithResult(res)({ invoices, invoiceCount });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets a single invoice
   */
  show: async (req, res, next) => {
    try {
      const invoice = await Invoice.findOne({ _id: req.params.id })
        .populate({ path: '_requests',
          populate: { path: '_reassignedTo', select: WHITELIST_USER_ATTRIBUTES } })
        .populate({ path: '_serviceProvider _leasee', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_horse _show',
          populate: { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES } })
        .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES })
        .lean();

      if (invoice) {
        // Send all the payments associated with this invoice to the frontend
        invoice._payments = await Payment.find({ _invoice: invoice._id });

        const response = utils.sanitizeObject(invoice, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Create a new invoice
   */
  create: async (req, res, next) => {
    try {
      const newInvoice = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);
      newInvoice.fromDataMigration = false;

      // Make sure the user creating the invoice is the main service provider on all requests
      newInvoice._requests.forEach((request) => {
        if (String(request._serviceProvider._id) !== String(req.user._id)) {
          utils.respondWithError(res)('You do not have permission to create this invoice.');
        }
      });

      // Find the horse object
      const horse = await Horse.findOne({ _id: newInvoice._horse });

      // Preserve a snapshot of owners, trainer, paying users, etc, at the time of invoice creation
      newInvoice.amount = Invoice.getInvoiceTotal(newInvoice._requests);
      newInvoice._reassignees = getInvoiceReassignees(newInvoice);
      newInvoice._owners = horse._owners;
      newInvoice._leasee = horse._leasedTo;
      newInvoice._serviceProvider = req.user._id;
      newInvoice._trainer = horse._trainer;

      // Set _payingUser array
      // If there is a leasee, they take over all ownership responsibilities
      if (newInvoice._leasee) {
        newInvoice._payingUsers = [{
          _user: horse._leasedTo,
          percentage: 100,
        }];
      } else if (!newInvoice._owners.length) {
        // If there are no owners, the trainer takes over all ownership responsibilities
        newInvoice._payingUsers = [{
          _user: horse._trainer,
          percentage: 100,
        }];
      } else {
        newInvoice._payingUsers = horse._owners;
      }

      // Add all the payment approvers for each paying user on this invoice
      newInvoice.paymentApprovals = [];
      await Promise.map(newInvoice._payingUsers, (async (owner) => {
        const user = await User.findOne({ _id: owner._user });
        if (user) {
          const approvals = user.paymentApprovals.map((paymentApproval) => {
            const paymentApprovalClone = paymentApproval;
            paymentApprovalClone._payer = user._id;
            return paymentApprovalClone;
          });

          newInvoice.paymentApprovals.push(...approvals);
        }
      }));

      const invoice = await Invoice.create(newInvoice);

      // Now we need to mark each request as addedToInvoice
      invoice._requests.forEach(async (invoiceRequest) => {
        const request = await Request.findOne({ _id: invoiceRequest });
        request.addedToInvoice = true;
        request.save();
      });

      // Find the invoice so we can send it back populated
      const populatedInvoice = await Invoice.findOne({ _id: invoice._id })
        .populate('_requests')
        .populate({ path: '_serviceProvider _leasee _reassignees _trainer', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_horse',
          populate: { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES } })
        .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES });


      // Get recipients and send a push notification to all users who can pay an invoice
      const payingUsers = populatedInvoice._payingUsers;
      const notificationRecipients = payingUsers.map(payingUser => payingUser._user);
      notificationRecipients.push(
        ...populatedInvoice.paymentApprovals.map(approval => approval._approver),
      );
      const pushMessage = `An invoice for ${populatedInvoice._horse.barnName} has been submitted.`;
      sendPushNotification(notificationRecipients, pushMessage);

      // Send email to all users with payment authority
      const payerEmails = notificationRecipients.map(recipient => recipient.email);
      const mailOptions = {
        to: utils.buildEmailString(payerEmails),
        from: process.env.FROM_EMAIL,
        subject: 'HorseLinc - Invoice Submitted',
        html: ('../app/invoice/views/invoiceSubmittedForManager.html'),
      };

      const serviceFee = +(populatedInvoice.amount * process.env.STRIPE_SERVICE_FEE_PERCENTAGE);
      const invoiceObject = {
        horse: populatedInvoice._horse.barnName,
        createdAt: formatDate(populatedInvoice.createdAt),
        serviceCount: Request.getServiceCount(populatedInvoice._requests),
        amount: populatedInvoice.amount + serviceFee,
        serviceProviderName: populatedInvoice._serviceProvider.name,
        serviceProviderEmail: populatedInvoice._serviceProvider.email,
      };

      const data = { invoiceObject };
      sendEmail(mailOptions, data);

      // Build object containing reassignee id and the amount they will get from this payment
      // We'll need to use this when sending notifications

      // If there are any reassignees on this invoice, send them a push and email
      if (invoice._reassignees.length) {
        const reassigneePushMessage = `${populatedInvoice._serviceProvider.name} has submitted an ` +
          `invoice for ${populatedInvoice._horse.barnName}.`;
        sendPushNotification(populatedInvoice._reassignees, reassigneePushMessage);

        populatedInvoice._reassignees.forEach((reassignee) => {
          // Remove any invoice requests they didn't do
          const requests = populatedInvoice._requests.filter(request => request._reassignedTo &&
            String(reassignee._id) === String(request._reassignedTo));

          const providerMailOptions = {
            to: reassignee.email,
            from: process.env.FROM_EMAIL,
            subject: 'HorseLinc - Invoice Submitted',
            html: ('../app/invoice/views/invoiceSubmittedForProvider.html'),
          };

          const providerInvoiceObject = {
            horse: populatedInvoice._horse.barnName,
            createdAt: formatDate(populatedInvoice.createdAt),
            serviceCount: Request.getServiceCount(requests),
            amount: getTotalForUser(populatedInvoice, reassignee),
            serviceProviderName: populatedInvoice._serviceProvider.name,
            serviceProviderEmail: populatedInvoice._serviceProvider.email,
            horseTrainerName: populatedInvoice._trainer.name,
            horseTrainerEmail: populatedInvoice._trainer.email,
          };

          const providerData = { providerInvoiceObject };
          sendEmail(providerMailOptions, providerData);
        });
      }

      const response = utils.sanitizeObject(populatedInvoice, WHITELIST_ATTRIBUTES);
      utils.respondWithResult(res)(response);
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Update an existing invoice
   */
  update: async (req, res, next) => {
    try {
      const updatedInvoice = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);
      const invoicePayments = await Payment.find({ _invoice: updatedInvoice._id });

      if (invoicePayments.length) {
        return utils.respondWithError(res)('Invoice cannot be updated once a payment has been made.');
      }

      let newInvoiceTotal = 0;

      // First, we need to update the request objects with the new services/total
      // Then we can update the invoice
      await Promise.map(updatedInvoice._requests, (async (request) => {
        const oldRequest = await Request.findOne({ _id: request._id });
        if (oldRequest) {
          oldRequest.services = request.services;
          oldRequest.total = request.services.reduce(
            (accumulator, currentValue) => accumulator +
            (Number(currentValue.rate) * (currentValue.quantity || 1)),
            0,
          );

          newInvoiceTotal += oldRequest.total;
          oldRequest.save();
        }
      }));

      // Update the invoice total
      updatedInvoice.amount = newInvoiceTotal;

      const invoice = await Invoice.findOne({ _id: req.params.id }).populate('_requests');

      if (invoice) {
        _.assign(invoice, updatedInvoice);
        await invoice.save();

        // Send back the populated invoice
        const populatedInvoice = await Invoice.findOne({ _id: invoice._id })
          .populate({ path: '_requests',
            populate: { path: '_reassignedTo', select: WHITELIST_USER_ATTRIBUTES } })
          .populate({ path: '_requests',
            populate: { path: '_horse' } })
          .populate({ path: '_serviceProvider _leasee _trainer _reassignees', select: WHITELIST_USER_ATTRIBUTES })
          .populate({ path: '_horse',
            populate: { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES } })
          .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES })
          .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES })
          .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES })
          .lean();

        // Add metadata to the new request
        let requests;
        if (String(req.user._id) === String(populatedInvoice._serviceProvider._id)) {
          requests = populatedInvoice._requests;
        } else {
          requests = populatedInvoice._requests.filter(request => request._reassignedTo &&
            String(req.user._id) === String(request._reassignedTo._id));
        }

        populatedInvoice._requests = requests;

        if (populatedInvoice._requests.length > 1) {
          populatedInvoice.minDate = getMinDate(requests);
          populatedInvoice.maxDate = getMaxDate(requests);
        }

        populatedInvoice.serviceCount = Request.getServiceCount(requests);
        populatedInvoice.totalForUser = getTotalForUser(populatedInvoice, req.user);

        // Send all the payments associated with this invoice to the frontend
        populatedInvoice._payments = invoicePayments;

        // Get recipients and send a push notification to all users who can pay an invoice
        const payingUsers = populatedInvoice._payingUsers;
        const pushRecipients = payingUsers.map(payingUser => payingUser._user);
        pushRecipients.push(
          ...populatedInvoice.paymentApprovals.map(approval => approval._approver),
        );

        const pushMessage = `${req.user.name} has updated the invoice for ${populatedInvoice._horse.barnName}.`;
        sendPushNotification(pushRecipients, pushMessage);

        const response = utils.sanitizeObject(populatedInvoice, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        return utils.handleEntityNotFound(res);
      }
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Send push/email reminder to service provider to submit invoice
   */
  requestSubmission: async (req, res, next) => {
    try {
      const requests = req.body.requests;
      const requestIds = requests.map(request => request._id);
      const serviceProviderId = requests[0]._serviceProvider._id;

      // Find the main service provider
      const serviceProvider = await User.findOne({ _id: serviceProviderId });
      if (serviceProvider) {
        // Find all the requests from the database
        const requestDocuments = await Request.find({
          _id: { $in: requestIds },
          deletedAt: null,
        });

        // If any of the requests have been deleted, send back an error
        if (!requestDocuments.length) {
          return utils.respondWithError(res)('This invoice has been deleted by the main service provider.');
        }

        // Send push notification
        const message = `${req.user.name} has requested an invoice submission. ` +
          'Please review and submit the joint invoice waiting in your Drafts.';
        sendPushNotification([serviceProvider], message);

        // Send email
        const reassignee = req.user;
        const mailOptions = {
          to: serviceProvider.email,
          from: process.env.FROM_EMAIL,
          subject: 'HorseLinc - Request For Invoice Submission',
          html: ('../app/invoice/views/submissionRequest.html'),
        };
        const data = { reassignee };
        sendEmail(mailOptions, data);

        return utils.respondWithSuccess(res)('Success');
      }

      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Send push and email reminder to pay for an invoice when the approved payer
   * doesn't have approval to do it
   */
  requestApproval: async (req, res, next) => {
    try {
      // Find the invoice and the owner objects
      const invoice = await Invoice.findOne({ _id: req.body.invoiceId })
        .populate('_serviceProvider _requests');
      const owner = await User.findOne({ _id: req.body.ownerId });

      if (invoice) {
        const roundedTotal = req.body.amountOwed.toFixed(2);

        // Send email
        const mailOptions = {
          to: owner.email,
          from: process.env.FROM_EMAIL,
          subject: 'HorseLinc - Approval Requested for Outstanding Invoice',
          html: ('../app/invoice/views/approvalRequested.html'),
        };

        const invoiceData = {
          date: moment(invoice.createdAt).format('ddd, MMM D'),
          horseManagerName: req.user.name,
          horseManagerEmail: req.user.email,
          serviceProviderName: invoice._serviceProvider.name,
          serviceProviderEmail: invoice._serviceProvider.email,
          serviceCount: Request.getServiceCount(invoice._requests),
          total: roundedTotal,
        };

        const data = { invoiceData };
        await sendEmail(mailOptions, data);

        // Send push notification
        if (owner.deviceIds && owner.deviceIds.length > 0) {
          const oneSignal = new OneSignal();
          const message = `${req.user.name} does not have the ability to initiate payments on your behalf. ` +
            'Add them as an approved payer to expedite invoice payments. In the meantime, resolve the pending ' +
            `invoice of $${roundedTotal} via the payments tab.`;

          oneSignal.createNotification({
            include_player_ids: owner.deviceIds,
            headings: { en: 'HorseLinc' },
            contents: { en: message },
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
          });
        }

        return utils.respondWithSuccess(res)('Email and push successfully sent.');
      }
      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Send push and email reminder to pay for an invoice when the approved payer
   * doesn't have a high enough limit to pay an invoice
   */
  requestApprovalIncrease: async (req, res, next) => {
    try {
      // Find the invoice and the owner objects
      const invoice = await Invoice.findOne({ _id: req.body.invoiceId })
        .populate('_serviceProvider _requests');
      const owner = await User.findOne({ _id: req.body.ownerId });

      if (invoice) {
        const roundedTotal = req.body.amountOwed.toFixed(2);

        // Send email
        const mailOptions = {
          to: owner.email,
          from: process.env.FROM_EMAIL,
          subject: 'HorseLinc - Invoice Over Payment Approver Limit',
          html: ('../app/invoice/views/approvalIncreaseRequested.html'),
        };

        const invoiceData = {
          date: moment(invoice.createdAt).format('ddd, MMM D'),
          horseManagerName: req.user.name,
          horseManagerEmail: req.user.email,
          serviceProviderName: invoice._serviceProvider.name,
          serviceProviderEmail: invoice._serviceProvider.email,
          serviceCount: Request.getServiceCount(invoice._requests),
          total: roundedTotal,
        };

        const data = { invoiceData };
        await sendEmail(mailOptions, data);

        // Send push notification
        if (owner.deviceIds && owner.deviceIds.length > 0) {
          const oneSignal = new OneSignal();
          const message = `${req.user.name} does not have the ability to resolve this pending invoice of ` +
            `$${roundedTotal}. Edit ${req.user.name}'s maximum approved amount. You can also resolve the ` +
            'pending payment from your own account.';

          oneSignal.createNotification({
            include_player_ids: owner.deviceIds,
            headings: { en: 'HorseLinc' },
            contents: { en: message },
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
          });
        }

        return utils.respondWithSuccess(res)('Email and push successfully sent.');
      }
      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Send push and email reminder to pay for an outstanding invoice
   */
  requestPayment: async (req, res, next) => {
    try {
      // Find the invoice
      const invoice = await Invoice.findOne({ _id: req.body._id })
        .populate('_serviceProvider _horse _requests')
        .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES });

      if (invoice) {
        // If the invoice is deleted, send back an error
        if (invoice.deletedAt) {
          return utils.respondWithError(res)('This invoice has been deleted by the main service provider.');
        }

        // Get all paying users on the invoice
        const payingUsers = invoice.getPayingUsers();
        const payingUserEmails = payingUsers.map(payingUser => payingUser.email);
        const emailRecipients = utils.buildEmailString(payingUserEmails);

        // Send email to all users with payment abilities
        const mailOptions = {
          to: emailRecipients,
          from: process.env.FROM_EMAIL,
          subject: 'HorseLinc - Payment Reminder for Outstanding Invoice',
          html: ('../app/invoice/views/paymentReminder.html'),
        };

        // The service provider should see the invoice amount increased by 5%
        const serviceFeePercentage = process.env.STRIPE_SERVICE_FEE_PERCENTAGE;
        const serviceFee = +(invoice.amount * serviceFeePercentage).toFixed(2);
        const roundedTotal = invoice.amount + serviceFee;
        const invoiceData = {
          horse: invoice._horse.barnName,
          date: moment(invoice.createdAt).format('ddd, MMM D'),
          serviceProviderName: invoice._serviceProvider.name,
          serviceProviderEmail: invoice._serviceProvider.email,
          serviceCount: Request.getServiceCount(invoice._requests),
          total: roundedTotal,
        };

        const data = { invoiceData };
        await sendEmail(mailOptions, data);

        // Send push notification to all users with payment abilities
        const pushMessage = `Your invoice of $${roundedTotal}` +
          ' remains outstanding. Head to the Payments tab to resolve the invoice.';
        sendPushNotification(payingUsers, pushMessage);

        return utils.respondWithSuccess(res)('Email and push successfully sent.');
      }
      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Add a deletedAt property to invoice and all it's requests
   */
  destroy: async (req, res, next) => {
    try {
      // Find the invoice
      const invoice = await Invoice.findOne({ _id: req.params.id })
        .populate('_requests _serviceProvider _reassignees')
        .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES });

      if (invoice) {
        // Only the main service provider can delete an invoice
        if (String(invoice._serviceProvider._id) !== String(req.user._id)) {
          return utils.respondWithError(res)('You are not authorized to delete this invoice.');
        }

        // A request cannot be deleted if there have been any payments against it
        const payments = await Payment.find({ _invoice: req.params.id });
        if (payments.length) {
          return utils.respondWithError(res)('There is already a payment against this invoice.');
        }

        // Mark the invoice as deleted and save
        invoice.deletedAt = new Date();
        invoice.save();

        // Mark each request as deletedAt
        invoice._requests.forEach(async (request) => {
          const invoiceRequest = await Request.findById(request);
          if (invoiceRequest) {
            invoiceRequest.deletedAt = new Date();
            invoiceRequest.save();
          }
        });

        // Send push to all reassignees on the invoice
        if (invoice._reassignees.length) {
          invoice._reassignees.forEach((reassignee) => {
            const reassigneeTotal = getTotalForUser(invoice, reassignee);
            const reassigneePushMessage = `Your invoice of $${reassigneeTotal.toFixed(2)}` +
              ` has been deleted by ${invoice._serviceProvider.name}.`;
            sendPushNotification([reassignee], reassigneePushMessage);
          });
        }

        // Send push notification to all paying users
        const payingUsers = invoice.getPayingUsers();
        const invoiceAmountPlusFee = utils.calculateInvoiceTotalWithFee(invoice);
        // Send push notification to all users with payment abilities
        const pushMessage = `Your invoice of $${invoiceAmountPlusFee}` +
          ` has been deleted by ${invoice._serviceProvider.name}.`;

        sendPushNotification(payingUsers, pushMessage);

        return utils.respondWithSuccess(res)('Invoice successfully deleted');
      }

      return utils.handleEntityNotFound(res);
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Collect invoice records based on query information, convert to CSV format, email as attachment
   */
  exportToCsv: async (req, res, next) => {
    try {
      const select = WHITELIST_ATTRIBUTES.join(' ');
      let sort = '-createdAt';
      // // Sort by paid at date if looking at completed invoice list
      if (req.body.complete) {
        sort = '-paidInFullAt';
      }

      // Do not return any deleted invoices, and begin with a push-able list of $and conditions
      const query = {
        $and: [
          { deletedAt: null },
        ],
      };

      // Select whether to query for HM's or SP's invoices, based on request's user type
      if (req.body.userType === 'service provider') {
        // Get all the invoices where the current user was the main provider or a reassignee
        const serviceProviderQuery = [
          { _serviceProvider: req.user._id },
          { _reassignees: req.user._id },
        ];
        query.$and.push(
          { $or: serviceProviderQuery },
        );
      } else if (req.body.userType === 'horse manager') {
        // Get all the invoices where the current user was a payer or a payment approver
        const horseManagerQuery = [
          { '_payingUsers._user': req.user._id },
          // { 'paymentApprovals._approver': req.user._id },
        ];
        query.$and.push(
          { $or: horseManagerQuery },
        );
      }

      // Constrain results by service providers if one or more is given in request body
      if (req.body.serviceProviders && req.body.serviceProviders.length) {
        const providerFilter = [
          { _serviceProvider: { $in: req.body.serviceProviders } },
          { _reassignees: { $in: req.body.serviceProviders } },
        ];
        query.$and.push(
          { $or: providerFilter },
        );
      }

      // Constrain results by horse managers if one or more is given in request body
      if (req.body.horseManagers && req.body.horseManagers.length) {
        const managerFilter = [
          { '_payingUsers._user': { $in: req.body.horseManagers } },
          // { 'paymentApprovals._approver': req.user._id },
        ];
        query.$and.push(
          { $or: managerFilter },
        );
      }

      // Get outstanding or completed invoices
      if (req.body.paymentType === 'outstanding') {
        query.paidInFullAt = null;
        query.paidOutsideAppAt = null;
      } else if (req.body.paymentType === 'complete') {
        const completeFilter = [
          { paidInFullAt: { $ne: null } },
          { paidOutsideAppAt: { $ne: null } },
        ];
        query.$and.push(
          { $or: completeFilter },
        );
      }

      let invoiceCount = await Invoice
        .find(query)
        .count();
      let invoices = await Invoice
        .find(query)
        .select(select)
        .sort(sort)
        .populate({
          path: '_requests',
          populate: { path: '_reassignedTo', select: WHITELIST_USER_ATTRIBUTES },
        })
        .populate({
          path: '_requests',
          populate: { path: '_horse _show' },
        })
        .populate({ path: '_serviceProvider _leasee _trainer _reassignees', select: WHITELIST_USER_ATTRIBUTES })
        .populate({
          path: '_horse',
          populate: { path: '_trainer', select: WHITELIST_USER_ATTRIBUTES },
        })
        .populate({ path: '_owners._user', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES });

      // If the user is filtering by specific horses,
      // filter the invoices after they are returned with populated horses and then recount them
      if (req.body.horses && req.body.horses.length) {
        invoices = invoices.filter((invoice) => {
          return invoice.includesHorses(req.body.horses);
        });
        invoiceCount = invoices.length;
      }

      // If the user is filtering by date,
      // filter the invoices that may or may not represent legacy request data
      // and then recount them
      if (req.body.sinceDate || req.body.untilDate) {
        invoices = invoices.filter((invoice) => {
          return invoice.isWithinDateRange(req.body.sinceDate, req.body.untilDate);
        });
        invoiceCount = invoices.length;
      }

      if (invoiceCount > 0) {
        // If there are invoices, convert them into CSV output and mail it
        const exportedCsv = await Invoice.convertAllToCsv(invoices, req.user);
        const dateString = String(moment.utc().subtract(5, 'hours').format('MM-DD-YYYY'));
        const mailOptions = {
          to: req.user.email,
          from: process.env.FROM_EMAIL,
          subject: 'Your HorseLinc Invoice Export is Ready',
          html: ('../app/invoice/views/invoiceExport.html'),
          attachments: [
            {
              filename: `HorseLinc-Invoice-Export-${dateString}.csv`,
              content: Buffer.from(exportedCsv, 'utf-8'),
            },
          ],
        };
        const data = {
          queryParams: req.body,
          userName: req.user.name,
        };

        sendEmail(mailOptions, data);
      }

      console.log(`INVOICE EXPORT QUERY COMPLETE. TOTAL INVOICES RETRIEVED: ${invoiceCount}`);

      // Respond based on whether invoices were found to export
      if (invoices.length) {
        return utils.respondWithSuccess(res)('Invoice export complete');
      }
      return utils.respondWithSuccess(res)('NO INVOICES FOUND');
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

};

module.exports = InvoiceController;
