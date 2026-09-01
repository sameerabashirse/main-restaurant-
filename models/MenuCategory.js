const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // Pizza, Burgers, Chicken, Pasta, Drinks, Desserts
  icon: { type: String, default: '🍕' },
  display_order: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true }
});

module.exports = mongoose.model('MenuCategory', categorySchema);
