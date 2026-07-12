const mongoose = require('mongoose');

const appVersionSchema = new mongoose.Schema({
  platform: {
    type: String,
    required: true,
    enum: ['android', 'ios'],
    unique: true
  },
  latestVersion: { type: String, required: true },
  minimumVersion: { type: String, required: true },
  forceUpdate: { type: Boolean, default: false },
  showUpdate: { type: Boolean, default: true },
  title: { type: String },
  message: { type: String },
  playStoreUrl: { type: String },
  appStoreUrl: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('AppVersion', appVersionSchema);
