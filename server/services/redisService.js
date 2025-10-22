/**
 * Redis Service for Caching
 * Handles all caching operations with Redis
 */

const Redis = require('ioredis');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.fallbackCache = new Map(); // Fallback to memory if Redis fails
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    try {
      // Redis configuration
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        // Connection timeout
        connectTimeout: 10000,
        // Command timeout
        commandTimeout: 5000,
      };

      this.client = new Redis(redisConfig);

      // Event handlers
      this.client.on('connect', () => {
        console.log('✅ Redis connected successfully');
        this.isConnected = true;
      });

      this.client.on('error', (error) => {
        console.error('❌ Redis connection error:', error.message);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('⚠️  Redis connection closed');
        this.isConnected = false;
      });

      // Test connection
      await this.client.ping();
      console.log('🚀 Redis service initialized');

    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      console.log('⚠️  Falling back to in-memory cache');
      this.isConnected = false;
    }
  }

  /**
   * Set cache with TTL
   */
  async set(key, value, ttlSeconds = 3600) {
    try {
      if (this.isConnected && this.client) {
        const serializedValue = JSON.stringify({
          data: value,
          timestamp: Date.now(),
          ttl: ttlSeconds
        });
        
        await this.client.setex(key, ttlSeconds, serializedValue);
        console.log(`💾 Redis: Cached ${key} (TTL: ${ttlSeconds}s)`);
        return true;
      } else {
        // Fallback to memory cache
        this.fallbackCache.set(key, {
          data: value,
          timestamp: Date.now(),
          expiry: Date.now() + (ttlSeconds * 1000)
        });
        console.log(`💾 Memory: Cached ${key} (TTL: ${ttlSeconds}s)`);
        return true;
      }
    } catch (error) {
      console.error('❌ Cache set error:', error.message);
      // Fallback to memory
      this.fallbackCache.set(key, {
        data: value,
        timestamp: Date.now(),
        expiry: Date.now() + (ttlSeconds * 1000)
      });
      return true;
    }
  }

  /**
   * Get cache value
   */
  async get(key) {
    try {
      if (this.isConnected && this.client) {
        const cached = await this.client.get(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          console.log(`✅ Redis: Cache hit for ${key}`);
          return {
            ...parsed.data,
            fromCache: true,
            cachedAt: parsed.timestamp,
            source: 'redis'
          };
        }
        return null;
      } else {
        // Fallback to memory cache
        const cached = this.fallbackCache.get(key);
        if (cached && Date.now() < cached.expiry) {
          console.log(`✅ Memory: Cache hit for ${key}`);
          return {
            ...cached.data,
            fromCache: true,
            cachedAt: cached.timestamp,
            source: 'memory'
          };
        } else if (cached) {
          // Expired
          this.fallbackCache.delete(key);
        }
        return null;
      }
    } catch (error) {
      console.error('❌ Cache get error:', error.message);
      return null;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key) {
    try {
      if (this.isConnected && this.client) {
        const exists = await this.client.exists(key);
        return exists === 1;
      } else {
        const cached = this.fallbackCache.get(key);
        return cached && Date.now() < cached.expiry;
      }
    } catch (error) {
      console.error('❌ Cache exists error:', error.message);
      return false;
    }
  }

  /**
   * Delete cache key
   */
  async delete(key) {
    try {
      if (this.isConnected && this.client) {
        await this.client.del(key);
        console.log(`🗑️  Redis: Deleted ${key}`);
      } else {
        this.fallbackCache.delete(key);
        console.log(`🗑️  Memory: Deleted ${key}`);
      }
      return true;
    } catch (error) {
      console.error('❌ Cache delete error:', error.message);
      return false;
    }
  }

  /**
   * Set multiple keys with TTL
   */
  async mset(keyValuePairs, ttlSeconds = 3600) {
    try {
      if (this.isConnected && this.client) {
        const pipeline = this.client.pipeline();
        
        for (const [key, value] of keyValuePairs) {
          const serializedValue = JSON.stringify({
            data: value,
            timestamp: Date.now(),
            ttl: ttlSeconds
          });
          pipeline.setex(key, ttlSeconds, serializedValue);
        }
        
        await pipeline.exec();
        console.log(`💾 Redis: Cached ${keyValuePairs.length} keys`);
        return true;
      } else {
        // Fallback to memory
        for (const [key, value] of keyValuePairs) {
          this.fallbackCache.set(key, {
            data: value,
            timestamp: Date.now(),
            expiry: Date.now() + (ttlSeconds * 1000)
          });
        }
        console.log(`💾 Memory: Cached ${keyValuePairs.length} keys`);
        return true;
      }
    } catch (error) {
      console.error('❌ Cache mset error:', error.message);
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys) {
    try {
      if (this.isConnected && this.client) {
        const values = await this.client.mget(keys);
        const results = {};
        
        keys.forEach((key, index) => {
          if (values[index]) {
            const parsed = JSON.parse(values[index]);
            results[key] = {
              ...parsed.data,
              fromCache: true,
              cachedAt: parsed.timestamp,
              source: 'redis'
            };
          }
        });
        
        return results;
      } else {
        // Fallback to memory
        const results = {};
        keys.forEach(key => {
          const cached = this.fallbackCache.get(key);
          if (cached && Date.now() < cached.expiry) {
            results[key] = {
              ...cached.data,
              fromCache: true,
              cachedAt: cached.timestamp,
              source: 'memory'
            };
          }
        });
        return results;
      }
    } catch (error) {
      console.error('❌ Cache mget error:', error.message);
      return {};
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      if (this.isConnected && this.client) {
        const info = await this.client.info('memory');
        const keyspace = await this.client.info('keyspace');
        
        return {
          connected: true,
          source: 'redis',
          memory: info,
          keyspace: keyspace,
          fallbackSize: this.fallbackCache.size
        };
      } else {
        return {
          connected: false,
          source: 'memory',
          fallbackSize: this.fallbackCache.size,
          fallbackKeys: Array.from(this.fallbackCache.keys())
        };
      }
    } catch (error) {
      console.error('❌ Cache stats error:', error.message);
      return {
        connected: false,
        source: 'error',
        error: error.message
      };
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    try {
      if (this.isConnected && this.client) {
        await this.client.flushdb();
        console.log('🗑️  Redis: Cleared all cache');
      } else {
        this.fallbackCache.clear();
        console.log('🗑️  Memory: Cleared all cache');
      }
      return true;
    } catch (error) {
      console.error('❌ Cache clear error:', error.message);
      return false;
    }
  }

  /**
   * Cleanup expired entries (for memory fallback)
   */
  cleanup() {
    if (!this.isConnected) {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [key, value] of this.fallbackCache.entries()) {
        if (now > value.expiry) {
          this.fallbackCache.delete(key);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        console.log(`🧹 Memory: Cleaned ${cleaned} expired entries`);
      }
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        console.log('👋 Redis disconnected');
      }
    } catch (error) {
      console.error('❌ Redis disconnect error:', error.message);
    }
  }
}

// Singleton instance
module.exports = new RedisService();
