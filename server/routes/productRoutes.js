const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const scraperService = require('../services/scraperService');

// Helper function to format price
const formatPrice = (price) => {
  if (!price || price === 0) return 'N/A';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

// Helper function to parse specifications from product name/description
const parseSpecifications = (product) => {
  const specs = product.specifications || {};
  const name = (product.name || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const combinedText = `${name} ${description}`;

  // Parse RAM (e.g., "16 GB", "16GB", "8 GB RAM")
  if (!specs.ram) {
    const ramMatch = combinedText.match(/(\d+)\s*(?:gb|mb)\s*(?:ram|ddr|memory)/i) ||
      combinedText.match(/(\d+)\s*(?:gb|mb)\s*(?:ram)?/i);
    if (ramMatch) {
      specs.ram = `${ramMatch[1]} GB`;
    }
  }

  // Parse Storage (e.g., "512 GB SSD", "256GB", "1 TB")
  if (!specs.storage) {
    const storageMatch = combinedText.match(/(\d+)\s*(gb|tb|mb)\s*(?:ssd|hdd|storage)?/i);
    if (storageMatch) {
      const unit = storageMatch[2]?.toUpperCase() || 'GB';
      specs.storage = `${storageMatch[1]} ${unit}`;
    }
  }

  // Parse Processor (e.g., "Intel Core i5", "AMD Ryzen", "i5-1334U")
  if (!specs.processor) {
    const processorMatch = combinedText.match(/(intel|amd|qualcomm|apple|snapdragon)[\s\w-]*(?:core|processor|cpu|chip)?[\s]*(?:i\d+|ryzen|a\d+|\d+)?[\s]*(?:gen|th)?[\s]*(?:[\d\w]+)?/i);
    if (processorMatch) {
      specs.processor = processorMatch[0].replace(/\s+/g, ' ').trim();
    }
  }

  // Parse Operating System (e.g., "Windows 11", "Android", "iOS")
  if (!specs.operatingSystem) {
    const osMatch = combinedText.match(/(windows\s+\d+|android\s+[\d.]+|ios\s+[\d.]+|macos|linux)/i);
    if (osMatch) {
      specs.operatingSystem = osMatch[0].trim();
    }
  }

  // Parse Display/Refresh Rate (e.g., "120Hz", "60Hz", "144Hz")
  if (!specs.refreshRate) {
    const refreshMatch = combinedText.match(/(\d+)\s*hz/i);
    if (refreshMatch) {
      specs.refreshRate = `${refreshMatch[1]}Hz`;
    }
  }

  // Parse Brightness (e.g., "250 Nits", "300 nits")
  if (!specs.brightness) {
    const brightnessMatch = combinedText.match(/(\d+)\s*nits?/i);
    if (brightnessMatch) {
      specs.brightness = `${brightnessMatch[1]} Nits`;
    }
  }

  // Parse Model Number (e.g., "3530", "B0FQF5DG3P")
  if (!specs.modelNumber) {
    const modelMatch = combinedText.match(/\b([a-z0-9]{6,})\b/i) ||
      name.match(/\b([a-z]?\d{3,})\b/i);
    if (modelMatch && modelMatch[1].length >= 4) {
      specs.modelNumber = modelMatch[1].toUpperCase();
    }
  }

  // Parse Color (e.g., "Deep Blue", "Silver", "Black")
  if (!specs.color) {
    const colorMatch = combinedText.match(/\b(deep\s+blue|silver|black|white|red|blue|gold|space\s+gray|graphite)\b/i);
    if (colorMatch) {
      specs.color = colorMatch[0].replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  return specs;
};

// Search products
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const query = q.trim();
    const searchRegex = new RegExp(query, 'i');

    // Check if query is a URL
    const isUrl = /^https?:\/\//i.test(query);
    let products = [];

    if (isUrl) {
      // Search by URL - exact match or partial match
      const urlPattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special regex characters
      const urlRegex = new RegExp(urlPattern, 'i');

      products = await Product.find({
        isActive: true,
        $or: [
          { 'urls.amazon': urlRegex },
          { 'urls.flipkart': urlRegex },
          { 'urls.myntra': urlRegex }
        ]
      })
        .limit(parseInt(limit))
        .sort({ createdAt: -1 })
        .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

      // After finding product by URL, also search for similar products by name
      // This ensures we find the same product from other marketplaces
      if (products.length > 0) {
        const foundProduct = products[0];
        const productName = foundProduct.name;

        // Extract key words from product name for matching
        const nameWords = productName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (nameWords.length >= 3) {
          // Escape special regex characters in words
          const escapedWords = nameWords.slice(0, 4).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          // Search for products with similar names (might have other marketplace URLs)
          const namePattern = new RegExp(escapedWords.join('|'), 'i');
          const relatedProducts = await Product.find({
            isActive: true,
            _id: { $nin: products.map(p => p._id) }, // Exclude already found products
            name: namePattern
          })
            .limit(20)
            .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

          // Add related products to the results for consolidation
          products = [...products, ...relatedProducts];
          console.log(`🔗 Found ${relatedProducts.length} related products by name for URL search`);
        }
      }

      // If no exact URL match, try extracting product ID from URL
      if (products.length === 0) {
        // Extract Amazon product ID (ASIN) from URL
        // Formats: /dp/B0FQF5DG3P, /gp/product/B0FQF5DG3P, /product/B0FQF5DG3P
        const amazonAsinMatch = query.match(/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
        if (amazonAsinMatch) {
          const asin = amazonAsinMatch[1];
          const asinRegex = new RegExp(asin, 'i');
          products = await Product.find({
            isActive: true,
            'urls.amazon': asinRegex
          })
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })
            .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

          // After finding by Amazon ASIN, search for related products by name
          if (products.length > 0) {
            const foundProduct = products[0];
            const nameWords = foundProduct.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            if (nameWords.length >= 3) {
              // Escape special regex characters
              const escapedWords = nameWords.slice(0, 4).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
              const namePattern = new RegExp(escapedWords.join('|'), 'i');
              const relatedProducts = await Product.find({
                isActive: true,
                _id: { $nin: products.map(p => p._id) },
                name: namePattern
              })
                .limit(20)
                .select('name image brand category description currentPrice urls priceHistory specifications createdAt');
              products = [...products, ...relatedProducts];
              console.log(`🔗 Found ${relatedProducts.length} related products for Amazon ASIN search`);
            }
          }
        }

        // Extract Flipkart product ID from URL
        // Formats: flipkart.com/product-name/p/itmXXXXX, flipkart.com/p/itmXXXXX
        if (products.length === 0) {
          // Try pattern: /p/itmXXXXX or /p/itmXXXXX?pid=XXXXX
          const flipkartItmMatch = query.match(/flipkart\.com\/[^/]*\/p\/([^/?]+)/i);
          if (flipkartItmMatch) {
            const flipkartId = flipkartItmMatch[1];
            const flipkartRegex = new RegExp(flipkartId, 'i');
            products = await Product.find({
              isActive: true,
              'urls.flipkart': flipkartRegex
            })
              .limit(parseInt(limit))
              .sort({ createdAt: -1 })
              .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

            // After finding by Flipkart URL, search for related products by name
            if (products.length > 0) {
              const foundProduct = products[0];
              const nameWords = foundProduct.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
              if (nameWords.length >= 3) {
                // Escape special regex characters
                const escapedWords = nameWords.slice(0, 4).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                const namePattern = new RegExp(escapedWords.join('|'), 'i');
                const relatedProducts = await Product.find({
                  isActive: true,
                  _id: { $nin: products.map(p => p._id) },
                  name: namePattern
                })
                  .limit(20)
                  .select('name image brand category description currentPrice urls priceHistory specifications createdAt');
                products = [...products, ...relatedProducts];
                console.log(`🔗 Found ${relatedProducts.length} related products for Flipkart URL search`);
              }
            }
          }

          // If that doesn't work, try extracting from pid parameter
          if (products.length === 0) {
            const flipkartPidMatch = query.match(/[?&]pid=([^&]+)/i);
            if (flipkartPidMatch) {
              const pid = flipkartPidMatch[1];
              const pidRegex = new RegExp(pid, 'i');
              products = await Product.find({
                isActive: true,
                'urls.flipkart': pidRegex
              })
                .limit(parseInt(limit))
                .sort({ createdAt: -1 })
                .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

              // After finding by Flipkart PID, search for related products
              if (products.length > 0) {
                const foundProduct = products[0];
                const nameWords = foundProduct.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                if (nameWords.length >= 3) {
                  // Escape special regex characters
                  const escapedWords = nameWords.slice(0, 4).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                  const namePattern = new RegExp(escapedWords.join('|'), 'i');
                  const relatedProducts = await Product.find({
                    isActive: true,
                    _id: { $nin: products.map(p => p._id) },
                    name: namePattern
                  })
                    .limit(20)
                    .select('name image brand category description currentPrice urls priceHistory specifications createdAt');
                  products = [...products, ...relatedProducts];
                  console.log(`🔗 Found ${relatedProducts.length} related products for Flipkart PID search`);
                }
              }
            }
          }
        }

        // Extract Myntra product ID from URL
        // Formats: myntra.com/product-name/productId, myntra.com/product-name/productId?...
        if (products.length === 0) {
          // Try pattern: myntra.com/product-name/productId or myntra.com/product-name/productId/
          const myntraMatch = query.match(/myntra\.com\/[^/]+\/([^/?]+)/i);
          if (myntraMatch) {
            const myntraId = myntraMatch[1];
            // Myntra product IDs are typically numeric or alphanumeric
            if (myntraId.length > 5) { // Ensure it's a valid product ID
              const myntraRegex = new RegExp(myntraId, 'i');
              products = await Product.find({
                isActive: true,
                'urls.myntra': myntraRegex
              })
                .limit(parseInt(limit))
                .sort({ createdAt: -1 })
                .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

              // After finding by Myntra URL, search for related products by name
              if (products.length > 0) {
                const foundProduct = products[0];
                const nameWords = foundProduct.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                if (nameWords.length >= 3) {
                  // Escape special regex characters
                  const escapedWords = nameWords.slice(0, 4).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                  const namePattern = new RegExp(escapedWords.join('|'), 'i');
                  const relatedProducts = await Product.find({
                    isActive: true,
                    _id: { $nin: products.map(p => p._id) },
                    name: namePattern
                  })
                    .limit(20)
                    .select('name image brand category description currentPrice urls priceHistory specifications createdAt');
                  products = [...products, ...relatedProducts];
                  console.log(`🔗 Found ${relatedProducts.length} related products for Myntra URL search`);
                }
              }
            }
          }
        }

        // If still no match, try extracting keywords from URL path and search by name
        if (products.length === 0) {
          // Extract meaningful words from URL (remove common words, keep product identifiers)
          const urlPath = query.split('/').filter(part => part && !part.includes('?') && !part.includes('&'));
          const excludedWords = [
            'www', 'http', 'https', 'amazon', 'flipkart', 'myntra', 'in', 'com',
            'dp', 'product', 'gp', 'p', 'itm', 'pid', 'www2', 'm', 'mobile'
          ];

          const keywords = urlPath
            .filter(part => {
              const lowerPart = part.toLowerCase();
              // Keep parts that are longer than 3 chars and not excluded
              return part.length > 3 && !excludedWords.includes(lowerPart) && !/^[a-z0-9]{1,3}$/i.test(part);
            })
            .slice(0, 5); // Take first 5 meaningful keywords for better matching

          if (keywords.length > 0) {
            // Search by product name using extracted keywords
            const keywordRegex = new RegExp(keywords.join('|'), 'i');
            products = await Product.find({
              isActive: true,
              name: keywordRegex
            })
              .limit(100) // Get more results for better consolidation
              .sort({ createdAt: -1 })
              .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

            console.log(`🔍 Found ${products.length} products by keyword extraction from URL`);
          }
        }
      }
    } else {
      // Search products by name, brand, or category (case-insensitive)
      // Use more precise matching to avoid irrelevant results
      const searchWords = query.split(/\s+/).filter(w => w.length > 2);

      // Extract key identifiers from query FIRST (before searching)
      // This helps us find all marketplace variants even if names differ slightly
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      const modelNumber = queryWords.find(w => /^\d+$/.test(w));
      const variant = queryWords.find(w => /^(pro|max|plus|mini|ultra)$/i.test(w));
      const brand = queryWords.find(w => ['iphone', 'apple', 'samsung', 'dell'].includes(w));

      // Build comprehensive search conditions
      const searchConditions = [
        { name: searchRegex } // Exact phrase match has highest priority
      ];

      // For multi-word queries, require ALL words to be present (AND logic)
      // This ensures "iPhone 17 Pro" doesn't match "iPhone 16"
      if (searchWords.length > 1) {
        // Create a pattern that requires all words to be present
        const allWordsPattern = searchWords
          .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape special chars
          .join('.*'); // Allow words to appear in any order

        searchConditions.push({
          name: new RegExp(allWordsPattern, 'i')
        });
      }

      // If we identified brand + model, search for all variants of that model
      // This ensures we find "iPhone 17 Pro" from both Amazon and Flipkart
      if (brand && modelNumber) {
        // Search for "brand modelNumber" (e.g., "iphone 17")
        searchConditions.push({ name: new RegExp(`${brand}.*${modelNumber}`, 'i') });
        if (variant) {
          // Also search for "brand modelNumber variant" (e.g., "iphone 17 pro")
          searchConditions.push({ name: new RegExp(`${brand}.*${modelNumber}.*${variant}`, 'i') });
        }
      }

      // Also search brand and category
      searchConditions.push({ brand: searchRegex });
      searchConditions.push({ category: searchRegex });

      // Get more products to ensure we find all variations
      products = await Product.find({
        isActive: true,
        $or: searchConditions
      })
        .limit(200) // Increased limit to catch all marketplace variants
        .sort({ createdAt: -1 })
        .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

      console.log(`🔍 Found ${products.length} products matching "${query}"`);

      // Additional search: If we found products, extract identifiers and search again
      // This catches any products we might have missed
      if (products.length > 0 && brand && modelNumber) {
        // Search one more time with broader pattern to catch all variations
        const broaderPatterns = [
          new RegExp(`${brand}.*${modelNumber}`, 'i') // e.g., "iphone.*17"
        ];

        if (variant) {
          broaderPatterns.push(new RegExp(`${brand}.*${modelNumber}.*${variant}`, 'i')); // e.g., "iphone.*17.*pro"
        }

        const additionalProducts = await Product.find({
          isActive: true,
          _id: { $nin: products.map(p => p._id) }, // Exclude already found products
          $or: broaderPatterns.map(pattern => ({ name: pattern }))
        })
          .limit(50)
          .select('name image brand category description currentPrice urls priceHistory specifications createdAt');

        if (additionalProducts.length > 0) {
          console.log(`🔗 Found ${additionalProducts.length} additional related products for "${query}"`);
          products = [...products, ...additionalProducts];
        }
      }

      // Filter products to prioritize exact matches
      // Sort so exact phrase matches come first
      products.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const queryLower = query.toLowerCase();

        // Exact phrase match gets highest priority
        if (aName.includes(queryLower) && !bName.includes(queryLower)) return -1;
        if (!aName.includes(queryLower) && bName.includes(queryLower)) return 1;

        // Then prioritize by number of matching words
        const aWords = queryLower.split(/\s+/).filter(w => aName.includes(w)).length;
        const bWords = queryLower.split(/\s+/).filter(w => bName.includes(w)).length;
        return bWords - aWords;
      });

      // Log products found for debugging
      products.forEach(p => {
        const marketplaces = [];
        if (p.urls?.amazon) marketplaces.push(`Amazon: ${p.currentPrice?.amazon ? formatPrice(p.currentPrice.amazon) : 'No price'}`);
        if (p.urls?.flipkart) marketplaces.push(`Flipkart: ${p.currentPrice?.flipkart ? formatPrice(p.currentPrice.flipkart) : 'No price'}`);
        if (p.urls?.myntra) marketplaces.push(`Myntra: ${p.currentPrice?.myntra ? formatPrice(p.currentPrice.myntra) : 'No price'}`);
        console.log(`  - ${p.name.substring(0, 60)}... [${marketplaces.join(', ') || 'No marketplaces'}]`);
      });
    }

    // Consolidate products by name (merge marketplace URLs from duplicate products)
    // Use a more flexible matching approach - normalize product names and extract key identifiers
    const normalizeProductName = (name) => {
      if (!name) return '';
      // Remove common variations, extra spaces, special characters
      return name.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove special chars
        .replace(/\s+/g, ' ') // Multiple spaces to single
        .trim();
    };

    const extractProductKey = (name) => {
      if (!name) return '';
      const normalized = normalizeProductName(name);
      // Extract ALL words (including short ones and numbers) for better matching
      const allWords = normalized.split(' ').filter(w => w.length > 0);

      // For iPhone/Apple products, prioritize brand + model number + variant
      // This ensures "iPhone 17 Pro" matches regardless of storage/color variations
      // Check for "iphone" first (more specific), then "apple" (brand)
      const hasIphone = allWords.some(w => w === 'iphone');
      const brand = hasIphone ? 'iphone' : allWords.find(w => w === 'apple');
      const modelNumber = allWords.find(w => /^\d+$/.test(w)); // Model numbers like "17", "16", etc.
      const variant = allWords.find(w => /^(pro|max|plus|mini|ultra)$/i.test(w));

      if ((brand || hasIphone) && modelNumber) {
        // Always use "iphone" as the brand key for consistency
        // This ensures "Apple iPhone 17 Pro" and "iPhone 17 Pro" both get "iphone 17 pro"
        let key = `iphone ${modelNumber}`;
        if (variant) {
          key += ` ${variant}`;
        }
        console.log(`   🔑 Generated key: "${key}" from "${name.substring(0, 50)}"`);
        return key;
      }

      // For other products, take first 5 significant words as key identifier
      const significantWords = allWords.filter(w => w.length > 2);
      return significantWords.slice(0, 5).join(' ');
    };

    const productMap = new Map();

    products.forEach(product => {
      const productKey = extractProductKey(product.name);
      console.log(`🔑 Processing product: "${product.name.substring(0, 50)}" -> Key: "${productKey}"`);
      console.log(`   Marketplaces: ${Object.keys(product.urls || {}).filter(k => product.urls?.[k]).join(', ')}`);
      let matchedKey = null;

      // Try to find existing product with similar key
      for (const [key, existing] of productMap.entries()) {
        const existingKey = extractProductKey(existing.name);
        console.log(`   Comparing with: "${existing.name.substring(0, 50)}" -> Key: "${existingKey}"`);

        // Match if keys are identical or very similar (at least 80% word overlap)
        if (productKey === existingKey) {
          console.log(`   ✅ Exact key match found!`);
          matchedKey = key;
          break;
        }

        // Check word overlap for similar products - but be more strict
        // Include ALL words (including numbers) for iPhone/Apple products
        const allWords1 = productKey.split(' ');
        const allWords2 = existingKey.split(' ');
        const words1 = allWords1.filter(w => w.length > 0); // Include all words
        const words2 = allWords2.filter(w => w.length > 0); // Include all words
        const commonWords = words1.filter(w => words2.includes(w));
        const overlapRatio = commonWords.length / Math.max(words1.length, words2.length);

        // Extract model numbers (e.g., "17", "16", "15") - from ALL words
        const modelNumber1 = allWords1.find(w => /^\d+$/.test(w));
        const modelNumber2 = allWords2.find(w => /^\d+$/.test(w));

        // Extract variant names (pro, max, plus, mini, etc.)
        const variant1 = words1.find(w => /^(pro|max|plus|mini|ultra|standard)$/i.test(w));
        const variant2 = words2.find(w => /^(pro|max|plus|mini|ultra|standard)$/i.test(w));

        // CRITICAL: Don't merge if model numbers differ (e.g., iPhone 16 vs iPhone 17)
        if (modelNumber1 && modelNumber2 && modelNumber1 !== modelNumber2) {
          // Different model numbers - don't merge
          continue;
        }

        // For iPhone products, require exact model number match
        const hasCommonBrand = words1.some(w => ['iphone', 'apple', 'samsung', 'dell'].includes(w)) &&
          words2.some(w => ['iphone', 'apple', 'samsung', 'dell'].includes(w));

        if (hasCommonBrand && (modelNumber1 || modelNumber2)) {
          // If both have model numbers, they must match
          if (modelNumber1 && modelNumber2 && modelNumber1 !== modelNumber2) {
            continue; // Different models, don't merge
          }
          // If one has model number and other doesn't, require variant match too
          if ((modelNumber1 && !modelNumber2) || (!modelNumber1 && modelNumber2)) {
            if (variant1 && variant2 && variant1.toLowerCase() !== variant2.toLowerCase()) {
              continue; // Different variants, don't merge
            }
          }
        }

        // Match if significant overlap (at least 70% or 3+ common significant words)
        // Increased threshold to be more strict
        if (overlapRatio >= 0.7 ||
          (commonWords.length >= 3 && words1.length >= 4 && words2.length >= 4)) {
          matchedKey = key;
          break;
        }

        // For same brand + same model number + same variant, merge with fewer requirements
        // This ensures iPhone 17 Pro from Flipkart merges with iPhone 17 Pro from Amazon
        if (hasCommonBrand && modelNumber1 && modelNumber2 && modelNumber1 === modelNumber2) {
          // If both have same variant, merge (even if names differ slightly)
          if (variant1 && variant2 && variant1.toLowerCase() === variant2.toLowerCase()) {
            // Same brand, model, and variant - merge even with less overlap
            if (commonWords.length >= 2) {
              matchedKey = key;
              break;
            }
          }
          // If variant is missing from one but model matches, check if other words align
          // This handles cases like "iPhone 17 Pro" vs "iPhone 17 Pro 512GB"
          if ((variant1 && !variant2) || (!variant1 && variant2)) {
            // If we have brand + model match, and at least 2 common words, merge
            if (commonWords.length >= 2) {
              matchedKey = key;
              break;
            }
          }
          // If no variant in either, but model matches and brand matches, merge
          if (!variant1 && !variant2 && commonWords.length >= 2) {
            matchedKey = key;
            break;
          }
        }

        // Also merge if exact brand + model match (even without variant match)
        // This helps merge products like "iPhone 17" and "iPhone 17 Pro"
        if (hasCommonBrand && modelNumber1 && modelNumber2 && modelNumber1 === modelNumber2) {
          // If we have brand + exact model number match, merge if overlap is reasonable
          if (commonWords.length >= 2 && overlapRatio >= 0.4) {
            matchedKey = key;
            break;
          }
        }
      }

      if (matchedKey) {
        // Merge with existing product
        const existing = productMap.get(matchedKey);

        console.log(`🔄 Merging: "${product.name.substring(0, 50)}" into "${existing.name.substring(0, 50)}"`);
        console.log(`   Existing marketplaces: ${Object.keys(existing.urls || {}).filter(k => existing.urls[k]).join(', ')}`);
        console.log(`   New product marketplaces: ${Object.keys(product.urls || {}).filter(k => product.urls?.[k]).join(', ')}`);

        // Merge URLs - always merge if new product has URL and existing doesn't
        if (product.urls?.amazon && !existing.urls.amazon) {
          existing.urls.amazon = product.urls.amazon;
          existing.priceComparison.amazon = product.currentPrice?.amazon || null;
          console.log(`   ✅ Added Amazon URL and price: ${existing.priceComparison.amazon ? formatPrice(existing.priceComparison.amazon) : 'No price'}`);
        } else if (product.urls?.amazon && existing.urls.amazon && !existing.priceComparison.amazon) {
          // If URL exists but no price, update price if available
          existing.priceComparison.amazon = product.currentPrice?.amazon || existing.priceComparison.amazon;
          console.log(`   ✅ Updated Amazon price: ${formatPrice(existing.priceComparison.amazon)}`);
        } else if (product.currentPrice?.amazon && !existing.priceComparison.amazon) {
          // If new product has price but existing doesn't, use it
          existing.priceComparison.amazon = product.currentPrice.amazon;
          console.log(`   ✅ Added Amazon price from new product: ${formatPrice(existing.priceComparison.amazon)}`);
        }

        if (product.urls?.flipkart && !existing.urls.flipkart) {
          existing.urls.flipkart = product.urls.flipkart;
          existing.priceComparison.flipkart = product.currentPrice?.flipkart || null;
          console.log(`   ✅ Added Flipkart URL and price: ${existing.priceComparison.flipkart ? formatPrice(existing.priceComparison.flipkart) : 'No price'}`);
        } else if (product.urls?.flipkart && existing.urls.flipkart && !existing.priceComparison.flipkart) {
          existing.priceComparison.flipkart = product.currentPrice?.flipkart || existing.priceComparison.flipkart;
          console.log(`   ✅ Updated Flipkart price: ${formatPrice(existing.priceComparison.flipkart)}`);
        } else if (product.currentPrice?.flipkart && !existing.priceComparison.flipkart) {
          // If new product has price but existing doesn't, use it
          existing.priceComparison.flipkart = product.currentPrice.flipkart;
          console.log(`   ✅ Added Flipkart price from new product: ${formatPrice(existing.priceComparison.flipkart)}`);
        }

        if (product.urls?.myntra && !existing.urls.myntra) {
          existing.urls.myntra = product.urls.myntra;
          existing.priceComparison.myntra = product.currentPrice?.myntra || null;
          console.log(`   ✅ Added Myntra URL and price: ${existing.priceComparison.myntra ? formatPrice(existing.priceComparison.myntra) : 'No price'}`);
        } else if (product.urls?.myntra && existing.urls.myntra && !existing.priceComparison.myntra) {
          existing.priceComparison.myntra = product.currentPrice?.myntra || existing.priceComparison.myntra;
          console.log(`   ✅ Updated Myntra price: ${formatPrice(existing.priceComparison.myntra)}`);
        } else if (product.currentPrice?.myntra && !existing.priceComparison.myntra) {
          // If new product has price but existing doesn't, use it
          existing.priceComparison.myntra = product.currentPrice.myntra;
          console.log(`   ✅ Added Myntra price from new product: ${formatPrice(existing.priceComparison.myntra)}`);
        }

        // Update availableOn flags
        existing.availableOn.amazon = !!existing.urls.amazon;
        existing.availableOn.flipkart = !!existing.urls.flipkart;
        existing.availableOn.myntra = !!existing.urls.myntra;

        // Merge price history count
        existing.priceHistoryCount += product.priceHistory?.length || 0;

        // Keep the product with more marketplace URLs, or the newer one
        const existingMarketplaceCount = Object.values(existing.urls).filter(u => u).length;
        const newMarketplaceCount = Object.values(product.urls || {}).filter(u => u).length;

        if (newMarketplaceCount > existingMarketplaceCount ||
          (newMarketplaceCount === existingMarketplaceCount && product.createdAt > existing.createdAt)) {
          // Update with the better product data
          existing.id = product._id;
          existing.image = product.image || existing.image;
          existing.brand = product.brand || existing.brand;
          existing.category = product.category || existing.category;
          existing.createdAt = product.createdAt;
          // Merge specifications
          const newSpecs = parseSpecifications(product);
          existing.specifications = { ...existing.specifications, ...newSpecs };
        }
      } else {
        // New product entry
        const priceComparison = {
          amazon: product.currentPrice?.amazon || null,
          flipkart: product.currentPrice?.flipkart || null,
          myntra: product.currentPrice?.myntra || null
        };

        // Find lowest price
        const prices = Object.values(priceComparison).filter(p => p && p > 0);
        const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
        const highestPrice = prices.length > 0 ? Math.max(...prices) : null;

        // Parse specifications from product
        const specifications = parseSpecifications(product);

        productMap.set(productKey, {
          id: product._id,
          name: product.name,
          image: product.image,
          brand: product.brand,
          category: product.category,
          specifications,
          priceComparison,
          lowestPrice,
          highestPrice,
          priceDifference: highestPrice && lowestPrice ? highestPrice - lowestPrice : null,
          availableOn: {
            amazon: !!product.urls?.amazon,
            flipkart: !!product.urls?.flipkart,
            myntra: !!product.urls?.myntra
          },
          urls: {
            amazon: product.urls?.amazon || null,
            flipkart: product.urls?.flipkart || null,
            myntra: product.urls?.myntra || null
          },
          priceHistoryCount: product.priceHistory?.length || 0,
          createdAt: product.createdAt
        });
      }
    });

    // Recalculate prices after merging and ensure specifications are included
    let formattedProducts = Array.from(productMap.values()).map(product => {
      const prices = Object.values(product.priceComparison).filter(p => p && p > 0);
      product.lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
      product.highestPrice = prices.length > 0 ? Math.max(...prices) : null;
      product.priceDifference = product.highestPrice && product.lowestPrice
        ? product.highestPrice - product.lowestPrice
        : null;

      // Ensure specifications exist
      if (!product.specifications) {
        product.specifications = {};
      }

      // Calculate relevance score for search query
      const productNameLower = product.name.toLowerCase();
      const queryLower = query.toLowerCase();
      let relevanceScore = 0;

      // Exact phrase match gets highest score
      if (productNameLower.includes(queryLower)) {
        relevanceScore += 100;
      }

      // Count matching words
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      const matchingWords = queryWords.filter(w => productNameLower.includes(w));
      relevanceScore += matchingWords.length * 10;

      // Exact word order match bonus
      const productWords = productNameLower.split(/\s+/);
      let consecutiveMatches = 0;
      let queryIdx = 0;
      for (let i = 0; i < productWords.length && queryIdx < queryWords.length; i++) {
        if (productWords[i].includes(queryWords[queryIdx])) {
          consecutiveMatches++;
          queryIdx++;
        }
      }
      if (consecutiveMatches === queryWords.length) {
        relevanceScore += 50; // All words in order
      }

      product._relevanceScore = relevanceScore;

      // Log merged product for debugging
      const marketplaces = [];
      if (product.urls?.amazon) marketplaces.push(`Amazon: ${product.priceComparison.amazon ? formatPrice(product.priceComparison.amazon) : 'No price'}`);
      if (product.urls?.flipkart) marketplaces.push(`Flipkart: ${product.priceComparison.flipkart ? formatPrice(product.priceComparison.flipkart) : 'No price'}`);
      if (product.urls?.myntra) marketplaces.push(`Myntra: ${product.priceComparison.myntra ? formatPrice(product.priceComparison.myntra) : 'No price'}`);
      console.log(`✅ Merged product: ${product.name.substring(0, 50)}... [${marketplaces.join(', ')}] (relevance: ${relevanceScore})`);

      return product;
    });

    // Sort by relevance score (highest first) to prioritize exact matches
    formattedProducts.sort((a, b) => {
      // First by relevance score
      if (b._relevanceScore !== a._relevanceScore) {
        return b._relevanceScore - a._relevanceScore;
      }
      // Then by number of marketplaces (more marketplaces = better)
      const aMarketplaces = Object.values(a.urls || {}).filter(u => u).length;
      const bMarketplaces = Object.values(b.urls || {}).filter(u => u).length;
      if (bMarketplaces !== aMarketplaces) {
        return bMarketplaces - aMarketplaces;
      }
      // Finally by creation date (newer first)
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Remove relevance score from final output
    formattedProducts = formattedProducts.map(({ _relevanceScore, ...product }) => product);

    // Log final consolidated products
    console.log(`\n📊 FINAL CONSOLIDATED PRODUCTS (${formattedProducts.length}):`);
    formattedProducts.forEach((product, index) => {
      const marketplaces = [];
      if (product.urls?.amazon) {
        marketplaces.push(`Amazon: ${product.priceComparison?.amazon ? formatPrice(product.priceComparison.amazon) : 'URL but no price'}`);
      } else {
        marketplaces.push('Amazon: Not Available');
      }
      if (product.urls?.flipkart) {
        marketplaces.push(`Flipkart: ${product.priceComparison?.flipkart ? formatPrice(product.priceComparison.flipkart) : 'URL but no price'}`);
      } else {
        marketplaces.push('Flipkart: Not Available');
      }
      if (product.urls?.myntra) {
        marketplaces.push(`Myntra: ${product.priceComparison?.myntra ? formatPrice(product.priceComparison.myntra) : 'URL but no price'}`);
      } else {
        marketplaces.push('Myntra: Not Available');
      }
      console.log(`  ${index + 1}. ${product.name.substring(0, 60)}`);
      console.log(`     ${marketplaces.join(' | ')}`);
    });
    console.log('');

    res.json({
      query: q.trim(),
      count: formattedProducts.length,
      products: formattedProducts
    });
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// Check if product exists by URL
router.get('/check-url', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || url.trim().length === 0) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const queryUrl = url.trim();

    // Try exact match first
    let product = await Product.findOne({
      isActive: true,
      $or: [
        { 'urls.amazon': queryUrl },
        { 'urls.flipkart': queryUrl },
        { 'urls.myntra': queryUrl }
      ]
    });

    // If no exact match, try extracting product ID and searching
    if (!product) {
      // Extract Amazon ASIN
      // Formats: /dp/B0FQF5DG3P, /gp/product/B0FQF5DG3P, /product/B0FQF5DG3P
      const amazonAsinMatch = queryUrl.match(/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
      if (amazonAsinMatch) {
        const asin = amazonAsinMatch[1];
        product = await Product.findOne({
          isActive: true,
          'urls.amazon': new RegExp(asin, 'i')
        });
      }

      // Extract Flipkart product ID
      // Formats: flipkart.com/product-name/p/itmXXXXX, flipkart.com/p/itmXXXXX
      if (!product) {
        // Try pattern: /p/itmXXXXX
        const flipkartItmMatch = queryUrl.match(/flipkart\.com\/[^/]*\/p\/([^/?]+)/i);
        if (flipkartItmMatch) {
          const flipkartId = flipkartItmMatch[1];
          product = await Product.findOne({
            isActive: true,
            'urls.flipkart': new RegExp(flipkartId, 'i')
          });
        }

        // Try extracting from pid parameter
        if (!product) {
          const flipkartPidMatch = queryUrl.match(/[?&]pid=([^&]+)/i);
          if (flipkartPidMatch) {
            const pid = flipkartPidMatch[1];
            product = await Product.findOne({
              isActive: true,
              'urls.flipkart': new RegExp(pid, 'i')
            });
          }
        }
      }

      // Extract Myntra product ID
      // Formats: myntra.com/product-name/productId
      if (!product) {
        const myntraMatch = queryUrl.match(/myntra\.com\/[^/]+\/([^/?]+)/i);
        if (myntraMatch) {
          const myntraId = myntraMatch[1];
          // Myntra product IDs are typically numeric or alphanumeric
          if (myntraId.length > 5) { // Ensure it's a valid product ID
            product = await Product.findOne({
              isActive: true,
              'urls.myntra': new RegExp(myntraId, 'i')
            });
          }
        }
      }

    }

    if (product) {
      res.json({
        exists: true,
        product: {
          id: product._id,
          name: product.name,
          url: product.urls.amazon || product.urls.flipkart || product.urls.myntra
        }
      });
    } else {
      res.json({
        exists: false,
        message: 'Product not found in database'
      });
    }
  } catch (error) {
    console.error('Check URL error:', error);
    res.status(500).json({ error: 'Failed to check URL' });
  }
});

// Get product details with price comparison
router.get('/compare/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const priceComparison = {
      amazon: product.currentPrice?.amazon || null,
      flipkart: product.currentPrice?.flipkart || null,
      myntra: product.currentPrice?.myntra || null
    };

    // Find lowest price
    const prices = Object.values(priceComparison).filter(p => p && p > 0);
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
    const highestPrice = prices.length > 0 ? Math.max(...prices) : null;

    res.json({
      product: {
        id: product._id,
        name: product.name,
        image: product.image,
        brand: product.brand,
        category: product.category,
        description: product.description,
        priceComparison,
        lowestPrice,
        highestPrice,
        priceDifference: highestPrice && lowestPrice ? highestPrice - lowestPrice : null,
        availableOn: {
          amazon: !!product.urls?.amazon,
          flipkart: !!product.urls?.flipkart,
          myntra: !!product.urls?.myntra
        },
        urls: product.urls,
        priceHistory: product.priceHistory,
        createdAt: product.createdAt
      }
    });
  } catch (error) {
    console.error('Get product comparison error:', error);
    res.status(500).json({ error: 'Failed to get product comparison' });
  }
});

// Get product details
router.get('/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// Update product
router.put('/:productId', async (req, res) => {
  try {
    const { name, description, category, brand } = req.body;

    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (brand) product.brand = brand;

    await product.save();

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Add additional URL to product and fetch price
router.post('/:productId/url', async (req, res) => {
  try {
    const { url, platform } = req.body;

    if (!url || !platform) {
      return res.status(400).json({ error: 'URL and platform are required' });
    }

    if (!['amazon', 'flipkart', 'myntra'].includes(platform.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid platform. Must be amazon, flipkart, or myntra' });
    }

    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if URL already exists for this platform
    if (product.urls[platform] === url) {
      return res.json({
        message: 'URL already exists for this platform',
        product
      });
    }

    // Check if this URL already exists in another product (prevent duplicates)
    const existingProductWithUrl = await Product.findOne({
      _id: { $ne: req.params.productId },
      isActive: true,
      $or: [
        { 'urls.amazon': url },
        { 'urls.flipkart': url },
        { 'urls.myntra': url }
      ]
    });

    if (existingProductWithUrl) {
      return res.status(400).json({
        error: 'This URL already exists in another product',
        existingProduct: {
          id: existingProductWithUrl._id,
          name: existingProductWithUrl.name
        },
        suggestion: 'Consider merging products or use the existing product'
      });
    }

    // Check if there's another product with the same name that has URLs from other marketplaces
    // This helps identify potential duplicate products
    const similarProducts = await Product.find({
      _id: { $ne: req.params.productId },
      isActive: true,
      name: new RegExp(product.name.split(' ').slice(0, 3).join(' '), 'i') // Match first 3 words of name
    }).select('_id name urls currentPrice');

    if (similarProducts.length > 0) {
      // Check if any similar product has the platform URL we're trying to add
      const productWithPlatform = similarProducts.find(p => p.urls[platform]);

      if (productWithPlatform) {
        return res.status(400).json({
          error: 'Similar product already exists with this marketplace URL',
          existingProduct: {
            id: productWithPlatform._id,
            name: productWithPlatform.name,
            hasPlatform: true
          },
          similarProducts: similarProducts.map(p => ({
            id: p._id,
            name: p.name,
            urls: Object.keys(p.urls).filter(k => p.urls[k])
          })),
          suggestion: 'Consider merging products or adding URL to the existing product'
        });
      }

      // Check if any similar product has URLs from other marketplaces (potential merge candidate)
      const productWithOtherMarketplaces = similarProducts.find(p =>
        Object.values(p.urls).some(u => u && u !== p.urls[platform])
      );

      if (productWithOtherMarketplaces) {
        console.log(`⚠️  Warning: Similar product found with other marketplace URLs: ${productWithOtherMarketplaces._id}`);
        // Continue with adding URL, but log the warning
      }
    }

    // Scrape product info to get current price
    const scraperService = require('../services/scraperService');
    let productInfo = null;
    let price = null;

    try {
      console.log(`🔍 Fetching price from ${platform} for product ${product._id}...`);
      productInfo = await scraperService.getProductInfo(url);

      if (productInfo && productInfo.price) {
        price = productInfo.price;
        console.log(`✅ Found price: ₹${price} from ${platform}`);
      }
    } catch (error) {
      console.error(`⚠️  Failed to fetch price from ${platform}:`, error.message);
      // Continue even if price fetch fails - we'll still add the URL
    }

    // Update product with new URL and price
    const updateData = {
      $set: {
        [`urls.${platform}`]: url
      }
    };

    if (price && price > 0) {
      updateData.$set[`currentPrice.${platform}`] = price;

      // Add to price history if price is different
      const existingPrice = product.currentPrice?.[platform];
      if (!existingPrice || Math.abs(existingPrice - price) > 1) {
        updateData.$push = {
          priceHistory: {
            price: price,
            source: platform,
            availability: productInfo?.availability || 'in_stock',
            discount: productInfo?.discount || 0,
            timestamp: new Date()
          }
        };
      }
    }

    // Use updateOne to handle both $set and $push
    await Product.updateOne(
      { _id: req.params.productId },
      updateData
    );

    const updatedProduct = await Product.findById(req.params.productId);

    res.json({
      message: `URL and price added successfully from ${platform}`,
      product: updatedProduct,
      priceAdded: price !== null
    });
  } catch (error) {
    console.error('Add URL error:', error);
    res.status(500).json({ error: 'Failed to add URL', details: error.message });
  }
});

// Delete product
router.delete('/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.isActive = false;
    await product.save();

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get product statistics
router.get('/:productId/stats', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const stats = {
      totalClicks: product.clickCount,
      pricePoints: product.priceHistory.length,
      averagePrice: 0,
      lowestPrice: 0,
      highestPrice: 0,
      priceRange: 0
    };

    if (product.priceHistory.length > 0) {
      const prices = product.priceHistory.map(entry => entry.price);
      stats.averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      stats.lowestPrice = Math.min(...prices);
      stats.highestPrice = Math.max(...prices);
      stats.priceRange = stats.highestPrice - stats.lowestPrice;
    }

    res.json({ stats });
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({ error: 'Failed to get product statistics' });
  }
});

// Compare product prices across marketplaces
router.get('/:productId/compare', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    console.log(`🔍 Comparison for product: ${product.name}`);
    console.log(`   URLs:`, JSON.stringify(product.urls, null, 2));
    console.log(`   Current Prices:`, JSON.stringify(product.currentPrice, null, 2));

    const comparison = {
      productName: product.name,
      productImage: product.image,
      marketplaces: []
    };

    // Amazon
    if (product.urls?.amazon) {
      const amazonPrice = product.currentPrice?.amazon || null;
      console.log(`   Amazon: URL=${!!product.urls.amazon}, Price=${amazonPrice}`);
      comparison.marketplaces.push({
        marketplace: 'amazon',
        name: 'Amazon',
        url: product.urls.amazon,
        price: amazonPrice,
        available: !!amazonPrice && amazonPrice > 0
      });
    }

    // Flipkart
    if (product.urls?.flipkart) {
      const flipkartPrice = product.currentPrice?.flipkart || null;
      console.log(`   Flipkart: URL=${!!product.urls.flipkart}, Price=${flipkartPrice}`);
      comparison.marketplaces.push({
        marketplace: 'flipkart',
        name: 'Flipkart',
        url: product.urls.flipkart,
        price: flipkartPrice,
        available: !!flipkartPrice && flipkartPrice > 0
      });
    }

    // Reliance Digital
    if (product.urls?.reliancedigital) {
      comparison.marketplaces.push({
        marketplace: 'reliancedigital',
        name: 'Reliance Digital',
        url: product.urls.reliancedigital,
        price: product.currentPrice?.reliancedigital || null,
        available: !!product.currentPrice?.reliancedigital
      });
    }

    // Find best price
    const prices = comparison.marketplaces
      .filter(m => m.price && m.price > 0)
      .map(m => m.price);

    if (prices.length > 0) {
      const lowestPrice = Math.min(...prices);
      const highestPrice = Math.max(...prices);
      comparison.bestPrice = lowestPrice;
      comparison.priceRange = highestPrice - lowestPrice;
      comparison.bestMarketplace = comparison.marketplaces.find(m => m.price === lowestPrice)?.marketplace;
    }

    res.json({ comparison });
  } catch (error) {
    console.error('Compare product error:', error);
    res.status(500).json({ error: 'Failed to compare product prices' });
  }
});

// Manually trigger marketplace search for a product
router.post('/:productId/find-marketplaces', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!product.name) {
      return res.status(400).json({ error: 'Product name is required for marketplace search' });
    }

    // Determine source marketplace
    let sourceMarketplace = 'amazon';
    if (product.urls?.flipkart && !product.urls?.amazon) {
      sourceMarketplace = 'flipkart';
    } else if (product.urls?.reliancedigital && !product.urls?.amazon && !product.urls?.flipkart) {
      sourceMarketplace = 'reliancedigital';
    }

    console.log(`🔍 Manually searching for "${product.name}" on other marketplaces...`);
    const marketplaceResults = await scraperService.findProductAcrossMarketplaces(
      product.name,
      sourceMarketplace,
      product.urls || {}
    );

    // Update product with found marketplace URLs and prices
    const updateData = { $set: {} };
    const priceHistoryEntries = [];

    if (marketplaceResults.amazon) {
      updateData.$set['urls.amazon'] = marketplaceResults.amazon.url;
      if (marketplaceResults.amazon.price) {
        updateData.$set['currentPrice.amazon'] = marketplaceResults.amazon.price;
        priceHistoryEntries.push({
          price: marketplaceResults.amazon.price,
          source: 'amazon',
          availability: 'in_stock',
          timestamp: new Date()
        });
      }
    }

    if (marketplaceResults.flipkart) {
      updateData.$set['urls.flipkart'] = marketplaceResults.flipkart.url;
      if (marketplaceResults.flipkart.price) {
        updateData.$set['currentPrice.flipkart'] = marketplaceResults.flipkart.price;
        priceHistoryEntries.push({
          price: marketplaceResults.flipkart.price,
          source: 'flipkart',
          availability: 'in_stock',
          timestamp: new Date()
        });
      }
    }

    if (marketplaceResults.reliancedigital) {
      updateData.$set['urls.reliancedigital'] = marketplaceResults.reliancedigital.url;
      if (marketplaceResults.reliancedigital.price) {
        updateData.$set['currentPrice.reliancedigital'] = marketplaceResults.reliancedigital.price;
        priceHistoryEntries.push({
          price: marketplaceResults.reliancedigital.price,
          source: 'reliancedigital',
          availability: 'in_stock',
          timestamp: new Date()
        });
      }
    }

    if (priceHistoryEntries.length > 0) {
      updateData.$push = { priceHistory: { $each: priceHistoryEntries } };
    }

    if (Object.keys(updateData.$set).length > 0) {
      await Product.updateOne({ _id: product._id }, updateData);
    }

    const updatedProduct = await Product.findById(req.params.productId);

    res.json({
      message: 'Marketplace search completed',
      product: updatedProduct,
      results: marketplaceResults
    });
  } catch (error) {
    console.error('Find marketplaces error:', error);
    res.status(500).json({ error: 'Failed to find product on marketplaces', details: error.message });
  }
});

module.exports = router;