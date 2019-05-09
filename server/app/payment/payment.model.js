const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  _horseManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  _serviceProvider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  _payingUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  _paymentSubmittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transactions: [{
    _serviceProvider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    _paymentSubmittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    _payingUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    _request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
    stripeTransferAmount: Number,
    transferId: String,
    transactionId: String,
    transactionDate: Date,
    transactionType: String,
  }],
  paidOutsideApp: { type: Boolean, deafult: false },
  date: { type: Date },
  amount: { type: Number, required: true },
  tip: { type: Number, default: 0 },
  _invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  percentOfInvoice: { type: Number },
  _requests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Request' }],
  _approvers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true, usePushEach: true });

/**
 * Methods
 */
PaymentSchema.methods = {

  /**
   * REMOVE - Test function for testing
   */
  testFunction() {
    return 'This is the test function';
  },

};

PaymentSchema.statics = {

  populateForAdmin() {
    return '_invoice _requests _horseManager _horse _serviceProvider _requests _payingUser _paymentSubmittedBy';
  },

};

module.exports = mongoose.model('Payment', PaymentSchema);
