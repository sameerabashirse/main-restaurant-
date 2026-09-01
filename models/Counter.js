const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. 'order_id', 'customer_id', 'branch_id', 'rider_id'
  seq: { type: Number, default: 0 }
});

counterSchema.statics.getNextSequence = async function(counterName, prefix = '', padLength = 4, startOffset = 0) {
  const counter = await this.findByIdAndUpdate(
    counterName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  
  const currentNum = counter.seq + startOffset;
  if (padLength > 0) {
    return `${prefix}${String(currentNum).padStart(padLength, '0')}`;
  }
  return `${prefix}${currentNum}`;
};

module.exports = mongoose.model('Counter', counterSchema);
