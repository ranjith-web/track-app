## Cross-Market Enrichment (November 9, 2025)

- **Config-driven marketplace pairing**  
  Added `MARKETPLACE_ENRICHMENT` (JSON array) in `.env`, e.g. `["Amazon","Flipkart","Reliance Digital"]`.  
  New helper `parseMarketplaceEnrichmentTargets()` canonicalises names so we can toggle marketplaces without touching code.

- **Generic search/scrape orchestration**  
  `scraperService.findMarketplaceMatchByName()` and `enrichProductAcrossMarketplaces()` now route lookups through a registry (Amazon, Flipkart today; extendable to Myntra/Reliance).  
  Both use Playwright to hit search listings, score candidates with Sørensen–Dice similarity (≥ 75 %), and scrape the winning PDP to pull price, availability, and imagery.

- **Routes leverage enrichment automatically**  
  `POST /api/prices/track` and `POST /api/products/:id/url` compute the configured targets, call the enrichment helper, and merge any matches into URLs, `currentPrice`, and price history—regardless of the marketplace that was originally submitted.

- **Testing script**  
  Added `server/scripts/test-enrichment.js` so we can run `node scripts/test-enrichment.js <url>` to verify cross-market matches without hitting the API. The script honours `MARKETPLACE_ENRICHMENT`.

- **Why this is better**  
  A single marketplace link immediately seeds the other configured marketplaces, keeping comparison cards complete and accurate. Adding Myntra/Reliance tomorrow only requires wiring their search adapters and updating the env list.

