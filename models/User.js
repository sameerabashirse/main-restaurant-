const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String },
    role: {
    type: String,
    enum: ['admin', 'manager', 'kitchen', 'delivery', 'rider', 'customer'],
    default: 'customer'
  },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
