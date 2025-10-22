require('dotenv').config({ path: './server/.env' });
const mongoose = require('mongoose');
const Product = require('./server/models/Product');
const aiService = require('./server/services/aiService');

async function test() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trackapp');
    console.log('✅ Connected to MongoDB');

    // Get the product
    const product = await Product.findById('68f9258218be6ee0cd7c3ece');
    
    if (!product) {
      console.log('❌ Product not found');
      process.exit(1);
    }

    console.log('📦 Product:', product.name);
    console.log('💰 Current Price:', product.currentPrice);
    console.log('📊 Price History Length:', product.priceHistory ? product.priceHistory.length : 0);
    console.log('📝 Price History:', product.priceHistory);

    // Get current lowest price
    const currentPrice = Object.values(product.currentPrice || {})
      .filter(p => p && p > 0)
      .reduce((min, p) => Math.min(min, p), Infinity);

    console.log('💵 Current Lowest Price:', currentPrice);

    // Prepare product data
    const productData = {
      name: product.name,
      currentPrice: currentPrice,
      priceHistory: product.priceHistory,
      reviewSummary: {
        averageRating: 0,
        totalGenuineReviews: 0,
        sentiment: 'neutral',
        pros: [],
        cons: [],
        fakeReviewPercentage: 0
      }
    };

    console.log('\n🔄 Testing AI Service...');
    console.log('📊 Product Data:', JSON.stringify(productData, null, 2));

    // Test AI service
    const insights = await aiService.getPriceInsights(productData);
    
    console.log('\n✅ AI Insights:', JSON.stringify(insights, null, 2));

    await mongoose.disconnect();
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

test();

