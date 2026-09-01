const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  order_id: { type: String, required: true, unique: true },
  customer_id: { type: String, required: true },
  customer_name: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  food_quality: {
    type: String,
    enum: ['Amazing', 'Delicious', 'Good', 'Average', 'Poor'],
    default: 'Delicious'
  },
  delivery_speed: {
    type: String,
    enum: ['Fast', 'Good', 'Slow'],
    default: 'Fast'
  },
  feedback: { type: String, default: '' },
  points_earned: { type: Number, default: 20 },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);
