const mongoose = require('mongoose');

const PaymentApproverSchema = new mongoose.Schema({
  _approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  _payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isUnlimited: { type: Boolean, required: true },
  maxAmount: { type: Number },
}, { timestamps: true });

// Only exporting the schema because it's used as a subdocument in both invoice and user models
module.exports = PaymentApproverSchema;
