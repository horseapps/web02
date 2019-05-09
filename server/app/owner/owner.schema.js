const mongoose = require('mongoose');

const OwnerSchema = new mongoose.Schema({
  _user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  percentage: { type: Number, required: true },
}, { timestamps: true });

// Only exporting the schema because owner is a subdocument used in invoice and horse models
module.exports = OwnerSchema;
