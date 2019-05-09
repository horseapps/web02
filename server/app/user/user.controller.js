const _ = require('lodash');
const stripe = require('stripe')(process.env.STRIPE_CLIENT_SECRET);
const request = require('request');
const Request = require('../request/request.model');
const Payment = require('../payment/payment.model');
const Invoice = require('../invoice/invoice.model');
const User = require('./user.model');
const Horse = require('../horse/horse.model');
const Notification = require('../notification/notification.model');
const authServer = require('snapmobile-authserver');
const utils = require('../../components/utils');
const Mailer = require('../../components/mailer');
const mongoose = require('mongoose');

const Auth = authServer.authService;

const HORSE_MANAGER = 'horse manager';
const SERVICE_PROVIDER = 'service provider';
const PAYMENT_APPROVER = 'payment approver';

const WHITELIST_ATTRIBUTES = [
  '_id',
  'name',
  'email',
  'roles',
  'token',
  'barn',
  'phone',
  'location',
  'avatar',
  'services',
  'accountSetupComplete',
  'stripeAccountApproved',
  'stripeLast4',
  'stripeExpMonth',
  'stripeExpYear',
  'paymentApprovals',
  'trustedProviders',
  'privateNotes',
];

const WHITELIST_REQUEST_ATTRIBUTES = [
  'privateNotes',
  'fromCustomInvoice',
  'name',
  'password',
  'email',
  'name',
  'roles',
  'barn',
  'phone',
  'location',
  'avatar',
  'services',
  'accountSetupComplete',
];

const WHITELIST_APPROVAL_ATTRIBUTES = [
  '_id',
  '_approver',
  'isUnlimited',
  'maxAmount',
];

const WHITELIST_PROVIDER_ATTRIBUTES = [
  '_id',
  '_provider',
  'label',
  'customLabel',
];

/**
 * Wrapper to send email
 * @param  {Object} options      Can include any options for Mailer
 * @param  {Object} templateData The data to be used in the template
 */
function sendEmail(options, templateData = {}) {
  const mailer = new Mailer(options);
  return mailer.sendMail(templateData);
}


const UserController = {

  /**
   * Gets a list of users
   */
  index: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const sort = req.query.sort || 'name';
      const select = WHITELIST_ATTRIBUTES.join(' ');

      // Make sure we're only showing users who have completed account setup
      const query = { accountSetupComplete: true };

      // If a searchTerm is sent we need to search users by name
      if (req.query.searchTerm) {
        query.name = { $regex: new RegExp(req.query.searchTerm, 'i') };
      }

      // If user is a manager searching for payment approvers, do not include them in the list
      if (User.isManager(req.user) && req.query.searchTerm && req.query.role === PAYMENT_APPROVER) {
        query._id = { $ne: req.user._id };
      }

      // If limiting by horse we need to get all trainers/owners for horses req.user manages
      if (req.query.limitByHorse) {
        // First get all horses the authenticated user trains or owns
        const horseQuery = {
          $or: [
            { '_owners._user': { $in: [req.user] } },
            { _trainer: req.user },
            { _leasedTo: req.user },
          ],
        };

        const horses = await Horse.find(horseQuery);

        // Then, get a unique list of people that are either owners or trainers
        let horseManagerIds = [];
        horses.forEach((horse) => {
          if (horse._owners.length) {
            const ownerIds = horse._owners.map(owner => String(owner._user));
            horseManagerIds = horseManagerIds.concat(ownerIds);
          }

          if (horse._trainer) {
            horseManagerIds.push(String(horse._trainer));
          }
        });

        query._id = { $in: horseManagerIds };
      }

      // Role may be sent as param
      if (req.query.role &&
        (req.query.role === HORSE_MANAGER || req.query.role === PAYMENT_APPROVER)) {
        query.roles = { $in: [HORSE_MANAGER] };
      } else if (req.query.role && req.query.role === SERVICE_PROVIDER) {
        query.roles = { $in: [SERVICE_PROVIDER] };
      }

      // If excludeIds is sent, do not return those users
      if (req.query.excludeIds) {
        const excludeIdsArray = req.query.excludeIds.split(',');
        query._id = { $nin: excludeIdsArray };
      }

      const userCount = await User
        .find(query)
        .count();
      const users = await User
        .find(query)
        .select(select)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .lean();

      utils.respondWithResult(res)({ users, userCount });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },


  /**
   * Creates a new user
   */
  create: async (req, res, next) => {
    try {
      const newUser = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);
      let user = await User.create(newUser);

      // Add auth token to response
      user = user.toObject();
      user.token = Auth.signToken(user._id);

      const response = utils.sanitizeObject(user, WHITELIST_ATTRIBUTES);
      utils.respondWithResult(res)(response);
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Returns the user
   */
  show: async (req, res, next) => {
    try {
      let user;
      if (req.params.id === 'me') {
        user = await User.findById(req.user._id)
          .populate({
            path: 'paymentApprovals._approver',
          });
      } else if (req.params.id === 'multipleOwners') {
        return utils.respondWithError(res)(Horse.backwardsCompatibilityError());
      } else {
        user = await User.findById(req.params.id);
      }

      if (user) {
        const response = utils.sanitizeObject(user, WHITELIST_ATTRIBUTES);

        // If this is the current user, add extra data
        if (req.params.id === 'me') {
          if (User.isManager(req.user)) {
            response.stripeCustomerSetup = req.user.isStripeCustomerSetup();
          }
        }

        return utils.respondWithResult(res)(response);
      } else {
        return utils.handleEntityNotFound(res);
      }
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * Updates the authenticated user
   */
  update: async (req, res, next) => {
    try {
      const updatedUser = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);
      const user = await User.findById(req.user._id);

      if (user) {
        _.assign(user, updatedUser);
        await user.save();

        const response = utils.sanitizeObject(user, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Delete the authenticated user
   */
  destroy: async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id);

      if (user) {
        await user.remove();
        res.status(204).end();
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Change the current user's password
   */
  changePassword: async (req, res, next) => {
    try {
      const oldPassword = req.body.oldPassword;
      const newPassword = req.body.newPassword;

      if (!newPassword) {
        utils.respondWithError(res)('New password is required');
        return;
      }

      if (!oldPassword) {
        utils.respondWithError(res)('Old password is required');
        return;
      }

      const user = await User.findById(req.user._id);

      if (user) {
        user.authenticate(oldPassword, async (err, authenticated) => {
          if (authenticated) {
            user.password = newPassword;
            await user.save();

            utils.respondWithSuccess(res)('Password successfully changed');
          } else {
            utils.respondWithError(res)('Incorrect password');
          }
        });
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Creates and sends a password reset token and URL to a user
   * @param {Object<email>} req Request object that includes email
   * @param {Object} res Response object
   * @param {Function} next Next callback
   */
  forgotPassword: async (req, res, next) => {
    try {
      const email = req.body.email;

      if (!email) {
        utils.respondWithError(res)('Email is required');
        return;
      }

      const user = await User.findOne({ email });

      if (!user) {
        utils.respondWithError(res)('Could not find a user with this email');
        return;
      }

      await user.saveResetToken();

      const mailOptions = {
        to: user.email,
        from: process.env.FROM_EMAIL,
        subject: 'Password Reset',
        html: ('../app/user/views/forgotPassword.html'),
      };

      const baseUrl = process.env.BASE_URL;
      const data = { baseUrl, user };
      const mailer = new Mailer(mailOptions);

      await mailer.sendMail(data);

      utils.respondWithSuccess(res)('Password reset instructions have been sent.');
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Confirms if the password reset token is valid or not
   * @param {Object<token>} req Request object including reset token
   * @param {Object} res  Response object
   * @param {Function} next Next callback
   */
  resetToken: async (req, res, next) => {
    try {
      const token = req.params.token;

      const user = await User.findOne({
        resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        utils.respondWithError(res)('Password reset token is incorrect or has expired.');
        return;
      }

      utils.respondWithSuccess(res)('Password reset token is valid.');
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Resets a password for a user
   * @param {Object<token,password>} req Request object including token and password
   * @param {Object} res  Response object
   * @param {Function} next Next callback
   */
  resetPassword: async (req, res, next) => {
    try {
      const token = req.params.token;
      const password = req.body.password;

      if (!password) {
        utils.respondWithError(res)('Password is required.');
        return;
      }

      const user = await User.findOne({
        resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        utils.respondWithError(res)('Password reset token is incorrect or has expired.');
        return;
      }

      user.password = password;
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();

      const mailOptions = {
        to: user.email,
        from: process.env.FROM_EMAIL,
        subject: 'Password Reset',
        text: 'Hello,\n\nThis is a confirmation your password has been reset.\n',
      };
      const mailer = new Mailer(mailOptions);
      await mailer.sendMail();

      utils.respondWithSuccess(res)('Password has been updated.');
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Add a device id to the authenticated user
   * If the device id is already in the user's device ids, respond with success but ignore id
   */
  addDevice: async (req, res, next) => {
    try {
      if (!req.body.deviceId && !req.body.deviceId.userId) {
        utils.respondWithError(res)('Device id is required');
        return;
      }

      const deviceId = req.body.deviceId.userId || req.body.deviceId;

      const user = await User.findById(req.user._id);

      if (user.deviceIds.indexOf(deviceId) === -1) {
        user.deviceIds.push(deviceId);
        await user.save();

        utils.respondWithSuccess(res)('Device id has been added');
      } else {
        utils.respondWithSuccess(res)('Device id has already been added');
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * The Stripe webhook endpoint used for notifications for Connect applications
   */
  stripeWebhookConnect: async (req, res, next) => {
    try {
      console.log('**** Webhook for Connect application ****', req.body);

      // Send email to HorseLinc admin
      const mailOptions = {
        to: process.env.ADMIN_EMAIL,
        from: process.env.FROM_EMAIL,
        subject: 'Stripe Connect Account Activity',
        html: ('../app/user/views/stripeAdminEmail.html'),
      };

      await sendEmail(mailOptions, req.body);

      // Payment was created - save the transfer amount to the payment object
      if (req.body.type === 'payment.created') {
        const payment = await Payment.findOne({
          transactions: { $elemMatch: { transferId: req.body.data.object.source_transfer } },
        })
          .populate('_horseManager _serviceProvider');

        if (payment) {
          let serviceProviderId;

          // Find transfer with transferId === req.body.data.object.source_transfer
          // TODO: SINGLE NOTIFICATION WITH OVERALL PAID TOTAL
          payment.transactions.forEach(async (transaction) => {
            const transactionClone = transaction;
            if (transaction.transferId === req.body.data.object.source_transfer) {
              const paymentAmount = req.body.data.object.amount;
              transactionClone.stripeTransferAmount = (paymentAmount / 100).toFixed(2);

              serviceProviderId = transaction._serviceProvider;
              let notificationMessage;

              if (transaction._request) {
                // Find the request attached to this transaction
                const populatedRequest = await Request.findById(transaction._request)
                  .populate('_horse');

                // Create a new notification object
                notificationMessage = `Payment for ${populatedRequest._horse.barnName} for` +
                  ` $${transactionClone.stripeTransferAmount} has been posted.`;
              }

              if (transaction.transactionType === 'tip') {
                notificationMessage = `A tip for $${transactionClone.stripeTransferAmount} has been posted.`;
              }

              if (notificationMessage && serviceProviderId) {
                await Notification.create({
                  message: notificationMessage,
                  _recipients: [serviceProviderId],
                });
              }
            }
          });

          await payment.save();
        }
        res.status(200).end();
      }
      res.status(200).end();
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * The Stripe webhook endpoint used for notifications for main account
   */
  stripeWebhookMaster: async (req, res, next) => {
    try {
      console.log('**** Webhook for client Stripe account ****', req.body);

      // Send email to HorseLinc admin
      const mailOptions = {
        to: process.env.ADMIN_EMAIL,
        from: process.env.FROM_EMAIL,
        subject: 'Stripe Master Account Activity',
        html: ('../app/user/views/stripeAdminEmail.html'),
      };
      await sendEmail(mailOptions, req.body);

      res.status(200).end();
    } catch (err) {
      utils.handleError(next)(err);
    }
  },


  /**
   * Sets up Stripe payment for a user
   */
  setupStripePayment: async (req, res) => {
    try {
      const user = await User.findById(req.user._id);

      if (user) {
        if (user.stripeCustomerId) {
          const customer = await stripe.customers.update(req.user.stripeCustomerId, {
            email: req.user.email,
            source: req.body.id,
          });

          if (customer && customer.sources.data[0]) {
            // Store credit card information for reference
            user.stripeLast4 = customer.sources.data[0].last4;
            user.stripeExpMonth = customer.sources.data[0].exp_month;
            user.stripeExpYear = customer.sources.data[0].exp_year;

            const updatedUser = await user.save();
            if (updatedUser) {
              res.status(200).end();
            } else {
              res.status(422).json({ message: 'Could not save account.' });
            }
          } else {
            res.status(422).json({ message: 'Something went wrong.' });
          }
        } else {
          const customer = await stripe.customers.create({
            email: req.user.email,
            source: req.body.id,
          });

          if (customer && customer.sources.data[0]) {
            user.stripeCustomerId = customer.id;

            // Store credit card information for reference
            user.stripeLast4 = customer.sources.data[0].last4;
            user.stripeExpMonth = customer.sources.data[0].exp_month;
            user.stripeExpYear = customer.sources.data[0].exp_year;

            const updatedUser = await user.save();
            if (updatedUser) {
              res.status(200).end();
            } else {
              res.status(422).json({ message: 'Could not save account.' });
            }
          } else {
            res.status(422).json({ message: 'Something went wrong.' });
          }
        }
      }
    } catch (err) {
      utils.respondWithError(res)(err.message);
    }
  },

  /**
   * Stripe redirect uri
   * Adds the stripe id to seller
   */
  stripeRedirect: async (req, res, next) => {
    try {
      const userId = req.query.state;

      // Make POST request to STRIPE server to finish connection
      await request.post(process.env.STRIPE_CONNECTION_URI, {
        form: {
          client_secret: process.env.STRIPE_CLIENT_SECRET,
          code: req.query.code,
          grant_type: 'authorization_code',
        },
      },
      async (error, response, body) => {
        const parsedBody = JSON.parse(body);
        console.log('**** Stripe OAuth Token endpoint body: ****', body);

        // An error from Stripe will come in the body
        if (parsedBody.error) {
          res.redirect(`${process.env.BASE_URL}/admin/stripe/deny`);
        } else {
          const user = await User.findById(userId);

          // Update user - add stripe id and update approval status
          if (user) {
            user.stripeSellerId = parsedBody.stripe_user_id;
            user.stripeAccountApproved = true;
            await user.save();
          } else {
            utils.handleEntityNotFound(res);
          }
          res.redirect(`${process.env.BASE_URL}/admin/stripe/approve`);
        }
      });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets a temporary url for req.user to use to edit their Stripe details dashboard
   */
  stripeDashboardUrl: async (req, res) => {
    if (req.user.stripeSellerId) {
      stripe.accounts.createLoginLink(req.user.stripeSellerId,
        (err, link) => {
          if (err) {
            res.status(422).json({ message: err.message });
          } else {
            utils.respondWithResult(res)({ link });
          }
        },
      );
    } else {
      res.status(422).json({ message: 'You do not have a Stripe account' });
    }
  },

  /**
  * Adds a payment approver to the user's collection of approvers
  */
  addPaymentApproval: async (req, res, next) => {
    try {
      const newApproval = utils.sanitizeObject(req.body, WHITELIST_APPROVAL_ATTRIBUTES);
      const user = await User.findById(req.user._id);
      if (user) {
        // Users may not have the payment approvals array if this is their first time adding
        if (!user.paymentApprovals) { user.paymentApprovals = []; }

        const existingApprovalIndex = user.paymentApprovals.findIndex((approval) => {
          return approval._approver.toString() === newApproval._approver._id.toString();
        });

        // If a user inadvertently adds a duplicate approver, ensure that only the new twin is saved
        if (existingApprovalIndex >= 0) {
          newApproval._id = user.paymentApprovals[existingApprovalIndex]._id;
          user.paymentApprovals[existingApprovalIndex] = newApproval;
        } else {
          newApproval._id = mongoose.Types.ObjectId();
          user.paymentApprovals.push(newApproval);
        }

        // Assemble this owner's horses and their pending requests
        const ownedHorses = await Horse.find({ $or: [{ _owner: req.user }, { _leasedTo: req.user }] }).select('_id').lean();
        const ownedHorseIds = ownedHorses.map((foundHorse) => {
          return foundHorse._id;
        });
        const requestQuery = {
          paidAt: { $eq: null },
          deletedAt: { $eq: null },
          _horse: { $in: ownedHorseIds },
        };
        const pendingRequests = await Request.find(requestQuery);

        /**
         * Now that we've got all the owner-payable requests, reset each one's approvers
         * allowing the new approver to view those requests after they refresh
         */
        const approverIds = user.paymentApprovals.map((approval) => {
          return approval._approver;
        });
        pendingRequests.forEach(async (pendReq) => {
          const pendingRequest = pendReq;
          pendingRequest._paymentApprovers = approverIds;
          await pendingRequest.save();
        });

        await user.save();

        // Notify the manager who has just been approved.
        let approvedAmount;
        if (newApproval.isUnlimited) {
          approvedAmount = 'any amount';
        } else {
          approvedAmount = `up to $${newApproval.maxAmount}`;
        }
        const notificationMessage = `${req.user.name} has approved you to pay ${approvedAmount} on their behalf.`;
        await Notification.create({
          message: notificationMessage,
          _recipients: [newApproval._approver._id],
        });

        const response = utils.sanitizeObject(newApproval, WHITELIST_APPROVAL_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  updatePaymentApproval: async (req, res, next) => {
    try {
      const updatedApproval = utils.sanitizeObject(req.body, WHITELIST_APPROVAL_ATTRIBUTES);
      const user = await User.findById(req.user._id);
      if (user) {
        user.paymentApprovals.forEach((approval, index) => {
          if (approval._id.toString() === updatedApproval._id.toString()) {
            user.paymentApprovals[index] = updatedApproval;
          }
        });
        await user.save();

        // Notify the approver that their amount has changed.
        let approvedAmount;
        if (updatedApproval.isUnlimited) {
          approvedAmount = 'any amount';
        } else {
          approvedAmount = `up to $${updatedApproval.maxAmount}`;
        }
        const notificationMessage = `Payment approval updated. You can now pay ${approvedAmount} on ${req.user.name}'s behalf.`;
        await Notification.create({
          message: notificationMessage,
          _recipients: [updatedApproval._approver._id],
        });

        // Find any outstanding invoices with this payment approver
        const invoices = await Invoice.find({
          paidInFullAt: null,
          paidOutsideAppAt: null,
          'paymentApprovals._approver': updatedApproval._approver._id,
          'paymentApprovals._payer': req.user._id,
        });

        // Then update the invoice with the new payment approval amount
        invoices.forEach((invoice) => {
          invoice.paymentApprovals.forEach((paymentApproval) => {
            const approvalClone = paymentApproval;
            if (String(paymentApproval._payer) === String(req.user._id) &&
              String(paymentApproval._approver) === String(updatedApproval._approver._id)) {
              approvalClone.maxAmount = updatedApproval.maxAmount;
              approvalClone.isUnlimited = updatedApproval.isUnlimited;
            }
          });

          invoice.save();
        });

        const response = utils.sanitizeObject(updatedApproval, WHITELIST_APPROVAL_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
  * Deletes a payment approver from the user's collection of approvers
  * @param  {Object}  approval   The payment approval to be deleted
  * @param  {Object}  response   The successfully deleted approval's ID, wrapped in JSON
  */
  deletePaymentApproval: async (req, res, next) => {
    try {
      const approvalToDeleteId = req.params.id;
      const user = await User.findById(req.user._id);
      if (user) {
        // Only keep the payment approvals that don't match the deleted approval's id
        const remainingApprovals = user.paymentApprovals.filter((approval) => {
          return approval._id.toString() !== approvalToDeleteId;
        });
        // Save the user with their freshly-filtered array of approvals
        user.paymentApprovals = remainingApprovals;

        // Assemble this owner's horses and their pending requests
        const ownedHorses = await Horse.find({ $or: [{ _owner: req.user }, { _leasedTo: req.user }] }).select('_id').lean();
        const ownedHorseIds = ownedHorses.map((foundHorse) => {
          return foundHorse._id;
        });
        const requestQuery = {
          paidAt: { $eq: null },
          deletedAt: { $eq: null },
          _horse: { $in: ownedHorseIds },
        };
        const pendingRequests = await Request.find(requestQuery);

        /**
         * Now that we've got all the owner-payable requests, reset each one's approvers
         * allowing the new approver to view those requests after they refresh
         */
        const approverIds = user.paymentApprovals.map((approval) => {
          return approval._approver;
        });
        pendingRequests.forEach(async (pendReq) => {
          const pendingRequest = pendReq;
          pendingRequest._paymentApprovers = approverIds;
          await pendingRequest.save();
        });

        await user.save();
        const response = { deletedId: approvalToDeleteId };
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
  * Returns a collection of owner authorization objects
  * each of which stores the owner who authorized the user to approve payments
  * along with the amount approved
  */
  ownerAuthorizations: async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id);
      if (user) {
        const select = WHITELIST_ATTRIBUTES.join(' ');
        // Get the horse managers who have added this user to their payment approvers
        const owners = await User.find({
          roles: 'horse manager',
          paymentApprovals: { $elemMatch: { _approver: user } } })
          .select(select)
          .populate({ path: 'paymentApprovals._approver' })
          .lean();
        const authorizations = [];
        owners.forEach((owner) => {
          owner.paymentApprovals.forEach((approval) => {
            if (approval._approver._id.toString() === user._id.toString()) {
              // Build the authorization object and add it to the response
              const authorization = {
                _owner: owner,
                isUnlimited: approval.isUnlimited,
                maxAmount: approval.maxAmount,
              };
              authorizations.push(authorization);
            }
          });
        });
        utils.respondWithResult(res)(authorizations);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  groupedProviders: async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id)
        .populate({ path: 'trustedProviders._provider', select: WHITELIST_ATTRIBUTES });
      if (user) {
        // Users may not have the service providers array if this is their first time adding
        if (!user.trustedProviders) { user.trustedProviders = []; }

        // Sanitize the provider objects before we nest them deeper into groups
        const sanitizedProviders = user.trustedProviders.map((provider) => {
          return utils.sanitizeObject(provider, WHITELIST_PROVIDER_ATTRIBUTES);
        });

        // Group by label, using the custom label where present
        const groupedProviders = _.groupBy(sanitizedProviders, (provider) => {
          let groupKey;
          if (provider.label === 'other' && provider.customLabel) {
            groupKey = provider.customLabel;
          } else {
            groupKey = provider.label;
          }
          return groupKey;
        });

        // Angular can't iterate over _.groupby()'s object of objects, so send it an array instead.
        const groupedProvidersArray = Object.values(groupedProviders);
        const response = groupedProvidersArray;
        utils.respondWithResult(res)(response);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  addServiceProvider: async (req, res, next) => {
    try {
      const newTrustedProvider = utils.sanitizeObject(req.body, WHITELIST_PROVIDER_ATTRIBUTES);
      const user = await User.findById(req.user._id)
        .populate({ path: 'trustedProviders._provider', select: WHITELIST_ATTRIBUTES });
      if (user) {
        // Users may not have the service providers array if this is their first time adding
        if (!user.trustedProviders) { user.trustedProviders = []; }
        newTrustedProvider._id = mongoose.Types.ObjectId();
        if (newTrustedProvider.label === 'other' && newTrustedProvider.customLabel) {
          newTrustedProvider.customLabel = _.trim(newTrustedProvider.customLabel.toLowerCase());
        }
        user.trustedProviders.push(newTrustedProvider);
        await user.save();

        const sanitizedProviders = user.trustedProviders.map((provider) => {
          return utils.sanitizeObject(provider, WHITELIST_PROVIDER_ATTRIBUTES);
        });

        // Group by label, using the custom label where present
        const groupedProviders = _.groupBy(sanitizedProviders, (provider) => {
          let groupValue;
          if (provider.label === 'other' && provider.customLabel) {
            groupValue = provider.customLabel.toLowerCase();
          } else {
            groupValue = provider.label;
          }
          return groupValue;
        });
        // Angular can't iterate over _.groupby()'s object of objects, so send it an array instead.
        const groupedProvidersArray = Object.values(groupedProviders);
        const response = groupedProvidersArray;

        const notificationMessage = `${req.user.name} has added you as a service provider. You can now invoice them directly from the Horses and Payments tabs.`;
        await Notification.create({
          message: notificationMessage,
          _recipients: [newTrustedProvider._provider._id],
        });

        utils.respondWithResult(res)(response);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  deleteServiceProvider: async (req, res, next) => {
    try {
      const providerToDeleteId = req.params.id;
      const user = await User.findById(req.user._id)
        .populate({ path: 'trustedProviders._provider', select: WHITELIST_ATTRIBUTES });
      if (user) {
        // Only keep the service providers that don't match the deleted provider's id
        const remainingProviders = user.trustedProviders.filter((provider) => {
          return provider._id.toString() !== providerToDeleteId;
        });

        // Hang on to the provider who will get the notification
        const providerObjToDelete = user.trustedProviders.find((provider) => {
          return provider._id.toString() === providerToDeleteId;
        });
        // Save the user with their freshly-filtered array of providers
        user.trustedProviders = remainingProviders;
        await user.save();

        const sanitizedProviders = user.trustedProviders.map((provider) => {
          return utils.sanitizeObject(provider, WHITELIST_PROVIDER_ATTRIBUTES);
        });

        // Group by label, using the custom label where present
        const groupedProviders = _.groupBy(sanitizedProviders, (provider) => {
          let groupValue;
          if (provider.label === 'other' && provider.customLabel) {
            groupValue = provider.customLabel;
          } else {
            groupValue = provider.label;
          }
          return groupValue;
        });

        // Angular can't iterate over _.groupby()'s object of objects, so send it an array instead.
        const groupedProvidersArray = Object.values(groupedProviders);
        const response = groupedProvidersArray;

        const notificationMessage = `You can no longer invoice ${req.user.name} directly. You can still accept requests for their horses in the Schedule tab.`;
        await Notification.create({
          message: notificationMessage,
          _recipients: [providerObjToDelete._provider._id],
        });
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },
};

module.exports = UserController;
