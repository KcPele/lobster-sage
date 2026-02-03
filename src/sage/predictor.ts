// Prediction Engine for LobsterSage

export interface MarketData {
  price: number;
  volume24h: number;
  priceChange24h: number;
  liquidity: number;
  targetMarket?: string;
}

export interface SentimentData {
  score: number; // -1 to 1
  volume: number;
  trending: string[];
}

export interface OnchainMetrics {
  whaleMovements: number;
  tvlChange: number;
  activeAddresses: number;
}

export interface PredictionInput {
  marketData: MarketData;
  sentiment: SentimentData;
  metrics: OnchainMetrics;
  timeframe?: string;
}

export interface Prediction {
  id: string;
  market: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-100
  currentPrice: number;
  targetPrice: number;
  timeframe: string;
  reasoning: string;
  timestamp: number;
  stakeAmount?: number;
  tokenAddress?: string; // Contract address for dynamic token trading (e.g., "0x...")
}

export interface PredictionConfig {
  minConfidence: number;
  maxStakePercent: number;
  defaultTimeframe: string;
}

/**
 * AI Prediction Engine for LobsterSage
 * Generates predictions with confidence scores based on market data
 */
export class PredictorEngine {
  private config: PredictionConfig;
  private predictions: Map<string, Prediction> = new Map();

  constructor(config?: Partial<PredictionConfig>) {
    this.config = {
      minConfidence: 65,
      maxStakePercent: 20,
      defaultTimeframe: '7d',
      ...config
    };
  }

  /**
   * Generate a prediction based on market analysis
   */
  async generatePrediction(input: PredictionInput): Promise<Prediction | null> {
    const { marketData, sentiment, metrics } = input;
    
    // Analyze market conditions
    const trendStrength = this.calculateTrendStrength(marketData);
    const sentimentScore = sentiment.score;
    const whaleActivity = Math.min(metrics.whaleMovements / 10, 1);
    
    // Determine direction
    let direction: 'bullish' | 'bearish' | 'neutral';
    let confidence: number;
    
    const combinedScore = (trendStrength * 0.4) + (sentimentScore * 0.4) + (whaleActivity * 0.2);
    
    if (combinedScore > 0.3) {
      direction = 'bullish';
      confidence = Math.round(50 + (combinedScore * 50));
    } else if (combinedScore < -0.3) {
      direction = 'bearish';
      confidence = Math.round(50 + (Math.abs(combinedScore) * 50));
    } else {
      direction = 'neutral';
      confidence = Math.round(60 + (Math.abs(combinedScore) * 20));
    }

    // Cap confidence at 95%
    confidence = Math.min(confidence, 95);

    // Generate target price
    const priceChange = direction === 'bullish' ? 0.1 : direction === 'bearish' ? -0.1 : 0;
    const targetPrice = marketData.price * (1 + priceChange);

    // Check if meets minimum confidence
    if (confidence < this.config.minConfidence) {
      return null;
    }

    const prediction: Prediction = {
      id: this.generateId(),
      market: input.marketData.targetMarket || 'ETH',
      direction,
      confidence,
      currentPrice: marketData.price,
      targetPrice,
      timeframe: input.timeframe || this.config.defaultTimeframe,
      reasoning: this.generateReasoning(direction, trendStrength, sentimentScore, whaleActivity),
      timestamp: Date.now()
    };

    this.predictions.set(prediction.id, prediction);
    return prediction;
  }

  /**
   * Validate if a prediction meets criteria
   */
  async validatePrediction(prediction: Prediction): Promise<boolean> {
    return prediction.confidence >= this.config.minConfidence;
  }

  /**
   * Resolve a prediction when timeframe expires
   */
  async resolvePrediction(
    predictionId: string, 
    actualPrice: number
  ): Promise<{ success: boolean; profitLoss: number } | null> {
    const prediction = this.predictions.get(predictionId);
    if (!prediction) return null;

    const priceChange = (actualPrice - prediction.currentPrice) / prediction.currentPrice;
    
    let success = false;
    if (prediction.direction === 'bullish' && priceChange > 0.05) {
      success = true;
    } else if (prediction.direction === 'bearish' && priceChange < -0.05) {
      success = true;
    } else if (prediction.direction === 'neutral' && Math.abs(priceChange) < 0.05) {
      success = true;
    }

    // Calculate P&L (simplified)
    const profitLoss = success ? prediction.stakeAmount! * 0.1 : -prediction.stakeAmount! * 0.1;

    return { success, profitLoss };
  }

  /**
   * Calculate accuracy of all predictions
   */
  calculateAccuracy(resolvedPredictions: { prediction: Prediction; success: boolean }[]): number {
    if (resolvedPredictions.length === 0) return 0;
    
    const correct = resolvedPredictions.filter(p => p.success).length;
    return (correct / resolvedPredictions.length) * 100;
  }

  /**
   * Get active predictions
   */
  getActivePredictions(): Prediction[] {
    return Array.from(this.predictions.values());
  }

  /**
   * Calculate trend strength from market data
   */
  private calculateTrendStrength(marketData: MarketData): number {
    const priceMomentum = marketData.priceChange24h / 100;
    const volumeScore = Math.min(marketData.volume24h / 1000000, 1);
    
    return Math.max(-1, Math.min(1, priceMomentum * 0.6 + volumeScore * 0.4));
  }

  /**
   * Generate reasoning for prediction
   */
  private generateReasoning(
    _direction: string, 
    trendStrength: number, 
    sentiment: number,
    whaleActivity: number
  ): string {
    const reasons: string[] = [];
    
    if (Math.abs(trendStrength) > 0.3) {
      reasons.push(`Strong ${trendStrength > 0 ? 'upward' : 'downward'} price momentum`);
    }
    
    if (Math.abs(sentiment) > 0.3) {
      reasons.push(`${sentiment > 0 ? 'Positive' : 'Negative'} social sentiment`);
    }
    
    if (whaleActivity > 0.5) {
      reasons.push('Significant whale activity detected');
    }
    
    return reasons.join('. ') || 'Based on technical analysis';
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default PredictorEngine;
