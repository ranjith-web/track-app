# Scalable Batch-Based Price Tracking System

## Problem
The previous system checked ALL products 3 times per day, which would break the system with millions of products:
- ❌ Millions of products checked simultaneously
- ❌ System overload and crashes
- ❌ No priority system
- ❌ Fixed schedule regardless of product count

## Solution
Implemented a **smart, scalable batch-based system** that:
- ✅ Processes products in small batches continuously
- ✅ Priority-based checking (new products first)
- ✅ Configurable batch size and interval
- ✅ Prevents system overload
- ✅ Scales to millions of products

## How It Works

### Batch Processing
Instead of checking all products at once, the system:
1. **Processes batches continuously** - Every X minutes (configurable)
2. **Limits batch size** - Only processes N products per batch (default: 50)
3. **Prevents overload** - Limits concurrent batches
4. **Distributes load** - Spreads checks throughout the day

### Priority System

The system uses a **3-tier priority** approach:

#### Priority 1: New Products (Highest)
- Products created in last 24 hours
- Products that haven't been checked yet
- Checked first to ensure new products get immediate attention

#### Priority 2: Products with Recent Changes
- Products with price changes in last 6 hours
- Checked more frequently to catch price fluctuations
- 30% of batch allocated to these

#### Priority 3: Stale Products
- Products not checked in last 24 hours
- Oldest checked products first
- Fills remaining batch slots

### Example Calculation

**Default Settings:**
- Batch size: 50 products
- Batch interval: 30 minutes
- Batches per day: 48 (24 hours × 60 minutes / 30 minutes)
- Products checked per day: 2,400 (50 × 48)

**For 1 Million Products:**
- Each product checked approximately every **417 days** (1,000,000 / 2,400)
- But new/active products checked much more frequently!

## Configuration

### Environment Variables

Add these to your `.env` file to customize behavior:

```bash
# Number of products to process per batch
PRICE_CHECK_BATCH_SIZE=50

# Minutes between batches (how often to run)
PRICE_CHECK_INTERVAL_MINUTES=30

# Maximum concurrent batches (prevents overload)
MAX_CONCURRENT_BATCHES=1
```

### Recommended Settings

**For Small Scale (< 1,000 products):**
```bash
PRICE_CHECK_BATCH_SIZE=100
PRICE_CHECK_INTERVAL_MINUTES=15
MAX_CONCURRENT_BATCHES=1
```
- Checks all products every ~2.5 hours
- 96 batches/day = 9,600 products/day

**For Medium Scale (1,000 - 100,000 products):**
```bash
PRICE_CHECK_BATCH_SIZE=50
PRICE_CHECK_INTERVAL_MINUTES=30
MAX_CONCURRENT_BATCHES=1
```
- Checks all products every ~20 days
- 48 batches/day = 2,400 products/day

**For Large Scale (100,000+ products):**
```bash
PRICE_CHECK_BATCH_SIZE=100
PRICE_CHECK_INTERVAL_MINUTES=10
MAX_CONCURRENT_BATCHES=2
```
- Higher throughput: 144 batches/day = 14,400 products/day
- New products still checked within hours
- Stale products checked every ~7 days

**For Very Large Scale (1M+ products):**
```bash
PRICE_CHECK_BATCH_SIZE=200
PRICE_CHECK_INTERVAL_MINUTES=5
MAX_CONCURRENT_BATCHES=3
```
- Maximum throughput: 288 batches/day = 57,600 products/day
- New products checked within minutes
- All products checked every ~17 days

## Benefits

### 1. **Scalability**
- Handles millions of products without breaking
- System load remains constant regardless of product count
- No need to check all products at once

### 2. **Smart Prioritization**
- New products get immediate attention
- Products with price changes checked more frequently
- Old products checked less often (but still checked)

### 3. **System Protection**
- Prevents overload with concurrent batch limits
- Configurable rate limiting
- Graceful handling of failures

### 4. **Resource Efficiency**
- Only processes products that need checking
- Distributes load throughout the day
- No peak load spikes

## Monitoring

### Check Status
Use the status endpoint to monitor:
```javascript
priceTrackerService.getStatus()
```

Returns:
```json
{
  "isRunning": false,
  "activeJobs": 2,
  "activeBatches": 0,
  "maxConcurrentBatches": 1,
  "batchSize": 50,
  "batchInterval": "30 minutes",
  "schedule": "Batch processing every 30 minutes",
  "estimatedProductsPerDay": 2400
}
```

### Manual Triggers

**Process one batch:**
```javascript
await priceTrackerService.triggerManualUpdate();
```

**Process multiple batches:**
```javascript
await priceTrackerService.triggerBulkUpdate(5); // Process 5 batches
```

## Migration Notes

### Backward Compatibility
- `updateAllPrices()` method still exists but is deprecated
- It now calls `processBatch()` for compatibility
- Manual triggers updated to use batch processing

### No Data Migration Required
- Existing products automatically included in batches
- `lastChecked` field used for priority sorting
- No schema changes needed

## Performance Considerations

### Rate Limiting
- 30 seconds delay between products (respectful scraping)
- 10 seconds delay between sources
- Prevents overwhelming target websites

### Batch Timing
- Batches run independently
- Failed batches don't block others
- System continues processing even if some products fail

### Database Load
- Queries are optimized with indexes
- Only fetches products that need checking
- Limits results to batch size

## Example Scenarios

### Scenario 1: New Product Added
1. Product created → `lastChecked` is null
2. Next batch (within 30 minutes) picks it up (Priority 1)
3. Price checked immediately
4. Product moves to normal rotation

### Scenario 2: Price Change Detected
1. Price change detected → New entry in `priceHistory`
2. Next batch picks it up (Priority 2)
3. Checked again within 6 hours
4. If stable, moves back to normal rotation

### Scenario 3: Stale Product
1. Product not checked in 24+ hours
2. Picked up by Priority 3 (oldest first)
3. Checked and updated
4. Returns to normal rotation

## Troubleshooting

### Too Many Products Not Getting Checked?
- Increase `PRICE_CHECK_BATCH_SIZE`
- Decrease `PRICE_CHECK_INTERVAL_MINUTES`
- Increase `MAX_CONCURRENT_BATCHES` (if resources allow)

### System Overload?
- Decrease `PRICE_CHECK_BATCH_SIZE`
- Increase `PRICE_CHECK_INTERVAL_MINUTES`
- Decrease `MAX_CONCURRENT_BATCHES`

### New Products Not Checked Fast Enough?
- Priority 1 ensures new products are checked first
- Adjust batch size/interval if needed
- Check that `lastChecked` field is being set correctly

## Future Enhancements

Potential improvements:
- [ ] User-configurable check frequencies per product
- [ ] Machine learning to predict optimal check times
- [ ] Webhook notifications for price changes
- [ ] Distributed processing across multiple servers
- [ ] Redis queue for better batch management

