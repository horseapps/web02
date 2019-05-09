const mongoose = require('mongoose');
const OwnerSchema = require('../owner/owner.schema');
const PaymentApprovalSchema = require('../payment-approver/payment-approver.schema');
const User = require('../user/user.model');
// const Payment = require('../payment/payment.model');
const Promise = require('bluebird');
const moment = require('moment');

const InvoiceSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  tip: { type: Number, default: 0 },
  paidOutsideAppAt: { type: Date },
  paidInFullAt: { type: Date },
  _owners: [OwnerSchema],
  _payingUsers: [OwnerSchema],
  paymentApprovals: [PaymentApprovalSchema],
  _leasee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  _horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse' },
  _requests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true }],
  _serviceProvider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  _trainer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  _reassignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedAt: { type: Date },
  fromDataMigration: { type: Boolean },
}, { timestamps: true, usePushEach: true });

InvoiceSchema.methods = {

  /**
   * Return an array of all the users who have the ability to submit payment for an invoice
   */
  getPayingUsers() {
    const payingUsers = this._payingUsers.map(payer => payer._user);
    const paymentApprovals = this.paymentApprovals;
    const approvers = paymentApprovals.map(approval => approval._approver);

    return [...payingUsers, ...approvers];
  },

  /**
   * Retrieve the payingUser object relevant to this invoice and a provided user,
   * @param {User} user The user to be found within the invoice's _payingUsers
   */
  getPayingUser(user) {
    return this._payingUsers.find((u) => {
      return String(u._user._id) === String(user._id);
    });
  },

  // Retrieve the Horse Id string(s) associated with this invoice
  getHorseIds() {
    // Newer invoices are single-horse style and reference a horse directly
    if (this._horse) {
      return [String(this._horse._id)];
    }
    // Older invoices reference horses through the requests nested in the invoice
    return this._requests.map((requestData) => {
      return requestData._horse ? String(requestData._horse._id) : 'deleted horse';
    });
  },

  /**
   * Returns true only if at least one of the provided horse IDs is referenced within the invoice
   * @param {array} horseIds The horse Ids to be checked against the invoice and its requests
   */
  includesHorses(horses) {
    const horseIdsOnInvoice = this.getHorseIds();
    for (let index = 0; index < horses.length; index += 1) {
      const stringHorseId = String(horses[index]._id);
      if (horseIdsOnInvoice.includes(stringHorseId)) {
        return true;
      }
    }
    return false;
  },

  /**
   * Get the amount currently paid on an invoice
   * @param {[Payment]} payments The payments made against this invoice
   */
  amountPaid(payments) {
    let total = 0;
    payments.forEach((payment) => {
      total += (payment.amount + (payment.tip || 0));
    });

    return total;
  },

  /**
   * Get the remaining balance on the invoice
   */
  outstandingBalance() {
    const amountPaid = this.amountPaidOnInvoice();
    const invoiceTotal = this.amount;
    const tip = this.tip || 0;
    return (invoiceTotal + tip) - amountPaid;
  },

  /**
   * Check if this invoice has the given user as the main service provider
   * @param {User} user The user to be checked against the invoice
   */
  hasMainServiceProvider(user) {
    return String(user._id) === String(this._serviceProvider._id);
  },

  /**
   * Only main service providers can see the balance for an unpaid invoice with
   * payments against it
   * @param {User} user The user to be checked against this invoice
   */
  shouldShowBalance(user) {
    return User.isServiceProvider(user) &&
      this.isMainServiceProvider(user) &&
      !this.paidInFullAt &&
      this._payments.length;
  },

  /**
   * Because many paid requests in this app pre-date the concept of invoices,
   * we can't consider the invoice's createdAt date as valid if it's before 08/24/2018;
   * we'll look into the invoice's populated request data instead when we prep exports.
   * @param {Date} since The earliest date desired by the export-requesting user
   * @param {Date} until The latest date desired by the export-requesting user
   */
  isWithinDateRange(since, until) {
    const newVersionDate = new Date('2018-08-24T00:00:00.000Z');
    const createdDate = new Date(String(this.createdAt)).setHours(0, 0, 0, 0);
    let dateToCompare;
    if (createdDate > newVersionDate) {
      dateToCompare = createdDate;
    } else {
      // If this invoice was grandfathered in, we'll filter using the first request's date
      dateToCompare = new Date(String(this._requests[0].createdAt)).setHours(0, 0, 0, 0);
    }
    // Once we've decided the comparison date, we check it against provided filters
    if (since && !until) {
      return new Date(since) <= dateToCompare;
    } else if (!since && until) {
      return dateToCompare <= new Date(until);
    } else if (since && until) {
      return new Date(since) <= dateToCompare && dateToCompare <= new Date(until);
    }
    // If we somehow made it this far, the method was called without any date filters
    return true;
  },

  // Returns true if the user is in the invoice's list of reassignees
  isReassignedToUser(user) {
    return !!this._reassignees.find((reassignee) => {
      if (reassignee) {
        return String(reassignee._id) === String(user._id);
      }
      return false;
    });
  },

  /**
   * Utility function that increases a given number by the current Stripe fee
   * @param {number} amount The number to increase by STRIPE_PERCENTAGE
   */
  addServiceFee(amount) {
    const feePercentage = process.env.STRIPE_SERVICE_FEE_PERCENTAGE || 0.05;
    // Calculate the service fee of given amount
    const serviceFee = +(amount * feePercentage).toFixed(2);
    return amount + serviceFee;
  },

  /**
   * Outputs the invoice's key information in a CSV row-formatted string
   * based on the user requesting the invoice (incorporating fees if user is a Horse Manager)
   * @param {User} user The user requesting the invoice be exported as CSV
   */
  async toCsvRow(user) {
    const paymentType = this.getPaymentType();
    const invoiceDate = this.getInvoiceDate();
    const paymentDate = this.getPaymentDate();
    const invoiceTip = this.getInvoiceTip(user);
    const mainServiceProviderName = this.getMainServiceProviderName();
    const reassigneeNames = this.getReassigneeNames();
    const concatenatedDescription = this.getConcatenatedDescription(user);

    // collect promises; these three run find() asynchronously to calculate payment info
    const totalAmountPaidPromise = this.getTotalAmountPaid(user);
    const amountPaidByUserPromise = this.getAmountPaidByUser(user, User.isManager(user), user);
    const invoicePayersPromise = this.getInvoicePayers(user);
    const invoiceTotalPromise = this.getInvoiceTotal(user);
    const promises = [
      invoiceTotalPromise,
      totalAmountPaidPromise,
      amountPaidByUserPromise,
      invoicePayersPromise,
    ];

    return Promise.all(promises)
      .then(([invoiceTotal, totalAmountPaid, amountPaidByUser, invoicePayers]) => {
        let rowOutput = '';
        rowOutput += `${paymentType},`;
        rowOutput += `${invoiceDate},`;
        rowOutput += `${paymentDate},`;
        rowOutput += `${invoiceTotal},`;
        rowOutput += `${invoiceTip},`;
        rowOutput += `${totalAmountPaid},`;
        rowOutput += User.isManager(user) ? `${amountPaidByUser},` : '';
        rowOutput += `${invoicePayers},`;
        rowOutput += User.isManager(user) ? `${mainServiceProviderName},` : '';
        rowOutput += `${reassigneeNames},`;
        rowOutput += `${concatenatedDescription},`;
        // Clip off the last training comma and return 'rowOutput' once the string is all built
        rowOutput = rowOutput.slice(0, -1);
        return rowOutput;
      });
  },

  // Returns 'complete' if the invoice was paid via (or outside of) app, 'outstanding' otherwise
  getPaymentType() {
    if (this.paidInFullAt || this.paidOutsideAppAt) {
      return 'COMPLETE';
    }
    return 'OUTSTANDING';
  },

  // Returns a formatted string of the date the invoice was finalized
  getInvoiceDate() {
    const newVersionDate = new Date('2018-08-24T00:00:00.000Z');
    const createdDate = new Date(String(this.createdAt));
    if (createdDate > newVersionDate) {
      return String(moment.utc(this.createdAt).subtract(5, 'hours').format('L'));
    }
    return String(moment.utc(this._requests[0].createdAt).subtract(5, 'hours').format('L'));
  },

  // Returns the date paid in (or outside of) app, arbitrary filler date if outstanding
  getPaymentDate() {
    if (this.paidOutsideAppAt) {
      return String(moment.utc(this.paidOutsideAppAt).subtract(5, 'hours').format('L'));
    } else if (this.paidInFullAt) {
      return String(moment.utc(this.paidInFullAt).subtract(5, 'hours').format('L'));
    }
    return '12/31/9999';
  },

  // Returns the total amount for the invoice
  async getInvoiceTotal(user) {
    const reassigned = this.isReassignedToUser(user);
    if (!reassigned && this.amount) {
      if (User.isManager(user)) {
        return `${this.addServiceFee(this.amount).toFixed(2)}`;
      }
      return `${this.amount.toFixed(2)}`;
    } else if (reassigned && this._requests) {
      let reassigneeTotal = 0;
      this._requests.forEach((request) => {
        if (request._reassignedTo && String(request._reassignedTo._id) === String(user._id)) {
          reassigneeTotal += request.total;
        }
      });
      return `${reassigneeTotal.toFixed(2)}`;
    }
    return 0;
  },

  // Returns the tip amount for the invoice
  getInvoiceTip(user) {
    if (this.tip && !this.isReassignedToUser(user)) {
      // Show the tip amount if it exists and user is not a reassignee
      return `${this.tip.toFixed(2)}`;
    }
    return 0;
  },

  /**
   * Returns the total amount paid against the invoice so far
   * @param {User} user The user to check to see if fee should be added to output
   */
  async getTotalAmountPaid(user) {
    let totalPaid = 0;
    const payments = await mongoose.model('Payment').find({ _invoice: this._id })
      .populate({
        path: '_requests',
        populate: { path: '_reassignedTo' },
      });
    if (!this.isReassignedToUser(user)) {
      payments.forEach((payment) => {
        // Add app service fee for manager displays
        totalPaid += User.isManager(user) ? this.addServiceFee(payment.amount) : payment.amount;
        totalPaid += (payment.tip ? payment.tip : 0);
      });
      return totalPaid.toFixed(2);
    }
    // If reassigned, only count request amounts reassigned within payments
    payments.forEach((payment) => {
      payment._requests.forEach((request) => {
        if (request._reassignedTo && String(request._reassignedTo._id) === String(user._id)) {
          totalPaid += request.total;
        }
      });
    });
    return `${totalPaid.toFixed(2)}`;
  },

  /**
   * Calculate the % the paying user has paid based on ownership percentage
   * @param {User} payingUser The payingUser object associated with this invoice
   * @param {boolean} forManager Whether or not to add fees to output for a manager export
   * @param {User} requestingUser The user requesting this export
   */
  async getAmountPaidByUser(user, forManager, requestingUser) {
    let amountPaid = 0;
    const payingUser = this.getPayingUser(user);
    const isReassigned = this.isReassignedToUser(requestingUser);
    if (payingUser) {
      // Check this invoice's payments to see who paid how much
      await mongoose.model('Payment').find({ _invoice: this._id }).populate('_requests')
        .then((payments) => {
          if (payments.length) {
            // Some payments list a horse manager, newer ones list a paying user
            const myPayment = payments.find((payment) => {
              return String(payment._horseManager) === String(user._id)
                || String(payment._payingUser) === String(user._id);
            });
            if (myPayment && !isReassigned) {
              const amount = myPayment.amount;
              // Show tip if user is a manager or main service provider
              const tip = myPayment.tip || 0;
              // Add service fee to output if user is a manager
              amountPaid += forManager ? (this.addServiceFee(amount) + tip) : (amount + tip);
            } else if (myPayment && isReassigned) {
              // Only account for reassigned requests when reassignees are exporting
              myPayment._requests.forEach((req) => {
                if (String(req._reassignedTo) === String(requestingUser._id)) {
                  amountPaid += req.total;
                }
              });
            }
          }
        });
    }
    return amountPaid.toFixed(2);
  },

  /**
   * Returns the list of users paying this invoice and how much they've paid
   * @param {User} user The user who is requesting this export
   */
  async getInvoicePayers(user) {
    let outputString = '';
    const promises = [];
    if (this._payingUsers.length) {
      await this._payingUsers.forEach(async (payingUser) => {
        // Collect all the async calls to calculate each paying user's amount
        promises.push(this.getAmountPaidByUser(payingUser._user, User.isManager(user), user));
      });
      // Run the async calls and build the output string only after they resolve
      return Promise.all(promises)
        .then((amounts) => {
          for (let i = 0; i < amounts.length; i += 1) {
            const amountPaid = amounts[i];
            outputString += `${this._payingUsers[i]._user.name} (${amountPaid} paid); `;
          }
          // Cut off the trailing comma and space...
          outputString = outputString.slice(0, -2);
          return outputString;
        });
    }
    return 'N/A';
  },

  getPayerNames() {
    let outputString = '';
    this._payingUsers.forEach((payingUser) => {
      outputString += `${payingUser._user.name}; `;
    });
    return outputString.slice(0, -2);
  },

  // Returns the name of the main service provider associated with the invoice
  getMainServiceProviderName() {
    return this._serviceProvider.name || 'N/A';
  },

  // Returns the list of users who were reassigned tasks on this invoice, as a single string
  getReassigneeNames() {
    let namesOutput = '';
    if (this._reassignees.length) {
      this._reassignees.forEach((reassignee) => {
        namesOutput += `${reassignee.name}; `;
      });
      // Cut off the trailing comma and space...
      namesOutput = namesOutput.slice(0, -2);
      return namesOutput;
    }
    return 'N/A';
  },

  /**
   * Returns the horse(s), services, and info/notes from an invoice as a single string
   * @param {User} user The user being checked (to determine how rates should be displayed)
   */
  getConcatenatedDescription(user) {
    let description = '"';
    // Append the invoice's horses and services performed for each horse
    description += `${this.getHorsesAndServices(user)}... `;
    // Append any additional instructions attached to requests on the invoice
    if (this.getRequestInstructions()) {
      description += `Instructions: ${this.getRequestInstructions()}... `;
    }
    // Append service provider notes from requests on the invoice if they are a service provider
    if (User.isServiceProvider(user) && this.getRequestProviderNotes()) {
      description += `Notes: ${this.getRequestProviderNotes()}... `;
    }
    // Append payer names
    description += `Payer${this._payingUsers.length === 1 ? '' : 's'}: ${this.getPayerNames()}... `;

    description = description.slice(0, -4);
    description += '"';
    return description;
  },

  // Returns a string listing all the horses and services from the invoice's requests
  getHorsesAndServices(user) {
    let collatedOutput = '';

    if (this._requests.length) {
      this._requests.forEach((request) => {
        // Only add information for requests that were assigned to a reassignee, if applicable
        if (!this.isReassignedToUser(user) ||
          (request._reassignedTo && String(request._reassignedTo._id) === String(user._id))) {
          if (request._horse) {
            collatedOutput += `Service${request.services.length === 1 ? '' : 's'} for ${request._horse.showName} (${request._horse.barnName}) - `;
          } else {
            // If the request isn't populated with a horse, that means the horse was deleted
            collatedOutput += `Service${request.services.length === 1 ? '' : 's'} for [HORSE DELETED FROM APP] - `;
          }
          // Go through the requests on the invoice and list each request's service info
          request.services.forEach((service) => {
            let calculatedRate;
            if (User.isManager(user)) {
              // Horse managers should see fees aplied to exported totals
              calculatedRate = this.addServiceFee((service.quantity || 1) * service.rate);
            } else {
              calculatedRate = (service.quantity || 1) * service.rate;
            }
            collatedOutput += `${service.service} (x${service.quantity || 1}): ${calculatedRate.toFixed(2)}; `;
          });
        }
      });

      // Cut off the trailing comma and space
      collatedOutput = collatedOutput.slice(0, -2);
      return collatedOutput;
    }
    return 'N/A';
  },

  // Returns instructions left on an invoice's requests (viewed by managers and providers)
  getRequestInstructions() {
    let instructionsOutput = '';
    if (this._requests.length) {
      this._requests.forEach((request) => {
        if (request.instructions) {
          instructionsOutput += `${request.instructions}... `;
        }
      });
      // Cut off the trailing ellipsis and space if there is one...
      if (instructionsOutput.length > 1) {
        instructionsOutput = instructionsOutput.slice(0, -4);
      }

      return instructionsOutput;
    }
    return 'N/A';
  },

  // Returns provider notes left on an invoice's requests (viewed only by service providers)
  getRequestProviderNotes() {
    let providerNotesOutput = '';
    if (this._requests.length) {
      this._requests.forEach((request) => {
        if (request.providerNotes) {
          providerNotesOutput += `${request.providerNotes}... `;
        }
      });
      // Cut off the trailing ellipsis and space if there is one...
      if (providerNotesOutput.length > 1) {
        providerNotesOutput = providerNotesOutput.slice(0, -4);
      }
      return providerNotesOutput;
    }
    return 'N/A';
  },

  // Returns iterable information about each owner paying an invoice and their payment amount,
  // Or returns null if there is only one owner
  getMultiOwnerInfo() {
    if (this._payingUsers.length <= 1) { return null; }
    const info = [];
    this._payingUsers.forEach((payerObj) => {
      const portionOfTipOwed = (payerObj.percentage / 100) * (this.tip || 0);
      const portionOfInvoiceOwed = (payerObj.percentage / 100) * this.addServiceFee(this.amount);
      const totalPaidAmt = (portionOfTipOwed + portionOfInvoiceOwed).toFixed(2);
      const ownerInfo = {
        name: payerObj._user.name,
        percentage: payerObj.percentage,
        paidAmount: totalPaidAmt,
      };
      info.push(ownerInfo);
    });
    return info;
  },
};

InvoiceSchema.statics = {

  populateForAdmin() {
    return '_requests _horse _leasee _serviceProvider _reassignees _trainer _payingUsers';
  },

  /**
   * Get the invoice total by summing the total of all requests
   * @param  {array} requests The invoice request objects
   * @return {number}         The total amount of an invoice
   */
  getInvoiceTotal(requests) {
    const total = requests.reduce(
      (accumulator, currentValue) => {
        return accumulator + currentValue.total;
      },
      0,
    );

    return total;
  },

  /**
   * Convert a given group of invoice objects to CSV format relevant to the requesting user
   * @param  {array} invoices The invoice request objects
   * @param  {User} user      The user requesting the invoice export
   * @return {string}         The CSV output
   */
  async convertAllToCsv(invoices, user) {
    // Start with an empty 'fileOutput' string
    let fileOutput = '';
    // Append to 'fileOutput' the column headers with commas between them
    fileOutput += this.getCsvHeaders(user);

    const unsortedInvoicesWithRows = [];
    // Take each individual invoice & put it through an instance function to get a CSV row
    await Promise.map(invoices, async (invoice) => {
      const rowOutput = await invoice.toCsvRow(user);
      // Store invoice and its row as a tuple
      unsortedInvoicesWithRows.push([invoice, rowOutput]);
    });

    // Sort through invoice/row tuples by invoice creation date
    const sortedInvoicesAndRows = unsortedInvoicesWithRows.sort((tupleOne, tupleTwo) => {
      // Managers sort new-old based on when the (possibly pre-migration) requests were made
      if (User.isManager(user)) {
        return new Date(tupleTwo[0].getInvoiceDate()) - new Date(tupleOne[0].getInvoiceDate());
      }
      // Service providers sort new-old based on when the invoices were paid
      return new Date(tupleTwo[0].getPaymentDate()) - new Date(tupleOne[0].getPaymentDate());
    });

    sortedInvoicesAndRows.forEach((sortedInvoiceAndRow) => {
      // Append each sorted invoice's CSV line to 'fileOutput', plus '\r\n' to go to a new row
      fileOutput += `${sortedInvoiceAndRow[1]}\r\n`;
    });
    // Once all invoices are handled, return 'fileOutput'
    return fileOutput.trim();
  },

  // Returns a string representing the header row of an exported CSV
  getCsvHeaders(user) {
    if (User.isManager(user)) {
      // Horse manager headers
      return 'Payment Type, Invoice Date, Payment Date, Invoice Total, Tip Amount, Total Amount Paid, Amount Paid By Me, Paid By, Service Provider, Reassigned To, Description\r\n';
    }
    // Service provider headers
    return 'Payment Type, Invoice Date, Payment Date, Invoice Total, Tip Amount, Total Amount Paid, Paid By, Reassigned To, Description\r\n';
  },
};

module.exports = mongoose.model('Invoice', InvoiceSchema);
