const { chromium } = require('playwright');

async function testSimple() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('🔍 Testing simple Flipkart scraping...');
    await page.goto('https://www.flipkart.com/apple-iphone-16-ultramarine-256-gb/p/itm03cecd3e85111', { 
      waitUntil: 'networkidle', 
      timeout: 30000 
    });
    
    await page.waitForTimeout(3000);
    
    const result = await page.evaluate(() => {
      const priceElement = document.querySelector('.Nx9bqj');
      const price = priceElement?.textContent?.replace(/[^\d.]/g, '');
      
      const titleElement = document.querySelector('.B_NuCI');
      const title = titleElement?.textContent?.trim();
      
      return {
        title,
        price: price ? parseFloat(price) : null,
        found: !!priceElement
      };
    });
    
    console.log('✅ Result:', result);
    
    if (result.price) {
      console.log('🎉 SUCCESS! Price found:', result.price);
    } else {
      console.log('❌ FAILED! No price found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testSimple();
