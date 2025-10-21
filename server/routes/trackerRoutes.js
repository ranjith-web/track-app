const express = require('express');
const router = express.Router();
const priceTrackerService = require('../services/priceTrackerService');

// Get tracker status
router.get('/status', (req, res) => {
  try {
    const status = priceTrackerService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get tracker status' });
  }
});

// Manually trigger price update for all products
router.post('/trigger-update', async (req, res) => {
  try {
    const result = await priceTrackerService.triggerManualUpdate();
    res.json(result);
  } catch (error) {
    console.error('Manual trigger error:', error);
    res.status(500).json({ error: 'Failed to trigger update' });
  }
});

module.exports = router;

