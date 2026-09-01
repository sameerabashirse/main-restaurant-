const mongoose = require('mongoose');

const reviewRewardSchema = new mongoose.Schema({
  order_id: { type: String, required: true, unique: true },
  customer_id: { type: String, required: true },
  points_awarded: { type: Number, default: 20 },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReviewReward', reviewRewardSchema);
