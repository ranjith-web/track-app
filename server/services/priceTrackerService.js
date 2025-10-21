const cron = require('node-cron');
const Product = require('../models/Product');
const scraperService = require('./scraperService');

class PriceTrackerService {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
  }

  // Start automated price tracking
  startTracking() {
    console.log('🤖 Price Tracker Service: Starting automated tracking...');

    // Schedule 1: Check prices 3 times a day (8 AM, 2 PM, 8 PM IST)
    const job1 = cron.schedule('0 8,14,20 * * *', async () => {
      console.log('⏰ Running scheduled price check...');
      await this.updateAllPrices();
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata"
    });

    // Schedule 2: Clean up old data monthly (1st of every month at 2 AM)
    const job2 = cron.schedule('0 2 1 * *', async () => {
      console.log('🧹 Running monthly cleanup...');
      await this.cleanupOldData();
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata"
    });

    this.jobs = [job1, job2];
    console.log('✅ Price tracking scheduled: 3 times daily');
    console.log('📊 Schedule: 8:00 AM, 2:00 PM, 8:00 PM IST');
  }

  // Update all active products with rate limiting
  async updateAllPrices() {
    try {
      this.isRunning = true;
      const products = await Product.find({ isActive: true });
      
      console.log(`📦 Found ${products.length} products to update`);
      
      let successCount = 0;
      let failCount = 0;

      for (const product of products) {
        try {
          // Add delay between products to be respectful (30 seconds)
          await this.delay(30000);
          
          await this.updateProductPrice(product);
          successCount++;
          console.log(`✅ Updated: ${product.name} (${successCount}/${products.length})`);
          
        } catch (error) {
          failCount++;
          console.error(`❌ Failed: ${product.name} - ${error.message}`);
        }
      }

      console.log(`\n📊 Price Update Summary:`);
      console.log(`   ✅ Success: ${successCount}`);
      console.log(`   ❌ Failed: ${failCount}`);
      console.log(`   📈 Total: ${products.length}\n`);

    } catch (error) {
      console.error('Price tracking error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Update a single product's price
  async updateProductPrice(product) {
    const urls = Object.entries(product.urls).filter(([_, url]) => url);
    const updatedPrices = {};
    let priceChanged = false;

    for (const [source, url] of urls) {
      try {
        // Check robots.txt compliance (basic check)
        if (!this.isUrlAllowed(url)) {
          console.warn(`⚠️  Robots.txt blocks scraping for ${source}`);
          continue;
        }

        // Get current price from the source
        const productInfo = await scraperService.getProductInfo(url);
        
        if (productInfo.price && productInfo.price > 0) {
          const oldPrice = product.currentPrice[source];
          updatedPrices[source] = productInfo.price;

          // Only add to history if price changed
          if (!oldPrice || Math.abs(oldPrice - productInfo.price) > 1) {
            product.priceHistory.push({
              price: productInfo.price,
              source: source,
              availability: productInfo.availability,
              discount: productInfo.discount,
              timestamp: new Date()
            });
            priceChanged = true;
          }
        }

        // Respectful delay between sources (10 seconds)
        await this.delay(10000);

      } catch (error) {
        console.error(`Failed to update ${source} for ${product.name}:`, error.message);
      }
    }

    // Update product if prices changed
    if (Object.keys(updatedPrices).length > 0) {
      product.currentPrice = { ...product.currentPrice, ...updatedPrices };
      product.lastChecked = new Date();
      await product.save();
    }

    return priceChanged;
  }

  // Basic robots.txt check
  isUrlAllowed(url) {
    // In a real implementation, fetch and parse robots.txt
    // For now, we'll be respectful by limiting frequency
    return true;
  }

  // Clean up old price history (keep last 6 months)
  async cleanupOldData() {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const products = await Product.find();
      let cleanedCount = 0;

      for (const product of products) {
        const originalLength = product.priceHistory.length;
        
        // Keep only last 6 months of data
        product.priceHistory = product.priceHistory.filter(
          entry => entry.timestamp >= sixMonthsAgo
        );

        if (product.priceHistory.length < originalLength) {
          await product.save();
          cleanedCount++;
          console.log(`🧹 Cleaned ${originalLength - product.priceHistory.length} old entries from ${product.name}`);
        }
      }

      console.log(`✅ Cleanup complete: ${cleanedCount} products cleaned`);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  // Manual trigger for testing
  async triggerManualUpdate() {
    if (this.isRunning) {
      console.log('⚠️  Update already in progress...');
      return { message: 'Update already running' };
    }

    console.log('🔧 Manual update triggered');
    await this.updateAllPrices();
    return { message: 'Manual update completed' };
  }

  // Stop all cron jobs
  stopTracking() {
    this.jobs.forEach(job => job.stop());
    console.log('🛑 Price tracking stopped');
  }

  // Helper: Delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get tracking status
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.length,
      schedule: '3 times daily (8 AM, 2 PM, 8 PM IST)'
    };
  }
}

module.exports = new PriceTrackerService();

