const scraperService = require('./server/services/scraperService');

async function testServerImage() {
  try {
    console.log('🔍 Testing server-side image extraction...');
    const result = await scraperService.scrapeProduct('https://www.flipkart.com/apple-iphone-16-ultramarine-256-gb/p/itm03cecd3e85111');
    console.log('✅ Server scraping result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Server scraping error:', error.message);
  }
}

testServerImage();
