const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  url: { type: String, required: true, unique: true },
  publishedAt: { type: Date },
  source: { type: String },
  category: { type: String },
  fetchedAt: { type: Date, default: Date.now }
});

newsSchema.index({ category: 1 });
newsSchema.index({ publishedAt: -1 });
newsSchema.index({ category: 1, publishedAt: -1 });
newsSchema.index({ source: 1 });

module.exports = mongoose.model('News', newsSchema);
