const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || 'AIzaSyAV5DQj5ctKip3K4oGPKqfLWtGIXd6xN9g';
    this.genAI = null;
    this.model = null;
    
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0, // Make outputs deterministic and consistent
        topK: 1,
        topP: 1,
      }
    });
    } else {
      console.warn('GEMINI_API_KEY not found. AI features will be disabled.');
    }
  }

  async analyzePriceTrend(priceHistory) {
    try {
      if (!this.model) {
        return {
          trend: 'unknown',
          confidence: 0,
          prediction: 'AI analysis unavailable - Gemini API key not configured',
          recommendation: 'Configure GEMINI_API_KEY to enable AI features',
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

      const prompt = `
        Analyze the following price history data and provide insights:
        
        Price Data: ${JSON.stringify(priceData)}
        
        Please analyze and provide:
        1. Price trend (increasing, decreasing, stable, volatile)
        2. Confidence level (0-100)
        3. Price prediction for next 7 days
        4. Best time to buy recommendation
        5. Price stability analysis
        
        Respond in JSON format:
        {
          "trend": "increasing|decreasing|stable|volatile",
          "confidence": 85,
          "prediction": "Price likely to increase by 5-10% in next week",
          "recommendation": "Buy now if price is below average",
          "stability": "high|medium|low",
          "analysis": "Detailed analysis of price patterns"
        }
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      try {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        // Fallback if JSON parsing fails
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
        fallbackResult.analysis += ' [Gemini API quota exceeded - using statistical analysis]';
        console.warn('⚠️  Gemini API quota exceeded. Using fallback statistical analysis.');
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
      if (!this.model) {
        return {
          dealScore: 0,
          isGoodDeal: false,
          priceComparison: 'AI analysis unavailable - Gemini API key not configured',
          seasonalTrend: 'No trend data available',
          strategy: 'Configure GEMINI_API_KEY to enable AI features',
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
      
      const prompt = `
        Analyze this product and provide buying insights:
        
        Product: ${productData.name}
        Current Price: ₹${productData.currentPrice}
        Price History: ${JSON.stringify(productData.priceHistory?.slice(-5) || [])}${reviewSection}
        
        Provide comprehensive insights considering:
        1. Is this a good deal based on price AND reviews?
        2. Price comparison across platforms
        3. Customer satisfaction (if reviews available)
        4. Seasonal trends
        5. Best buying strategy
        
        ${reviewSection ? 'IMPORTANT: Factor in the genuine customer reviews. High ratings and positive reviews increase deal score. Low ratings decrease it.' : ''}
        
        Respond in JSON format:
        {
          "dealScore": 85,
          "isGoodDeal": true,
          "priceComparison": "Amazon offers best price at ₹X",
          "seasonalTrend": "Prices typically drop in December",
          "strategy": "Buy now - good price and excellent reviews",
          "insights": "Detailed buying recommendations including review analysis"
        }
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      try {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Validate and fix data types to prevent validation errors
          return {
            dealScore: typeof parsed.dealScore === 'number' ? parsed.dealScore : 50,
            isGoodDeal: typeof parsed.isGoodDeal === 'boolean' ? parsed.isGoodDeal : (parsed.isGoodDeal === 'true' || parsed.isGoodDeal === true),
            priceComparison: typeof parsed.priceComparison === 'string' ? parsed.priceComparison : 'Unable to compare prices',
            seasonalTrend: typeof parsed.seasonalTrend === 'string' ? parsed.seasonalTrend : 'No trend data available',
            strategy: typeof parsed.strategy === 'string' ? parsed.strategy : 'Monitor price before buying',
            insights: typeof parsed.insights === 'string' ? parsed.insights : text
          };
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        return {
          dealScore: 50,
          isGoodDeal: false,
          priceComparison: 'Unable to compare prices',
          seasonalTrend: 'No trend data available',
          strategy: 'Monitor price before buying',
          insights: text
        };
      }
    } catch (error) {
      console.error('AI insights error:', error);
      
      // Use fallback for ANY AI error
      const fallbackAnalysisService = require('./fallbackAnalysisService');
      const fallbackResult = fallbackAnalysisService.getPriceInsights(productData);
      
      // Add error context
      if (error.status === 429 || error.message.includes('quota')) {
        console.warn('⚠️  Gemini API quota exceeded. Using fallback statistical analysis.');
      }
      
      return fallbackResult;
    }
  }

  async generatePriceAlert(productData, targetPrice) {
    try {
      if (!this.model) {
        return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice} (AI features disabled - configure GEMINI_API_KEY)`;
      }
      const prompt = `
        Create a price alert message for this product:
        
        Product: ${productData.name}
        Current Price: ${productData.currentPrice}
        Target Price: ${targetPrice}
        Price Trend: ${productData.aiAnalysis?.trend || 'unknown'}
        
        Create an engaging alert message that includes:
        1. Current vs target price
        2. Savings amount
        3. Urgency level
        4. Action recommendation
        
        Keep it concise and actionable.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return text;
    } catch (error) {
      console.error('AI alert generation error:', error);
      
      // Handle specific Gemini errors
      if (error.message.includes('API_KEY_INVALID')) {
        return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice} (AI features disabled - invalid API key. Please check your Gemini configuration.)`;
      } else if (error.message.includes('QUOTA_EXCEEDED')) {
        return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice} (AI features disabled - API quota exceeded. Please upgrade your Gemini plan.)`;
      } else if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
        return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice} (AI features temporarily unavailable - rate limit exceeded. Please try again later.)`;
      }
      
      return `Price Alert: ${productData.name} is now ₹${productData.currentPrice}. Target: ₹${targetPrice}`;
    }
  }
}

module.exports = new AIService();