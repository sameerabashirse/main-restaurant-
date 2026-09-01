const mongoose = require('mongoose');

const whatsAppMessageSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  direction: { type: String, enum: ['INBOUND', 'OUTBOUND'], required: true },
  message_type: {
    type: String,
    enum: ['text', 'interactive_button', 'interactive_list', 'product_card', 'location', 'template'],
    default: 'text'
  },
  body: { type: String, required: true },
  payload: { type: Object, default: {} },
  wa_message_id: { type: String, default: null },
  status: { type: String, default: 'sent' }, // sent, delivered, read
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WhatsAppMessage', whatsAppMessageSchema);
