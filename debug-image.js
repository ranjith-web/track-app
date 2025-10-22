const { chromium } = require('playwright');

async function debugImage() {
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
    console.log('🔍 Testing image extraction...');
    await page.goto('https://www.flipkart.com/apple-iphone-16-ultramarine-256-gb/p/itm03cecd3e85111', { 
      waitUntil: 'networkidle', 
      timeout: 30000 
    });
    
    await page.waitForTimeout(3000);
    
    const result = await page.evaluate(() => {
      // Try all image selectors
      const imageSelectors = [
        '._396cs4._2amPT._3qGm1',
        'img[class*="image"]',
        'img[alt*="product"]',
        '.product-image img',
        'img[data-testid="product-image"]',
        'img[class*="_396cs4"]',
        'img[class*="q6DCl0"]',
        'img[alt*="iPhone"]',
        'img[alt*="Apple"]',
        'img[src*="rukmini1.flixcart.com"]'
      ];
      
      let image = null;
      let foundSelector = null;
      
      for (const selector of imageSelectors) {
        const imgElement = document.querySelector(selector);
        if (imgElement?.src) {
          image = imgElement.src;
          foundSelector = selector;
          break;
        }
      }
      
      // Try JSON-LD
      let jsonLdImage = null;
      if (!image) {
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
          try {
            const data = JSON.parse(script.textContent);
            if (data.image) {
              jsonLdImage = data.image;
              break;
            }
            if (Array.isArray(data)) {
              for (const item of data) {
                if (item.image) {
                  jsonLdImage = item.image;
                  break;
                }
              }
            }
          } catch (e) {
            // Ignore
          }
        }
      }
      
      // Get all images on page
      const allImages = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt,
        className: img.className
      })).filter(img => img.src.includes('flipkart') || img.src.includes('rukmini'));
      
      return {
        image,
        foundSelector,
        jsonLdImage,
        allImages: allImages.slice(0, 5) // First 5 images
      };
    });
    
    console.log('✅ Image debug result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugImage();
