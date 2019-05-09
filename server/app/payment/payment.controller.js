const _ = require('lodash');
const moment = require('moment');
const stripe = require('stripe')(process.env.STRIPE_CLIENT_SECRET);
const Promise = require('bluebird');
const Payment = require('./payment.model');
const Invoice = require('../invoice/invoice.model');
const Request = require('../request/request.model');
const User = require('../user/user.model');
const Horse = require('../horse/horse.model');
const Notification = require('../notification/notification.model');
const utils = require('../../components/utils');
const Mailer = require('../../components/mailer');
const OneSignal = require('../../components/push');

const currency = 'usd';
const HORSE_MANAGER = 'horse manager';
const SERVICE_PROVIDER = 'service provider';
const SERVICE_FEE_PERCENT = process.env.STRIPE_SERVICE_FEE_PERCENTAGE;

const WHITELIST_ATTRIBUTES = [
  '_id',
  '_invoice',
  '_serviceProvider',
  '_paymentSubmittedBy',
  '_payingUser',
  'stripeTransferAmount',
  'transferId',
  'transactionId',
  'transactionDate',
  'amount',
  'tip',
  '_requests',
  '_approvers',
  'date',
  'paidOutsideApp',
  'transactions',
  'tip',
  'createdAt',
];

const WHITELIST_REQUEST_ATTRIBUTES = [
  'fromCustomInvoice',
  '_horse',
  '_horseManager',
  '_serviceProvider',
  'amount',
  'tip',
  '_requests',
  'paidOutsideAppAt',
  'uuid',
  'invoiceTotal',
  '_invoice',
  'percentOfInvoice',
  '_payingUser',
  '_requests',
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

/**
 * Wrapper to send email
 * @param  {Object} options      Can include any options for Mailer
 * @param  {Object} templateData The data to be used in the template
 */
function sendEmail(options, templateData = {}) {
  const mailer = new Mailer(options);
  return mailer.sendMail(templateData);
}

/**
 * Calculate a user's percentage of a total amount
 * @param  {number} percentOfInvoice Percentage of an invoice the user owes
 * @param  {number} amount           The total amount to take the percentage of
 * @return {number}                  The percentage of the total amount the user owes
 */
function ownerPercentage(percentOfInvoice, amount) {
  return (percentOfInvoice / 100) * amount;
}

/**
 * Send notifications for a completed invoice
 * @param  {object} invoice The invoice object
 */
function emailInvoiceReceipt(invoice) {
  const payingUserEmails = invoice._payingUsers.map(payer => payer._user.email);
  const paymentApprovals = invoice.paymentApprovals;
  const approverEmails = paymentApprovals.map(approval => approval._approver.email);

  const managerEmailRecipients = [
    ...payingUserEmails,
    ...approverEmails,
  ];

  const managerEmailOptions = {
    to: utils.buildEmailString(managerEmailRecipients),
    from: process.env.FROM_EMAIL,
    subject: 'HorseLinc - Invoice Paid In Full',
    html: ('../app/invoice/views/invoiceReceiptManager.html'),
  };

  // Update invoice total/tip to include the service fee
  const subtotalFee = +(invoice.amount * SERVICE_FEE_PERCENT);
  const subtotal = (invoice.amount + subtotalFee).toFixed(2);
  const tip = invoice.tip || 0;
  const multiOwnerInfo = invoice.getMultiOwnerInfo();

  const managerInvoiceData = {
    subtotal,
    tip: (tip.toFixed(2) || 0),
    invoiceTotal: (+subtotal + tip).toFixed(2),
    paidInFullAt: moment(invoice.paidInFullAt).format('ddd, MMM D'),
    horseName: invoice._horse.barnName,
    trainerName: invoice._trainer.name,
    serviceProviderName: invoice._serviceProvider.name,
    serviceProviderEmail: invoice._serviceProvider.email,
    serviceCount: Request.getServiceCount(invoice._requests),
    services: Request.getServices(invoice._requests),
    multipleOwnerInfo: multiOwnerInfo,
  };

  const managerEmailData = { managerInvoiceData };
  sendEmail(managerEmailOptions, managerEmailData);

  // Send email to the main service provider
  const serviceProviderEmails = [invoice._serviceProvider.email];

  const serviceProviderEmailOptions = {
    to: utils.buildEmailString(serviceProviderEmails),
    from: process.env.FROM_EMAIL,
    subject: 'HorseLinc - Invoice Paid In Full',
    html: ('../app/invoice/views/invoiceReceiptProvider.html'),
  };

  const serviceProviderInvoiceData = {
    subtotal: invoice.amount.toFixed(2),
    tip: (tip.toFixed(2) || 0),
    invoiceTotal: (invoice.amount + tip).toFixed(2),
    paidInFullAt: moment(invoice.paidInFullAt).format('ddd, MMM D'),
    horseName: invoice._horse.barnName,
    trainerName: invoice._trainer.name,
    serviceCount: Request.getServiceCount(invoice._requests),
    services: Request.getServices(invoice._requests),
  };

  const providerEmailData = { serviceProviderInvoiceData };
  sendEmail(serviceProviderEmailOptions, providerEmailData);

  // Send email to the reassignees
  if (invoice._reassignees.length) {
    invoice._reassignees.forEach((reassignee) => {
      // Remove any invoice requests they didn't do
      const requests = invoice._requests.filter(request => request._reassignedTo &&
        String(reassignee._id) === String(request._reassignedTo));

      const reassigneeEmailOptions = {
        to: reassignee.email,
        from: process.env.FROM_EMAIL,
        subject: 'HorseLinc - Invoice Paid In Full',
        html: ('../app/invoice/views/invoiceReceiptReassignee.html'),
      };

      const reassigneeInvoiceData = {
        invoiceTotal: Invoice.getInvoiceTotal(requests).toFixed(2),
        paidInFullAt: moment(invoice.paidInFullAt).format('ddd, MMM D'),
        horseName: invoice._horse.barnName,
        trainerName: invoice._trainer.name,
        serviceCount: Request.getServiceCount(requests),
        serviceProviderName: invoice._serviceProvider.name,
        serviceProviderEmail: invoice._serviceProvider.email,
        services: Request.getServices(requests),
      };

      const reasigneeEmailData = { reassigneeInvoiceData };
      sendEmail(reassigneeEmailOptions, reasigneeEmailData);
    });
  }
}

const PaymentController = {

  /**
   * Gets a list of payments
   */
  index: async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const skip = Number(req.query.skip) || 0;
      const sort = req.query.sort || '-date';
      const select = WHITELIST_ATTRIBUTES.join(' ');

      const query = {};

      if (req.query.horseManager) {
        query.$or = [
          { _horseManager: req.user._id },
          { _approvers: req.user._id },
          { _paymentSubmittedBy: req.user._id },
          { _payingUser: req.user._id },
        ];
      }

      if (req.query.serviceProvider) {
        /** First find all paid requests where req.user is the main service provider
         * or the reassignee for that request
         */
        const requests = await Request.find({
          $or: [{ _serviceProvider: req.user._id }, { _reassignedTo: req.user._id }],
          paidAt: { $ne: null },
        })
          .populate('_serviceProvider _reassignedTo _owner _horseManager');
        const requestIds = requests.map(request => request._id);

        // Then find all payments that these requests belong to
        query._requests = { $in: requestIds };
      }

      const paymentCount = await Payment
        .find(query)
        .count();
      const payments = await Payment
        .find(query)
        .select(select)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .populate('_horseManager _requests _serviceProvider')
        .populate({ path: '_requests',
          populate: { path: '_horse _show _owner _payingUser _horseManager' } })
        .lean();

      if (req.query.serviceProvider) {
        // For every payment, go through each request and remove request if req.user
        // is not the service provider or the reassignee
        await Promise.each(payments, async (payment) => {
          const clonedPayment = payment;
          clonedPayment._requests = payment._requests.filter((request) => {
            return String(req.user._id) === String(request._reassignedTo) ||
            String(req.user._id) === String(request._serviceProvider);
          });
        });
      }

      // Add array of unique horses that were a part of this payment
      payments.forEach((payment) => {
        const paymentClone = payment;
        paymentClone.horses = Request.getHorses(payment._requests);
      });

      utils.respondWithResult(res)({ payments, paymentCount });
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Gets a single payment
   */
  show: async (req, res, next) => {
    try {
      const payment = await Payment.findOne({ _id: req.params.id })
        .populate('_horseManager _requests _serviceProvider')
        .populate({ path: '_requests',
          populate: { path: '_horse _show _owner _horseManager _serviceProvider _reassignedTo' } })
        .lean();

      if (payment) {
        // Add displayTip property so the frontend knows if it should show the tip
        payment.displayTip = false;

        // Show the tip if user is a horse manager
        if (req.user.roles.includes(HORSE_MANAGER)) {
          payment.displayTip = true;
        }

        // If user is a service provider, go through each request and remove request
        // if req.user is not the service provider or the reassignee
        if (req.user.roles.includes(SERVICE_PROVIDER)) {
          payment._requests = payment._requests.filter((request) => {
            const reassignedId = request._reassignedTo ? String(request._reassignedTo._id) : '';
            return String(req.user._id) === reassignedId ||
              String(req.user._id) === String(request._serviceProvider._id);
          });

          // Display tip if user was the main service provider on a request
          payment._requests.forEach((request) => {
            if (String(req.user._id) === String(request._serviceProvider) &&
              (request._reassignedTo)) {
              payment.displayTip = true;
            }
          });
        }

        const response = utils.sanitizeObject(payment, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Create a new payment in our db and a new charge with Stripe
   */
  create: async (req, res, next) => {
    console.log('***************', 'CREATING PAYMENT', '**************');
    try {
      // Find the invoice this payment belongs to
      const invoice = await Invoice.findById(req.body._invoice)
        .populate('_requests _serviceProvider _reassignees _horse _trainer')
        .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES });

      // Make sure the invoice has not been deleted
      if (invoice.deletedAt) {
        return utils.respondWithError(res)('This invoice has been deleted.');
      }

      const invoiceTip = req.body.tip;
      const newPayment = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);

      // If a payment does not have a _payingUser property, the user is trying to make
      // a payment on the old app so we send back an error
      if (!newPayment._payingUser) {
        return utils.respondWithError(res)(Horse.backwardsCompatibilityError());
      }

      newPayment._paymentSubmittedBy = req.user._id;
      newPayment.date = new Date();

      // Set uuid to send with Stripe charge to make request idempotent
      let uuid;
      if (req.body.uuid) {
        uuid = req.body.uuid;
      }

      // Get the percentage of the tip this owner owes and update the payment object
      const percentageOfTip = ownerPercentage(newPayment.percentOfInvoice, newPayment.tip || 0);
      newPayment.tip = percentageOfTip;

      // Get the percentage of invoice total this owner owes and update the payment object
      newPayment.amount = ownerPercentage(newPayment.percentOfInvoice, newPayment.invoiceTotal);

      // Find the paying user
      const payingUser = await User.findOne({ _id: newPayment._payingUser });

      // Return error if user does not have a stripe customer account setup
      if (payingUser) {
        if (!payingUser.stripeCustomerId ||
          !payingUser.accountSetupComplete) {
          let message = '';
          if (String(payingUser._id) === String(req.user._id)) {
            message = 'You need to complete your payment information in your profile before you may proceed.';
          } else {
            message = `${payingUser.name} needs to complete their payment information in their profile before you may proceed.`;
          }

          return utils.respondWithError(res)(message);
        }
      } else {
        return utils.respondWithError(res)('Sorry, we couldn\'t find that user.');
      }

      // Make sure there are no other payments for this invoice with the same _payingUser
      const previousPaymentsForUser = await Payment.find({
        _invoice: newPayment._invoice,
        _payingUser: newPayment._payingUser,
      });

      if (previousPaymentsForUser.length) {
        return utils.respondWithError(res)(`A payment has already been made against this invoice for ${payingUser.name}`);
      }

      // Create the payment object and then find it/populate it
      const payment = await Payment.create(newPayment);
      const populatedPayment = await Payment.findById(payment._id)
        .populate('_payingUser')
        .populate({ path: '_serviceProvider _paymentSubmittedBy', select: WHITELIST_USER_ATTRIBUTES });

      // Track a running total of all the charges and fees to be paid
      let runningInvoiceTotal = 0;
      // Get ready to assemble all the transfer requests under the single charge
      const pendingTransfers = [];

      // Build object containing reassignee id and the amount they will get from this payment
      // We'll need to use this when sending notifications
      const reasigneeTransferAmounts = {};

      // For each request we need to create a pending transfer
      await Promise.each(invoice._requests, async (request) => {
        // Get request from database
        const requestObj = await Request.findById(request._id)
          .populate('_serviceProvider _horse _horseManager _reassignedTo _payingUser');

        // Owner percentage of the original total of all services for this request
        const originalTotal = ownerPercentage(newPayment.percentOfInvoice, requestObj.total);

        // Percentage of total that HorseLinc wants to pocket
        const serviceFeeAmount = +(originalTotal * SERVICE_FEE_PERCENT);

        // Total service charges plus % that HorseLinc wants to pocket
        const totalChargeAmt = originalTotal + serviceFeeAmount;

        // Accumulate this request's total charge into the running total for the invoice being paid
        runningInvoiceTotal += totalChargeAmt;

        // Set destination account based on if the request was reassigned or not
        let destinationAccount;

        // If this request was re-assigned we need to set that as the destination account
        if (requestObj._reassignedTo) {
          destinationAccount = requestObj._reassignedTo;
          const reassigneeId = requestObj._reassignedTo._id;

          // Update the transfer amount for this reassignee
          if (Object.prototype.hasOwnProperty.call(reasigneeTransferAmounts, reassigneeId)) {
            reasigneeTransferAmounts[requestObj._reassignedTo._id] += originalTotal;
          } else {
            reasigneeTransferAmounts[requestObj._reassignedTo._id] = originalTotal;
          }
        } else {
          destinationAccount = requestObj._serviceProvider;
        }

        // Create a transfer for this request and add it to the pending transfers under this invoice
        // Amount needs to be in cents, per the Stripe API docs. So $1.00 would be sent as 100
        const pendingTransfer = {
          amount: +(originalTotal.toFixed(2) * 100).toFixed(2), // Amount to transfer to destination account
          currency,
          destination: destinationAccount.stripeSellerId, // Stripe connected account to be paid
        };

        // Keep track of the request record so we can update document stores after transfer attempt
        pendingTransfers.push([pendingTransfer, requestObj]);
      });

      // Add any tip to the running total and pending transfers
      if (populatedPayment.tip && populatedPayment.tip > 0) {
        const payee = invoice._serviceProvider; // Main service provider on the invoice
        const tipAmount = populatedPayment.tip;
        runningInvoiceTotal += tipAmount;

        const pendingTransfer = {
          amount: +(populatedPayment.tip.toFixed(2) * 100).toFixed(2),
          currency,
          destination: payee.stripeSellerId, // Stripe connected account to be paid
        };

        // Unlike other transfers, a tip isn't mapped to a specific request
        pendingTransfers.push([pendingTransfer, null]);
      }

      // Keep track of failed payouts for error handing on the frontend
      let failedPayoutCount = 0;
      try {
        const chargeObj = {
          amount: +(runningInvoiceTotal * 100).toFixed(), // Single line charge to the customer
          currency,
          customer: populatedPayment._payingUser.stripeCustomerId, // Stripe customer to be charged
          receipt_email: populatedPayment._payingUser.email,
        };

        // Create the single-line-item stripe charge
        // Check for uuid to attach as idempotency_key key to request
        // Older app versions won't send a uuid
        let charge;
        if (uuid) {
          charge = await stripe.charges.create(chargeObj, {
            idempotency_key: `${uuid}`,
          });
        } else {
          // Create the single-line-item stripe charge
          charge = await stripe.charges.create(chargeObj);
        }

        // Notify of payment and create payouts only if the charge worked
        if (charge && !charge.failure_message) {
          // Each transfer will point back to the charge that's funding it
          const transactionTokenFromCharge = charge.id;

          // Assemble each payout under this charge and send them to Stripe for processing
          await Promise.each(pendingTransfers, async (transferWithRequest) => {
            // transferWithRequest is an array structured as: [pendingTransfer, requestObj]
            const pendingTransfer = transferWithRequest[0];

            pendingTransfer.source_transaction = transactionTokenFromCharge;
            const request = transferWithRequest[1];

            let transfer;
            try {
              // Prep the payout and get the associated request object to be updated
              transfer = await stripe.transfers.create(pendingTransfer);
            } catch (error) {
              failedPayoutCount += 1;

              // Report whether a request or a tip payout failed
              let mailOptions;
              const transferInformation = {
                invoiceDate: moment(invoice.createdAt).format('ddd, MMM D'),
                mainServiceProviderName: invoice._serviceProvider.name,
                mainServiceProviderEmail: invoice._serviceProvider.email,
                horseTrainerName: invoice._trainer.name,
                invoiceId: invoice._id,
              };

              // If a payout fails, email the admin, all users with abilities
              // and the service providers
              const payingUsers = invoice._payingUsers.map(payer => payer._user);
              const approvers = invoice.paymentApprovals.map(approval => approval._approver);
              if (request) {
                transferInformation.requestId = request._id;

                // If request was reassigned, email both the main service provider and
                // the reassignee
                if (request._reassignedTo) {
                  transferInformation.serviceProviderName = `${request._reassignedTo.name}'s`;
                  transferInformation.total = invoice.amount.toFixed(2);
                  transferInformation.serviceCount = Request.getServiceCount(invoice._requests);
                  transferInformation.isReassignee = false;

                  // Send email to main service provider and horseLinc admin email
                  const mainProviderMailOptions = {
                    to: process.env.ADMIN_EMAIL,
                    bcc: request._reassignedTo.email,
                    from: process.env.FROM_EMAIL,
                    subject: 'Stripe Payout Failure',
                    html: ('../app/payment/views/stripePayoutFailureEmail.html'),
                  };

                  const mainProviderData = { transferInformation };
                  sendEmail(mainProviderMailOptions, mainProviderData);

                  // Send email to reassignee
                  const reassigneeMailOptions = {
                    to: process.env.ADMIN_EMAIL,
                    bcc: request._reassignedTo.email,
                    from: process.env.FROM_EMAIL,
                    subject: 'Stripe Payout Failure',
                    html: ('../app/payment/views/stripePayoutFailureEmail.html'),
                  };

                  // Remove any invoice requests they didn't do
                  const requests = invoice._requests.filter(invoiceRequest =>
                    invoiceRequest._reassignedTo &&
                    String(request._reassignedTo._id) === String(invoiceRequest._reassignedTo));

                  transferInformation.serviceProviderName = 'your';
                  transferInformation.total = Invoice.getInvoiceTotal(requests).toFixed(2);
                  transferInformation.serviceCount = Request.getServiceCount(requests);
                  transferInformation.isReassignee = true;

                  const reassigneeData = { transferInformation };
                  sendEmail(reassigneeMailOptions, reassigneeData);
                } else {
                  // Just send the email to the main service provider
                  transferInformation.isReassignee = false;
                  transferInformation.serviceProviderName = 'your';
                  transferInformation.total = invoice.amount.toFixed(2);
                  transferInformation.serviceCount = Request.getServiceCount(invoice._requests);

                  mailOptions = {
                    to: process.env.ADMIN_EMAIL,
                    bcc: request._serviceProvider.email,
                    from: process.env.FROM_EMAIL,
                    subject: 'Stripe Payout Failure',
                    html: ('../app/payment/views/stripePayoutFailureEmail.html'),
                  };

                  sendEmail(mailOptions, { transferInformation });
                }
              } else {
                // This payout failure was for the tip
                transferInformation.isReassignee = false;
                transferInformation.serviceProviderName = 'your';
                transferInformation.total = invoice.amount.toFixed(2);
                transferInformation.serviceCount = Request.getServiceCount(invoice._requests);

                mailOptions = {
                  to: process.env.ADMIN_EMAIL,
                  bcc: invoice._serviceProvider.email,
                  from: process.env.FROM_EMAIL,
                  subject: 'Stripe Payout Failure',
                  html: ('../app/payment/views/stripePayoutFailureEmail.html'),
                };

                sendEmail(mailOptions, { transferInformation });
              }

              // Send push to all paying users and main service provider
              const providerPushRecipients = [invoice._serviceProvider];
              const horseManagerPushRecipients = [...payingUsers, ...approvers];
              const invoiceTotal = invoice.amount + (invoice.tip || 0);
              const serviceFee = +(invoice.amount * SERVICE_FEE_PERCENT).toFixed(2);

              const providerPushMessage = 'We\'ve encountered an error transfering the funds for your paid invoice of ' +
                `$${invoiceTotal.toFixed(2)}. We are actively working to correct this error.`;

              const managerPushMessage = 'We\'ve encountered an error transfering the funds for your paid invoice of ' +
                `$${(invoiceTotal + serviceFee + (invoice.tip || 0)).toFixed(2)}. We are actively working to correct this error.`;

              sendPushNotification(providerPushRecipients, providerPushMessage);
              sendPushNotification(horseManagerPushRecipients, managerPushMessage);
            } finally {
              // Whether the payout worked or not, we track its request on the payment receipt
              if (!populatedPayment.transactions) { populatedPayment.transactions = []; }

              let transferToken = '';
              if (transfer) { transferToken = transfer.id; }
              // Add a 'request' transaction to the payment if a request is present
              if (request) {
                // Determine the service provider associated with the payout
                let destinationAccount;
                if (request._reassignedTo) {
                  destinationAccount = request._reassignedTo;
                } else {
                  destinationAccount = request._serviceProvider;
                }

                populatedPayment.transactions.push({
                  transactionType: 'request',
                  _request: request,
                  _serviceProvider: destinationAccount._id,
                  _submittedBy: newPayment._paymentSubmittedBy,
                  _payingUser: newPayment._payingUser,
                  transferId: transferToken,
                  transactionId: charge.id,
                  transactionDate: new Date(),
                });

                // A payout without an accompanying request is a 'tip' transaction
              } else {
                populatedPayment.transactions.push({
                  transactionType: 'tip',
                  _serviceProvider: newPayment._serviceProvider,
                  _submittedBy: newPayment._paymentSubmittedBy,
                  _payingUser: newPayment._payingUser,
                  transferId: transferToken,
                  transactionId: charge.id,
                  transactionDate: new Date(),
                });
              }

              // Update the payment record each time a transaction succeeds
              await populatedPayment.save();
            }
          });

          // If this user is paying on behalf of another owner send push to the owner
          if (String(payingUser._id) !== String(req.user._id)) {
            const notificationMessage = `${req.user.name} has made a payment of $${Number(runningInvoiceTotal).toFixed(2)} on your behalf.`;
            await Notification.create({
              message: notificationMessage,
              _recipients: [payingUser._id],
            });
          }

          // Send push to main service provider with invoice total + tip
          const serviceProviderTotal = +(populatedPayment.amount + (populatedPayment.tip || 0));
          const mainServiceProviderMessage = `${payingUser.name} has made a payment of $${serviceProviderTotal.toFixed(2)}.`;
          sendPushNotification([invoice._serviceProvider], mainServiceProviderMessage);

          // Send a push notification to each reassignee with the portion of
          // the invoice they will receive
          if (invoice._reassignees.length) {
            invoice._reassignees.forEach((reassignee) => {
              const reassignedProviderMessage = `${payingUser.name} has made a payment of $${reasigneeTransferAmounts[reassignee._id].toFixed(2)}.`;
              sendPushNotification([reassignee], reassignedProviderMessage);
            });
          }

          // Get all previous payments on this invoice
          const previousPayments = await Payment.find({ _invoice: newPayment._invoice });

          // The single charge and all associated payouts were processed
          // Save the tip on the invoice if this is the first payment
          if (previousPayments.length === 1) {
            invoice.tip = invoiceTip;
          }

          // If this is the last payment, mark the invoice as paid completely
          if (previousPayments.length === invoice._payingUsers.length) {
            invoice.paidInFullAt = new Date();
          }

          // Mark invoice as paid in full
          await invoice.save();

          // When invoice is fully paid, alert all payers and service providers
          // We also need to mark the request as paid
          if (invoice.paidInFullAt) {
            emailInvoiceReceipt(invoice);
          }
        }
      } catch (error) {
        console.log(error);
        // If the charge fails, report it...
        const attemptedPayment = populatedPayment;
        attemptedPayment.amount = +runningInvoiceTotal.toFixed(2);
        const mailOptions = {
          to: process.env.ADMIN_EMAIL,
          from: process.env.FROM_EMAIL,
          subject: 'Stripe Charge Failure',
          html: ('../app/payment/views/stripeChargeFailureEmail.html'),
        };
        const data = { attemptedPayment };
        await sendEmail(mailOptions, data);

        // ...and delete the payment completely
        // Make sure the invoice is not marked as paid
        populatedPayment.remove();
        invoice.paidInFullAt = null;
        invoice.save();

        // Report that the charge was unsuccessful
        const message = error.message || 'Your payment did not go through. Please contact HorseLinc.';
        return utils.respondWithError(res)(message);
      }

      // Sanitize the paying user object now, we needed the unsanitized object when checking
      // for a Stripe customer id
      const sanitizedPayingUser = utils.sanitizeObject(
        populatedPayment._payingUser, WHITELIST_USER_ATTRIBUTES,
      );
      populatedPayment._payingUser = sanitizedPayingUser;
      const response = utils.sanitizeObject(populatedPayment, WHITELIST_ATTRIBUTES);

      // If any of the payouts failed to complete with Stripe, let the user know
      if (failedPayoutCount > 0) {
        return res.status(200).json({
          message: 'Your payment has been submitted, but it may not have reached its final payee(s). Please contact HorseLinc.',
          payment: response,
        });
      }

      let message;
      if (invoice.paidInFullAt) {
        message = 'Invoice paid in full';

        // Mark each request as paid if invoice is paid in full
        invoice._requests.forEach(async (request) => {
          request.paidAt = new Date();
          await request.save();
        });
      } else {
        message = 'Payment successful';
      }

      return res.status(200).json({
        message,
        payment: response,
      });
    } catch (err) {
      console.log(err);
      utils.handleError(next)(err);
    }
  },

  /**
   * Mark requests as paid and create new payment object in database
   */
  markAsPaid: async (req, res, next) => {
    try {
      // Find the invoice
      const invoice = await Invoice.findOne({ _id: req.body.invoice })
        .populate('_requests _serviceProvider _reassignees _horse _trainer')
        .populate({ path: 'paymentApprovals._approver', select: WHITELIST_USER_ATTRIBUTES })
        .populate({ path: '_payingUsers._user', select: WHITELIST_USER_ATTRIBUTES });

      // Make sure the invoice has not already been marked as paid
      if (invoice && invoice.paidInFullAt) {
        return utils.respondWithError(res)('This invoice has already been paid.');
      }

      if (invoice) {
        if (String(req.user._id) !== String(invoice._serviceProvider._id)) {
          return utils.respondWithError(res)('You are not authorized to mark invoice as paid.');
        }

        // First, see if there are any partial payments on the invoice
        const invoicePayments = await Payment.find({ _invoice: invoice._id });

        // Get any payers who have completed payment
        const completedInvoicePayers = invoicePayments.map(payment => String(payment._payingUser));

        // Then check the payers on the invoice against completedInvoicePayers.
        // Any payers who have not yet completed payment will get a payment created for them
        const outstandingInvoicePayers = [];
        invoice._payingUsers.forEach((payingUser) => {
          if (!completedInvoicePayers.includes(String(payingUser._user))) {
            outstandingInvoicePayers.push(payingUser);
          }
        });

        // Create a partial payment for each paying user on this invoice who hasn't yet paid
        outstandingInvoicePayers.forEach(async (payingUser) => {
          const percentageOfTipOwed = ownerPercentage(payingUser.percentage, invoice.tip || 0);
          const percentageOfInvoiceOwed = ownerPercentage(payingUser.percentage, invoice.amount);

          await Payment.create({
            paidOutsideApp: new Date(),
            date: new Date(),
            amount: percentageOfInvoiceOwed,
            tip: percentageOfTipOwed,
            _serviceProvider: req.user._id,
            _invoice: invoice,
            _payingUser: payingUser._user._id,
          });
        });

        // Mark invoice as paid in full and paid outside the app
        invoice.paidOutsideAppAt = new Date();
        invoice.paidInFullAt = new Date();
        invoice.save();

        // Mark all requests on the invoice as paid
        invoice._requests.forEach(async (request) => {
          request.paidAt = new Date();
          await request.save();
        });

        // Email all users with payment abilities and all service providers
        emailInvoiceReceipt(invoice);

        // Send push to all users who can pay an invoice
        const payingUsers = invoice._payingUsers.map(payer => payer._user);
        const paymentApprovals = invoice.paymentApprovals;
        const approvers = paymentApprovals.map(approval => approval._approver);

        const horseManagerPushRecipients = [
          ...payingUsers,
          ...approvers,
        ];

        const invoiceAmountPlusFee = utils.calculateInvoiceTotalWithFee(invoice);
        const horseManagerMessage = `${req.user.name} has marked your invoice totaling $${invoiceAmountPlusFee} as paid!`;
        sendPushNotification(horseManagerPushRecipients, horseManagerMessage);

        // Send a push notificatino to each reassignee with the portion they should have received
        if (invoice._reassignees && invoice._reassignees.length) {
          invoice._reassignees.forEach((reassignee) => {
            let reassigneeTotal = 0;
            invoice._requests.forEach((request) => {
              if (request._reassignedTo && String(req.user._id === String(request._reassignedTo))) {
                reassigneeTotal += request.total;
              }
            });

            const reassigneeMessage = `${req.user.name} has marked your invoice totaling $${reassigneeTotal} as paid!`;
            sendPushNotification([reassignee], reassigneeMessage);
          });
        }

        const response = utils.sanitizeObject(invoice, WHITELIST_ATTRIBUTES);
        return utils.respondWithResult(res)(response);
      }

      // If no invoice is found, the user has an old version of the app and
      // should not be able to mark as paid
      return utils.respondWithError(res)(Horse.backwardsCompatibilityError());
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },

  /**
   * As a payment approver, notify the horse(s) owner
   * that a pending invoice is higher than the approver's maximum amount
   */
  reportUnapproved: async (req, res, next) => {
    try {
      const invoiceInfo = req.body.requests[0];
      const total = invoiceInfo.total;
      const totalPlusFees = +(total + (total * SERVICE_FEE_PERCENT)).toFixed(2);
      const tipAmount = invoiceInfo.tipAmount;
      const grandTotal = +(Number(totalPlusFees) + Number(tipAmount)).toFixed(2);
      const toEmail = invoiceInfo._payingUser.email;
      const approver = invoiceInfo._currentUser;
      const approvedMax = invoiceInfo.approvedMax;

      const mailOptions = {
        to: toEmail,
        from: process.env.FROM_EMAIL,
        subject: 'Pending Invoice Over Trainer\'s Approved Limit',
        html: ('../app/payment/views/overPaymentApproverLimitEmail.html'),
      };

      const invoice = {
        total: totalPlusFees,
        tip: tipAmount,
        totalWithTip: grandTotal,
        approverName: approver.name,
        approverEmail: approver.email,
        approvalMaxAmount: approvedMax,
      };

      const data = { invoice };

      await sendEmail(mailOptions, data);
      utils.respondWithSuccess(res)('Email successfully sent.');
    } catch (err) {
      utils.handleError(next)(err);
    }
  },


  /**
   * Update an existing payment
   */
  update: async (req, res, next) => {
    try {
      const updatedItem = utils.sanitizeObject(req.body, WHITELIST_REQUEST_ATTRIBUTES);

      const payment = await Payment.findOne({ _id: req.params.id });

      if (payment) {
        _.assign(payment, updatedItem);
        await payment.save();

        const response = utils.sanitizeObject(payment, WHITELIST_ATTRIBUTES);
        utils.respondWithResult(res)(response);
      } else {
        utils.handleEntityNotFound(res);
      }
    } catch (err) {
      utils.handleError(next)(err);
    }
  },

  /**
   * Send push reminder to pay for services
   */
  requestPayment: async (req, res, next) => {
    try {
      const requestIds = req.query.requests || [];

      // Get all requests sent in query params and make sure they are still unpaid
      const requests = await Request.find({
        _id: { $in: requestIds },
        paidAt: { $eq: null },
      })
        .populate('_trainer');

      if (requests.length) {
        // Get all trainer device ids
        let deviceIds = [];
        requests.forEach((request) => {
          if (request._trainer.deviceIds && request._trainer.deviceIds.length) {
            deviceIds = deviceIds.concat(request._trainer.deviceIds);
          }
        });

        // Make sure array is unique
        deviceIds = _.uniq(deviceIds);

        // Send push notification
        if (deviceIds.length) {
          const oneSignal = new OneSignal();
          const message = 'You have completed requests that are awaiting payment. ' +
          'Please go to the HorseLinc app to submit payment.';

          oneSignal.createNotification({
            include_player_ids: deviceIds,
            headings: { en: 'HorseLinc' },
            contents: { en: message },
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
          });
        }

        return utils.respondWithSuccess(res)('Success');
      }

      return utils.respondWithError(res)('All these requests have been paid! Refresh to see changes.');
    } catch (err) {
      return utils.handleError(next)(err);
    }
  },
};

module.exports = PaymentController;
