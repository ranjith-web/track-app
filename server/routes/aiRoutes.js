const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const aiService = require('../services/aiService');

// Analyze price trend for a product
router.post('/analyze/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!product.priceHistory || product.priceHistory.length < 2) {
      return res.status(400).json({ 
        error: 'Insufficient price history for analysis' 
      });
    }

    // Get AI analysis
    const analysis = await aiService.analyzePriceTrend(product.priceHistory);
    
    // Update product with AI analysis
    product.aiAnalysis = {
      ...analysis,
      lastAnalyzed: new Date()
    };
    
    await product.save();

    res.json({
      message: 'Price analysis completed',
      analysis
    });
  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze price trend' });
  }
});

// Get buying insights for a product
router.get('/insights/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const insights = await aiService.getPriceInsights(product);

    res.json({
      insights
    });
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to get buying insights' });
  }
});

// Generate price alert
router.post('/alert/:productId', async (req, res) => {
  try {
    const { targetPrice } = req.body;
    
    if (!targetPrice) {
      return res.status(400).json({ error: 'Target price is required' });
    }

    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentPrice = Math.min(
      ...Object.values(product.currentPrice).filter(price => price)
    );

    const alertMessage = await aiService.generatePriceAlert(product, targetPrice);

    res.json({
      alert: {
        message: alertMessage,
        currentPrice,
        targetPrice,
        savings: currentPrice - targetPrice,
        isTargetReached: currentPrice <= targetPrice
      }
    });
  } catch (error) {
    console.error('Generate alert error:', error);
    res.status(500).json({ error: 'Failed to generate price alert' });
  }
});

// Get AI recommendations
router.get('/recommendations/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const recommendations = {
      bestTimeToBuy: 'Based on price trend analysis',
      pricePrediction: product.aiAnalysis?.prediction || 'No prediction available',
      confidence: product.aiAnalysis?.confidence || 0,
      trend: product.aiAnalysis?.trend || 'unknown',
      lastAnalyzed: product.aiAnalysis?.lastAnalyzed
    };

    res.json({ recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to get AI recommendations' });
  }
});

// Bulk analyze multiple products
router.post('/bulk-analyze', async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({ error: 'Product IDs array is required' });
    }

    const results = [];
    
    for (const productId of productIds) {
      try {
        const product = await Product.findById(productId);
        
        if (product && product.priceHistory.length >= 2) {
          const analysis = await aiService.analyzePriceTrend(product.priceHistory);
          
          product.aiAnalysis = {
            ...analysis,
            lastAnalyzed: new Date()
          };
          
          await product.save();
          
          results.push({
            productId,
            status: 'success',
            analysis
          });
        } else {
          results.push({
            productId,
            status: 'skipped',
            reason: 'Insufficient data'
          });
        }
      } catch (error) {
        results.push({
          productId,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({
      message: 'Bulk analysis completed',
      results
    });
  } catch (error) {
    console.error('Bulk analysis error:', error);
    res.status(500).json({ error: 'Failed to perform bulk analysis' });
  }
});

// Check AI service status
router.get('/status', async (req, res) => {
  try {
    const hasApiKey = !!process.env.GEMINI_API_KEY || !!aiService.apiKey;
    const isConfigured = aiService.model !== null;
    
    res.json({
      hasApiKey,
      isConfigured,
      status: hasApiKey && isConfigured ? 'ready' : 'not_configured',
      message: hasApiKey && isConfigured 
        ? 'AI service is ready (Gemini)' 
        : 'AI service is not configured. Please set GEMINI_API_KEY environment variable.'
    });
  } catch (error) {
    console.error('AI status check error:', error);
    res.status(500).json({ 
      error: 'Failed to check AI service status',
      hasApiKey: false,
      isConfigured: false,
      status: 'error'
    });
  }
});

// Test AI service with a simple request
router.post('/test', async (req, res) => {
  try {
    const testData = [{
      price: 100,
      timestamp: new Date(),
      source: 'test'
    }];
    
    const result = await aiService.analyzePriceTrend(testData);
    
    res.json({
      message: 'AI service test completed',
      result,
      status: 'success'
    });
  } catch (error) {
    console.error('AI test error:', error);
    res.status(500).json({ 
      error: 'AI service test failed',
      details: error.message,
      status: 'error'
    });
  }
});

module.exports = router;