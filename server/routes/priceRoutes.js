const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const scraperService = require('../services/scraperService');
const aiService = require('../services/aiService');

// Track a new product
router.post('/track', async (req, res) => {
  try {
    const { url, platform } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check if product already exists
    const existingProduct = await Product.findOne({
      $or: [
        { 'urls.amazon': url },
        { 'urls.flipkart': url },
        { 'urls.myntra': url }
      ]
    });

    if (existingProduct) {
      return res.json({
        message: 'Product already being tracked',
        product: existingProduct
      });
    }

    // Scrape product information with timeout
    const scrapingPromise = scraperService.getProductInfo(url);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Scraping timeout')), 30000)
    );

    const productInfo = await Promise.race([scrapingPromise, timeoutPromise]);

    console.log('🔍 Product info from scraping:', JSON.stringify(productInfo, null, 2));

    // Allow products without price to be saved (price can be updated later)
    if (!productInfo.name) {
      return res.status(400).json({ error: 'Could not extract product name' });
    }

    if (!productInfo.price) {
      console.warn('⚠️ Product added without price. Price can be updated later via "Update Price" button.');
    }

    // Create new product
    const product = new Product({
      name: productInfo.name,
      image: productInfo.image,
      urls: {
        [productInfo.source]: url
      },
      currentPrice: productInfo.price ? {
        [productInfo.source]: productInfo.price
      } : {},
      priceHistory: productInfo.price ? [{
        price: productInfo.price,
        source: productInfo.source,
        availability: productInfo.availability || 'in_stock',
        discount: productInfo.discount || 0
      }] : []
    });

    await product.save();

    // Automatically find product on other marketplaces in background
    setImmediate(async () => {
      try {
        console.log(`🔍 Auto-searching for "${productInfo.name}" on other marketplaces...`);
        const marketplaceResults = await scraperService.findProductAcrossMarketplaces(
          productInfo.name,
          productInfo.source,
          product.urls
        );

        // Update product with found marketplace URLs and prices
        const updateData = { $set: {} };
        const priceHistoryEntries = [];

        if (marketplaceResults.amazon) {
          updateData.$set['urls.amazon'] = marketplaceResults.amazon.url;
          if (marketplaceResults.amazon.price) {
            updateData.$set['currentPrice.amazon'] = marketplaceResults.amazon.price;
            priceHistoryEntries.push({
              price: marketplaceResults.amazon.price,
              source: 'amazon',
              availability: 'in_stock',
              timestamp: new Date()
            });
          }
        }

        if (marketplaceResults.flipkart) {
          updateData.$set['urls.flipkart'] = marketplaceResults.flipkart.url;
          if (marketplaceResults.flipkart.price) {
            updateData.$set['currentPrice.flipkart'] = marketplaceResults.flipkart.price;
            priceHistoryEntries.push({
              price: marketplaceResults.flipkart.price,
              source: 'flipkart',
              availability: 'in_stock',
              timestamp: new Date()
            });
          }
        }

        if (marketplaceResults.reliancedigital) {
          updateData.$set['urls.reliancedigital'] = marketplaceResults.reliancedigital.url;
          if (marketplaceResults.reliancedigital.price) {
            updateData.$set['currentPrice.reliancedigital'] = marketplaceResults.reliancedigital.price;
            priceHistoryEntries.push({
              price: marketplaceResults.reliancedigital.price,
              source: 'reliancedigital',
              availability: 'in_stock',
              timestamp: new Date()
            });
          }
        }

        if (priceHistoryEntries.length > 0) {
          updateData.$push = { priceHistory: { $each: priceHistoryEntries } };
        }

        if (Object.keys(updateData.$set).length > 0) {
          await Product.updateOne({ _id: product._id }, updateData);
          console.log(`✅ Updated product with ${Object.keys(updateData.$set).length} marketplace(s)`);
        }
      } catch (error) {
        console.error(`⚠️  Error finding product on other marketplaces: ${error.message}`);
        // Don't throw - this is background process
      }
    });

    // Automatically trigger AI analysis in background (non-blocking)
    // This will provide initial insights even with just one price point
    setImmediate(async () => {
      try {
        console.log(`🤖 Auto-triggering AI analysis for new product: ${product._id}`);

        // Use atomic update to avoid version conflicts
        const analysis = await aiService.analyzePriceTrend(product.priceHistory);

        const currentPrice = Object.values(product.currentPrice || {})
          .filter(p => p && p > 0)
          .reduce((min, p) => Math.min(min, p), Infinity);

        await Product.findByIdAndUpdate(
          product._id,
          {
            $set: {
              'aiAnalysis.trend': analysis.trend,
              'aiAnalysis.confidence': analysis.confidence,
              'aiAnalysis.prediction': analysis.prediction,
              'aiAnalysis.recommendation': analysis.recommendation,
              'aiAnalysis.stability': analysis.stability,
              'aiAnalysis.analysis': analysis.analysis,
              'aiAnalysis.lastAnalyzed': new Date(),
              'aiAnalysis.priceSnapshot': currentPrice
            }
          },
          { runValidators: true }
        );

        console.log(`✅ Auto AI analysis completed for product: ${product.name}`);
      } catch (error) {
        console.error(`⚠️  Auto AI analysis failed for product ${product._id}:`, error.message);
        // Don't throw - this is background process, shouldn't affect product creation
      }
    });

    res.json({
      message: 'Product added for tracking',
      product,
      note: 'AI analysis will be generated automatically in the background'
    });
  } catch (error) {
    console.error('Track product error:', error);
    res.status(500).json({
      error: 'Failed to track product',
      details: error.message
    });
  }
});

// Get current price for a product
router.get('/current/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      product: {
        id: product._id,
        name: product.name,
        currentPrice: product.currentPrice,
        lastChecked: product.lastChecked,
        clickCount: product.clickCount
      }
    });
  } catch (error) {
    console.error('Get current price error:', error);
    res.status(500).json({ error: 'Failed to get current price' });
  }
});

// Update price for a product
router.post('/update/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get all active URLs
    const urls = Object.values(product.urls).filter(url => url);
    const updatedPrices = {};
    const updateInfo = {
      cached: [],
      scraped: [],
      failed: []
    };

    for (const url of urls) {
      try {
        const productInfo = await scraperService.getProductInfo(url);
        const source = scraperService.getSourceFromUrl(url);

        // Track if result was from cache
        if (productInfo.fromCache) {
          updateInfo.cached.push(source);
        } else {
          updateInfo.scraped.push(source);
        }

        if (productInfo.price) {
          updatedPrices[source] = productInfo.price;

          // Only add to price history if it's a new scrape (not cached)
          if (!productInfo.fromCache) {
            product.priceHistory.push({
              price: productInfo.price,
              source: source,
              availability: productInfo.availability,
              discount: productInfo.discount
            });
          }
        }
      } catch (error) {
        const source = scraperService.getSourceFromUrl(url);
        updateInfo.failed.push(source);
        console.error(`Failed to update price for ${url}:`, error);
      }
    }

    // Update current prices
    product.currentPrice = { ...product.currentPrice, ...updatedPrices };
    product.lastChecked = new Date();

    await product.save();

    res.json({
      message: updateInfo.cached.length > 0
        ? 'Prices returned from cache (recently updated)'
        : 'Prices updated successfully',
      updatedPrices,
      lastChecked: product.lastChecked,
      updateInfo: {
        cached: updateInfo.cached,
        scraped: updateInfo.scraped,
        failed: updateInfo.failed,
        queueWaitTime: updateInfo.scraped.length > 0 ? 'Processed' : 'Instant (cached)'
      }
    });
  } catch (error) {
    console.error('Update price error:', error);
    res.status(500).json({ error: 'Failed to update prices' });
  }
});

// Get price history
router.get('/history/:productId', async (req, res) => {
  try {
    const { months = 3 } = req.query;
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(months));

    const priceHistory = product.priceHistory.filter(
      entry => entry.timestamp >= cutoffDate
    );

    res.json({
      product: {
        id: product._id,
        name: product.name,
        priceHistory: priceHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      }
    });
  } catch (error) {
    console.error('Get price history error:', error);
    res.status(500).json({ error: 'Failed to get price history' });
  }
});

// Track click on product
router.post('/click/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.clickCount += 1;
    await product.save();

    res.json({
      message: 'Click tracked successfully',
      clickCount: product.clickCount
    });
  } catch (error) {
    console.error('Track click error:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// Get all tracked products
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const products = await Product.find({ isActive: true })
      .sort({ lastChecked: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('name image currentPrice lastChecked clickCount createdAt');

    const total = await Product.countDocuments({ isActive: true });

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// Test scraping endpoint
router.post('/test-scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Testing scraping for URL: ${url}`);
    const productInfo = await scraperService.getProductInfo(url);

    res.json({
      message: productInfo.fromCache ? 'Returned from cache' : 'Scraping test successful',
      productInfo,
      fromCache: productInfo.fromCache || false
    });
  } catch (error) {
    console.error('Test scraping error:', error);
    res.status(500).json({
      error: 'Scraping test failed',
      details: error.message
    });
  }
});

// Get queue status
router.get('/queue-status', (req, res) => {
  try {
    const queueStatus = scraperService.getQueueStatus();
    res.json({
      queues: queueStatus,
      totalQueued: queueStatus.reduce((sum, q) => sum + q.queueLength, 0)
    });
  } catch (error) {
    console.error('Get queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

// Clear cache endpoint (useful for testing)
router.post('/clear-cache', (req, res) => {
  try {
    const { url } = req.body;
    scraperService.clearCache(url);
    res.json({
      message: url ? `Cache cleared for ${url}` : 'All cache cleared'
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;