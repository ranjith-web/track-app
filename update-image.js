const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/track-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Product = require('./server/models/Product');

async function updateImage() {
  try {
    console.log('🔍 Updating product image...');
    
    // Find the iPhone product
    const product = await Product.findOne({ 
      name: { $regex: /iPhone 16.*Ultramarine/i } 
    });
    
    if (!product) {
      console.log('❌ Product not found');
      return;
    }
    
    console.log('📱 Found product:', product.name);
    console.log('🖼️ Current image:', product.image);
    
    // Update the image
    product.image = 'https://rukminim2.flixcart.com/image/416/416/xif0q/mobile/g/l/q/-original-imahgfmzdbnzzjjg.jpeg?q=70&crop=false';
    await product.save();
    
    console.log('✅ Image updated successfully!');
    console.log('🖼️ New image:', product.image);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

updateImage();
