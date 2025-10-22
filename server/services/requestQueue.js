const EventEmitter = require('events');
const redisService = require('./redisService');

class RequestQueue extends EventEmitter {
  constructor() {
    super();
    this.queues = {}; // Separate queue per domain
    this.processing = {}; // Track which domains are being processed
    this.cache = {}; // Fallback cache (in-memory)
    this.cacheExpiry = 3600; // 1 hour in seconds (for Redis)
    this.minDelay = 10000; // 10 seconds between requests to same domain
  }

  /**
   * Add a request to the queue or return cached result
   * @param {string} domain - The domain being scraped
   * @param {Function} operation - The async function to execute
   * @param {Object} options - Additional options
   * @returns {Promise} - Result of the operation or cached data
   */
  async enqueue(domain, operation, options = {}) {
    const { cacheKey, cacheDuration = this.cacheExpiry } = options;

    // Check Redis cache first
    if (cacheKey) {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        console.log(`✅ Redis cache hit for ${cacheKey}`);
        return cached;
      }
    }

    // Initialize queue for domain if doesn't exist
    if (!this.queues[domain]) {
      this.queues[domain] = [];
      this.processing[domain] = false;
    }

    // Create a promise for this request
    const queuePosition = this.queues[domain].length + 1;
    console.log(`📋 Queuing request for ${domain} (Position: ${queuePosition})`);

    return new Promise((resolve, reject) => {
      // Add to queue
      this.queues[domain].push({
        operation,
        resolve,
        reject,
        cacheKey,
        cacheDuration,
        queuedAt: Date.now()
      });

      // Start processing if not already processing
      if (!this.processing[domain]) {
        this.processQueue(domain);
      }
    });
  }

  /**
   * Process queued requests for a domain
   */
  async processQueue(domain) {
    if (this.processing[domain] || this.queues[domain].length === 0) {
      return;
    }

    this.processing[domain] = true;

    while (this.queues[domain].length > 0) {
      const request = this.queues[domain].shift();
      const remaining = this.queues[domain].length;

      try {
        console.log(`⚙️  Processing request for ${domain} (${remaining} remaining in queue)`);

        // Execute the operation
        const result = await request.operation();

        // Cache the result if cacheKey provided
        if (request.cacheKey) {
          await this.cacheResult(request.cacheKey, result, request.cacheDuration);
        }

        // Resolve the promise
        request.resolve({
          ...result,
          fromCache: false,
          queueWaitTime: Date.now() - request.queuedAt
        });

        // Wait before processing next request (rate limiting)
        if (this.queues[domain].length > 0) {
          const waitTime = this.minDelay;
          console.log(`⏳ Waiting ${waitTime}ms before next request to ${domain}...`);
          await this.delay(waitTime);
        }

      } catch (error) {
        console.error(`❌ Request failed for ${domain}:`, error.message);
        request.reject(error);
      }
    }

    this.processing[domain] = false;
    console.log(`✅ Queue for ${domain} completed`);
  }

  /**
   * Cache a result (Redis + fallback)
   */
  async cacheResult(key, data, duration = this.cacheExpiry) {
    try {
      // Try Redis first
      await redisService.set(key, data, duration);
    } catch (error) {
      // Fallback to memory cache
      this.cache[key] = {
        data,
        timestamp: Date.now(),
        expiry: Date.now() + (duration * 1000)
      };
      console.log(`💾 Memory: Cached result for ${key} (expires in ${duration}s)`);
    }
  }

  /**
   * Check if cached data is still valid (Redis + fallback)
   */
  async isCached(key) {
    try {
      return await redisService.exists(key);
    } catch (error) {
      // Fallback to memory cache
      if (!this.cache[key]) return false;
      
      const isExpired = Date.now() > this.cache[key].expiry;
      if (isExpired) {
        delete this.cache[key];
        return false;
      }
      
      return true;
    }
  }

  /**
   * Get cached data (Redis + fallback)
   */
  async getCached(key) {
    try {
      return await redisService.get(key);
    } catch (error) {
      // Fallback to memory cache
      if (this.cache[key] && Date.now() < this.cache[key].expiry) {
        return {
          ...this.cache[key].data,
          fromCache: true,
          cachedAt: this.cache[key].timestamp,
          source: 'memory'
        };
      }
      return null;
    }
  }

  /**
   * Clear cache for a specific key or all (Redis + fallback)
   */
  async clearCache(key = null) {
    try {
      if (key) {
        await redisService.delete(key);
        delete this.cache[key]; // Also clear memory fallback
        console.log(`🗑️  Cleared cache for ${key}`);
      } else {
        await redisService.clear();
        this.cache = {};
        console.log(`🗑️  Cleared all cache`);
      }
    } catch (error) {
      // Fallback to memory only
      if (key) {
        delete this.cache[key];
      } else {
        this.cache = {};
      }
      console.log(`🗑️  Cleared memory cache for ${key || 'all'}`);
    }
  }

  /**
   * Get queue status for a domain
   */
  getQueueStatus(domain) {
    return {
      domain,
      queueLength: this.queues[domain]?.length || 0,
      isProcessing: this.processing[domain] || false,
      estimatedWaitTime: (this.queues[domain]?.length || 0) * this.minDelay
    };
  }

  /**
   * Get all queues status
   */
  getAllQueuesStatus() {
    const domains = new Set([
      ...Object.keys(this.queues),
      ...Object.keys(this.processing)
    ]);

    return Array.from(domains).map(domain => this.getQueueStatus(domain));
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear expired cache entries (cleanup)
   */
  cleanupCache() {
    // Redis handles TTL automatically, only clean memory fallback
    redisService.cleanup();
  }
}

// Singleton instance
module.exports = new RequestQueue();

