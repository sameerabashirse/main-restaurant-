const mongoose = require('mongoose');

const namePriceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, default: 0 }
});

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true }, // Pizza, Burgers, Chicken, Pasta, Drinks, Desserts, Sides
  description: { type: String, default: '' },
  price: { type: Number, required: true }, // Base price
  image: { type: String, default: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500' },
  sizes: [namePriceSchema],
  extras: [namePriceSchema],
  customization: {
    flavours: [{ type: String }],
    sizes: [namePriceSchema],
    crusts: [namePriceSchema],
    extras: [namePriceSchema],
    sides: [namePriceSchema],
    addons: [namePriceSchema]
  },
  is_available: { type: Boolean, default: true },
  is_active: { type: Boolean, default: true },
  sales_count: { type: Number, default: 0 }
});

menuItemSchema.index({ category: 1, is_active: 1 });

module.exports = mongoose.model('MenuItem', menuItemSchema);
