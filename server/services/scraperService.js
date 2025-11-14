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
        // console.log(`🔍 Scraping Flipkart: ${url}`);

        // Set extra headers to appear more like a real browser
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        });

        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // Check if we were redirected or blocked
        const currentUrl = page.url();
        // console.log(`📍 Current URL after navigation: ${currentUrl}`);

        // Check if URL is correct product page
        if (!currentUrl.includes('/p/') && !currentUrl.includes('/product/')) {
          console.warn(`⚠️ URL doesn't look like a product page: ${currentUrl}`);
          console.warn(`   Expected URL format: https://www.flipkart.com/product-name/p/itm...`);
        }

        // Wait for page to load completely
        await page.waitForTimeout(10000);

        // Check page title to see if we're on the right page
        const pageTitle = await page.title();
        // console.log(`📄 Page title: ${pageTitle}`);

        // Check if we're on homepage or wrong page
        if (pageTitle.includes('Online Shopping') && !pageTitle.includes('Buy') && !currentUrl.includes('/p/')) {
          console.error('❌ Redirected to Flipkart homepage - URL might be incorrect or page blocked');
          throw new Error('Redirected to homepage - product page not accessible');
        }

        // Check if page contains product-related content
        const pageInfo = await page.evaluate(() => {
          const bodyText = document.body.innerText || '';
          const hasPrice = bodyText.includes('₹') || bodyText.includes('Price');
          const hasTitle = document.querySelector('h1, .B_NuCI, span.B_NuCI') !== null;
          const hasProductElements = document.querySelector('.B_NuCI, .Nx9bqj, ._30jeq3') !== null;
          const url = window.location.href;
          const title = document.title;

          // Check for common Flipkart product page indicators
          const isProductPage = url.includes('/p/') || url.includes('/product/');

          return {
            hasPrice,
            hasTitle,
            hasProductElements,
            isProductPage,
            url,
            title,
            bodyTextLength: bodyText.length,
            sampleText: bodyText.substring(0, 200)
          };
        });

        // console.log('📊 Page Analysis:');
        // console.log('   URL:', pageInfo.url);
        // console.log('   Title:', pageInfo.title);
        // console.log('   Is Product Page:', pageInfo.isProductPage);
        // console.log('   Has Price Symbol:', pageInfo.hasPrice);
        // console.log('   Has Title Element:', pageInfo.hasTitle);
        // console.log('   Has Product Elements:', pageInfo.hasProductElements);
        // console.log('   Body Text Length:', pageInfo.bodyTextLength);

        if (!pageInfo.isProductPage) {
          console.error('❌ Not on a product page - URL structure might be wrong');
          throw new Error('Not on a Flipkart product page');
        }

        if (!pageInfo.hasProductElements && !pageInfo.hasTitle && pageInfo.bodyTextLength < 500) {
          console.warn('⚠️ Page may not have loaded correctly - no product content detected');
          console.warn('   This might be a redirect, login page, or bot detection page');
          throw new Error('Product page content not detected - page may be blocked or redirected');
        }

        // Try to close any popups or modals
        try {
          const closeButtons = [
            'button._2KpZ6l._2doB4z',
            'button[class*="close"]',
            '[data-testid="close"]',
            'button._2KpZ6l',
            '.doB4z'
          ];
          for (const selector of closeButtons) {
            try {
              await page.click(selector, { timeout: 1000 });
              await page.waitForTimeout(1000);
              break;
            } catch (e) {
              // Try next selector
            }
          }
        } catch (e) {
          // Ignore if no close button found
        }

        // Scroll to trigger lazy loading
        await page.evaluate(() => {
          window.scrollTo(0, 500);
        });
        await page.waitForTimeout(2000);

        // Wait for any of the key elements to appear
        try {
          await Promise.race([
            page.waitForSelector('.B_NuCI', { timeout: 5000 }),
            page.waitForSelector('h1', { timeout: 5000 }),
            page.waitForSelector('.Nx9bqj', { timeout: 5000 }),
            page.waitForSelector('._30jeq3', { timeout: 5000 })
          ]);
        } catch (e) {
          // console.log('⚠️ Key selectors not found, will try fallback methods');
        }

        const productData = await page.evaluate(() => {
          // console.log('🔍 Starting Flipkart evaluation...');
          // console.log('Page URL:', window.location.href);
          // console.log('Page title:', document.title);

          // Debug: Log all elements with class containing "B_NuCI" or price-related classes
          const debugElements = {
            titleElements: Array.from(document.querySelectorAll('[class*="B_NuCI"], h1')).map(el => ({
              tag: el.tagName,
              class: el.className,
              text: el.textContent?.substring(0, 50)
            })),
            priceElements: Array.from(document.querySelectorAll('[class*="Nx9bqj"], [class*="_30jeq3"], [class*="price"]')).map(el => ({
              tag: el.tagName,
              class: el.className,
              text: el.textContent?.substring(0, 50)
            }))
          };
          // console.log('🔍 Debug - Title elements found:', debugElements.titleElements.length);
          // console.log('🔍 Debug - Price elements found:', debugElements.priceElements.length);

          // Try to extract from window object (Flipkart sometimes stores data here)
          let title = null;
          let price = null;
          let image = null;

          try {
            // Check window.__INITIAL_STATE__ or similar
            if (window.__INITIAL_STATE__) {
              const state = window.__INITIAL_STATE__;
              if (state.pageData?.productData?.name) {
                title = state.pageData.productData.name;
              }
              if (state.pageData?.productData?.pricing?.finalPrice) {
                price = parseFloat(state.pageData.productData.pricing.finalPrice);
              }
            }

            // Check window.__PRELOADED_STATE__
            if (window.__PRELOADED_STATE__) {
              const state = window.__PRELOADED_STATE__;
              if (state?.product?.name && !title) {
                title = state.product.name;
              }
              if (state?.product?.price && !price) {
                price = parseFloat(state.product.price);
              }
            }
          } catch (e) {
            // console.log('⚠️ Error accessing window state:', e.message);
          }

          // Try multiple selectors for title
          if (!title) {
            const titleSelectors = [
              '.B_NuCI',
              'span.B_NuCI',
              'h1[class*="title"]',
              'h1',
              '[data-testid="product-title"]',
              '.product-title',
              'h1 span',
              '[class*="B_NuCI"]',
              'h1[class*="B_NuCI"]'
            ];

            for (const selector of titleSelectors) {
              const element = document.querySelector(selector);
              if (element?.textContent?.trim()) {
                title = element.textContent.trim();
                // console.log(`✅ Found title with selector: ${selector}`);
                break;
              }
            }
          }

          // Try to extract from JSON-LD structured data first
          if (!price) {
            try {
              const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
              for (const script of jsonLdScripts) {
                try {
                  const data = JSON.parse(script.textContent);
                  if (data.offers?.price) {
                    price = parseFloat(data.offers.price);
                    // console.log(`✅ Found price in JSON-LD: ${price}`);
                    break;
                  }
                  if (data.offers && Array.isArray(data.offers)) {
                    for (const offer of data.offers) {
                      if (offer.price) {
                        price = parseFloat(offer.price);
                        // console.log(`✅ Found price in JSON-LD offers array: ${price}`);
                        break;
                      }
                    }
                  }
                  if (Array.isArray(data)) {
                    for (const item of data) {
                      if (item.offers?.price) {
                        price = parseFloat(item.offers.price);
                        // console.log(`✅ Found price in JSON-LD array: ${price}`);
                        break;
                      }
                    }
                  }
                } catch (e) {
                  // Ignore invalid JSON
                }
              }
            } catch (e) {
              // console.log('⚠️ Error parsing JSON-LD:', e.message);
            }
          }

          // Try multiple selectors for price
          if (!price) {
            const priceSelectors = [
              '.Nx9bqj',
              '._30jeq3._16Jk6d',
              '._30jeq3',
              'div._30jeq3',
              'span._30jeq3',
              '[class*="Nx9bqj"]',
              '[class*="_30jeq3"]',
              '[class*="price"]',
              '[data-testid="price"]',
              '.price',
              'span[class*="price"]',
              'div[class*="price"]',
              'div[class*="_25b18c"]',
              'span[class*="_25b18c"]',
              '[itemprop="price"]'
            ];

            for (const selector of priceSelectors) {
              const priceElement = document.querySelector(selector);
              if (priceElement?.textContent) {
                const priceText = priceElement.textContent.replace(/[^\d.]/g, '');
                if (priceText && !isNaN(parseFloat(priceText)) && parseFloat(priceText) > 100) {
                  price = parseFloat(priceText);
                  // console.log(`✅ Found price with selector: ${selector}, value: ${price}`);
                  break;
                }
              }
            }
          }

          // If no price found with selectors, try to find price in text content
          if (!price) {
            // console.log('🔍 Trying to find price in text content...');
            const allText = document.body.innerText || document.body.textContent || '';
            const pricePatterns = [
              /₹[\s]*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)/g,
              /(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)[\s]*₹/g,
              /price[\s]*:?[\s]*₹?[\s]*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)/gi,
              /₹[\s]*(\d{4,})/g
            ];

            for (const pattern of pricePatterns) {
              const matches = Array.from(allText.matchAll(pattern));
              if (matches.length > 0) {
                const validPrices = matches
                  .map(match => {
                    const priceText = match[1] ? match[1].replace(/,/g, '') : match[0].replace(/[^\d.]/g, '');
                    const priceValue = parseFloat(priceText);
                    return { match: match[0], priceValue };
                  })
                  .filter(item => item.priceValue && item.priceValue > 100 && item.priceValue < 10000000)
                  .sort((a, b) => b.priceValue - a.priceValue);

                if (validPrices.length > 0) {
                  price = validPrices[0].priceValue;
                  // console.log(`✅ Found price in text: ${validPrices[0].match} -> ${price}`);
                  break;
                }
              }
            }
          }

          // Try multiple selectors for image
          if (!image) {
            const imageSelectors = [
              '._396cs4._2amPT._3qGm1',
              'img[class*="_396cs4"]',
              'img[class*="q6DCl0"]',
              'img[class*="image"]',
              'img[alt*="product"]',
              '.product-image img',
              'img[data-testid="product-image"]',
              'img[alt*="iPhone"]',
              'img[alt*="Apple"]',
              'img[src*="rukmini1.flixcart.com"]',
              'img[src*="flipkart"]',
              '.CXW8mj img',
              'div[class*="CXW8mj"] img'
            ];

            for (const selector of imageSelectors) {
              const imgElement = document.querySelector(selector);
              if (imgElement?.src && !imgElement.src.includes('placeholder') && !imgElement.src.includes('logo')) {
                image = imgElement.src;
                // Clean up image URL
                image = image.split('?')[0]; // Remove query params
                // console.log(`✅ Found image with selector: ${selector}`);
                break;
              }
            }
          }

          // If no image found with selectors, try to get from JSON-LD structured data
          if (!image) {
            // console.log('🔍 Trying to find image in JSON-LD structured data...');
            const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of jsonLdScripts) {
              try {
                const data = JSON.parse(script.textContent);
                if (data.image) {
                  image = data.image;
                  // console.log(`✅ Found image in JSON-LD: ${image}`);
                  break;
                }
                // Handle array of structured data
                if (Array.isArray(data)) {
                  for (const item of data) {
                    if (item.image) {
                      image = item.image;
                      // console.log(`✅ Found image in JSON-LD array: ${image}`);
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
              // console.log(`✅ Found availability with selector: ${selector}, value: ${text}`);
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
                // console.log(`✅ Found discount with selector: ${selector}, value: ${discount}`);
                break;
              }
            }
          }

          // console.log('🔍 Flipkart evaluation result:', { title, price, image, availability, discount });

          return {
            title,
            price,
            image,
            availability,
            discount
          };
        });

        // console.log('🔍 Flipkart scraping result:', productData);

        // Don't throw error if price is missing - return product with null price
        // This allows the product to be saved and price can be updated later
        if (!productData.price) {
          console.warn('⚠️ Could not extract price from Flipkart, but product info found');
          console.warn('   Product will be saved without price. Price can be updated later.');
        }

        // Log image extraction details
        if (productData.image) {
          // console.log('✅ Image extracted successfully:', productData.image);
        } else {
          // console.log('⚠️ No image found during scraping');
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
          } else if (url.includes('reliancedigital.')) {
            return await this.scrapeRelianceDigital(url);
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
    if (url.includes('reliancedigital.')) return 'reliancedigital';
    return 'unknown';
  }

  /**
   * Scrape product from Reliance Digital
   */
  async scrapeRelianceDigital(url) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();

      try {
        // console.log(`🔍 Scraping Reliance Digital: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        const productData = await page.evaluate(() => {
          const titleSelectors = [
            '.pdp__product-title',
            'h1[itemprop="name"]',
            'h1'
          ];
          let title = null;
          for (const selector of titleSelectors) {
            const el = document.querySelector(selector);
            if (el?.textContent?.trim()) {
              title = el.textContent.trim();
              break;
            }
          }

          const priceSelectors = [
            '.pdp__product-price',
            '.pdp__price',
            'span[itemprop="price"]',
            '.final-price'
          ];
          let price = null;
          for (const selector of priceSelectors) {
            const el = document.querySelector(selector);
            if (el?.textContent) {
              const priceText = el.textContent.replace(/[^\d.]/g, '');
              if (priceText && !isNaN(parseFloat(priceText))) {
                price = parseFloat(priceText);
                break;
              }
            }
          }

          // Fallback: search for price patterns in the entire body text
          if (!price) {
            const bodyText = document.body.innerText;
            const priceRegex = /₹\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/;
            const match = bodyText.match(priceRegex);
            if (match && match[1]) {
              price = parseFloat(match[1].replace(/,/g, ''));
            }
          }

          const imageSelectors = [
            '.pdp__product-image img',
            '.pdp__images img',
            'img[class*="product-image"]',
            'img[itemprop="image"]'
          ];
          let image = null;
          for (const selector of imageSelectors) {
            const el = document.querySelector(selector);
            if (el?.src) {
              image = el.src;
              break;
            }
          }

          const availabilitySelectors = [
            '.pdp__stock-status',
            '.stock-status',
            '[class*="stock"]'
          ];
          let availability = 'in_stock';
          for (const selector of availabilitySelectors) {
            const el = document.querySelector(selector);
            if (el?.textContent?.trim().toLowerCase().includes('out of stock')) {
              availability = 'out_of_stock';
              break;
            }
          }

          const discountElement = document.querySelector('.pdp__product-discount, .discount');
          const discount = discountElement?.textContent?.replace(/[^\d]/g, '') || 0;

          return {
            title,
            price,
            image,
            availability,
            discount: parseInt(discount) || 0
          };
        });

        await context.close();
        return {
          ...productData,
          source: 'reliancedigital'
        };
      } catch (error) {
        console.error('❌ Reliance Digital scraping error:', error.message);
        await context.close().catch(() => { });
        throw error;
      }
    });
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
        // console.log('Reviews not supported for this platform yet');
        return [];
      }
    } catch (error) {
      console.error('Review scraping error:', error);
      return [];
    }
  }

  /**
   * Search for products on Amazon by name
   */
  async searchAmazon(productName, limit = 5) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();

      try {
        const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(productName)}`;
        // console.log(`🔍 Searching Amazon for: ${productName}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        const results = await page.evaluate((maxResults) => {
          const products = [];
          const cards = Array.from(document.querySelectorAll('[data-asin]')).slice(0, maxResults * 2);

          cards.forEach(card => {
            const asin = card.getAttribute('data-asin');
            if (!asin || asin === '') return;

            const titleEl = card.querySelector('h2 a span, h2 span');
            const title = titleEl?.textContent?.trim();

            const linkEl = card.querySelector('h2 a');
            const href = linkEl?.getAttribute('href');
            const url = href ? (href.startsWith('http') ? href : `https://www.amazon.in${href}`) : null;

            const priceEl = card.querySelector('.a-price-whole, .a-offscreen');
            const priceText = priceEl?.textContent?.replace(/[^\d.]/g, '');
            const price = priceText ? parseFloat(priceText) : null;

            if (title && url) {
              products.push({ title, url, price, asin });
            }
          });

          return products.slice(0, maxResults);
        }, limit);

        await context.close();
        // console.log(`✅ Found ${results.length} Amazon results`);
        return results;
      } catch (error) {
        console.error('❌ Amazon search error:', error.message);
        await context.close().catch(() => { });
        return [];
      }
    });
  }

  /**
   * Search for products on Flipkart by name
   */
  async searchFlipkart(productName, limit = 5) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();

      try {
        const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(productName)}`;
        // console.log(`🔍 Searching Flipkart for: ${productName}`);
        // console.log(`   URL: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // console.log(`✅ Page loaded: ${page.url()}`);

        await page.waitForTimeout(5000);

        // Close login popup if present
        try {
          await page.click('button._2KpZ6l._2doB4z, button._2KpZ6l', { timeout: 2000 });
          // console.log('✅ Closed login popup');
          await page.waitForTimeout(1000);
        } catch (e) {
          // console.log('ℹ️  No login popup found');
        }

        // Wait for search results to load
        try {
          await page.waitForSelector('.DOjaWF, div[class*="DOjaWF"], div[data-id]', { timeout: 10000 });
          // console.log('✅ Search results loaded');
        } catch (e) {
          console.warn('⚠️  Search results selector not found, will try anyway');
        }

        // console.log('🔍 Starting page evaluation...');
        let results;
        try {
          // First, check if we can access the page
          const pageTitle = await page.title();
          const pageUrl = page.url();
          // console.log(`   Page title: ${pageTitle}`);
          // console.log(`   Page URL: ${pageUrl}`);

          // Check if we're on the right page (not redirected)
          if (!pageUrl.includes('flipkart.com/search')) {
            console.warn(`⚠️  Unexpected page URL: ${pageUrl}`);
          }

          results = await page.evaluate((maxResults) => {
            const products = [];
            const debug = { steps: [] };

            // Use the correct Flipkart search result structure
            // Selector: DOjaWF gdgoEp > cPHDOP col-12-12 > a href
            // Try multiple selector patterns to find product cards
            let cards = Array.from(document.querySelectorAll('.DOjaWF.gdgoEp'));
            debug.steps.push(`Found ${cards.length} cards with .DOjaWF.gdgoEp`);

            if (cards.length === 0) {
              cards = Array.from(document.querySelectorAll('div[class*="DOjaWF"]'));
              debug.steps.push(`Found ${cards.length} cards with [class*="DOjaWF"]`);
            }
            if (cards.length === 0) {
              cards = Array.from(document.querySelectorAll('div[class*="gdgoEp"]'));
              debug.steps.push(`Found ${cards.length} cards with [class*="gdgoEp"]`);
            }
            if (cards.length === 0) {
              // Fallback to data-id selector
              cards = Array.from(document.querySelectorAll('div[data-id]'));
              debug.steps.push(`Found ${cards.length} cards with [data-id]`);
            }
            cards = cards.slice(0, maxResults * 2);
            debug.steps.push(`Processing ${cards.length} cards`);

            cards.forEach((card, index) => {
              // Skip first 2 cards (indices 0 and 1), start from 3rd card (index 2)
              if (index < 2) {
                debug.steps.push(`Skipping card ${index + 1} (index ${index})`);
                return;
              }

              debug.steps.push(`Processing card ${index + 1}/${cards.length} (3rd card onwards)`);

              // Find the cPHDOP col-12-12 container
              // Structure: DOjaWF gdgoEp > DOjaWF YJG4Cf col-12-12 > cPHDOP col-12-12
              const allColContainers = card.querySelectorAll('.cPHDOP.col-12-12, [class*="cPHDOP"][class*="col-12-12"]');
              debug.steps.push(`  Card ${index + 1}: Found ${allColContainers.length} cPHDOP col-12-12 elements`);

              // Pick the one that contains the product link
              let colContainer = null;
              for (let i = 0; i < allColContainers.length; i++) {
                const container = allColContainers[i];
                // Check if this container has the product link (a.CGtC98 with /p/ in href)
                const linkEl = container.querySelector('a.CGtC98[href*="/p/"], a[class*="CGtC98"][href*="/p/"]');
                if (linkEl) {
                  colContainer = container;
                  debug.steps.push(`  Card ${index + 1}: Found colContainer at index ${i} with product link`);
                  break;
                }
              }

              // If not found, try the 2nd one (index 1) as fallback
              if (!colContainer && allColContainers.length > 1) {
                colContainer = allColContainers[1];
                debug.steps.push(`  Card ${index + 1}: Using colContainer at index 1 as fallback`);
              } else if (!colContainer && allColContainers.length > 0) {
                colContainer = allColContainers[0];
                debug.steps.push(`  Card ${index + 1}: Using colContainer at index 0 as fallback`);
              }

              debug.steps.push(`  Card ${index + 1}: colContainer found: ${!!colContainer}`);

              if (!colContainer) {
                // Fallback: try to find link directly in card
                const linkEl = card.querySelector('a.CGtC98[href*="/p/"], a[class*="CGtC98"][href*="/p/"]');
                debug.steps.push(`  Card ${index + 1}: linkEl (fallback) found: ${!!linkEl}`);
                if (!linkEl) {
                  debug.steps.push(`  Card ${index + 1}: No link found, skipping`);
                  return;
                }

                let href = linkEl.getAttribute('href');
                debug.steps.push(`  Card ${index + 1}: href (fallback) = ${href}`);
                if (!href) {
                  debug.steps.push(`  Card ${index + 1}: No href (fallback), skipping`);
                  return;
                }

                // Clean up URL
                let url = null;
                if (href.startsWith('http')) {
                  const urlObj = new URL(href);
                  url = `${urlObj.origin}${urlObj.pathname}`;
                } else {
                  href = href.split('?')[0].split('#')[0];
                  if (!href.startsWith('/')) href = '/' + href;
                  if (href.includes('/p/')) {
                    url = `https://www.flipkart.com${href}`;
                  } else {
                    debug.steps.push(`  Card ${index + 1}: href doesn't contain /p/, skipping`);
                    return;
                  }
                }

                if (!url || !url.includes('/p/')) {
                  debug.steps.push(`  Card ${index + 1}: Invalid URL, skipping`);
                  return;
                }

                const titleEl = card.querySelector('.KzDlHZ, .wjcEIp, .IRpwTa, [title], a[href*="/p/"]');
                const title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || '';

                const priceEl = card.querySelector('.Nx9bqj, ._30jeq3, [class*="Nx9bqj"]');
                const priceText = priceEl?.textContent?.replace(/[^\d.]/g, '');
                const price = priceText ? parseFloat(priceText) : null;

                if (title && url) {
                  products.push({ title, url, price });
                  debug.steps.push(`  Card ${index + 1}: Added product - ${title.substring(0, 50)}...`);
                } else {
                  debug.steps.push(`  Card ${index + 1}: Missing title or url, skipping`);
                }
                return;
              }

              // Find link in the col container
              // Structure: cPHDOP col-12-12 > _75nlfW > data-id div > tUxRFH > a.CGtC98
              // Look for a.CGtC98 with /p/ in href first (the actual product link)
              let linkEl = colContainer.querySelector('a.CGtC98[href*="/p/"], a[class*="CGtC98"][href*="/p/"]');
              if (!linkEl) {
                // Fallback to other selectors
                linkEl = colContainer.querySelector('a[href*="/p/"]') ||
                  colContainer.querySelector('a[href*="/product/"]') ||
                  colContainer.querySelector('a.CGtC98') ||
                  colContainer.querySelector('a');
              }

              debug.steps.push(`  Card ${index + 1}: linkEl (in colContainer) found: ${!!linkEl}`);
              if (!linkEl) {
                debug.steps.push(`  Card ${index + 1}: No link in colContainer, skipping`);
                return;
              }

              let href = linkEl.getAttribute('href');
              debug.steps.push(`  Card ${index + 1}: href = ${href}`);
              if (!href) {
                debug.steps.push(`  Card ${index + 1}: No href, skipping`);
                return;
              }

              // Clean up the URL
              let url = null;

              // If it's already a full URL
              if (href.startsWith('http')) {

                // Remove query parameters and fragments, but keep the path
                const urlObj = new URL(href);
                url = `${urlObj.origin}${urlObj.pathname}`;
              } else {
                debug.steps.push(`  Card ${index + 1}: href refactored ${href}`);
                // Check if it's a product page URL
                if (href.includes('/p/') || href.includes('/product/')) {
                  url = `https://www.flipkart.com${href}`;
                } else {
                  // Skip if it doesn't look like a product URL
                  debug.steps.push(`  Card ${index + 1}: href doesn't contain /p/ or /product/, skipping`);
                  return;
                }
              }

              // Final validation - URL must contain /p/ for product pages
              if (!url || !url.includes('/p/')) {
                debug.steps.push(`  Card ${index + 1}: Final URL validation failed, skipping`);
                return;
              }

              // Try multiple selectors for title
              const titleEl = colContainer.querySelector('.KzDlHZ, .wjcEIp, .IRpwTa, [title]') ||
                card.querySelector('.KzDlHZ, .wjcEIp, .IRpwTa, [title]') ||
                linkEl;
              const title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || linkEl.textContent?.trim() || '';
              debug.steps.push(`  Card ${index + 1}: title = ${title ? title.substring(0, 50) + '...' : 'NOT FOUND'}`);

              // Try multiple selectors for price
              const priceEl = colContainer.querySelector('.Nx9bqj, ._30jeq3, [class*="Nx9bqj"]') ||
                card.querySelector('.Nx9bqj, ._30jeq3, [class*="Nx9bqj"]');
              const priceText = priceEl?.textContent?.replace(/[^\d.]/g, '');
              const price = priceText ? parseFloat(priceText) : null;
              debug.steps.push(`  Card ${index + 1}: price = ${price || 'NOT FOUND'}`);

              if (title && url) {
                products.push({ title, url, price });
                debug.steps.push(`  Card ${index + 1}: ✅ Added product - ${title.substring(0, 50)}...`);
              } else {
                debug.steps.push(`  Card ${index + 1}: ❌ Missing title or url (title: ${!!title}, url: ${!!url}), skipping`);
              }
            });

            return { products: products.slice(0, maxResults), debug };
          }, limit);

          // Log debug information
          if (results && results.debug) {
            // results.debug.steps.forEach(step => console.log(`   ${step}`));
            // console.log(`✅ Found ${results.products.length} products`);
            results = results.products;
          } else {
            // console.log(`✅ Page evaluation completed, found ${results?.length || 0} results`);
          }
        } catch (evalError) {
          console.error('❌ Error in page.evaluate():', evalError);
          // Try to get page content for debugging
          const pageContent = await page.content();
          // console.log(`   Page URL: ${page.url()}`);
          // console.log(`   Page title: ${await page.title()}`);
          // console.log(`   Page content length: ${pageContent.length}`);
          throw evalError;
        }

        await context.close();
        // console.log(`✅ Found ${results.length} Flipkart results`);
        return results;
      } catch (error) {
        console.error('❌ Flipkart search error:', error.message);
        await context.close().catch(() => { });
        return [];
      }
    });
  }

  /**
   * Search for products on Reliance Digital by name
   */
  async searchRelianceDigital(productName, limit = 5) {
    return await this.withRetry(async () => {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      const page = await context.newPage();

      try {
        // console.log(`🔍 Searching Reliance Digital for: ${productName} via onsite search`);

        await page.goto('https://www.reliancedigital.in/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        // Focus the global search box ("Search Products & Brands")
        try {
          await page.waitForSelector('input[placeholder*="Search Products & Brands"]', { timeout: 8000 });
        } catch (error) {
          console.warn('⚠️  Reliance Digital search input not immediately available, retrying after short wait');
        }

        const searchInput = await page.$('input[placeholder*="Search Products & Brands"]');
        if (!searchInput) {
          throw new Error('Reliance Digital search input not found');
        }

        await searchInput.fill('');
        await searchInput.type(productName, { delay: 50 });
        await searchInput.press('Enter');

        // Wait for results page to load
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => { });
        await page.waitForTimeout(2000);

        // Wait for either product cards or a "no results" indicator
        const waitForResults = async () => {
          await Promise.race([
            page.waitForSelector('.main-grid .product-card', { timeout: 12000 }),
            page.waitForSelector('.no-products, .no-results, .search-no-result', { timeout: 12000 })
          ]);
        };

        try {
          await waitForResults();
        } catch (e) {
          console.warn('⚠️  Reliance Digital search results still missing, reloading and retrying once');
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);
          await waitForResults().catch(() => { });
        }

        // Extra safeguard: if still no cards, attempt direct search URL as fallback
        let hasCards = await page.$('.main-grid .product-card');
        if (!hasCards) {
          const fallbackUrl = `https://www.reliancedigital.in/products?q=${encodeURIComponent(productName)}&page_no=1&page_size=12&page_type=number`;
          console.warn(`⚠️  No cards after onsite search, navigating to fallback URL: ${fallbackUrl}`);
          await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);
          await Promise.race([
            page.waitForSelector('.main-grid .product-card', { timeout: 12000 }),
            page.waitForSelector('.no-products, .no-results, .search-no-result', { timeout: 12000 })
          ]).catch(() => {
            console.warn('⚠️  Fallback Reliance Digital URL still did not produce product cards');
          });
          hasCards = await page.$('.main-grid .product-card');
        }

        const evalResult = await page.evaluate(({ maxResults, searchQuery, minSimilarity }) => {
          const products = [];
          const debug = { steps: [] };

          // New Reliance Digital DOM structure (main-grid > product-card)
          let cards = Array.from(document.querySelectorAll('.main-grid .product-card'));
          debug.steps.push(`Found ${cards.length} cards with .main-grid .product-card`);

          if (cards.length === 0) {
            cards = Array.from(document.querySelectorAll('[class*="product-card"]'));
          }

          if (cards.length === 0) {
            cards = Array.from(document.querySelectorAll('.sp__product'));
          }

          cards = cards.slice(0, maxResults * 3);
          debug.steps.push(`Found ${cards.length} cards for Reliance Digital search`);

          const normalize = (text = '') =>
            text
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, ' ')
              .split(/\s+/)
              .filter(w => w.length > 2);

          const calculateSimilarity = (a, b) => {
            const words1 = normalize(a);
            const words2 = normalize(b);
            if (!words1.length || !words2.length) return 0;
            const commons = words1.filter(w => words2.includes(w));
            return commons.length / Math.max(words1.length, words2.length);
          };

          cards.forEach((card, index) => {
            debug.steps.push(`Processing card ${index + 1}/${cards.length}`);

            // Link selection
            let linkEl = card.querySelector('a.product-card-image, a[class*="product-card-image"]');
            if (!linkEl) {
              linkEl = card.querySelector('a[href*="/product/"], a[href*="/products/"], a[href*="/p/"]');
            }

            if (!linkEl) {
              debug.steps.push(`  Card ${index + 1}: No link found, skipping`);
              return;
            }

            const href = linkEl.getAttribute('href');
            const url = href ? (href.startsWith('http') ? href : `https://www.reliancedigital.in${href}`) : null;
            debug.steps.push(`  Card ${index + 1}: url found: ${url}`);

            // Title selection
            const titleEl =
              card.querySelector('.card-info-container h2, .product-card-details h2, .header-area h2, .product-card-title, a[title]') ||
              linkEl;
            const title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || '';

            // Price selection
            const priceEl =
              card.querySelector('.product-card-price, .price-container .price, .pdp__product-price') ||
              card.querySelector('[class*="price"]');
            const priceText = priceEl?.textContent?.replace(/[^\d.]/g, '');
            const price = priceText ? parseFloat(priceText) : null;

            const similarity = calculateSimilarity(searchQuery, title);
            debug.steps.push(`  Card ${index + 1}: similarity ${(similarity * 100).toFixed(1)}%`);

            if (title && url && similarity >= minSimilarity) {
              products.push({ title, url, price });
              debug.steps.push(
                `  Card ${index + 1}: ✅ Added product "${title.substring(0, 60)}" with price ${price || 'N/A'}`
              );
            } else {
              debug.steps.push(
                `  Card ${index + 1}: ❌ Skipped (title=${!!title}, url=${!!url}, similarity ${(similarity * 100).toFixed(1)}%)`
              );
            }
          });

          return { products: products.slice(0, maxResults), debug };
        }, { maxResults: limit, searchQuery: productName, minSimilarity: 0.6 });

        await context.close();

        let products = evalResult;
        if (evalResult && evalResult.debug) {
          // evalResult.debug.steps.forEach(step => console.log(`   ${step}`));
          // console.log(`✅ Result Found ${evalResult.products.length} products`);
          products = evalResult.products;
        } else if (Array.isArray(evalResult)) {
          // console.log(`✅ Page evaluation completed, found ${evalResult.length} results`);
          products = evalResult;
        } else {
          // console.log('⚠️  Page evaluation returned unexpected format');
          products = [];
        }

        // console.log(`✅ Found ${products.length} Reliance Digital results`);
        return products;
      } catch (error) {
        console.error('❌ Reliance Digital search error:', error.message);
        await context.close().catch(() => { });
        return [];
      }
    });
  }

  /**
   * Calculate similarity score between two product names
   */
  calculateSimilarity(name1, name2) {
    if (!name1 || !name2) return 0;

    const words1 = name1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = name2.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const commonWords = words1.filter(w => words2.includes(w));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);

    return similarity;
  }

  /**
   * Find the same product across all marketplaces
   */
  async findProductAcrossMarketplaces(productName, sourceMarketplace, existingUrls = {}) {
    const results = {
      amazon: null,
      flipkart: null,
      reliancedigital: null
    };

    // console.log(`\n🔍 Finding "${productName}" across marketplaces (source: ${sourceMarketplace})`);

    // Search on Amazon if not already have URL
    if (sourceMarketplace !== 'amazon' && !existingUrls.amazon) {
      try {
        const amazonResults = await this.searchAmazon(productName, 5);
        if (amazonResults.length > 0) {
          // Find best match
          let bestMatch = amazonResults[0];
          let bestScore = this.calculateSimilarity(productName, bestMatch.title);

          for (const result of amazonResults) {
            const score = this.calculateSimilarity(productName, result.title);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = result;
            }
          }

          if (bestScore >= 0.5) { // At least 50% similarity
            // Scrape the product page to get accurate price
            try {
              const productInfo = await this.getProductInfo(bestMatch.url);

              // Only use scraped data, no fallback
              results.amazon = {
                url: bestMatch.url,
                title: productInfo.name || bestMatch.title,
                price: productInfo.price || null,
                similarity: bestScore
              };

              if (productInfo.price) {
                // console.log(`✅ Found on Amazon: ${bestMatch.title} (${(bestScore * 100).toFixed(0)}% match) - ₹${productInfo.price}`);
              } else {
                // console.log(`⚠️  Found on Amazon: ${bestMatch.title} (${(bestScore * 100).toFixed(0)}% match) - Price not available (scraping failed)`);
              }
            } catch (error) {
              // console.log(`⚠️  Found Amazon URL but failed to scrape: ${error.message}`);
              results.amazon = {
                url: bestMatch.url,
                title: bestMatch.title,
                price: null, // Only show what we actually scraped
                similarity: bestScore
              };
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error searching Amazon: ${error.message}`);
      }
    }

    // Search on Flipkart if not already have URL
    if (sourceMarketplace !== 'flipkart' && !existingUrls.flipkart) {
      try {
        const flipkartResults = await this.searchFlipkart(productName, 5);
        if (flipkartResults.length > 0) {
          let bestMatch = flipkartResults[0];
          let bestScore = this.calculateSimilarity(productName, bestMatch.title);

          for (const result of flipkartResults) {
            const score = this.calculateSimilarity(productName, result.title);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = result;
            }
          }

          if (bestScore >= 0.5) {
            try {
              const productInfo = await this.getProductInfo(bestMatch.url);

              // Only use scraped data, no fallback
              results.flipkart = {
                url: bestMatch.url,
                title: productInfo.name || bestMatch.title,
                price: productInfo.price || null,
                similarity: bestScore
              };

              if (productInfo.price) {
                // console.log(`✅ Found on Flipkart: ${bestMatch.title} (${(bestScore * 100).toFixed(0)}% match) - ₹${productInfo.price}`);
              } else {
                // console.log(`⚠️  Found on Flipkart: ${bestMatch.title} (${(bestScore * 100).toFixed(0)}% match) - Price not available (scraping failed)`);
              }
            } catch (error) {
              // console.log(`⚠️  Found Flipkart URL but failed to scrape: ${error.message}`);
              results.flipkart = {
                url: bestMatch.url,
                title: bestMatch.title,
                price: null, // Only show what we actually scraped
                similarity: bestScore
              };
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error searching Flipkart: ${error.message}`);
      }
    }

    // Search on Reliance Digital if not already have URL
    if (sourceMarketplace !== 'reliancedigital' && !existingUrls.reliancedigital) {
      try {
        const rdResults = await this.searchRelianceDigital(productName, 5);
        if (rdResults.length > 0) {
          let bestMatch = rdResults[0];
          let bestScore = this.calculateSimilarity(productName, bestMatch.title);

          for (const result of rdResults) {
            const score = this.calculateSimilarity(productName, result.title);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = result;
            }
          }

          if (bestScore >= 0.5) {
            try {
              const productInfo = await this.getProductInfo(bestMatch.url);

              // Only use scraped data, no fallback
              results.reliancedigital = {
                url: bestMatch.url,
                title: productInfo.name || bestMatch.title,
                price: productInfo.price || null,
                similarity: bestScore
              };

              if (productInfo.price) {
                // console.log(`✅ Found on Reliance Digital: ${bestMatch.title} (${(bestScore * 100).toFixed(0)}% match) - ₹${productInfo.price}`);
              } else {
                // console.log(`⚠️  Found on Reliance Digital: ${bestMatch.title} (${(bestScore * 100).toFixed(0)}% match) - Price not available (scraping failed)`);
              }
            } catch (error) {
              // console.log(`⚠️  Found Reliance Digital URL but failed to scrape: ${error.message}`);
              results.reliancedigital = {
                url: bestMatch.url,
                title: bestMatch.title,
                price: null, // Only show what we actually scraped
                similarity: bestScore
              };
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error searching Reliance Digital: ${error.message}`);
      }
    }


    console.log("final comparision results", results);

    return results;
  }

}

module.exports = new ScraperService();