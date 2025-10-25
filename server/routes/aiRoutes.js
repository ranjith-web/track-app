const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const aiService = require('../services/aiService');
const reviewAnalysisService = require('../services/reviewAnalysisService');
const scraperService = require('../services/scraperService');

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

    // Get current lowest price
    const currentPrice = Object.values(product.currentPrice || {})
      .filter(p => p && p > 0)
      .reduce((min, p) => Math.min(min, p), Infinity);

    // Check if we have cached analysis and price hasn't changed significantly
    if (product.aiAnalysis && 
        product.aiAnalysis.lastAnalyzed &&
        product.aiAnalysis.priceSnapshot) {
      
      const hoursSinceAnalysis = (Date.now() - product.aiAnalysis.lastAnalyzed) / (1000 * 60 * 60);
      const priceChangePercent = Math.abs((currentPrice - product.aiAnalysis.priceSnapshot) / product.aiAnalysis.priceSnapshot * 100);
      
      // Return cached analysis if:
      // - Analyzed within last 24 hours AND
      // - Price changed less than 5%
      if (hoursSinceAnalysis < 24 && priceChangePercent < 5) {
        console.log(`✅ Returning cached AI analysis (${hoursSinceAnalysis.toFixed(1)}h old, ${priceChangePercent.toFixed(1)}% price change)`);
        return res.json({
          message: 'Analysis returned from cache',
          analysis: product.aiAnalysis,
          cached: true,
          cacheAge: `${hoursSinceAnalysis.toFixed(1)} hours`
        });
      }
    }

    // Generate fresh AI analysis
    console.log('🔄 Generating fresh AI analysis...');
    const analysis = await aiService.analyzePriceTrend(product.priceHistory);
    
    // Save complete analysis to database
    product.aiAnalysis = {
      trend: analysis.trend,
      confidence: analysis.confidence,
      prediction: analysis.prediction,
      recommendation: analysis.recommendation,
      stability: analysis.stability,
      analysis: analysis.analysis,
      lastAnalyzed: new Date(),
      priceSnapshot: currentPrice
    };
    
    await product.save();
    console.log('✅ AI analysis saved to database');

    res.json({
      message: 'Fresh price analysis completed',
      analysis: product.aiAnalysis,
      cached: false
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

    // Get current lowest price
    const validPrices = Object.values(product.currentPrice || {})
      .filter(p => p && p > 0);
    
    const currentPrice = validPrices.length > 0 
      ? Math.min(...validPrices) 
      : 0;
    
    if (currentPrice === 0) {
      return res.status(400).json({ error: 'No valid price data available for this product' });
    }

    // Check if we have cached insights and price hasn't changed significantly
    if (product.buyingInsights && 
        product.buyingInsights.lastAnalyzed &&
        product.buyingInsights.priceSnapshot) {
      
      const hoursSinceAnalysis = (Date.now() - new Date(product.buyingInsights.lastAnalyzed)) / (1000 * 60 * 60);
      const priceChangePercent = Math.abs((currentPrice - product.buyingInsights.priceSnapshot) / product.buyingInsights.priceSnapshot * 100);
      
      // Return cached insights if:
      // - Analyzed within last 24 hours AND
      // - Price changed less than 5%
      if (hoursSinceAnalysis < 24 && priceChangePercent < 5) {
        return res.json({
          insights: product.buyingInsights,
          cached: true,
          cacheAge: `${hoursSinceAnalysis.toFixed(1)} hours`
        });
      }
    }

    // Check if we need to scrape reviews (scrape every 7 days)
    let reviewSummary = product.buyingInsights?.reviewSummary || {
      averageRating: 0,
      totalGenuineReviews: 0,
      sentiment: 'neutral',
      pros: [],
      cons: [],
      fakeReviewPercentage: 0
    };
    const shouldScrapeReviews = !product.reviews?.lastScraped || 
                                (Date.now() - product.reviews.lastScraped) > (7 * 24 * 60 * 60 * 1000);

    if (shouldScrapeReviews && product.urls) {
      console.log('📝 Scraping and analyzing reviews...');
      
      // Get URL (prefer Amazon, then Flipkart)
      const url = product.urls.amazon || product.urls.flipkart;
      
      if (url) {
        try {
          // Scrape reviews
          const rawReviews = await scraperService.scrapeReviews(url, 20);
          
          if (rawReviews.length > 0) {
            // Filter fake reviews
            const filtered = await reviewAnalysisService.filterGenuineReviews(rawReviews);
            
            // Generate insights from genuine reviews
            const reviewInsights = await reviewAnalysisService.generateReviewInsights(filtered.genuine);
            console.log('🔍 Review insights received:', JSON.stringify(reviewInsights, null, 2));
            
            // Save review summary with validation
            reviewSummary = {
              averageRating: reviewInsights.averageRating || 0,
              totalGenuineReviews: filtered.stats.genuine || 0,
              sentiment: reviewInsights.sentiment || 'neutral',
              pros: reviewInsights.pros || [],
              cons: reviewInsights.cons || [],
              fakeReviewPercentage: 100 - (filtered.stats.genuinePercentage || 0)
            };
            console.log('📝 Final reviewSummary:', JSON.stringify(reviewSummary, null, 2));
            
            // Update product reviews stats
            product.reviews = {
              lastScraped: new Date(),
              totalReviews: filtered.stats.total,
              genuineReviews: filtered.stats.genuine,
              suspiciousReviews: filtered.stats.suspicious
            };
            
            console.log(`✅ Reviews analyzed: ${filtered.stats.genuine}/${filtered.stats.total} genuine (${filtered.stats.genuinePercentage}%)`);
          }
        } catch (error) {
          console.error('Review scraping error:', error);
          // Continue with insights even if reviews fail
        }
      }
    }

    // Prepare product data including reviews
    const productData = {
      name: product.name,
      currentPrice: currentPrice,
      priceHistory: product.priceHistory,
      reviewSummary: reviewSummary
    };

    // Generate fresh insights (now includes review data)
    const insights = await aiService.getPriceInsights(productData);

    // Ensure reviewSummary is always properly defined before saving
    if (!reviewSummary || typeof reviewSummary !== 'object') {
      reviewSummary = {
        averageRating: 0,
        totalGenuineReviews: 0,
        sentiment: 'neutral',
        pros: [],
        cons: [],
        fakeReviewPercentage: 0
      };
    }
    
    // Set buyingInsights fields individually to avoid Mongoose issues
    product.buyingInsights.dealScore = insights.dealScore;
    product.buyingInsights.isGoodDeal = insights.isGoodDeal;
    product.buyingInsights.priceComparison = insights.priceComparison;
    product.buyingInsights.seasonalTrend = insights.seasonalTrend;
    product.buyingInsights.strategy = insights.strategy;
    product.buyingInsights.insights = insights.insights;
    product.buyingInsights.lastAnalyzed = new Date();
    product.buyingInsights.priceSnapshot = currentPrice;
    
    // Set reviewSummary directly
    product.buyingInsights.reviewSummary = {
      averageRating: reviewSummary.averageRating,
      totalGenuineReviews: reviewSummary.totalGenuineReviews,
      sentiment: reviewSummary.sentiment,
      pros: [...(reviewSummary.pros || [])],
      cons: [...(reviewSummary.cons || [])],
      fakeReviewPercentage: reviewSummary.fakeReviewPercentage
    };
    
    await product.save();

    res.json({
      insights: product.buyingInsights,
      cached: false
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