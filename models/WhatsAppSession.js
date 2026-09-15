const mongoose = require('mongoose');

const whatsAppSessionSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, default: 'Customer' },
  customer_id: { type: String, default: null },
  current_state: { type: String, default: 'IDLE' },
  checkout_state: { type: String, default: null },
  checkout_draft: {
    orderType: { type: String, default: 'DELIVERY' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    houseNumber: { type: String, default: '' },
    streetNumber: { type: String, default: '' },
    area: { type: String, default: '' },
    city: { type: String, default: 'Lahore' },
    landmark: { type: String, default: '' },
    instructions: { type: String, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null }
  },
  is_human_handover: { type: Boolean, default: false }, // If true, AI pauses and human staff handles conversation
  assigned_staff_name: { type: String, default: null },
  active_cart: [{
    item_id: String,
    name: String,
    quantity: Number,
    size: String,
    extras: [String],
    unit_price: Number,
    total_price: Number
  }],
  last_interaction: { type: Date, default: Date.now },
  reminder_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WhatsAppSession', whatsAppSessionSchema);
