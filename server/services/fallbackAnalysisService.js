/**
 * Fallback Analysis Service
 * Provides basic analysis when AI service is unavailable (quota exceeded, API down, etc.)
 */

class FallbackAnalysisService {
  
  /**
   * Analyze price trend using statistical methods (no AI)
   */
  analyzePriceTrend(priceHistory) {
    if (!priceHistory || priceHistory.length < 2) {
      return {
        trend: 'insufficient_data',
        confidence: 0,
        prediction: 'Need at least 2 price points for analysis',
        recommendation: 'Add more price data',
        stability: 'unknown',
        analysis: 'Insufficient data for analysis'
      };
    }

    const prices = priceHistory.map(p => p.price);
    const recent = prices.slice(-5); // Last 5 prices
    
    // Calculate trend
    const firstPrice = recent[0];
    const lastPrice = recent[recent.length - 1];
    const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    
    let trend = 'stable';
    if (priceChange > 5) trend = 'increasing';
    else if (priceChange < -5) trend = 'decreasing';
    
    // Calculate volatility
    const avgPrice = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / recent.length;
    const volatility = Math.sqrt(variance) / avgPrice * 100;
    
    let stability = 'stable';
    if (volatility > 10) stability = 'volatile';
    else if (volatility < 3) stability = 'very stable';
    
    // Generate prediction
    let prediction = '';
    let recommendation = '';
    
    if (trend === 'decreasing') {
      prediction = `Price has dropped ${Math.abs(priceChange).toFixed(1)}% recently. Trend suggests further decrease possible.`;
      recommendation = 'Good time to buy. Price is trending down.';
    } else if (trend === 'increasing') {
      prediction = `Price has increased ${priceChange.toFixed(1)}% recently. Upward trend detected.`;
      recommendation = 'Consider waiting. Price is trending up.';
    } else {
      prediction = `Price is stable with minimal change (${Math.abs(priceChange).toFixed(1)}%).`;
      recommendation = 'Stable pricing. Buy when needed.';
    }
    
    // Confidence based on data points
    const confidence = Math.min(95, 50 + (priceHistory.length * 5));
    
    return {
      trend,
      confidence,
      prediction,
      recommendation,
      stability,
      analysis: `Statistical analysis based on ${priceHistory.length} data points. ${prediction}`
    };
  }

  /**
   * Generate buying insights using rule-based system (no AI)
   */
  getPriceInsights(productData) {
    const currentPrice = productData.currentPrice || 0;
    const priceHistory = productData.priceHistory || [];
    const reviewSummary = productData.reviewSummary;
    
    // Calculate average historical price
    let avgPrice = currentPrice;
    if (priceHistory.length > 0) {
      const prices = priceHistory.map(p => p.price);
      avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    }
    
    // Price comparison
    const priceDiff = ((currentPrice - avgPrice) / avgPrice) * 100;
    let dealScore = 50; // Start neutral
    
    // Adjust score based on price
    if (priceDiff < -20) dealScore += 40; // 20%+ below average
    else if (priceDiff < -10) dealScore += 30; // 10-20% below
    else if (priceDiff < -5) dealScore += 20; // 5-10% below
    else if (priceDiff < 0) dealScore += 10; // 0-5% below
    else if (priceDiff > 20) dealScore -= 30; // 20%+ above
    else if (priceDiff > 10) dealScore -= 20; // 10-20% above
    else if (priceDiff > 5) dealScore -= 10; // 5-10% above
    
    // Adjust score based on reviews if available
    if (reviewSummary && reviewSummary.averageRating) {
      const rating = reviewSummary.averageRating;
      if (rating >= 4.5) dealScore += 15;
      else if (rating >= 4.0) dealScore += 10;
      else if (rating >= 3.5) dealScore += 5;
      else if (rating < 2.5) dealScore -= 15;
      else if (rating < 3.0) dealScore -= 10;
    }
    
    // Cap score at 0-100
    dealScore = Math.max(0, Math.min(100, dealScore));
    
    const isGoodDeal = dealScore >= 70;
    
    // Generate price comparison text
    let priceComparison = '';
    if (priceDiff < -10) {
      priceComparison = `Current price is ${Math.abs(priceDiff).toFixed(1)}% below average - excellent value`;
    } else if (priceDiff < -5) {
      priceComparison = `Current price is ${Math.abs(priceDiff).toFixed(1)}% below average - good deal`;
    } else if (priceDiff > 10) {
      priceComparison = `Current price is ${priceDiff.toFixed(1)}% above average - consider waiting`;
    } else {
      priceComparison = `Price is around average (${Math.abs(priceDiff).toFixed(1)}% difference)`;
    }
    
    // Generate strategy
    let strategy = '';
    if (isGoodDeal && reviewSummary?.averageRating >= 4.0) {
      strategy = 'Buy now - good price and positive customer reviews';
    } else if (isGoodDeal) {
      strategy = 'Good price point. Consider buying if product meets your needs';
    } else if (!isGoodDeal && reviewSummary?.averageRating < 3.5) {
      strategy = 'Not recommended - high price and mixed reviews';
    } else {
      strategy = 'Monitor price for better opportunities';
    }
    
    // Generate insights
    let insights = `Based on statistical analysis of ${priceHistory.length} price points. `;
    insights += priceComparison + '. ';
    
    if (reviewSummary && reviewSummary.averageRating) {
      insights += `Customer rating: ${reviewSummary.averageRating}/5 from ${reviewSummary.totalGenuineReviews} genuine reviews. `;
    }
    
    insights += strategy;
    
    return {
      dealScore,
      isGoodDeal,
      priceComparison,
      seasonalTrend: 'Seasonal trend analysis requires AI service',
      strategy,
      insights: insights + ' (AI analysis unavailable - using statistical analysis)'
    };
  }

  /**
   * Simple sentiment analysis without AI
   */
  analyzeSentiment(text) {
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'love', 'perfect', 'best',
      'awesome', 'fantastic', 'wonderful', 'quality', 'recommend'
    ];
    
    const negativeWords = [
      'bad', 'poor', 'terrible', 'worst', 'waste', 'disappointed', 'defective',
      'broken', 'useless', 'horrible', 'awful', 'never'
    ];
    
    const textLower = text.toLowerCase();
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (textLower.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (textLower.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }
}

module.exports = new FallbackAnalysisService();

