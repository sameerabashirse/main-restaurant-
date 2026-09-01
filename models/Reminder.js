const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  customer_id: { type: String, required: true },
  phone: { type: String, required: true },
  step: { type: Number, default: 1 }, // 1, 2, 3 (Max 3 reminders)
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Sent', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  scheduled_at: { type: Date, default: Date.now },
  sent_at: { type: Date }
});

module.exports = mongoose.model('Reminder', reminderSchema);
