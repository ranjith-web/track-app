#!/usr/bin/env node

/**
 * Utility script to purge all product data (MongoDB + Redis).
 * Usage:
 *   node scripts/clear-data.js
 *   (or run via npm script, start from repo root or server directory)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Product = require('../models/Product');
const redisService = require('../services/redisService');

const mongoUri =
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/price-tracker';

const clearMongo = async () => {
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected');

    const collections = await mongoose.connection.db.listCollections().toArray();
    if (collections.length === 0) {
        console.log('ℹ️  No collections found.');
        return;
    }

    console.log(`🗑️  Clearing ${collections.length} MongoDB collection(s)...`);
    for (const collection of collections) {
        const name = collection.name;
        if (name.startsWith('system.')) {
            continue;
        }
        const collectionHandle = mongoose.connection.collection(name);
        const count = await collectionHandle.countDocuments();
        if (count === 0) {
            continue;
        }
        await collectionHandle.deleteMany({});
        console.log(`   ✅ Cleared ${name} (${count} documents)`);
    }
};

const clearRedis = async () => {
    try {
        console.log('\n🧠 Connecting to Redis...');
        await redisService.connect();
        console.log('✅ Redis connected');
        await redisService.clear();
    } catch (error) {
        console.error('⚠️  Redis clear error:', error.message);
    } finally {
        await redisService.disconnect();
    }
};

const run = async () => {
    try {
        await clearMongo();
        await clearRedis();
        console.log('\n🎉 All data cleared successfully.');
    } catch (error) {
        console.error('\n❌ Failed to clear data:', error);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection?.readyState === 1) {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
};

run();

