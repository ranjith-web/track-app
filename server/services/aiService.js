const { Perplexity } = require('@perplexity-ai/perplexity_ai');

class AIService {
  constructor() {
    this.DEFAULT_MODEL = 'sonar-pro';
    this.apiKey = process.env.PERPLEXITY_API_KEY;
    this.modelName = process.env.PERPLEXITY_MODEL || this.DEFAULT_MODEL;

    if (!this.apiKey) {
      console.warn('PERPLEXITY_API_KEY not found. AI features will be disabled.');
      this.client = null;
    } else {
      this.client = new Perplexity({ apiKey: this.apiKey });
      console.log(`✅ Perplexity model initialised: ${this.modelName}`);
    }
  }

  async callPerplexity(messages, options = {}) {
    if (!this.apiKey || !this.client) {
      throw new Error('Perplexity API key not configured');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages,
        temperature: options.temperature || 0,
        ...options
      });

      const content = response?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Perplexity response did not contain content');
      }
      return content;
    } catch (error) {
      // Handle SDK-specific errors
      if (error.status === 429) {
        error.message = 'Perplexity API quota exceeded or rate limited.';
      } else if (error.status === 401) {
        error.message = 'Perplexity API key is invalid.';
      }
      throw error;
    }
  }

  extractJson(text) {
    if (!text) return null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      return null;
    }
  }

  async analyzePriceTrend(priceHistory) {
    try {
      if (!this.apiKey) {
        return {
          trend: 'unknown',
          confidence: 0,
          prediction: 'AI analysis unavailable - Perplexity API key not configured',
          recommendation: 'Configure PERPLEXITY_API_KEY to enable AI features',
          stability: 'unknown',
          analysis: 'AI service not available'
        };
      }

      if (!priceHistory || priceHistory.length < 1) {
        return {
          trend: 'insufficient_data',
          confidence: 0,
          prediction: 'No price data available for analysis'
        };
      }

      // Handle single price point
      if (priceHistory.length === 1) {
        const singlePrice = priceHistory[0];
        return {
          trend: 'stable',
          confidence: 30,
          prediction: 'Price tracking started. More data points needed for trend analysis.',
          recommendation: 'Check back in a few days for price trend insights',
          stability: 'unknown',
          analysis: `Initial price recorded: ₹${singlePrice.price.toLocaleString()} on ${new Date(singlePrice.timestamp).toLocaleDateString()}. Price tracking will continue to build historical data for better analysis.`
        };
      }

      // Prepare data for AI analysis
      const recentPrices = priceHistory.slice(-10); // Last 10 price points
      const priceData = recentPrices.map(entry => ({
        price: entry.price,
        date: entry.timestamp,
        source: entry.source
      }));

      const systemPrompt = 'You are a financial analyst who returns concise JSON.';
      const userPrompt = `Analyze the following price history data and respond in JSON with keys: trend (increasing|decreasing|stable|volatile), confidence (0-100), prediction (short sentence), recommendation (action), stability (high|medium|low), analysis (paragraph).\n\nPrice Data:\n${JSON.stringify(priceData)}`;

      const text = await this.callPerplexity([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      const parsed = this.extractJson(text);
      if (parsed) {
        return parsed;
      } else {
        return {
          trend: 'stable',
          confidence: 50,
          prediction: 'Unable to analyze price trend accurately',
          recommendation: 'Monitor price for better opportunities',
          stability: 'medium',
          analysis: text
        };
      }
    } catch (error) {
      console.error('AI analysis error:', error);

      // Use fallback for ANY AI error
      const fallbackAnalysisService = require('./fallbackAnalysisService');
      const fallbackResult = fallbackAnalysisService.analyzePriceTrend(priceHistory);

      // Add error context
      if (error.status === 429 || error.message.includes('quota')) {
        fallbackResult.analysis += ' [Perplexity API quota exceeded - using statistical analysis]';
        console.warn('⚠️  Perplexity API quota exceeded. Using fallback statistical analysis.');
      } else if (error.message.includes('API_KEY_INVALID')) {
        fallbackResult.analysis += ' [Invalid API key - using statistical analysis]';
      } else {
        fallbackResult.analysis += ' [AI temporarily unavailable - using statistical analysis]';
      }

      return fallbackResult;
    }
  }

  async getPriceInsights(productData) {
    try {
      if (!this.apiKey) {
        return {
          dealScore: 0,
          isGoodDeal: false,
          priceComparison: 'AI analysis unavailable - Perplexity API key not configured',
          seasonalTrend: 'No trend data available',
          strategy: 'Configure PERPLEXITY_API_KEY to enable AI features',
          insights: 'AI service not available'
        };
      }

      // Check for insufficient price history
      if (!productData.priceHistory || productData.priceHistory.length < 2) {
        return {
          dealScore: 50,
          isGoodDeal: false,
          priceComparison: 'Insufficient price history for analysis',
          seasonalTrend: 'No trend data available',
          strategy: 'Wait for more price data before making purchase decision',
          insights: 'Need at least 2 price points for meaningful analysis. Price tracking runs 3 times daily to build historical data.'
        };
      }

      // Include review data in prompt if available
      let reviewSection = '';
      if (productData.reviewSummary && productData.reviewSummary.totalGenuineReviews > 0) {
        reviewSection = `
        
        Customer Reviews (Genuine only, fake reviews filtered):
        - Average Rating: ${productData.reviewSummary.averageRating}/5
        - Total Genuine Reviews: ${productData.reviewSummary.totalGenuineReviews}
        - Sentiment: ${productData.reviewSummary.sentiment}
        - Pros: ${productData.reviewSummary.pros.join(', ')}
        - Cons: ${productData.reviewSummary.cons.join(', ')}
        - Fake Review Rate: ${productData.reviewSummary.fakeReviewPercentage}%
        `;
      }

      const systemPrompt = 'You are an expert shopping assistant who replies strictly with JSON.';
      const userPrompt = `
        Analyze this product:
        Product: ${productData.name}
        Current Price: ₹${productData.currentPrice}
        Price History: ${JSON.stringify(productData.priceHistory?.slice(-5) || [])}
        ${reviewSection}

        Respond in JSON with keys: dealScore (0-100), isGoodDeal (true/false), priceComparison (string), seasonalTrend (string), strategy (string), insights (string).
      `;

      const text = await this.callPerplexity([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      try {
        const parsed = this.extractJson(text) || {};
        return {
          dealScore: typeof parsed.dealScore === 'number' ? parsed.dealScore : 50,
          isGoodDeal: typeof parsed.isGoodDeal === 'boolean'
            ? parsed.isGoodDeal
            : (parsed.isGoodDeal === 'true' || parsed.isGoodDeal === true),
          priceComparison: typeof parsed.priceComparison === 'string' ? parsed.priceComparison : 'Unable to compare prices',
          seasonalTrend: typeof parsed.seasonalTrend === 'string' ? parsed.seasonalTrend : 'No trend data available',
          strategy: typeof parsed.strategy === 'string' ? parsed.strategy : 'Monitor price before buying',
          insights: typeof parsed.insights === 'string' ? parsed.insights : text
        };
      } catch (parseError) {
        return {
          dealScore: 50,
          isGoodDeal: false,
          priceComparison: 'Unable to compare prices',
          seasonalTrend: 'No trend data available',
          strategy: 'Monitor price before buying',
          insights: typeof text === 'string' ? text : 'AI insight unavailable'
        };
      }
    } catch (error) {
      console.error('AI insights error:', error);

      // Use fallback for ANY AI error
      const fallbackAnalysisService = require('./fallbackAnalysisService');
      const fallbackResult = fallbackAnalysisService.getPriceInsights(productData);

      // Add error context
      if (error.status === 429 || error.message.includes('quota')) {
        console.warn('⚠️  Perplexity API quota exceeded. Using fallback statistical analysis.');
      }

      return fallbackResult;
    }
  }

  async generatePriceAlert(productData, targetPrice) {
    try {
      if (!this.apiKey) {
        return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice} (AI features disabled - configure PERPLEXITY_API_KEY)`;
      }

      const systemPrompt = 'You are an assistant that writes concise, actionable price alerts.';
      const userPrompt = `
        Craft a brief price alert message covering:
        - Current price vs target price
        - Savings amount
        - Urgency level
        - Recommended action

        Product: ${productData.name}
        Current Price: ₹${productData.currentPrice}
        Target Price: ₹${targetPrice}
        Trend: ${productData.aiAnalysis?.trend || 'unknown'}
      `;

      const text = await this.callPerplexity([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      return text;
    } catch (error) {
      console.error('AI alert generation error:', error);

      // Handle specific API errors
      if (error.message.includes('API_KEY_INVALID')) {
        return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice} (AI features disabled - invalid Perplexity API key. Please check your configuration.)`;
      } else if (error.message.includes('QUOTA_EXCEEDED')) {
        return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice} (AI features disabled - Perplexity quota exceeded. Please review your plan.)`;
      } else if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
        return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice} (AI features temporarily unavailable - rate limit exceeded. Please try again later.)`;
      }

      return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice}`;
    }
  }
}

module.exports = new AIService();