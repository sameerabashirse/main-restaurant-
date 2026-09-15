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
    enum: ['Home Delivery', 'Pickup', 'DELIVERY', 'PICKUP'],
    default: 'Home Delivery'
  },
  orderType: {
    type: String,
    enum: ['DELIVERY', 'PICKUP', 'Home Delivery', 'Pickup'],
    default: 'DELIVERY'
  },
  customer: {
    name: { type: String },
    phone: { type: String }
  },
  deliveryAddress: {
    houseNumber: { type: String, default: '' },
    streetNumber: { type: String, default: '' },
    area: { type: String, default: '' },
    city: { type: String, default: '' },
    landmark: { type: String, default: '' },
    instructions: { type: String, default: '' },
    formattedAddress: { type: String, default: '' }
  },
  deliveryLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    confirmedAt: { type: Date }
  },
  riderLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    updatedAt: { type: Date }
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
    enum: [
      'RECEIVED',
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'RIDER_ACCEPTED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
      // Legacy compatibility
      'Received',
      'Confirmed',
      'Preparing',
      'Ready',
      'Out For Delivery',
      'Out for Delivery',
      'Delivered',
      'Cancelled'
    ],
    default: 'RECEIVED'
  },
  total_amount: { type: Number, required: true },
  rider_id: { type: String, default: null },
  rider_name: { type: String, default: null },
  rider_phone: { type: String, default: null },
  estimated_delivery_time: { type: String, default: '30-40 mins' },
  is_reviewed: { type: Boolean, default: false },
  is_delivery_processed: { type: Boolean, default: false },
  is_updated: { type: Boolean, default: false },
  modification_history: [{
    modified_at: { type: Date, default: Date.now },
    previous_total: { type: Number },
    new_total: { type: Number },
    items_count: { type: Number }
  }],
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
