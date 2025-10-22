const { chromium } = require('playwright');

async function debugFlipkart() {
  const browser = await chromium.launch({ 
    headless: false, // Show browser for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('🔍 Navigating to Flipkart...');
    await page.goto('https://www.flipkart.com/apple-iphone-16-ultramarine-256-gb/p/itm03cecd3e85111', { 
      waitUntil: 'networkidle', 
      timeout: 30000 
    });
    
    console.log('⏳ Waiting for page to load...');
    await page.waitForTimeout(5000);
    
    // Try to close any popups
    try {
      await page.click('button[class*="close"], ._2KpZ6l._2doB4z, [data-testid="close"]', { timeout: 2000 });
      console.log('✅ Closed popup');
    } catch (e) {
      console.log('ℹ️ No popup to close');
    }
    
    console.log('🔍 Analyzing page content...');
    
    // Get all text content to see what's available
    const allText = await page.textContent('body');
    console.log('📄 Page title:', await page.title());
    console.log('📄 Page URL:', page.url());
    
    // Look for price patterns in text
    const priceMatches = allText.match(/₹[\s]*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
    console.log('💰 Price matches found:', priceMatches);
    
    // Check specific selectors
    const selectors = [
      '._30jeq3._16Jk6d',
      '._30jeq3',
      '[class*="price"]',
      '[data-testid="price"]',
      '.price',
      'span[class*="price"]',
      'div[class*="price"]'
    ];
    
    for (const selector of selectors) {
      const element = await page.$(selector);
      if (element) {
        const text = await element.textContent();
        console.log(`✅ Found element with selector "${selector}": "${text}"`);
      } else {
        console.log(`❌ No element found with selector: "${selector}"`);
      }
    }
    
    // Get page HTML to analyze
    const html = await page.content();
    console.log('📄 HTML length:', html.length);
    
    // Look for common Flipkart patterns
    const patterns = [
      /class="[^"]*price[^"]*"/g,
      /class="[^"]*30jeq3[^"]*"/g,
      /₹/g
    ];
    
    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches) {
        console.log(`🔍 Pattern ${pattern} found:`, matches.slice(0, 5));
      }
    }
    
    console.log('✅ Debug complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugFlipkart();
