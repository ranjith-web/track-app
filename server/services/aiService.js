const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || 'AIzaSyAV5DQj5ctKip3K4oGPKqfLWtGIXd6xN9g';
    this.genAI = null;
    this.model = null;
    
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
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

      if (!priceHistory || priceHistory.length < 2) {
        return {
          trend: 'insufficient_data',
          confidence: 0,
          prediction: 'Need more price data for accurate analysis'
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
      
      // Handle specific Gemini errors
      if (error.message.includes('API_KEY_INVALID')) {
        return {
          trend: 'unknown',
          confidence: 0,
          prediction: 'AI analysis unavailable - invalid API key',
          recommendation: 'Please check your Gemini API key configuration',
          stability: 'unknown',
          analysis: 'Gemini API key is invalid. Please check your configuration.'
        };
      } else if (error.message.includes('QUOTA_EXCEEDED')) {
        return {
          trend: 'unknown',
          confidence: 0,
          prediction: 'AI analysis unavailable - API quota exceeded',
          recommendation: 'Please check your Gemini billing and upgrade your plan',
          stability: 'unknown',
          analysis: 'Gemini API quota exceeded. Please upgrade your plan or wait for quota reset.'
        };
      } else if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
        return {
          trend: 'unknown',
          confidence: 0,
          prediction: 'AI analysis temporarily unavailable - rate limit exceeded',
          recommendation: 'Please try again in a few minutes',
          stability: 'unknown',
          analysis: 'Gemini API rate limit exceeded. Please try again later.'
        };
      }
      
      return {
        trend: 'unknown',
        confidence: 0,
        prediction: 'AI analysis temporarily unavailable',
        recommendation: 'Manual price monitoring recommended',
        stability: 'unknown',
        analysis: 'Error in AI analysis'
      };
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
      const prompt = `
        Analyze this product and provide buying insights:
        
        Product: ${productData.name}
        Current Price: ${productData.currentPrice}
        Price History: ${JSON.stringify(productData.priceHistory?.slice(-5) || [])}
        
        Provide insights on:
        1. Is this a good deal?
        2. Price comparison across platforms
        3. Seasonal trends
        4. Best buying strategy
        
        Respond in JSON format:
        {
          "dealScore": 85,
          "isGoodDeal": true,
          "priceComparison": "Amazon offers best price",
          "seasonalTrend": "Prices typically drop in December",
          "strategy": "Wait for next sale or buy now if urgent",
          "insights": "Detailed buying recommendations"
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
      
      // Handle specific Gemini errors
      if (error.message.includes('API_KEY_INVALID')) {
        return {
          dealScore: 0,
          isGoodDeal: false,
          priceComparison: 'AI analysis unavailable - invalid API key',
          seasonalTrend: 'No data available',
          strategy: 'Please check your Gemini API key configuration',
          insights: 'Gemini API key is invalid. Please check your configuration.'
        };
      } else if (error.message.includes('QUOTA_EXCEEDED')) {
        return {
          dealScore: 0,
          isGoodDeal: false,
          priceComparison: 'AI analysis unavailable - API quota exceeded',
          seasonalTrend: 'No data available',
          strategy: 'Please check your Gemini billing and upgrade your plan',
          insights: 'Gemini API quota exceeded. Please upgrade your plan or wait for quota reset.'
        };
      } else if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
        return {
          dealScore: 0,
          isGoodDeal: false,
          priceComparison: 'AI analysis temporarily unavailable - rate limit exceeded',
          seasonalTrend: 'No data available',
          strategy: 'Please try again in a few minutes',
          insights: 'Gemini API rate limit exceeded. Please try again later.'
        };
      }
      
      return {
        dealScore: 0,
        isGoodDeal: false,
        priceComparison: 'Analysis unavailable',
        seasonalTrend: 'No data available',
        strategy: 'Manual research recommended',
        insights: 'AI analysis temporarily unavailable'
      };
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