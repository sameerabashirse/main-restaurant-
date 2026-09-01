const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  branch_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  opening_hours: { type: String, default: '11:00 AM - 12:00 AM' },
  lat: { type: Number, default: 31.4704 },
  lng: { type: Number, default: 74.4101 },
  is_active: { type: Boolean, default: true }
});

module.exports = mongoose.model('Branch', branchSchema);
