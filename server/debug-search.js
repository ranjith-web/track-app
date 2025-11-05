const mongoose = require('mongoose');
const Product = require('./models/Product');

mongoose.connect('mongodb://localhost:27017/price-tracker', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

async function debugSearch() {
    try {
        console.log('🔍 Debugging search for iPhone 17 Pro...\n');

        // Wait for connection
        await new Promise((resolve) => {
            if (mongoose.connection.readyState === 1) {
                resolve();
            } else {
                mongoose.connection.once('open', resolve);
            }
        });

        const query = 'iPhone 17 Pro';
        const searchRegex = new RegExp(query, 'i');

        // Search for products
        const products = await Product.find({
            isActive: true,
            $or: [
                { name: searchRegex },
                { brand: searchRegex },
                { category: searchRegex }
            ]
        })
            .select('name image brand category currentPrice urls priceHistory createdAt');

        console.log(`📊 Found ${products.length} products:\n`);

        products.forEach((product, index) => {
            console.log(`${index + 1}. ${product.name}`);
            console.log(`   ID: ${product._id}`);
            console.log(`   URLs:`);
            if (product.urls?.amazon) console.log(`     Amazon: ${product.urls.amazon.substring(0, 80)}...`);
            if (product.urls?.flipkart) console.log(`     Flipkart: ${product.urls.flipkart.substring(0, 80)}...`);
            if (product.urls?.myntra) console.log(`     Myntra: ${product.urls.myntra?.substring(0, 80) || 'N/A'}...`);
            console.log(`   Prices:`);
            if (product.currentPrice?.amazon) console.log(`     Amazon: ₹${product.currentPrice.amazon}`);
            if (product.currentPrice?.flipkart) console.log(`     Flipkart: ₹${product.currentPrice.flipkart}`);
            if (product.currentPrice?.myntra) console.log(`     Myntra: ₹${product.currentPrice.myntra}`);
            console.log('');
        });

        // Check for products with iPhone in name
        const iphoneProducts = await Product.find({
            isActive: true,
            name: /iphone/i
        })
            .select('name urls currentPrice');

        console.log(`\n📱 All iPhone products (${iphoneProducts.length}):\n`);
        iphoneProducts.forEach((p, i) => {
            const marketplaces = [];
            if (p.urls?.amazon) marketplaces.push('Amazon');
            if (p.urls?.flipkart) marketplaces.push('Flipkart');
            if (p.urls?.myntra) marketplaces.push('Myntra');
            console.log(`${i + 1}. ${p.name.substring(0, 60)}`);
            console.log(`   Marketplaces: ${marketplaces.join(', ') || 'None'}`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
    }
}

debugSearch();
