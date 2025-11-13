const scraperService = require('../services/scraperService');

async function testFlipkartScraping() {
    const amazonUrl = 'https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX6NQMD/ref=sxin_14_pa_sp_search_thematic_sspa?content-id=amzn1.sym.0629fcb0-94ed-4eba-9abe-6c93c227c465%3Aamzn1.sym.0629fcb0-94ed-4eba-9abe-6c93c227c465&crid=1MTTIOIH0KK5R&cv_ct_cx=iphone%2B17%2Bpro&keywords=iphone%2B17%2Bpro&pd_rd_i=B0CHX6NQMD&pd_rd_r=0406dbca-8b42-43fe-8d21-9aa5e2b71c74&pd_rd_w=YFTIX&pd_rd_wg=n2IvI&pf_rd_p=0629fcb0-94ed-4eba-9abe-6c93c227c465&pf_rd_r=SX8791WJCZ5BPS7BNQ8S&qid=1762340865&sbo=RZvfv%2F%2FHxDF%2BO5021pAnSA%3D%3D&sprefix=iphone%2Caps%2C180&sr=1-3-66673dcf-083f-43ba-b782-d4a436cc5cfb-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9zZWFyY2hfdGhlbWF0aWM&th=1';

    try {
        console.log('🔍 Step 1: Scraping Amazon product...\n');
        const amazonProduct = await scraperService.getProductInfo(amazonUrl);

        console.log('✅ Amazon Product Details:');
        console.log('   Name:', amazonProduct.name);
        console.log('   Price:', amazonProduct.price ? `₹${amazonProduct.price.toLocaleString()}` : 'N/A');
        console.log('   Source:', amazonProduct.source);
        console.log('');

        if (!amazonProduct.name) {
            console.error('❌ Failed to extract product name from Amazon');
            process.exit(1);
        }

        console.log('🔍 Step 2: Testing cross-marketplace search...\n');
        const marketplaceResults = await scraperService.findProductAcrossMarketplaces(
            amazonProduct.name,
            'amazon',
            { amazon: amazonUrl }
        );

        console.log('✅ Cross-Marketplace Results:\n');

        if (marketplaceResults.flipkart) {
            console.log('   Flipkart:');
            console.log(`      URL: ${marketplaceResults.flipkart.url}`);
            console.log(`      Title: ${marketplaceResults.flipkart.title}`);
            console.log(`      Price: ${marketplaceResults.flipkart.price ? `₹${marketplaceResults.flipkart.price.toLocaleString()}` : 'N/A'}`);
            console.log(`      Price Source: ${marketplaceResults.flipkart.priceSource || 'unknown'}`);
            console.log(`      Similarity: ${(marketplaceResults.flipkart.similarity * 100).toFixed(1)}%`);
        } else {
            console.log('   Flipkart: Not found');
        }
        console.log('');

        if (marketplaceResults.reliancedigital) {
            console.log('   Reliance Digital:');
            console.log(`      URL: ${marketplaceResults.reliancedigital.url}`);
            console.log(`      Title: ${marketplaceResults.reliancedigital.title}`);
            console.log(`      Price: ${marketplaceResults.reliancedigital.price ? `₹${marketplaceResults.reliancedigital.price.toLocaleString()}` : 'N/A'}`);
            console.log(`      Price Source: ${marketplaceResults.reliancedigital.priceSource || 'unknown'}`);
            console.log(`      Similarity: ${(marketplaceResults.reliancedigital.similarity * 100).toFixed(1)}%`);
        } else {
            console.log('   Reliance Digital: Not found');
        }
        console.log('');

        // Price Comparison
        console.log('📊 Price Comparison:');
        console.log(`   Amazon:  ${amazonProduct.price ? `₹${amazonProduct.price.toLocaleString()}` : 'N/A'}`);
        if (marketplaceResults.flipkart?.price) {
            console.log(`   Flipkart: ${marketplaceResults.flipkart.price ? `₹${marketplaceResults.flipkart.price.toLocaleString()}` : 'N/A'}`);
            if (amazonProduct.price) {
                const diff = Math.abs(amazonProduct.price - marketplaceResults.flipkart.price);
                const cheaper = amazonProduct.price < marketplaceResults.flipkart.price ? 'Amazon' : 'Flipkart';
                console.log(`   Difference: ₹${diff.toLocaleString()}`);
                console.log(`   Cheaper on: ${cheaper}`);
            }
        }
        console.log('');

        console.log('✅ Test completed successfully!');

        // Close browser
        await scraperService.closeBrowser();
        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        await scraperService.closeBrowser().catch(() => { });
        process.exit(1);
    }
}

// Run the test
testFlipkartScraping();

