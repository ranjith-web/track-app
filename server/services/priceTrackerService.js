const cron = require('node-cron');
const Product = require('../models/Product');
const scraperService = require('./scraperService');

class PriceTrackerService {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
    // Configurable batch settings
    this.batchSize = parseInt(process.env.PRICE_CHECK_BATCH_SIZE) || 50; // Products per batch
    this.batchInterval = parseInt(process.env.PRICE_CHECK_INTERVAL_MINUTES) || 30; // Minutes between batches
    this.maxConcurrentBatches = parseInt(process.env.MAX_CONCURRENT_BATCHES) || 1; // Prevent overload
    this.activeBatches = 0;
  }

  // Start automated price tracking with smart batch processing
  startTracking() {
    console.log('🤖 Price Tracker Service: Starting smart batch-based tracking...');
    console.log(`📊 Configuration:`);
    console.log(`   - Batch size: ${this.batchSize} products per batch`);
    console.log(`   - Batch interval: ${this.batchInterval} minutes`);
    console.log(`   - Max concurrent batches: ${this.maxConcurrentBatches}`);

    // Schedule: Process batches continuously throughout the day
    // Runs every X minutes (configurable) to process a batch of products
    const batchJob = cron.schedule(`*/${this.batchInterval} * * * *`, async () => {
      // Only start new batch if we're not at max concurrent batches
      if (this.activeBatches < this.maxConcurrentBatches) {
        this.processBatch();
      } else {
        console.log(`⏸️  Skipping batch - ${this.activeBatches} batches already running`);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata"
    });

    // Schedule: Clean up old data monthly (1st of every month at 2 AM)
    const cleanupJob = cron.schedule('0 2 1 * *', async () => {
      console.log('🧹 Running monthly cleanup...');
      await this.cleanupOldData();
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata"
    });

    this.jobs = [batchJob, cleanupJob];
    console.log(`✅ Smart batch tracking scheduled: Every ${this.batchInterval} minutes`);

    // Process initial batch immediately
    setTimeout(() => this.processBatch(), 10000); // Wait 10 seconds after server start
  }

  // Process a batch of products with priority-based selection
  async processBatch() {
    if (this.isRunning && this.activeBatches >= this.maxConcurrentBatches) {
      console.log('⏸️  Batch processing skipped - already at max capacity');
      return;
    }

    this.activeBatches++;
    this.isRunning = true;

    try {
      const now = new Date();

      // Priority 1: New products (created in last 24 hours, not checked yet)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const newProducts = await Product.find({
        isActive: true,
        createdAt: { $gte: oneDayAgo },
        $or: [
          { lastChecked: { $exists: false } },
          { lastChecked: null }
        ]
      }).limit(this.batchSize).sort({ createdAt: -1 });

      // Priority 2: Products with recent price changes (checked more frequently)
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const recentChanges = await Product.find({
        isActive: true,
        lastChecked: { $lt: sixHoursAgo },
        priceHistory: { $exists: true, $ne: [] },
        'priceHistory.timestamp': { $gte: sixHoursAgo }
      }).limit(Math.max(1, Math.floor(this.batchSize * 0.3))).sort({ 'priceHistory.timestamp': -1 });

      // Priority 3: Products that haven't been checked recently (oldest first)
      const remainingSlots = this.batchSize - newProducts.length - recentChanges.length;
      const staleProducts = await Product.find({
        isActive: true,
        $or: [
          { lastChecked: { $exists: false } },
          { lastChecked: null },
          { lastChecked: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
        ],
        _id: { $nin: [...newProducts.map(p => p._id), ...recentChanges.map(p => p._id)] }
      }).limit(Math.max(0, remainingSlots)).sort({ lastChecked: 1 }); // Oldest first

      // Combine and deduplicate
      const productMap = new Map();
      [...newProducts, ...recentChanges, ...staleProducts].forEach(p => {
        productMap.set(p._id.toString(), p);
      });
      const products = Array.from(productMap.values()).slice(0, this.batchSize);

      if (products.length === 0) {
        console.log('📭 No products need checking at this time');
        return;
      }

      console.log(`\n📦 Processing batch: ${products.length} products`);
      console.log(`   - New products: ${newProducts.length}`);
      console.log(`   - Recent changes: ${recentChanges.length}`);
      console.log(`   - Stale products: ${staleProducts.length}`);

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

      console.log(`\n📊 Batch Summary:`);
      console.log(`   ✅ Success: ${successCount}`);
      console.log(`   ❌ Failed: ${failCount}`);
      console.log(`   📈 Total: ${products.length}\n`);

    } catch (error) {
      console.error('Batch processing error:', error);
    } finally {
      this.activeBatches = Math.max(0, this.activeBatches - 1);
      if (this.activeBatches === 0) {
        this.isRunning = false;
      }
    }
  }

  // Legacy method - kept for backward compatibility (manual triggers)
  async updateAllPrices() {
    console.log('⚠️  updateAllPrices() is deprecated. Use processBatch() for scalable processing.');
    return this.processBatch();
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

    // Update product if prices changed (use atomic update to avoid version conflicts)
    if (Object.keys(updatedPrices).length > 0) {
      const updateData = {
        $set: {
          lastChecked: new Date()
        }
      };

      // Update current prices atomically
      Object.entries(updatedPrices).forEach(([source, price]) => {
        updateData.$set[`currentPrice.${source}`] = price;
      });

      // Update price history if it was modified (new entries were pushed above)
      if (priceChanged && product.priceHistory) {
        // Use the modified priceHistory array (new entries were already pushed in the loop)
        updateData.$set.priceHistory = product.priceHistory;
      }

      await Product.findByIdAndUpdate(
        product._id,
        updateData,
        { runValidators: true }
      );
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

  // Manual trigger for testing (processes one batch)
  async triggerManualUpdate() {
    if (this.activeBatches >= this.maxConcurrentBatches) {
      console.log('⚠️  Max concurrent batches reached...');
      return { message: 'Max concurrent batches reached', activeBatches: this.activeBatches };
    }

    console.log('🔧 Manual batch update triggered');
    await this.processBatch();
    return { message: 'Manual batch update completed' };
  }

  // Process multiple batches manually (for testing/admin use)
  async triggerBulkUpdate(batchCount = 1) {
    const results = [];
    for (let i = 0; i < batchCount; i++) {
      if (this.activeBatches >= this.maxConcurrentBatches) {
        results.push({ batch: i + 1, status: 'skipped', reason: 'Max concurrent batches reached' });
        continue;
      }
      console.log(`🔧 Processing batch ${i + 1}/${batchCount}`);
      await this.processBatch();
      results.push({ batch: i + 1, status: 'completed' });
    }
    return { message: 'Bulk update completed', results };
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
      activeBatches: this.activeBatches,
      maxConcurrentBatches: this.maxConcurrentBatches,
      batchSize: this.batchSize,
      batchInterval: `${this.batchInterval} minutes`,
      schedule: `Batch processing every ${this.batchInterval} minutes`,
      estimatedProductsPerDay: Math.floor((24 * 60 / this.batchInterval) * this.batchSize)
    };
  }
}

module.exports = new PriceTrackerService();

