const MARKETPLACE_ALIASES = {
    amazon: 'amazon',
    'amazon.in': 'amazon',
    'amazon india': 'amazon',
    flipkart: 'flipkart',
    'flipkart.com': 'flipkart',
    myntra: 'myntra',
    'myntra.com': 'myntra',
    'reliance digital': 'reliancedigital',
    reliancedigital: 'reliancedigital',
    'reliancedigital.in': 'reliancedigital',
    'reliance digital india': 'reliancedigital'
};

const SEARCH_SUPPORTED_MARKETPLACES = new Set(['amazon', 'flipkart']);

const canonicalizeMarketplaceName = (name) => {
    if (!name) return null;
    const key = name.toString().trim().toLowerCase();
    if (!key) return null;
    return MARKETPLACE_ALIASES[key] || key.replace(/\s+/g, '');
};

const parseMarketplaceEnrichmentTargets = () => {
    const raw = process.env.MARKETPLACE_ENRICHMENT;
    console.log("raw---->", raw);

    if (!raw) return [];


    try {
        const list = JSON.parse(raw);
        console.log("list---->", list);
        if (!Array.isArray(list)) {
            console.warn('MARKETPLACE_ENRICHMENT must be a JSON array');
            return [];
        }

        const normalized = list
            .map(canonicalizeMarketplaceName)
            .filter(Boolean);
        console.log("normalized---->", normalized);

        return Array.from(new Set(normalized)); // dedupe
    } catch (error) {
        console.warn('Failed to parse MARKETPLACE_ENRICHMENT:', error.message);
        return [];
    }
};

module.exports = {
    canonicalizeMarketplaceName,
    parseMarketplaceEnrichmentTargets,
    SEARCH_SUPPORTED_MARKETPLACES
};

