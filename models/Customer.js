const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' }, // Home, Office, Other
  address: { type: String, required: true },
  lat: { type: Number, default: 31.4704 },
  lng: { type: Number, default: 74.4101 }
});

const customerSchema = new mongoose.Schema({
  customer_id: { type: String, required: true, unique: true }, // e.g. CUST-1001
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, default: '' },
  addresses: [addressSchema],
  total_orders: { type: Number, default: 0 },
  completed_orders: { type: Number, default: 0 },
  cancelled_orders: { type: Number, default: 0 },
  total_spending: { type: Number, default: 0 },
  favorite_items: [{ type: String }],
  last_order_date: { type: Date },
  loyalty_points: { type: Number, default: 0 },
  customer_level: {
    type: String,
    enum: ['New Customer', 'Regular Customer', 'VIP Customer', 'Inactive Customer'],
    default: 'New Customer'
  },
  created_at: { type: Date, default: Date.now }
});

// Helper method to auto-update customer level based on total spending / completed orders
customerSchema.methods.updateCustomerLevel = function() {
  if (this.completed_orders >= 10 || this.total_spending >= 15000) {
    this.customer_level = 'VIP Customer';
  } else if (this.completed_orders >= 3 || this.total_spending >= 4000) {
    this.customer_level = 'Regular Customer';
  } else {
    this.customer_level = 'New Customer';
  }
};

module.exports = mongoose.model('Customer', customerSchema);
