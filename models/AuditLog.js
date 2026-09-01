const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  performed_by: { type: String, default: 'System' },
  role: { type: String, default: 'System' },
  module: { type: String, default: 'General' },
  ip_address: { type: String, default: '127.0.0.1' },
  details: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
