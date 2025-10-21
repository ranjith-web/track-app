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
    trend: { type: String }, // 'increasing', 'decreasing', 'stable', 'volatile'
    confidence: { type: Number },
    prediction: { type: String },
    recommendation: { type: String },
    stability: { type: String },
    analysis: { type: String },
    lastAnalyzed: { type: Date },
    priceSnapshot: { type: Number } // Price when analysis was done
  },
  buyingInsights: {
    dealScore: { type: Number },
    isGoodDeal: { type: Boolean },
    priceComparison: { type: String },
    seasonalTrend: { type: String },
    strategy: { type: String },
    insights: { type: String },
    lastAnalyzed: { type: Date },
    priceSnapshot: { type: Number }, // Price when insights were generated
    reviewSummary: {
      averageRating: { type: Number },
      totalGenuineReviews: { type: Number },
      sentiment: { type: String },
      pros: [{ type: String }],
      cons: [{ type: String }],
      fakeReviewPercentage: { type: Number }
    }
  },
  reviews: {
    lastScraped: { type: Date },
    totalReviews: { type: Number, default: 0 },
    genuineReviews: { type: Number, default: 0 },
    suspiciousReviews: { type: Number, default: 0 }
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