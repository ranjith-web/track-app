const { GoogleGenerativeAI } = require('@google/generative-ai');

class ReviewAnalysisService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || 'AIzaSyAV5DQj5ctKip3K4oGPKqfLWtGIXd6xN9g';
    this.genAI = null;
    this.model = null;
    
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          temperature: 0,
          topK: 1,
          topP: 1,
        }
      });
    }
  }

  /**
   * Detect if a review is likely fake using multiple signals
   * @param {Object} review - Review object with text, rating, date, reviewer info
   * @returns {Object} - Authenticity score and reasons
   */
  async detectFakeReview(review) {
    try {
      const signals = {
        textQuality: this.analyzeTextQuality(review.text),
        reviewerProfile: this.analyzeReviewerProfile(review.reviewer),
        ratingPattern: this.analyzeRatingPattern(review.rating, review.text),
        timingPattern: this.analyzeTimingPattern(review.date),
        verifiedPurchase: review.verifiedPurchase || false,
        helpfulVotes: review.helpfulVotes || 0
      };

      // Calculate authenticity score (0-100, higher = more genuine)
      let authenticityScore = 50; // Start at neutral

      // Verified purchase = +30 points
      if (signals.verifiedPurchase) {
        authenticityScore += 30;
      }

      // Text quality score
      authenticityScore += signals.textQuality.score;

      // Reviewer profile score
      authenticityScore += signals.reviewerProfile.score;

      // Rating-text match score
      authenticityScore += signals.ratingPattern.score;

      // Helpful votes (normalized)
      if (signals.helpfulVotes > 10) {
        authenticityScore += 10;
      } else if (signals.helpfulVotes > 5) {
        authenticityScore += 5;
      }

      // Cap at 0-100
      authenticityScore = Math.max(0, Math.min(100, authenticityScore));

      // Use AI for final verification on borderline cases
      if (authenticityScore >= 40 && authenticityScore <= 70 && this.model) {
        const aiScore = await this.aiAuthenticityCheck(review);
        authenticityScore = (authenticityScore + aiScore) / 2;
      }

      return {
        isGenuine: authenticityScore >= 60, // 60+ = genuine
        authenticityScore: Math.round(authenticityScore),
        confidence: this.calculateConfidence(signals),
        signals: signals,
        reasons: this.generateReasons(signals, authenticityScore)
      };
    } catch (error) {
      console.error('Fake review detection error:', error);
      // On error, be conservative - mark as potentially fake
      return {
        isGenuine: false,
        authenticityScore: 40,
        confidence: 'low',
        signals: {},
        reasons: ['Unable to verify authenticity']
      };
    }
  }

  /**
   * Analyze text quality for signs of fake reviews
   */
  analyzeTextQuality(text) {
    if (!text || text.trim().length === 0) {
      return { score: -20, issues: ['Empty review'] };
    }

    const issues = [];
    let score = 0;

    // Length analysis
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 5) {
      issues.push('Too short');
      score -= 15;
    } else if (wordCount > 20 && wordCount < 200) {
      score += 10; // Detailed reviews are good
    } else if (wordCount > 200) {
      score += 5; // Very detailed (could be genuine or fake)
    }

    // Generic phrases detection (common in fake reviews)
    const genericPhrases = [
      'best product ever',
      'highly recommend',
      'amazing product',
      'must buy',
      'worth the money',
      'value for money',
      'excellent quality'
    ];
    
    const textLower = text.toLowerCase();
    let genericCount = 0;
    genericPhrases.forEach(phrase => {
      if (textLower.includes(phrase)) {
        genericCount++;
      }
    });

    if (genericCount === 0 && wordCount > 15) {
      score += 10; // Specific, detailed reviews
    } else if (genericCount > 3) {
      issues.push('Too many generic phrases');
      score -= 15;
    }

    // ALL CAPS detection (spammy)
    const capsPercentage = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsPercentage > 0.3) {
      issues.push('Excessive capitals');
      score -= 10;
    }

    // Excessive punctuation (!!!, ???)
    if (text.match(/[!?]{3,}/)) {
      issues.push('Excessive punctuation');
      score -= 5;
    }

    // Specific product details (good sign)
    if (textLower.match(/(size|color|fit|quality|material|delivery|packaging)/gi)) {
      score += 10;
      issues.push('Contains specific details');
    }

    return { score, issues };
  }

  /**
   * Analyze reviewer profile for authenticity
   */
  analyzeReviewerProfile(reviewer) {
    if (!reviewer) {
      return { score: 0, issues: ['No reviewer info'] };
    }

    const issues = [];
    let score = 0;

    // Total reviews by user
    if (reviewer.totalReviews) {
      if (reviewer.totalReviews > 50) {
        score += 15; // Active reviewer
      } else if (reviewer.totalReviews > 10) {
        score += 10;
      } else if (reviewer.totalReviews === 1) {
        score -= 10; // New reviewer (suspicious)
        issues.push('Only 1 review');
      }
    }

    // Account age
    if (reviewer.memberSince) {
      const accountAge = (Date.now() - new Date(reviewer.memberSince)) / (1000 * 60 * 60 * 24);
      if (accountAge > 365) {
        score += 10; // Old account
      } else if (accountAge < 30) {
        score -= 10; // Very new account
        issues.push('New account');
      }
    }

    // Reviewer name patterns (fake names often generic)
    if (reviewer.name) {
      const genericNames = ['Amazon Customer', 'Customer', 'Flipkart Customer', 'User'];
      if (genericNames.some(name => reviewer.name.includes(name))) {
        score -= 5;
        issues.push('Generic name');
      }
    }

    return { score, issues };
  }

  /**
   * Analyze if rating matches review text sentiment
   */
  analyzeRatingPattern(rating, text) {
    if (!text || !rating) {
      return { score: 0, issues: ['Missing data'] };
    }

    const issues = [];
    let score = 0;

    const textLower = text.toLowerCase();

    // Positive words
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'perfect', 'best'];
    const positiveCount = positiveWords.filter(word => textLower.includes(word)).length;

    // Negative words
    const negativeWords = ['bad', 'poor', 'terrible', 'worst', 'waste', 'disappointed', 'defective'];
    const negativeCount = negativeWords.filter(word => textLower.includes(word)).length;

    // Check rating-sentiment match
    if (rating >= 4) {
      // High rating should have positive sentiment
      if (positiveCount > negativeCount) {
        score += 15; // Match!
      } else if (negativeCount > positiveCount) {
        score -= 20; // Mismatch! Suspicious
        issues.push('Rating-sentiment mismatch');
      }
    } else if (rating <= 2) {
      // Low rating should have negative sentiment
      if (negativeCount > positiveCount) {
        score += 15; // Match!
      } else if (positiveCount > negativeCount) {
        score -= 20; // Mismatch! Suspicious
        issues.push('Rating-sentiment mismatch');
      }
    }

    return { score, issues };
  }

  /**
   * Analyze timing patterns (burst of reviews = suspicious)
   */
  analyzeTimingPattern(reviewDate) {
    // This would require multiple reviews to detect patterns
    // For now, just check if review is very recent (first day reviews can be incentivized)
    if (!reviewDate) {
      return { score: 0, issues: [] };
    }

    const daysSinceReview = (Date.now() - new Date(reviewDate)) / (1000 * 60 * 60 * 24);
    
    if (daysSinceReview < 1) {
      return { score: -5, issues: ['Very recent review'] };
    } else if (daysSinceReview > 30) {
      return { score: 5, issues: [] }; // Older reviews more trustworthy
    }

    return { score: 0, issues: [] };
  }

  /**
   * AI-powered authenticity check for borderline cases
   */
  async aiAuthenticityCheck(review) {
    try {
      if (!this.model) return 50;

      const prompt = `Analyze this product review for authenticity (0-100, higher = more genuine):

Review Text: "${review.text}"
Rating: ${review.rating}/5
Verified Purchase: ${review.verifiedPurchase ? 'Yes' : 'No'}

Detect signs of:
1. Fake/incentivized reviews (generic praise, no specifics)
2. Competitor sabotage (extreme negativity without details)
3. Genuine customer experience (specific details, balanced view)

Respond with ONLY a number 0-100 representing authenticity score.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      
      const score = parseInt(text);
      return isNaN(score) ? 50 : Math.max(0, Math.min(100, score));
    } catch (error) {
      // Silently fallback to rule-based score on AI error (quota, etc.)
      if (error.status === 429) {
        console.warn('⚠️  Gemini quota exceeded in review analysis. Using rule-based scoring.');
      }
      return 50; // Neutral score - rely on other signals
    }
  }

  /**
   * Calculate confidence in the authenticity determination
   */
  calculateConfidence(signals) {
    let indicators = 0;
    let totalIndicators = 0;

    // Count strong indicators
    if (signals.verifiedPurchase) indicators++;
    totalIndicators++;

    if (signals.reviewerProfile?.score > 10) indicators++;
    totalIndicators++;

    if (signals.textQuality?.score > 5) indicators++;
    totalIndicators++;

    if (signals.ratingPattern?.score > 10) indicators++;
    totalIndicators++;

    const confidenceRatio = indicators / totalIndicators;
    
    if (confidenceRatio > 0.75) return 'high';
    if (confidenceRatio > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Generate human-readable reasons
   */
  generateReasons(signals, score) {
    const reasons = [];

    if (score >= 80) {
      reasons.push('Strong authenticity indicators');
    }

    if (signals.verifiedPurchase) {
      reasons.push('Verified purchase');
    }

    if (signals.textQuality?.score > 10) {
      reasons.push('Detailed, specific review');
    }

    if (signals.reviewerProfile?.score > 10) {
      reasons.push('Established reviewer');
    }

    if (signals.helpfulVotes > 10) {
      reasons.push('Helpful to other customers');
    }

    // Negative reasons
    if (signals.textQuality?.issues?.includes('Too short')) {
      reasons.push('Very brief review');
    }

    if (signals.textQuality?.issues?.includes('Too many generic phrases')) {
      reasons.push('Contains generic marketing language');
    }

    if (signals.ratingPattern?.issues?.includes('Rating-sentiment mismatch')) {
      reasons.push('Rating doesn\'t match review content');
    }

    if (signals.reviewerProfile?.issues?.includes('Only 1 review')) {
      reasons.push('New or inactive reviewer');
    }

    return reasons;
  }

  /**
   * Analyze multiple reviews and filter genuine ones
   */
  async filterGenuineReviews(reviews) {
    if (!reviews || reviews.length === 0) {
      return {
        genuine: [],
        suspicious: [],
        stats: {
          total: 0,
          genuine: 0,
          suspicious: 0,
          genuinePercentage: 0
        }
      };
    }

    const analyzed = await Promise.all(
      reviews.map(async (review) => {
        const analysis = await this.detectFakeReview(review);
        return {
          ...review,
          analysis
        };
      })
    );

    const genuine = analyzed.filter(r => r.analysis.isGenuine);
    const suspicious = analyzed.filter(r => !r.analysis.isGenuine);

    return {
      genuine,
      suspicious,
      stats: {
        total: reviews.length,
        genuine: genuine.length,
        suspicious: suspicious.length,
        genuinePercentage: Math.round((genuine.length / reviews.length) * 100)
      }
    };
  }

  /**
   * Generate summary insights from genuine reviews
   */
  async generateReviewInsights(genuineReviews) {
    if (!genuineReviews || genuineReviews.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        sentiment: 'neutral',
        pros: [],
        cons: [],
        summary: 'No genuine reviews available'
      };
    }

    // Calculate average rating
    const avgRating = genuineReviews.reduce((sum, r) => sum + r.rating, 0) / genuineReviews.length;

    // Extract pros and cons using AI
    const reviewTexts = genuineReviews.slice(0, 20).map(r => r.text).join('\n\n');
    
    let pros = [];
    let cons = [];
    let summary = '';

    if (this.model) {
      try {
        const prompt = `Analyze these genuine product reviews and extract:

Reviews:
${reviewTexts}

Provide a JSON response with:
{
  "pros": ["list of 3-5 main positive points"],
  "cons": ["list of 3-5 main negative points"],
  "summary": "2-sentence overall summary"
}`;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          pros = insights.pros || [];
          cons = insights.cons || [];
          summary = insights.summary || '';
        }
      } catch (error) {
        if (error.status === 429) {
          console.warn('⚠️  Gemini quota exceeded in review insights. Using basic analysis.');
        } else {
          console.error('Review insights generation error:', error);
        }
        // Continue with basic stats even if AI fails
      }
    }

    // Determine overall sentiment
    let sentiment = 'neutral';
    if (avgRating >= 4) sentiment = 'positive';
    else if (avgRating <= 2) sentiment = 'negative';

    return {
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews: genuineReviews.length,
      sentiment,
      pros,
      cons,
      summary: summary || `Based on ${genuineReviews.length} genuine reviews, average rating is ${avgRating.toFixed(1)}/5.`
    };
  }
}

module.exports = new ReviewAnalysisService();

