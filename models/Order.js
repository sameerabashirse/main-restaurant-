const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  item_id: { type: String, required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  size: { type: String, default: 'Medium' },
  extras: [{ type: String }],
  unit_price: { type: Number, required: true },
  total_price: { type: Number, required: true }
});

const orderSchema = new mongoose.Schema({
  order_id: { type: String, required: true, unique: true }, // e.g. FF-2026-0001
  customer_id: { type: String, required: true },
  customer_name: { type: String, required: true },
  customer_phone: { type: String, required: true },
  branch_id: { type: String, required: true },
  branch_name: { type: String, default: 'DHA Branch' },
  items: [orderItemSchema],
  delivery_type: {
    type: String,
    enum: ['Home Delivery', 'Pickup'],
    default: 'Home Delivery'
  },
  delivery_address: {
    label: { type: String, default: 'Home' },
    address: { type: String, required: true },
    lat: { type: Number, default: 31.4704 },
    lng: { type: Number, default: 74.4101 }
  },
  payment_method: {
    type: String,
    enum: ['Cash on Delivery', 'Online Payment', 'Bank Transfer'],
    default: 'Cash on Delivery'
  },
  payment_status: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
    default: 'Pending'
  },
  order_status: {
    type: String,
    enum: ['Received', 'Confirmed', 'Preparing', 'Ready', 'Out For Delivery', 'Delivered', 'Cancelled'],
    default: 'Received'
  },
  total_amount: { type: Number, required: true },
  rider_id: { type: String, default: null },
  rider_name: { type: String, default: null },
  rider_phone: { type: String, default: null },
  estimated_delivery_time: { type: String, default: '30-40 mins' },
  is_reviewed: { type: Boolean, default: false },
  is_delivery_processed: { type: Boolean, default: false },
  whatsapp_notification_sent: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

orderSchema.index({ customer_id: 1, created_at: -1 });
orderSchema.index({ customer_phone: 1, created_at: -1 });
orderSchema.index({ order_status: 1, created_at: 1 });
orderSchema.index({ rider_id: 1, order_status: 1 });

orderSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('Order', orderSchema);
