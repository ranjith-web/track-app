#!/usr/bin/env node

/**
 * Quick script to test cross-market enrichment for a given product URL.
 * Usage:
 *    node scripts/test-enrichment.js [productUrl]
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const scraperService = require('../services/scraperService');
const { parseMarketplaceEnrichmentTargets } = require('../utils/marketplaceConfig');

const DEFAULT_TEST_URL = 'https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX6NQMD/ref=sxin_14_pa_sp_search_thematic_sspa?content-id=amzn1.sym.0629fcb0-94ed-4eba-9abe-6c93c227c465%3Aamzn1.sym.0629fcb0-94ed-4eba-9abe-6c93c227c465&crid=1MTTIOIH0KK5R&cv_ct_cx=iphone%2B17%2Bpro&keywords=iphone%2B17%2Bpro&pd_rd_i=B0CHX6NQMD&pd_rd_r=0406dbca-8b42-43fe-8d21-9aa5e2b71c74&pd_rd_w=YFTIX&pd_rd_wg=n2IvI&pf_rd_p=0629fcb0-94ed-4eba-9abe-6c93c227c465&pf_rd_r=SX8791WJCZ5BPS7BNQ8S&qid=1762340865&sbo=RZvfv%2F%2FHxDF%2BO5021pAnSA%3D%3D&sprefix=iphone%2Caps%2C180&sr=1-3-66673dcf-083f-43ba-b782-d4a436cc5cfb-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9zZWFyY2hfdGhlbWF0aWM&th=1';
const testUrl = process.argv[2] || DEFAULT_TEST_URL;

const enrichmentTargets = parseMarketplaceEnrichmentTargets();

const run = async () => {
    console.log('🚀 Cross-market enrichment test');
    console.log('📌 URL:', testUrl);
    console.log('🔧 Targets:', enrichmentTargets.join(', ') || '(none)');

    try {
        const productInfo = await scraperService.getProductInfo(testUrl);
        console.log('\n🔍 Source marketplace:', productInfo.source);
        console.log('🛍️  Product name:', productInfo.name);
        console.log('💰 Source price:', productInfo.price);

        const enrichments = await scraperService.enrichProductAcrossMarketplaces({
            productName: productInfo.name,
            sourceMarketplace: productInfo.source,
            existingUrls: { [productInfo.source]: testUrl },
            targets: enrichmentTargets,
            minScore: 0.75
        });

        if (enrichments.length === 0) {
            console.log('\n⚠️  No cross-market matches were found.');
        } else {
            console.log(`\n✅ Found ${enrichments.length} cross-market matches:`);
            enrichments.forEach((result, index) => {
                console.log(`\n#${index + 1} ${result.marketplace.toUpperCase()}`);
                console.log('   Title      :', result.title);
                console.log('   Match Score:', `${(result.score * 100).toFixed(1)}%`);
                console.log('   URL        :', result.url);
                console.log('   Price      :', result.scrapedData?.price || result.price || 'N/A');
            });
        }
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    } finally {
        await scraperService.closeBrowser?.();
        process.exit(0);
    }
};

run();

