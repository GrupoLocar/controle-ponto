const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const employeeSchema = new mongoose.Schema({
  code:    { type: String, unique: true, required: true },
  name:    { type: String, required: true },
  password:{ type: String, required: true },
  active:  { type: Boolean, default: true }
});

// antes de salvar, hash da senha
employeeSchema.pre('save', async function() {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

// método pra comparar senha
employeeSchema.methods.comparePassword = function(raw) {
  return bcrypt.compare(raw, this.password);
};

module.exports = mongoose.model('Employee', employeeSchema);
