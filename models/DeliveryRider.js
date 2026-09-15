const mongoose = require('mongoose');

const deliveryRiderSchema = new mongoose.Schema({
  rider_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: null },
  vehicle_number: { type: String, default: 'LEK-4592' },
  status: {
    type: String,
    enum: ['Available', 'On Delivery', 'Offline'],
    default: 'Available'
  },
  current_location: {
    lat: { type: Number, default: 31.4704 },
    lng: { type: Number, default: 74.4101 },
    updated_at: { type: Date, default: Date.now }
  },
  assigned_order_id: { type: String, default: null },
  total_deliveries: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

deliveryRiderSchema.index({ status: 1 });

module.exports = mongoose.model('DeliveryRider', deliveryRiderSchema);
