# Product Search & Price Comparison Feature

## Overview
Implemented a comprehensive product search feature that allows users to search for products in the database and compare prices across Indian marketplaces (Amazon, Flipkart, Myntra).

## Features

### 1. **Product Search**
- Search products by name, brand, or category
- Case-insensitive search
- Real-time results with loading states
- Supports up to 20 results per search (configurable)

### 2. **Price Comparison**
- Shows prices from all available marketplaces:
  - **Amazon** - Amazon.in prices
  - **Flipkart** - Flipkart.com prices
  - **Myntra** - Myntra.com prices
- Highlights the best (lowest) price
- Shows price difference between highest and lowest
- Displays "Not Available" for marketplaces without prices

### 3. **Visual Features**
- Product cards with images
- Marketplace logos
- Color-coded price highlights (green for best price)
- Responsive grid layout
- Empty states and error handling

## Implementation

### Backend Endpoints

#### 1. Search Products
```
GET /api/products/search?q=<query>&limit=<number>
```

**Response:**
```json
{
  "query": "iphone",
  "count": 2,
  "products": [
    {
      "id": "...",
      "name": "iPhone 17 Pro",
      "image": "...",
      "brand": "Apple",
      "category": "Electronics",
      "priceComparison": {
        "amazon": 154900,
        "flipkart": 154800,
        "myntra": null
      },
      "lowestPrice": 154800,
      "highestPrice": 154900,
      "priceDifference": 100,
      "availableOn": {
        "amazon": true,
        "flipkart": true,
        "myntra": false
      },
      "urls": {...},
      "priceHistoryCount": 45
    }
  ]
}
```

#### 2. Get Product Comparison
```
GET /api/products/compare/:productId
```

Returns detailed product information with price comparison.

### Frontend Components

#### Search Page (`/search`)
- Search input with icon
- Product cards grid
- Price comparison display
- Navigation to product details
- Direct links to marketplace pages

#### Features:
- **Search Bar**: Prominent search input with submit button
- **Product Cards**: 
  - Product image
  - Product name, brand, category
  - Price comparison table
  - Best price badge
  - Price difference indicator
  - Action buttons (View Details, Open Link)
- **Empty States**: 
  - Before search: Instructions
  - No results: Helpful message with "Add Product" button

### API Service Updates

Added new methods to `apiService.js`:
```javascript
// Search products
await apiService.searchProducts(query, limit)

// Get product comparison
await apiService.getProductComparison(productId)
```

## User Flow

1. **Navigate to Search Page**
   - Click "Search" in header navigation
   - Or visit `/search` directly

2. **Enter Search Query**
   - Type product name, brand, or category
   - Click "Search" button or press Enter

3. **View Results**
   - See product cards with price comparison
   - Best price highlighted in green
   - Click "View Details" for full product page
   - Click external link icon to open marketplace page

4. **Compare Prices**
   - See prices from all available marketplaces
   - Identify best deal at a glance
   - View price difference between marketplaces

## Price Comparison Display

### Marketplace Cards
Each marketplace is shown with:
- **Logo**: Marketplace brand logo
- **Name**: Amazon / Flipkart / Myntra
- **Price**: Formatted in INR (₹)
- **Status**: 
  - Green highlight for best price
  - Gray for other available prices
  - "Not Available" for missing prices

### Best Price Badge
- Green badge in top-right of product card
- Shows "Best: ₹X" with trending down icon
- Highlights the lowest available price

### Price Difference
- Yellow info box showing difference between highest and lowest
- Helps users understand price variation

## Example Search Results

### Product: "iPhone 17 Pro"
```
┌─────────────────────────────────┐
│ [Product Image]  [Best: ₹154,800]│
│                                  │
│ iPhone 17 Pro 512GB              │
│ Apple • Electronics             │
│                                  │
│ Price Comparison:                │
│ ┌─────────────┬──────────────┐ │
│ │ Amazon      │ ₹154,900     │ │
│ │ Flipkart    │ ₹154,800 ✅  │ │
│ │ Myntra      │ Not Available│ │
│ └─────────────┴──────────────┘ │
│                                  │
│ Price Difference: ₹100          │
│                                  │
│ [View Details] [External Link]   │
└─────────────────────────────────┘
```

## Technical Details

### Search Algorithm
- Uses MongoDB regex for case-insensitive search
- Searches across:
  - Product name
  - Brand name
  - Category
- Sorted by creation date (newest first)
- Limited results to prevent overload

### Price Comparison Logic
```javascript
// Extract prices from all marketplaces
const prices = [
  product.currentPrice.amazon,
  product.currentPrice.flipkart,
  product.currentPrice.myntra
].filter(p => p && p > 0)

// Find best price
const lowestPrice = Math.min(...prices)
const highestPrice = Math.max(...prices)
const priceDifference = highestPrice - lowestPrice
```

### Marketplace Logos
- Amazon: Orange theme
- Flipkart: Blue theme
- Myntra: Pink theme

## Error Handling

- Empty search query validation
- No results message
- API error handling with toast notifications
- Image load errors with fallback
- Network error handling

## Future Enhancements

Potential improvements:
- [ ] Advanced filters (price range, brand, category)
- [ ] Sort options (price, name, date)
- [ ] Search suggestions/autocomplete
- [ ] Price alerts from search results
- [ ] Save favorite comparisons
- [ ] Export comparison as CSV/PDF
- [ ] Historical price comparison
- [ ] Multi-product comparison view

## Files Modified

### Backend
- `server/routes/productRoutes.js` - Added search and compare endpoints

### Frontend
- `client/src/pages/SearchProducts.jsx` - New search page component
- `client/src/services/apiService.js` - Added search methods
- `client/src/components/Header.jsx` - Added Search navigation link
- `client/src/App.jsx` - Added search route

## Testing

### Test Search
1. Navigate to `/search`
2. Enter a product name (e.g., "iPhone")
3. Verify results show price comparison
4. Check that best price is highlighted
5. Click "View Details" to verify navigation
6. Test with empty query (should show error)
7. Test with no results (should show empty state)

### Test Price Comparison
1. Search for a product with multiple marketplace prices
2. Verify all prices are displayed correctly
3. Verify best price is highlighted
4. Verify price difference is calculated correctly
5. Test with missing marketplace prices

## Notes

- Search is case-insensitive
- Results limited to 20 products by default (configurable)
- Price formatting uses Indian number format (₹)
- Product cards are responsive (1 column mobile, 2 tablet, 3 desktop)
- External links open in new tab
- Price history count shown on each card

