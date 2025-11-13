# Marketplace Price Comparison Implementation

## Overview
This document describes the implementation of automatic cross-marketplace price comparison feature that finds the same product across Amazon, Flipkart, and Reliance Digital when a product URL is added.

## Features Implemented

### 1. Automatic Marketplace Search
When you add a product URL (e.g., Amazon iPhone 15), the system automatically:
- Scrapes the product details from the provided URL
- Searches for the same product on other marketplaces (Flipkart, Reliance Digital)
- Finds the best matching product using similarity scoring (≥50% match)
- Updates the product with URLs and prices from all found marketplaces

### 2. Smart Price Extraction
The system uses a **two-tier approach** for price extraction:

#### Primary Method: Product Page Scraping
- Attempts to scrape the actual product page for accurate prices
- Uses multiple extraction methods:
  - JSON-LD structured data
  - Window object state (for Flipkart)
  - CSS selectors (multiple fallbacks)
  - Text pattern matching

#### Fallback Method: Search Result Prices
- If product page scraping fails (due to bot detection, page structure changes, etc.)
- Uses the price from search results as fallback
- Ensures products are saved with prices even when direct scraping fails

### 3. Marketplace Search Functions

#### `searchAmazon(productName, limit)`
- Searches Amazon.in by product name
- Returns top matching products with titles, URLs, and prices

#### `searchFlipkart(productName, limit)`
- Searches Flipkart by product name
- Handles login popups automatically
- Returns top matching products

#### `searchRelianceDigital(productName, limit)`
- Searches Reliance Digital by product name
- Returns top matching products

### 4. Product Matching Algorithm
- Uses **Sørensen–Dice coefficient** for name similarity
- Requires ≥50% similarity to consider a match
- Selects the best matching product from search results
- Handles variations in product names (e.g., "iPhone 15 (128 GB) - Green" vs "iPhone 15 Green 128 GB")

### 5. API Endpoints

#### `POST /api/prices/track`
- Adds a new product to track
- Automatically searches for product on other marketplaces in background
- Returns product with initial marketplace data

#### `GET /api/products/:productId/compare`
- Returns price comparison across all marketplaces
- Shows best price and price range
- Includes marketplace availability status

#### `POST /api/products/:productId/find-marketplaces`
- Manually triggers marketplace search
- Useful for re-searching if product wasn't found initially
- Updates product with new marketplace data

### 6. Frontend Integration

#### ProductDetail Page
- Displays prominent **Price Comparison Across Marketplaces** section
- Shows prices from Amazon, Flipkart, and Reliance Digital side-by-side
- Highlights the best price with a badge
- Shows savings amount vs highest price
- "Find on Other Stores" button to manually trigger search
- Displays "Not Available" for marketplaces without prices

## How It Works

### Example Flow

1. **User adds Amazon URL:**
   ```
   https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX6NQMD/...
   ```

2. **System scrapes Amazon:**
   - Product Name: "Apple iPhone 15 (128 GB) - Green"
   - Price: ₹50,990

3. **System searches Flipkart:**
   - Finds: "Apple iPhone 15 (Green, 128 GB)"
   - Similarity: 60% (above 50% threshold)
   - Search Result Price: ₹59,900
   - Attempts to scrape product page
   - If scraping fails, uses search result price

4. **System searches Reliance Digital:**
   - Finds matching products (if available)
   - Extracts prices using same method

5. **Product saved with all marketplace data:**
   ```json
   {
     "name": "Apple iPhone 15 (128 GB) - Green",
     "urls": {
       "amazon": "https://www.amazon.in/...",
       "flipkart": "https://www.flipkart.com/...",
       "reliancedigital": "..."
     },
     "currentPrice": {
       "amazon": 50990,
       "flipkart": 59900,
       "reliancedigital": null
     }
   }
   ```

6. **UI displays comparison:**
   - Amazon: ₹50,990 (Best Price)
   - Flipkart: ₹59,900 (₹8,910 more)
   - Reliance Digital: Not Available

## Technical Details

### Flipkart Bot Detection Handling
Flipkart sometimes shows a maintenance/error page when detecting bots:
- **Detection**: System detects this by checking page content length and title
- **Fallback**: Uses search result price (₹59,900) instead of failing
- **User Impact**: Product is saved with price, can be updated manually later

### Price Source Tracking
Each marketplace result includes a `priceSource` field:
- `"scraped"`: Price from product page scraping
- `"search_result"`: Price from search results (fallback)

### Error Handling
- Products can be saved without prices (price can be updated later)
- Search failures don't block product creation
- Background processes don't crash the main flow
- Graceful degradation ensures system continues working

## Testing

Run the test script to verify functionality:
```bash
cd server
node scripts/test-flipkart-scraper.js
```

This will:
1. Scrape the Amazon product
2. Search for it on Flipkart
3. Attempt to scrape Flipkart product page
4. Use fallback price if scraping fails
5. Show price comparison

## Future Improvements

1. **Stealth Mode**: Implement better bot detection evasion
2. **Proxy Rotation**: Use proxies to avoid rate limiting
3. **Caching**: Cache search results to reduce API calls
4. **More Marketplaces**: Add Myntra, Croma, etc.
5. **Price Alerts**: Notify users when prices drop on other marketplaces

## Files Modified

- `server/services/scraperService.js`: Added search functions and cross-marketplace logic
- `server/routes/priceRoutes.js`: Enhanced `/track` endpoint with auto-search
- `server/routes/productRoutes.js`: Added comparison and find-marketplaces endpoints
- `client/src/services/apiService.js`: Added comparison API methods
- `client/src/pages/ProductDetail.jsx`: Added marketplace comparison UI

## Usage

### Adding a Product
1. Go to "Add Product" page
2. Paste any marketplace URL (Amazon, Flipkart, etc.)
3. System automatically finds product on other marketplaces
4. View comparison on product detail page

### Manual Search
1. Go to product detail page
2. Click "Find on Other Stores" button
3. System searches for product on all marketplaces
4. Updates product with new marketplace data

## Notes

- Search results prices are usually accurate but may differ slightly from product page prices
- Product page scraping is more accurate but may fail due to bot detection
- System uses best available price (scraped > search result)
- All marketplace URLs are saved for future price updates

