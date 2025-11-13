const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const scraperService = require('../services/scraperService');
const aiService = require('../services/aiService');
const { parseMarketplaceEnrichmentTargets, canonicalizeMarketplaceName } = require('../utils/marketplaceConfig');

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

    if (!productInfo.price) {
      return res.status(400).json({ error: 'Could not extract price information' });
    }

    const urls = {
      [productInfo.source]: url
    };

    const currentPrice = {
      [productInfo.source]: productInfo.price
    };

    const priceHistory = [{
      price: productInfo.price,
      source: productInfo.source,
      availability: productInfo.availability,
      discount: productInfo.discount
    }];

    const enrichmentTargets = parseMarketplaceEnrichmentTargets().filter(target => target !== productInfo.source);
    let enrichmentResults = [];

    if (productInfo?.name && enrichmentTargets.length > 0) {
      try {
        enrichmentResults = await scraperService.enrichProductAcrossMarketplaces({
          productName: productInfo.name,
          sourceMarketplace: productInfo.source,
          existingUrls: urls,
          targets: enrichmentTargets,
          minScore: 0.75
        });
      } catch (error) {
        console.error('⚠️  Cross-market enrichment failed:', error.message);
      }
    }

    enrichmentResults.forEach(result => {
      const { marketplace, url: marketUrl, scrapedData } = result;
      if (!scrapedData || !scrapedData.price) return;

      urls[marketplace] = marketUrl;
      currentPrice[marketplace] = scrapedData.price;
      priceHistory.push({
        price: scrapedData.price,
        source: marketplace,
        availability: scrapedData.availability || 'in_stock',
        discount: scrapedData.discount || 0
      });
    });

    // Create new product
    const product = new Product({
      name: productInfo.name,
      image: productInfo.image || enrichmentResults.find(r => r.scrapedData?.image)?.scrapedData?.image || null,
      urls,
      currentPrice,
      priceHistory
    });

    await product.save();

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

    const responsePayload = {
      message: 'Product added for tracking',
      product,
      note: 'AI analysis will be generated automatically in the background'
    };

    if (enrichmentResults.length > 0) {
      responsePayload.enrichments = enrichmentResults.map(result => ({
        marketplace: result.marketplace,
        url: result.url,
        matchScore: Number((result.score * 100).toFixed(1)),
        title: result.title,
        price: result.scrapedData?.price || result.price || null
      }));
    }

    res.json(responsePayload);
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
    const { months = 3, marketplace } = req.query;
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const canonicalMarketplace = canonicalizeMarketplaceName(marketplace);
    const monthsNumber = parseInt(months, 10);
    const monthsValue = typeof months === 'string' ? months.toLowerCase() : months;
    const applyCutoff = !Number.isNaN(monthsNumber) && monthsValue !== 'max';

    let priceHistory = [...product.priceHistory];

    if (canonicalMarketplace) {
      priceHistory = priceHistory.filter(entry =>
        canonicalizeMarketplaceName(entry.source) === canonicalMarketplace
      );
    }

    if (applyCutoff) {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - monthsNumber);
      priceHistory = priceHistory.filter(entry => entry.timestamp >= cutoffDate);
    }

    res.json({
      marketplace: canonicalMarketplace || null,
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