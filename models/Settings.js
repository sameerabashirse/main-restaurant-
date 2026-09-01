const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  restaurant_name: { type: String, default: 'FeastFlow Restaurant' },
  tagline: { type: String, default: 'Authentic Flavor & Smart AI Delivery' },
  logo_url: { type: String, default: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200' },
  contact_phone: { type: String, default: '042-35894120' },
  contact_email: { type: String, default: 'info@feastflow.com' },
  address: { type: String, default: 'Phase 5 Commercial, DHA, Lahore' },
  whatsapp_number: { type: String, default: '+923001234567' },
  whatsapp_verify_token: { type: String, default: 'feastflow_verify_token_2026' },
  currency: { type: String, default: 'Rs.' },
  tax_rate_percent: { type: Number, default: 16 },
  default_delivery_fee: { type: Number, default: 150 },
  reminder_auto_enabled: { type: Boolean, default: true },
  updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Settings', settingsSchema);
