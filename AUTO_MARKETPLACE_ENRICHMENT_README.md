## Auto Marketplace Comparison Improvements

### What Changed
- Reliance Digital scraper now performs an onsite search (typing into “Search Products & Brands”) before collecting cards, with retries and a fallback to the legacy query URL.
- Product comparison on the detail page automatically triggers a background enrichment run when any marketplace (Amazon, Flipkart, Reliance Digital) is missing, and the manual “Find on Other Stores” button was removed.
- The UI now surfaces a subtle “Searching other marketplaces…” status so users know the auto-enrichment is running.
- After the enrichment call completes, the page immediately refetches the product + comparison data (no more manual refresh), and a lightweight polling loop keeps refreshing for a few extra cycles until all marketplaces appear.

### Approach
1. **Browser-level realism** – Navigating to the homepage, filling the real search box, and waiting for network-idle plus explicit selectors drastically reduced the empty-state issue Reliance randomly returns.
2. **Retry & fallback** – After an initial wait, we reload once; if cards are still missing we fall back to the old `products?q=...` endpoint, ensuring we almost always land on usable results.
3. **Automatic enrichment** – On the client, once we load the stored comparison we compute which marketplaces are missing, kick off the `/find-marketplaces` job, refresh immediately when it returns, and keep polling a few more times so late-arriving marketplaces (e.g., Reliance Digital) surface without manual reloads.

### Why It’s Better
- Reliance Digital listings are now found consistently, so Redis cache hits translate into visible “Price Comparison” rows (including Reliance).
- Users no longer have to click “Find on Other Stores”; every product attempts to populate all marketplaces automatically, keeping the experience identical to buyhatke-style comparisons, and the auto-polling ensures the UI updates as soon as scraping finishes.
- The added status message avoids confusion by explaining when enrichment is running in the background.

