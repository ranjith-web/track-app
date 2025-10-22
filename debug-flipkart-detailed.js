const { chromium } = require('playwright');

async function debugFlipkartDetailed() {
  const browser = await chromium.launch({ 
    headless: false,
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
    
    console.log('🔍 Looking for price elements...');
    
    // Get all elements that might contain price
    const priceElements = await page.$$eval('*', elements => {
      return elements
        .filter(el => {
          const text = el.textContent || '';
          return text.includes('₹') && text.match(/\d{4,}/); // Contains ₹ and 4+ digits
        })
        .map(el => ({
          tagName: el.tagName,
          className: el.className,
          textContent: el.textContent?.trim(),
          id: el.id
        }))
        .slice(0, 10); // Limit to first 10 matches
    });
    
    console.log('💰 Price elements found:');
    priceElements.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tagName} class="${el.className}" id="${el.id}">`);
      console.log(`   Text: "${el.textContent}"`);
    });
    
    // Look for specific patterns in class names
    const allClasses = await page.$$eval('*', elements => {
      const classes = new Set();
      elements.forEach(el => {
        if (el.className && typeof el.className === 'string') {
          el.className.split(' ').forEach(cls => {
            if (cls.includes('price') || cls.includes('30jeq3') || cls.includes('Nx9bqj') || cls.includes('25b18c')) {
              classes.add(cls);
            }
          });
        }
      });
      return Array.from(classes);
    });
    
    console.log('🎯 Relevant class names found:', allClasses);
    
    // Test each class name as a selector
    for (const className of allClasses) {
      try {
        const elements = await page.$$(`.${className}`);
        if (elements.length > 0) {
          const text = await elements[0].textContent();
          if (text && text.includes('₹')) {
            console.log(`✅ Class "${className}" found price: "${text}"`);
          }
        }
      } catch (e) {
        // Ignore invalid selectors
      }
    }
    
    console.log('✅ Detailed debug complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugFlipkartDetailed();
