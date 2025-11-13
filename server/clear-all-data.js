const mongoose = require('mongoose');
const Product = require('./models/Product');
const redisService = require('./services/redisService');
require('dotenv').config();

async function clearAllData() {
    try {
        console.log('🚀 Starting data cleanup...\n');

        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/track-app';
        console.log('📦 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Clear MongoDB collections
        console.log('🗑️  Clearing MongoDB collections...');

        // Clear Products collection
        const productCount = await Product.countDocuments();
        console.log(`   Found ${productCount} products in database`);

        if (productCount > 0) {
            const deleteResult = await Product.deleteMany({});
            console.log(`   ✅ Deleted ${deleteResult.deletedCount} products from MongoDB`);
        } else {
            console.log('   ℹ️  No products to delete');
        }

        // Get all collections and clear them
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`\n📊 Found ${collections.length} collections in database:`);

        for (const collection of collections) {
            const collectionName = collection.name;
            const count = await mongoose.connection.db.collection(collectionName).countDocuments();
            console.log(`   - ${collectionName}: ${count} documents`);

            if (count > 0 && collectionName !== 'system.indexes') {
                await mongoose.connection.db.collection(collectionName).deleteMany({});
                console.log(`     ✅ Cleared ${collectionName}`);
            }
        }

        // Clear Redis cache
        console.log('\n🗑️  Clearing Redis cache...');

        try {
            // Initialize Redis connection
            await redisService.connect();

            // Use the clear method from redisService
            const cleared = await redisService.clear();

            if (cleared) {
                console.log('   ✅ Cleared all Redis cache');
            } else {
                console.log('   ⚠️  Redis clear returned false');
            }

            // Also clear fallback cache if exists
            if (redisService.fallbackCache && redisService.fallbackCache.size > 0) {
                const fallbackSize = redisService.fallbackCache.size;
                redisService.fallbackCache.clear();
                console.log(`   ✅ Cleared ${fallbackSize} fallback cache entries`);
            }

            // Get Redis stats
            const stats = await redisService.getStats();
            console.log('\n📊 Redis stats after cleanup:');
            console.log(JSON.stringify(stats, null, 2));

        } catch (error) {
            console.error('   ❌ Error clearing Redis:', error.message);
            // Try to clear fallback cache anyway
            if (redisService.fallbackCache) {
                redisService.fallbackCache.clear();
                console.log('   ✅ Cleared fallback cache');
            }
        }

        console.log('\n✅ Data cleanup completed successfully!');
        console.log('\n📝 Summary:');
        console.log('   - MongoDB: All collections cleared');
        console.log('   - Redis: All cache keys cleared');

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        throw error;
    } finally {
        // Close connections
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('\n🔌 MongoDB connection closed');
        }

        // Close Redis connection if needed
        try {
            await redisService.disconnect();
            console.log('🔌 Redis connection closed');
        } catch (error) {
            // Ignore Redis close errors
            console.log('⚠️  Error closing Redis:', error.message);
        }

        process.exit(0);
    }
}

// Run the cleanup
clearAllData().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

