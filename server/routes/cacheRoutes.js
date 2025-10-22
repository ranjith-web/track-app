/**
 * Cache Management Routes
 * Provides endpoints for cache monitoring and management
 */

const express = require('express');
const redisService = require('../services/redisService');
const requestQueue = require('../services/requestQueue');

const router = express.Router();

/**
 * GET /api/cache/stats
 * Get cache statistics and health
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await redisService.getStats();
    const queueStats = requestQueue.getAllQueuesStatus();
    
    res.json({
      success: true,
      cache: stats,
      queues: queueStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/cache/health
 * Check cache health status
 */
router.get('/health', async (req, res) => {
  try {
    const stats = await redisService.getStats();
    
    res.json({
      success: true,
      healthy: stats.connected,
      source: stats.source,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      healthy: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cache/clear
 * Clear all cache
 */
router.post('/clear', async (req, res) => {
  try {
    await requestQueue.clearCache();
    
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

/**
 * DELETE /api/cache/:key
 * Clear specific cache key
 */
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    await requestQueue.clearCache(key);
    
    res.json({
      success: true,
      message: `Cache key '${key}' cleared successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache key clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache key',
      message: error.message
    });
  }
});

/**
 * GET /api/cache/test
 * Test cache functionality
 */
router.get('/test', async (req, res) => {
  try {
    const testKey = 'test:cache:' + Date.now();
    const testData = { message: 'Hello from cache!', timestamp: Date.now() };
    
    // Test set
    await redisService.set(testKey, testData, 60); // 1 minute TTL
    
    // Test get
    const retrieved = await redisService.get(testKey);
    
    // Test exists
    const exists = await redisService.exists(testKey);
    
    // Clean up
    await redisService.delete(testKey);
    
    res.json({
      success: true,
      test: {
        set: true,
        get: retrieved ? true : false,
        exists: exists,
        dataMatch: retrieved && retrieved.message === testData.message
      },
      message: 'Cache test completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache test error:', error);
    res.status(500).json({
      success: false,
      error: 'Cache test failed',
      message: error.message
    });
  }
});

module.exports = router;
