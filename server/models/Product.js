const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  price: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  timestamp: { type: Date, default: Date.now },
  source: { type: String, required: true }, // 'amazon', 'flipkart', 'myntra'
  availability: { type: String, default: 'in_stock' }, // 'in_stock', 'out_of_stock', 'limited'
  discount: { type: Number, default: 0 },
  originalPrice: { type: Number }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  image: { type: String },
  category: { type: String },
  brand: { type: String },
  urls: {
    amazon: { type: String },
    flipkart: { type: String },
    myntra: { type: String }
  },
  currentPrice: {
    amazon: { type: Number },
    flipkart: { type: Number },
    myntra: { type: Number }
  },
  priceHistory: [priceHistorySchema],
  aiAnalysis: {
    priceTrend: { type: String }, // 'increasing', 'decreasing', 'stable'
    confidence: { type: Number },
    prediction: { type: String },
    lastAnalyzed: { type: Date }
  },
  isActive: { type: Boolean, default: true },
  clickCount: { type: Number, default: 0 },
  lastChecked: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Index for efficient queries
productSchema.index({ 'urls.amazon': 1 });
productSchema.index({ 'urls.flipkart': 1 });
productSchema.index({ 'urls.myntra': 1 });
productSchema.index({ lastChecked: 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);