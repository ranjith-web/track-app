const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// Get product details
router.get('/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// Update product
router.put('/:productId', async (req, res) => {
  try {
    const { name, description, category, brand } = req.body;
    
    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (brand) product.brand = brand;

    await product.save();

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Add additional URL to product
router.post('/:productId/url', async (req, res) => {
  try {
    const { url, platform } = req.body;
    
    if (!url || !platform) {
      return res.status(400).json({ error: 'URL and platform are required' });
    }

    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.urls[platform] = url;
    await product.save();

    res.json({
      message: 'URL added successfully',
      product
    });
  } catch (error) {
    console.error('Add URL error:', error);
    res.status(500).json({ error: 'Failed to add URL' });
  }
});

// Delete product
router.delete('/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.isActive = false;
    await product.save();

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get product statistics
router.get('/:productId/stats', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const stats = {
      totalClicks: product.clickCount,
      pricePoints: product.priceHistory.length,
      averagePrice: 0,
      lowestPrice: 0,
      highestPrice: 0,
      priceRange: 0
    };

    if (product.priceHistory.length > 0) {
      const prices = product.priceHistory.map(entry => entry.price);
      stats.averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      stats.lowestPrice = Math.min(...prices);
      stats.highestPrice = Math.max(...prices);
      stats.priceRange = stats.highestPrice - stats.lowestPrice;
    }

    res.json({ stats });
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({ error: 'Failed to get product statistics' });
  }
});

module.exports = router;