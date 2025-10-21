const EventEmitter = require('events');

class RequestQueue extends EventEmitter {
  constructor() {
    super();
    this.queues = {}; // Separate queue per domain
    this.processing = {}; // Track which domains are being processed
    this.cache = {}; // Cache recent results
    this.cacheExpiry = 3600000; // 1 hour in milliseconds
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

    // Check cache first
    if (cacheKey && this.isCached(cacheKey)) {
      console.log(`✅ Cache hit for ${cacheKey}`);
      return {
        ...this.cache[cacheKey].data,
        fromCache: true,
        cachedAt: this.cache[cacheKey].timestamp
      };
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
          this.cacheResult(request.cacheKey, result, request.cacheDuration);
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
   * Cache a result
   */
  cacheResult(key, data, duration = this.cacheExpiry) {
    this.cache[key] = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + duration
    };
    console.log(`💾 Cached result for ${key} (expires in ${duration / 1000}s)`);
  }

  /**
   * Check if cached data is still valid
   */
  isCached(key) {
    if (!this.cache[key]) return false;
    
    const isExpired = Date.now() > this.cache[key].expiry;
    if (isExpired) {
      delete this.cache[key];
      return false;
    }
    
    return true;
  }

  /**
   * Get cached data
   */
  getCached(key) {
    if (this.isCached(key)) {
      return this.cache[key].data;
    }
    return null;
  }

  /**
   * Clear cache for a specific key or all
   */
  clearCache(key = null) {
    if (key) {
      delete this.cache[key];
      console.log(`🗑️  Cleared cache for ${key}`);
    } else {
      this.cache = {};
      console.log(`🗑️  Cleared all cache`);
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
    const now = Date.now();
    let cleaned = 0;

    Object.keys(this.cache).forEach(key => {
      if (now > this.cache[key].expiry) {
        delete this.cache[key];
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
  }
}

// Singleton instance
module.exports = new RequestQueue();

