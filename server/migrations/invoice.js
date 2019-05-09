const Promise = require('bluebird');
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
const Invoice = require('../app/invoice/invoice.model');
const Payment = require('../app/payment/payment.model');
const Request = require('../app/request/request.model');
const User = require('../app/user/user.model');

/**
 * Connect to MongoDB depending on environment
 */
const mongoDatabase = 'mongodb://localhost/HorseLinc';
mongoose.connect(mongoDatabase);

Payment.find({})
  .then(async (payments) => {
    await Promise.each(payments, (async (payment) => {
      const paymentClone = payment.toObject();
      // Create a paid invoice for each legacy payment
      const newInvoice = {
        fromDataMigration: true,
        amount: paymentClone.amount,
        tip: paymentClone.tip,
        paidInFullAt: paymentClone.createdAt,
        _requests: [],
        _serviceProvider: paymentClone._serviceProvider,
        _trainer: paymentClone._horseManager,
        _payingUsers: [{
          _user: paymentClone._horseManager,
          percentage: 100,
        }],
      };

      // Because the payment data model no longer has _requests, we need to find
      // the requests individually from the database, we can't use .populate() for this
      if (paymentClone._requests && paymentClone._requests.length) {
        await Promise.each(paymentClone._requests, (async (request) => {
          const requestDocument = await Request.findById(request);
          if (requestDocument) {
            newInvoice._requests.push(requestDocument);
          }
        }));
      }

      // Add reassignees
      newInvoice._reassignees = [];
      newInvoice._requests.forEach((request) => {
        if (request._reassignedTo) {
          newInvoice._reassignees.push(request._reassignedTo);
        }
      });

      // Mark payment received outside the app
      if (paymentClone.paidOutsideAppAt) {
        newInvoice.paidOutsideAppAt = paymentClone.paidOutsideAppAt;
      }

      // Add payment approvers
      if (paymentClone._approvers && paymentClone._approvers.length) {
        newInvoice.paymentApprovals = [];
        await Promise.each(paymentClone._approvers, (async (approver) => {
          // Find the approver user object and the horse manager user object
          const approverDocument = await User.findById(approver);
          const horseManager = await User.findById(paymentClone._horseManager);

          if (approverDocument) {
            const approvalObject = {
              _approver: approverDocument._id,
              _payer: paymentClone._horseManager,
            };

            // Find the approver in the horse manager's approver list
            const matchedApprovals = horseManager.paymentApprovals.filter((paymentApproval) => {
              return String(approverDocument._id) === String(paymentApproval._approver);
            });

            if (matchedApprovals.length) {
              approvalObject.isUnlimited = matchedApprovals[0].isUnlimited;
              approvalObject.maxAmount = matchedApprovals[0].maxAmount;
            } else {
              approvalObject.isUnlimited = false;
            }

            newInvoice.paymentApprovals.push(approvalObject);
          }
        }));
      }

      // Create the invoice
      // Then we need to mark each request as added to an invoice
      Invoice.create(newInvoice)
        .then((response) => {
          payment._invoice = response._id;
          payment.percentOfInvoice = 100;
          payment.save();

          newInvoice._requests.forEach(async (request) => {
            request.addedToInvoice = true;
            request.save()
              .catch((err) => {
                console.error(`Error saving request with _id: ${request._id}: `, err);
              });
          });
        })
        .catch((err) => {
          console.error(`Error creating a new invoice for payment with _id: ${paymentClone._id}: `, err);
          console.log(`For invoice: ${newInvoice}`);
        });
    }));
  });

