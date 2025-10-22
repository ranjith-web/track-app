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
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();
      
      try {
        console.log(`🔍 Scraping Flipkart: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Wait for page to load completely and handle potential popups
        await page.waitForTimeout(5000);
        
        // Try to close any popups or modals
        try {
          await page.click('button[class*="close"], ._2KpZ6l._2doB4z, [data-testid="close"]', { timeout: 2000 });
        } catch (e) {
          // Ignore if no close button found
        }
        
        const productData = await page.evaluate(() => {
          console.log('🔍 Starting Flipkart evaluation...');
          
          // Try multiple selectors for title
          const titleSelectors = [
            '.B_NuCI',
            'h1[class*="title"]',
            'h1',
            '[data-testid="product-title"]',
            '.product-title'
          ];
          
          let title = null;
          for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element?.textContent?.trim()) {
              title = element.textContent.trim();
              console.log(`✅ Found title with selector: ${selector}`);
              break;
            }
          }
          
          // Try multiple selectors for price
          const priceSelectors = [
            '.Nx9bqj',  // This is the working selector!
            '._30jeq3._16Jk6d',
            '._30jeq3',
            '[class*="price"]',
            '[data-testid="price"]',
            '.price',
            'span[class*="price"]',
            'div[class*="price"]',
            'div[class*="Nx9bqj"]',
            'div[class*="_25b18c"]',
            'span[class*="Nx9bqj"]',
            'span[class*="_25b18c"]'
          ];
          
          let price = null;
          let priceElement = null;
          for (const selector of priceSelectors) {
            priceElement = document.querySelector(selector);
            if (priceElement?.textContent) {
              const priceText = priceElement.textContent.replace(/[^\d.]/g, '');
              if (priceText && !isNaN(parseFloat(priceText))) {
                price = parseFloat(priceText);
                console.log(`✅ Found price with selector: ${selector}, value: ${price}`);
                break;
              }
            }
          }
          
          // If no price found with selectors, try to find price in text content
          if (!price) {
            console.log('🔍 Trying to find price in text content...');
            const allText = document.body.textContent || '';
            const pricePatterns = [
              /₹[\s]*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
              /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)[\s]*₹/g,
              /price[\s]*:?[\s]*₹?[\s]*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
              /₹[\s]*(\d{4,})/g  // For prices above 1000
            ];
            
            for (const pattern of pricePatterns) {
              const matches = allText.match(pattern);
              if (matches) {
                // Sort matches by price value and pick the highest reasonable price
                const validPrices = matches
                  .map(match => {
                    const priceText = match.replace(/[^\d.]/g, '');
                    const priceValue = parseFloat(priceText);
                    return { match, priceValue };
                  })
                  .filter(item => item.priceValue && item.priceValue > 1000) // Reasonable price range for phones
                  .sort((a, b) => b.priceValue - a.priceValue); // Sort by highest price
                
                if (validPrices.length > 0) {
                  price = validPrices[0].priceValue;
                  console.log(`✅ Found price in text: ${validPrices[0].match} -> ${price}`);
                  break;
                }
              }
            }
          }
          
          // Try multiple selectors for image
          const imageSelectors = [
            '._396cs4._2amPT._3qGm1',
            'img[class*="image"]',
            'img[alt*="product"]',
            '.product-image img',
            'img[data-testid="product-image"]',
            // New selectors based on Flipkart structure
            'img[class*="_396cs4"]',
            'img[class*="q6DCl0"]',
            'img[alt*="iPhone"]',
            'img[alt*="Apple"]',
            'img[src*="rukmini1.flixcart.com"]'
          ];
          
          let image = null;
          for (const selector of imageSelectors) {
            const imgElement = document.querySelector(selector);
            if (imgElement?.src) {
              image = imgElement.src;
              console.log(`✅ Found image with selector: ${selector}`);
              break;
            }
          }
          
          // If no image found with selectors, try to get from JSON-LD structured data
          if (!image) {
            console.log('🔍 Trying to find image in JSON-LD structured data...');
            const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of jsonLdScripts) {
              try {
                const data = JSON.parse(script.textContent);
                if (data.image) {
                  image = data.image;
                  console.log(`✅ Found image in JSON-LD: ${image}`);
                  break;
                }
                // Handle array of structured data
                if (Array.isArray(data)) {
                  for (const item of data) {
                    if (item.image) {
                      image = item.image;
                      console.log(`✅ Found image in JSON-LD array: ${image}`);
                      break;
                    }
                  }
                }
              } catch (e) {
                // Ignore invalid JSON
              }
            }
          }
          
          // Try multiple selectors for availability
          const availabilitySelectors = [
            '._2JC05C',
            '[class*="stock"]',
            '[data-testid="availability"]',
            '.availability',
            'span[class*="stock"]'
          ];
          
          let availability = 'in_stock';
          for (const selector of availabilitySelectors) {
            const element = document.querySelector(selector);
            if (element?.textContent?.trim()) {
              const text = element.textContent.trim().toLowerCase();
              if (text.includes('out') || text.includes('unavailable')) {
                availability = 'out_of_stock';
              }
              console.log(`✅ Found availability with selector: ${selector}, value: ${text}`);
              break;
            }
          }
          
          // Try multiple selectors for discount
          const discountSelectors = [
            '._3Ay6Sb span',
            '[class*="discount"]',
            '.discount',
            'span[class*="off"]'
          ];
          
          let discount = 0;
          for (const selector of discountSelectors) {
            const element = document.querySelector(selector);
            if (element?.textContent) {
              const discountText = element.textContent.replace(/[^\d]/g, '');
              if (discountText && !isNaN(parseInt(discountText))) {
                discount = parseInt(discountText);
                console.log(`✅ Found discount with selector: ${selector}, value: ${discount}`);
                break;
              }
            }
          }
          
          console.log('🔍 Flipkart evaluation result:', { title, price, image, availability, discount });
          
          return {
            title,
            price,
            image,
            availability,
            discount
          };
        });
        
        console.log('🔍 Flipkart scraping result:', productData);
        
        if (!productData.price) {
          throw new Error('Could not extract price information from Flipkart');
        }
        
        // Log image extraction details
        if (productData.image) {
          console.log('✅ Image extracted successfully:', productData.image);
        } else {
          console.log('⚠️ No image found during scraping');
        }
        
        await context.close();
        return {
          ...productData,
          source: 'flipkart'
        };
      } catch (error) {
        console.error('❌ Flipkart scraping error:', error.message);
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

  /**
   * Scrape reviews from Amazon
   */
  async scrapeAmazonReviews(url, maxReviews = 10) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for reviews section
        await page.waitForSelector('[data-hook="review"], .review', { timeout: 10000 }).catch(() => {});
        
        const reviews = await page.evaluate((max) => {
          const reviewElements = document.querySelectorAll('[data-hook="review"]');
          const extractedReviews = [];
          
          for (let i = 0; i < Math.min(reviewElements.length, max); i++) {
            const review = reviewElements[i];
            
            const ratingElement = review.querySelector('[data-hook="review-star-rating"], .review-rating');
            const rating = ratingElement ? parseFloat(ratingElement.textContent.match(/[\d.]+/)?.[0] || '0') : 0;
            
            const textElement = review.querySelector('[data-hook="review-body"], .review-text');
            const text = textElement ? textElement.textContent.trim() : '';
            
            const titleElement = review.querySelector('[data-hook="review-title"], .review-title');
            const title = titleElement ? titleElement.textContent.trim() : '';
            
            const reviewerElement = review.querySelector('[data-hook="genome-widget"], .reviewer-name');
            const reviewer = reviewerElement ? reviewerElement.textContent.trim() : 'Anonymous';
            
            const dateElement = review.querySelector('[data-hook="review-date"], .review-date');
            const date = dateElement ? dateElement.textContent.trim() : '';
            
            const verifiedElement = review.querySelector('[data-hook="avp-badge"], .avp-badge');
            const verifiedPurchase = !!verifiedElement;
            
            const helpfulElement = review.querySelector('[data-hook="helpful-vote-statement"]');
            const helpfulVotes = helpfulElement ? parseInt(helpfulElement.textContent.match(/\d+/)?.[0] || '0') : 0;
            
            if (text && rating) {
              extractedReviews.push({
                rating,
                text: `${title} ${text}`.trim(),
                reviewer: {
                  name: reviewer,
                  totalReviews: null,
                  memberSince: null
                },
                date: date,
                verifiedPurchase,
                helpfulVotes,
                source: 'amazon'
              });
            }
          }
          
          return extractedReviews;
        }, maxReviews);
        
        await context.close();
        return reviews;
      } catch (error) {
        await context.close().catch(() => {});
        throw error;
      }
    });
  }

  /**
   * Scrape reviews from Flipkart
   */
  async scrapeFlipkartReviews(url, maxReviews = 10) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for reviews section
        await page.waitForSelector('._27M-vq, .review-container', { timeout: 10000 }).catch(() => {});
        
        const reviews = await page.evaluate((max) => {
          const reviewElements = document.querySelectorAll('._27M-vq');
          const extractedReviews = [];
          
          for (let i = 0; i < Math.min(reviewElements.length, max); i++) {
            const review = reviewElements[i];
            
            const ratingElement = review.querySelector('._3LWZlK');
            const rating = ratingElement ? parseFloat(ratingElement.textContent) : 0;
            
            const textElement = review.querySelector('.t-ZTKy');
            const text = textElement ? textElement.textContent.trim() : '';
            
            const reviewerElement = review.querySelector('._2sc7ZR');
            const reviewer = reviewerElement ? reviewerElement.textContent.trim() : 'Anonymous';
            
            const dateElement = review.querySelector('._2-N8zT');
            const date = dateElement ? dateElement.textContent.trim() : '';
            
            const verifiedElement = review.querySelector('._1lRcqv');
            const verifiedPurchase = !!verifiedElement;
            
            const helpfulElement = review.querySelector('._3c3Ev5');
            const helpfulVotes = helpfulElement ? parseInt(helpfulElement.textContent.match(/\d+/)?.[0] || '0') : 0;
            
            if (text && rating) {
              extractedReviews.push({
                rating,
                text: text.trim(),
                reviewer: {
                  name: reviewer,
                  totalReviews: null,
                  memberSince: null
                },
                date: date,
                verifiedPurchase,
                helpfulVotes,
                source: 'flipkart'
              });
            }
          }
          
          return extractedReviews;
        }, maxReviews);
        
        await context.close();
        return reviews;
      } catch (error) {
        await context.close().catch(() => {});
        throw error;
      }
    });
  }

  /**
   * Scrape reviews for a product (auto-detect source)
   */
  async scrapeReviews(url, maxReviews = 10) {
    try {
      if (url.includes('amazon.')) {
        return await this.scrapeAmazonReviews(url, maxReviews);
      } else if (url.includes('flipkart.')) {
        return await this.scrapeFlipkartReviews(url, maxReviews);
      } else {
        console.log('Reviews not supported for this platform yet');
        return [];
      }
    } catch (error) {
      console.error('Review scraping error:', error);
      return [];
    }
  }

}

module.exports = new ScraperService();