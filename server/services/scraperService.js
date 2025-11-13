const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const requestQueue = require('./requestQueue');
const {
  canonicalizeMarketplaceName,
  SEARCH_SUPPORTED_MARKETPLACES
} = require('../utils/marketplaceConfig');

const normalizeTextForMatch = (text = '') => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
};

const calculateNameSimilarity = (targetName = '', candidateName = '') => {
  const targetTokens = new Set(normalizeTextForMatch(targetName));
  const candidateTokens = new Set(normalizeTextForMatch(candidateName));

  if (targetTokens.size === 0 || candidateTokens.size === 0) {
    return 0;
  }

  let intersectionCount = 0;
  targetTokens.forEach(token => {
    if (candidateTokens.has(token)) {
      intersectionCount += 1;
    }
  });

  // Use Sørensen–Dice coefficient for better balance
  return (2 * intersectionCount) / (targetTokens.size + candidateTokens.size);
};

const MARKETPLACE_SEARCH_HANDLERS = {
  amazon: {
    searchMethod: 'searchAmazonListings',
    scrapeMethod: 'scrapeAmazon'
  },
  flipkart: {
    searchMethod: 'searchFlipkartListings',
    scrapeMethod: 'scrapeFlipkart'
  }
};

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
          // Note: JavaScript is enabled for dynamic content (Flipkart, Myntra, etc.)
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
        await page.waitForSelector('.a-price-whole, .a-offscreen, #priceblock_dealprice, #priceblock_ourprice', { timeout: 10000 }).catch(() => { });

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
        await context.close().catch(() => { });
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
        await context.close().catch(() => { });
        throw error;
      }
    });
  }

  async searchAmazonListings(productName, options = {}) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();

      const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(productName)}`;
      const maxResults = options.limit || 10;

      try {
        console.log(`🔍 Searching Amazon for "${productName}"`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);

        const listings = await page.evaluate((limit) => {
          const cards = Array.from(document.querySelectorAll('div[data-component-type="s-search-result"]')).slice(0, limit * 2);
          const results = [];
          const seenUrls = new Set();

          const extractCanonicalUrl = (href) => {
            if (!href) return null;
            try {
              const url = new URL(href, 'https://www.amazon.in');
              // Keep /dp/ASIN structure
              const dpMatch = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
              if (dpMatch) {
                return `https://www.amazon.in/dp/${dpMatch[1]}`;
              }
              return url.href.split('?')[0];
            } catch (error) {
              return href.startsWith('http') ? href : `https://www.amazon.in${href}`;
            }
          };

          cards.forEach(card => {
            const titleElement =
              card.querySelector('span.a-size-medium') ||
              card.querySelector('span.a-size-base-plus') ||
              card.querySelector('h2 a span');

            const linkElement = card.querySelector('h2 a');
            if (!linkElement) return;

            const href = linkElement.getAttribute('href');
            const url = extractCanonicalUrl(href);
            if (!url || seenUrls.has(url)) return;
            seenUrls.add(url);

            const priceWhole = card.querySelector('span.a-price-whole');
            const priceFraction = card.querySelector('span.a-price-fraction');
            let price = null;
            if (priceWhole) {
              const priceText = `${priceWhole.textContent || ''}${priceFraction ? `.${priceFraction.textContent}` : ''}`.replace(/[^\d.]/g, '');
              if (priceText) {
                price = parseFloat(priceText);
              }
            }

            const title = titleElement?.textContent?.trim();
            if (title) {
              results.push({
                title,
                url,
                price
              });
            }
          });

          return results.slice(0, limit);
        }, maxResults);

        await context.close();
        console.log(`🧭 Amazon search returned ${listings.length} candidates`);
        return listings;
      } catch (error) {
        await context.close().catch(() => { });
        throw error;
      }
    });
  }

  async searchFlipkartListings(productName, options = {}) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();

      const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(productName)}`;
      const maxResults = options.limit || 10;

      try {
        console.log(`🔍 Searching Flipkart for "${productName}"`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);

        // Close login popup if it appears
        try {
          await page.click('button[class*="_2KpZ6l _2doB4z"], button._2KpZ6l._2doB4z', { timeout: 2000 });
        } catch (e) {
          // Ignore if popup not present
        }

        const listings = await page.evaluate((limit) => {
          const cards = Array.from(document.querySelectorAll('div[data-id]')).slice(0, limit * 2);
          const uniqueResults = [];
          const seenUrls = new Set();

          cards.forEach(card => {
            const linkElement = card.querySelector('a[href*="/p/"]');
            if (!linkElement) {
              return;
            }

            const href = linkElement.getAttribute('href');
            if (!href) {
              return;
            }

            const url = href.startsWith('http') ? href : `https://www.flipkart.com${href.split('?')[0]}`;
            if (seenUrls.has(url)) {
              return;
            }
            seenUrls.add(url);

            const titleElement =
              card.querySelector('.KzDlHZ') ||
              card.querySelector('div[title]') ||
              card.querySelector('.wjcEIp') ||
              card.querySelector('.IRpwTa') ||
              card.querySelector('a');

            const priceElement =
              card.querySelector('.Nx9bqj') ||
              card.querySelector('._30jeq3') ||
              card.querySelector('[class*="price"]');

            const title = titleElement?.textContent?.trim() || linkElement.getAttribute('title') || '';
            const priceText = priceElement?.textContent?.replace(/[^\d.]/g, '');
            const price = priceText ? parseFloat(priceText) : null;

            if (title) {
              uniqueResults.push({
                title,
                url,
                price
              });
            }
          });

          return uniqueResults.slice(0, limit);
        }, maxResults);

        await context.close();
        console.log(`🧭 Flipkart search returned ${listings.length} candidates`);
        return listings;
      } catch (error) {
        await context.close().catch(() => { });
        throw error;
      }
    });
  }

  async findMarketplaceMatchByName(marketplace, productName, options = {}) {
    const minScore = options.minScore ?? 0.75;
    const searchLimit = options.limit ?? 10;
    const canonicalMarketplace = canonicalizeMarketplaceName(marketplace);

    if (!canonicalMarketplace || !this.supportsMarketplaceSearch(canonicalMarketplace)) {
      console.log(`⚠️  Marketplace search not supported for "${marketplace}"`);
      return null;
    }

    const handler = MARKETPLACE_SEARCH_HANDLERS[canonicalMarketplace];
    if (!handler) {
      return null;
    }

    const searchMethod = handler.searchMethod;
    const scrapeMethod = handler.scrapeMethod;

    if (typeof this[searchMethod] !== 'function' || typeof this[scrapeMethod] !== 'function') {
      console.log(`⚠️  Search or scrape method missing for marketplace ${canonicalMarketplace}`);
      return null;
    }

    try {
      const candidates = await this[searchMethod](productName, { limit: searchLimit });
      if (!candidates || candidates.length === 0) {
        console.log(`⚠️  No ${canonicalMarketplace} listings found for`, productName);
        return null;
      }

      let bestMatch = null;

      candidates.forEach(candidate => {
        const score = calculateNameSimilarity(productName, candidate.title);
        console.log(`   • ${canonicalMarketplace} candidate "${candidate.title}" scored ${(score * 100).toFixed(1)}%`);
        if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
          bestMatch = {
            ...candidate,
            score
          };
        }
      });

      if (!bestMatch) {
        console.log(`⚠️  No ${canonicalMarketplace} candidates met the ${(minScore * 100)}% similarity threshold`);
        return null;
      }

      console.log(`✅ ${canonicalMarketplace} best match "${bestMatch.title}" with score ${(bestMatch.score * 100).toFixed(1)}%`);

      try {
        const scrapedData = await this[scrapeMethod](bestMatch.url);
        return {
          marketplace: canonicalMarketplace,
          url: bestMatch.url,
          score: bestMatch.score,
          title: bestMatch.title,
          price: bestMatch.price,
          scrapedData
        };
      } catch (error) {
        console.error(`⚠️  Failed to scrape matched ${canonicalMarketplace} product:`, error.message);
        return {
          marketplace: canonicalMarketplace,
          url: bestMatch.url,
          score: bestMatch.score,
          title: bestMatch.title,
          price: bestMatch.price,
          scrapedData: null,
          error: error.message
        };
      }
    } catch (error) {
      console.error(`🔁 ${canonicalMarketplace} search error:`, error.message);
      return null;
    }
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
        await page.waitForSelector('.pdp-price, [class*="price"]', { timeout: 10000 }).catch(() => { });

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
        await context.close().catch(() => { });
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
        await page.waitForSelector('[data-hook="review"], .review', { timeout: 10000 }).catch(() => { });

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
        await context.close().catch(() => { });
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
        await page.waitForSelector('._27M-vq, .review-container', { timeout: 10000 }).catch(() => { });

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
        await context.close().catch(() => { });
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

  supportsMarketplaceSearch(marketplace) {
    const canonical = canonicalizeMarketplaceName(marketplace);
    return canonical && SEARCH_SUPPORTED_MARKETPLACES.has(canonical) && Boolean(MARKETPLACE_SEARCH_HANDLERS[canonical]);
  }

  async enrichProductAcrossMarketplaces(options = {}) {
    const {
      productName,
      sourceMarketplace,
      existingUrls = {},
      targets = [],
      minScore = 0.75,
      searchLimit = 10
    } = options;

    if (!productName) {
      return [];
    }


    const canonicalSource = canonicalizeMarketplaceName(sourceMarketplace);
    const enrichments = [];

    console.log("targets---->", targets)

    for (const target of targets) {
      const canonicalTarget = canonicalizeMarketplaceName(target);
      if (!canonicalTarget) continue;
      if (canonicalTarget === canonicalSource) continue;
      if (existingUrls[canonicalTarget]) continue;
      if (!this.supportsMarketplaceSearch(canonicalTarget)) continue;

      try {
        const match = await this.findMarketplaceMatchByName(canonicalTarget, productName, { minScore, limit: searchLimit });
        if (match && match.scrapedData && match.scrapedData.price) {
          enrichments.push(match);
        }
      } catch (error) {
        console.error(`⚠️  Enrichment failed for ${canonicalTarget}:`, error.message);
      }
    }

    return enrichments;
  }

}

module.exports = new ScraperService();