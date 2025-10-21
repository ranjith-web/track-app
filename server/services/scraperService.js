const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const requestQueue = require('./requestQueue');

class ScraperService {
  constructor() {
    this.browser = null;
    this.maxRetries = 3;
    this.retryDelay = 2000;
    
    // Start cache cleanup interval (every 10 minutes)
    setInterval(() => {
      requestQueue.cleanupCache();
    }, 600000);
  }

  async initBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (error) {
          console.warn('Error closing previous browser:', error.message);
        }
      }
      
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images',
          '--disable-javascript',
          '--disable-default-apps'
        ],
        timeout: 30000
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.warn('Error closing browser:', error.message);
      }
      this.browser = null;
    }
  }

  async withRetry(operation, maxRetries = this.maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.warn(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Close browser on connection errors and wait before retry
        if (error.message.includes('socket hang up') || 
            error.message.includes('ECONNRESET') ||
            error.message.includes('WebSocket')) {
          await this.closeBrowser();
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }
  }

  async scrapeAmazon(url) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for price elements to load
        await page.waitForSelector('.a-price-whole, .a-offscreen, #priceblock_dealprice, #priceblock_ourprice', { timeout: 10000 }).catch(() => {});
        
        const productData = await page.evaluate(() => {
          const title = document.querySelector('#productTitle')?.textContent?.trim() || 
                       document.querySelector('h1.a-size-large')?.textContent?.trim();
          
          const priceElement = document.querySelector('.a-price-whole') || 
                             document.querySelector('.a-offscreen') ||
                             document.querySelector('#priceblock_dealprice') ||
                             document.querySelector('#priceblock_ourprice');
          
          const price = priceElement?.textContent?.replace(/[^\d.]/g, '') || null;
          
          const image = document.querySelector('#landingImage')?.src ||
                       document.querySelector('.a-dynamic-image')?.src;
          
          const availability = document.querySelector('#availability span')?.textContent?.trim() ||
                             document.querySelector('#availability')?.textContent?.trim();
          
          const discountElement = document.querySelector('.a-size-large.a-color-price.savingsPercentage');
          const discount = discountElement?.textContent?.replace(/[^\d]/g, '') || 0;
          
          return {
            title,
            price: price ? parseFloat(price) : null,
            image,
            availability: availability?.toLowerCase().includes('stock') ? 'in_stock' : 'out_of_stock',
            discount: parseInt(discount) || 0
          };
        });
        
        await context.close();
        return productData;
      } catch (error) {
        await context.close().catch(() => {});
        throw error;
      }
    });
  }

  async scrapeFlipkart(url) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for price elements to load
        await page.waitForSelector('._30jeq3, [class*="price"]', { timeout: 10000 }).catch(() => {});
        
        const productData = await page.evaluate(() => {
          const title = document.querySelector('.B_NuCI')?.textContent?.trim() ||
                       document.querySelector('h1')?.textContent?.trim();
          
          const priceElement = document.querySelector('._30jeq3._16Jk6d') ||
                             document.querySelector('._30jeq3') ||
                             document.querySelector('[class*="price"]');
          
          const price = priceElement?.textContent?.replace(/[^\d.]/g, '') || null;
          
          const image = document.querySelector('._396cs4._2amPT._3qGm1')?.src ||
                       document.querySelector('img[class*="image"]')?.src;
          
          const availability = document.querySelector('._2JC05C')?.textContent?.trim() ||
                             document.querySelector('[class*="stock"]')?.textContent?.trim();
          
          const discountElement = document.querySelector('._3Ay6Sb span');
          const discount = discountElement?.textContent?.replace(/[^\d]/g, '') || 0;
          
          return {
            title,
            price: price ? parseFloat(price) : null,
            image,
            availability: availability?.toLowerCase().includes('stock') ? 'in_stock' : 'out_of_stock',
            discount: parseInt(discount) || 0
          };
        });
        
        await context.close();
        return productData;
      } catch (error) {
        await context.close().catch(() => {});
        throw error;
      }
    });
  }

  async scrapeMyntra(url) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for price elements to load
        await page.waitForSelector('.pdp-price, [class*="price"]', { timeout: 10000 }).catch(() => {});
        
        const productData = await page.evaluate(() => {
          const title = document.querySelector('.pdp-product-name')?.textContent?.trim() ||
                       document.querySelector('h1')?.textContent?.trim();
          
          const priceElement = document.querySelector('.pdp-price') ||
                             document.querySelector('[class*="price"]');
          
          const price = priceElement?.textContent?.replace(/[^\d.]/g, '') || null;
          
          const image = document.querySelector('.image-grid-image')?.src ||
                       document.querySelector('img[class*="image"]')?.src;
          
          const availability = document.querySelector('.size-buttons-size-button')?.textContent?.trim() ||
                             document.querySelector('[class*="size"]')?.textContent?.trim();
          
          const discountElement = document.querySelector('.pdp-discount');
          const discount = discountElement?.textContent?.replace(/[^\d]/g, '') || 0;
          
          return {
            title,
            price: price ? parseFloat(price) : null,
            image,
            availability: availability ? 'in_stock' : 'out_of_stock',
            discount: parseInt(discount) || 0
          };
        });
        
        await context.close();
        return productData;
      } catch (error) {
        await context.close().catch(() => {});
        throw error;
      }
    });
  }

  async scrapeProduct(url) {
    try {
      const domain = new URL(url).hostname;
      const cacheKey = `scrape:${url}`;

      // Use request queue with caching
      const result = await requestQueue.enqueue(
        domain,
        async () => {
          // Actual scraping operation
          if (url.includes('amazon.')) {
            return await this.scrapeAmazon(url);
          } else if (url.includes('flipkart.')) {
            return await this.scrapeFlipkart(url);
          } else if (url.includes('myntra.')) {
            return await this.scrapeMyntra(url);
          } else {
            throw new Error('Unsupported e-commerce platform');
          }
        },
        {
          cacheKey,
          cacheDuration: 3600000 // 1 hour cache
        }
      );

      return result;

    } catch (error) {
      console.error('Scraping error:', error);
      // Provide more specific error messages
      if (error.message.includes('socket hang up') || error.message.includes('ECONNRESET')) {
        throw new Error('Network connection failed. Please try again.');
      } else if (error.message.includes('timeout')) {
        throw new Error('Request timed out. The website may be slow or unavailable.');
      } else if (error.message.includes('Unsupported e-commerce platform')) {
        throw new Error('This e-commerce platform is not supported yet.');
      } else {
        throw new Error('Failed to scrape product information. Please check the URL and try again.');
      }
    }
  }

  // Get queue status (useful for API endpoints)
  getQueueStatus() {
    return requestQueue.getAllQueuesStatus();
  }

  // Clear cache manually if needed
  clearCache(url = null) {
    if (url) {
      const cacheKey = `scrape:${url}`;
      requestQueue.clearCache(cacheKey);
    } else {
      requestQueue.clearCache();
    }
  }

  async getProductInfo(url) {
    const productData = await this.scrapeProduct(url);
    
    return {
      name: productData.title,
      price: productData.price,
      image: productData.image,
      availability: productData.availability,
      discount: productData.discount,
      source: this.getSourceFromUrl(url)
    };
  }

  getSourceFromUrl(url) {
    if (url.includes('amazon.')) return 'amazon';
    if (url.includes('flipkart.')) return 'flipkart';
    if (url.includes('myntra.')) return 'myntra';
    return 'unknown';
  }
}

module.exports = new ScraperService();