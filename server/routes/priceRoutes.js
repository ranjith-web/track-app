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
    
    if (!productInfo.price) {
      return res.status(400).json({ error: 'Could not extract price information' });
    }

    // Create new product
    const product = new Product({
      name: productInfo.name,
      image: productInfo.image,
      urls: {
        [productInfo.source]: url
      },
      currentPrice: {
        [productInfo.source]: productInfo.price
      },
      priceHistory: [{
        price: productInfo.price,
        source: productInfo.source,
        availability: productInfo.availability,
        discount: productInfo.discount
      }]
    });

    await product.save();

    res.json({
      message: 'Product added for tracking',
      product
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

    for (const url of urls) {
      try {
        const productInfo = await scraperService.getProductInfo(url);
        const source = scraperService.getSourceFromUrl(url);
        
        if (productInfo.price) {
          updatedPrices[source] = productInfo.price;
          
          // Add to price history
          product.priceHistory.push({
            price: productInfo.price,
            source: source,
            availability: productInfo.availability,
            discount: productInfo.discount
          });
        }
      } catch (error) {
        console.error(`Failed to update price for ${url}:`, error);
      }
    }

    // Update current prices
    product.currentPrice = { ...product.currentPrice, ...updatedPrices };
    product.lastChecked = new Date();
    
    await product.save();

    res.json({
      message: 'Prices updated successfully',
      updatedPrices,
      lastChecked: product.lastChecked
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
      message: 'Scraping test successful',
      productInfo
    });
  } catch (error) {
    console.error('Test scraping error:', error);
    res.status(500).json({ 
      error: 'Scraping test failed',
      details: error.message 
    });
  }
});

module.exports = router;