const mongoose = require('mongoose');

const punchSchema = new mongoose.Schema({
  employee:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  type:         { type: String,
                  enum: ['IN','LUNCH_START','LUNCH_END','OUT'],
                  required: true },
  timestamp:    { type: Date, default: Date.now }
});

module.exports = mongoose.model('Punch', punchSchema);
