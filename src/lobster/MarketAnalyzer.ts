/**
 * MarketAnalyzer - Handles market analysis and data gathering
 *
 * Handles:
 * - Market sentiment analysis
 * - Asset analysis (price, volume, changes)
 * - Whale transaction signals
 * - TVL analysis
 * - Market snapshot and regime detection
 * - Capitulation detection
 */

import { BaseAnalytics, getAnalytics } from '../sage/analytics';
import { getCoinGecko, BASE_TOKEN_IDS } from '../data/coingecko';
import { getDuneAnalytics, WhaleTransaction } from '../data/dune-client';
import { getDefiLlama, ProtocolTVL } from '../data/defillama';

export interface MarketSentiment {
  score: number;
  fearGreedIndex: number;
  socialVolume: number;
}

export interface AssetAnalysis {
  symbol: string;
  price: number;
  priceChange24h: number;
  priceChange7d: number;
  volume24h: number;
  marketCap: number;
  high24h: number;
  low24h: number;
  sentimentScore: number;
  whaleActivity: string;
  tvlChange: string;
  timestamp: number;
}

export interface WhaleSignals {
  transactions: WhaleTransaction[];
  summary: {
    totalTransactions: number;
    totalVolumeUsd: number;
    netDirection: 'bullish' | 'bearish' | 'neutral';
  };
  timestamp: number;
}

export interface TVLAnalysis {
  chainTVL: number;
  topProtocols: ProtocolTVL[];
  tvlChange24h: number;
  timestamp: number;
}

export interface MarketSnapshot {
  regime: 'bullish' | 'bearish' | 'neutral' | 'volatile';
  whaleSentiment: 'accumulating' | 'distributing' | 'neutral';
  liquidityScore: number;
  volatility: 'low' | 'medium' | 'high';
  recommendedAction: 'enter' | 'wait' | 'exit';
  confidence: number;
  timestamp: number;
  details: {
    ethPrice: number;
    ethChange24h: number;
    whaleNetDirection: 'bullish' | 'bearish' | 'neutral';
    tvlChange24h: number;
    sentimentScore: number;
  };
}

export interface CapitulationSignal {
  detected: boolean;
  score: number;
  signals: {
    extremeFear: boolean;
    priceCrash: boolean;
    whaleAccumulation: boolean;
    tvlStable: boolean;
  };
  recommendation: 'BUY' | 'WAIT' | 'AVOID';
}

/**
 * MarketAnalyzer class for handling all market analysis operations
 */
export class MarketAnalyzer {
  private analytics: BaseAnalytics;

  constructor(analytics?: BaseAnalytics) {
    this.analytics = analytics || getAnalytics();
  }

  /**
   * Get market sentiment for analysis
   */
  async getMarketSentiment(): Promise<MarketSentiment> {
    const sentiment = await this.analytics.analyzeSentiment();
    return {
      score: sentiment.overall,
      fearGreedIndex: sentiment.overall, // Use overall as proxy for now
      socialVolume: sentiment.socialVolume
    };
  }

  /**
   * Get market analysis
   */
  async getMarketAnalysis(): Promise<any> {
    const insights = await this.analytics.generateInsights();
    const sentiment = await this.analytics.analyzeSentiment();

    return {
      timestamp: Date.now(),
      sentiment,
      insights: insights.slice(0, 5),
      summary: insights.length > 0
        ? `${insights.length} market insights detected`
        : 'Markets are calm'
    };
  }

  /**
   * Get ecosystem trends
   */
  async getEcosystemTrends(): Promise<any[]> {
    const trends = await this.analytics.scanBaseEcosystem();
    return trends;
  }

  /**
   * Get analysis for a specific asset
   * Returns price, volume, changes, and sentiment for any supported token
   */
  async getAssetAnalysis(symbol: string): Promise<AssetAnalysis | null> {
    const coinGecko = getCoinGecko();
    const coinId = BASE_TOKEN_IDS[symbol.toUpperCase()];

    if (!coinId) {
      return null;
    }

    try {
      const marketData = await coinGecko.getMarketData([coinId], {
        priceChangePercentage: '24h,7d'
      });

      const token = marketData[0];
      if (!token) return null;

      // Get sentiment from analytics
      const sentiment = await this.analytics.analyzeSentiment();

      return {
        symbol: symbol.toUpperCase(),
        price: token.current_price,
        priceChange24h: token.price_change_percentage_24h || 0,
        priceChange7d: token.price_change_percentage_7d_in_currency || 0,
        volume24h: token.total_volume,
        marketCap: token.market_cap,
        high24h: token.high_24h,
        low24h: token.low_24h,
        sentimentScore: sentiment.overall,
        whaleActivity: 'normal', // Will be enhanced with Dune
        tvlChange: 'stable', // Will be enhanced with DeFiLlama
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Error fetching analysis for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get whale transaction signals from Dune Analytics
   * Returns large transactions and aggregated signals for market analysis
   */
  async getWhaleSignals(minValueUsd: number = 50000): Promise<WhaleSignals> {
    const dune = getDuneAnalytics();
    const transactions = await dune.getWhaleTransactions(minValueUsd);

    // Calculate summary statistics
    let buyVolume = 0;
    let sellVolume = 0;

    transactions.forEach(tx => {
      if (tx.direction === 'buy') {
        buyVolume += tx.usdValue;
      } else if (tx.direction === 'sell') {
        sellVolume += tx.usdValue;
      }
    });

    const totalVolume = buyVolume + sellVolume;
    let netDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';

    if (buyVolume > sellVolume * 1.2) {
      netDirection = 'bullish';
    } else if (sellVolume > buyVolume * 1.2) {
      netDirection = 'bearish';
    }

    return {
      transactions,
      summary: {
        totalTransactions: transactions.length,
        totalVolumeUsd: totalVolume,
        netDirection
      },
      timestamp: Date.now()
    };
  }

  /**
   * Get TVL analysis for Base chain
   * Uses DeFiLlama to track total value and protocol performance
   */
  async getTVLAnalysis(): Promise<TVLAnalysis> {
    const defiLlama = getDefiLlama();

    // Parallel fetch for speed
    const [chainTvl, protocols] = await Promise.all([
      defiLlama.getBaseTVL(),
      defiLlama.getTopBaseProtocols(5)
    ]);

    // Calculate aggregate 24h change from top protocols (approximation)
    // Weighted average based on TVL
    let totalWeightedChange = 0;
    let totalTvl = 0;

    protocols.forEach((p: ProtocolTVL) => {
      if (p.tvl && p.change_1d) {
        totalWeightedChange += p.tvl * p.change_1d;
        totalTvl += p.tvl;
      }
    });

    const avgChange24h = totalTvl > 0 ? totalWeightedChange / totalTvl : 0;

    return {
      chainTVL: chainTvl,
      topProtocols: protocols,
      tvlChange24h: avgChange24h,
      timestamp: Date.now()
    };
  }

  /**
   * Get market snapshot for trading decisions
   * Analyzes market regime, whale sentiment, liquidity, and provides recommendations
   */
  async getMarketSnapshot(): Promise<MarketSnapshot> {
    const coinGecko = getCoinGecko();
    const ethPriceData = await coinGecko.getSimplePrices(['ethereum'], { include24hChange: true });
    const ethPrice = ethPriceData['ethereum']?.usd || 0;
    const ethChange24h = ethPriceData['ethereum']?.usd_24h_change || 0;

    // Get whale signals
    const whaleSignals = await this.getWhaleSignals(50000);
    const whaleNetDirection = whaleSignals.summary.netDirection;
    const whaleSentiment = whaleNetDirection === 'bullish' ? 'accumulating' :
                          whaleNetDirection === 'bearish' ? 'distributing' : 'neutral';

    // Get TVL analysis
    const tvlAnalysis = await this.getTVLAnalysis();
    const tvlChange24h = tvlAnalysis.tvlChange24h;

    // Get market sentiment
    const sentiment = await this.getMarketSentiment();
    const sentimentScore = sentiment.score;

    // Determine regime
    let regime: 'bullish' | 'bearish' | 'neutral' | 'volatile';
    const volatility = Math.abs(ethChange24h) > 8 ? 'high' :
                      Math.abs(ethChange24h) > 4 ? 'medium' : 'low';

    if (volatility === 'high') {
      regime = 'volatile';
    } else if (ethChange24h > 3 && sentimentScore > 55) {
      regime = 'bullish';
    } else if (ethChange24h < -3 && sentimentScore < 45) {
      regime = 'bearish';
    } else {
      regime = 'neutral';
    }

    // Calculate liquidity score (0-100)
    const liquidityScore = Math.min(100, Math.max(0, 50 + tvlChange24h * 2));

    // Determine recommended action and confidence
    let recommendedAction: 'enter' | 'wait' | 'exit';
    let confidence = 50;

    if (regime === 'bullish' && whaleSentiment === 'accumulating') {
      recommendedAction = 'enter';
      confidence = Math.min(95, 50 + sentimentScore + Math.abs(ethChange24h) * 2);
    } else if (regime === 'bearish' || whaleSentiment === 'distributing') {
      recommendedAction = 'exit';
      confidence = Math.min(95, 50 + Math.abs(ethChange24h) * 3);
    } else {
      recommendedAction = 'wait';
      confidence = 60;
    }

    return {
      regime,
      whaleSentiment,
      liquidityScore: Math.round(liquidityScore),
      volatility,
      recommendedAction,
      confidence: Math.round(confidence),
      timestamp: Date.now(),
      details: {
        ethPrice: Number(ethPrice.toFixed(2)),
        ethChange24h: Number(ethChange24h.toFixed(2)),
        whaleNetDirection,
        tvlChange24h: Number(tvlChange24h.toFixed(2)),
        sentimentScore: Math.round(sentimentScore)
      }
    };
  }

  /**
   * Detect potential market capitulation
   * Signals "buy" when:
   * 1. Price is down significantly (Fear)
   * 2. Whales are accumulating (Smart Money)
   * 3. TVL is relatively stable (Protocol Health)
   */
  async detectCapitulation(): Promise<CapitulationSignal> {
    const coinGecko = getCoinGecko();

    // 1. Get Sentiment & Price Data
    const sentiment = await this.analytics.analyzeSentiment();
    const ethPrice = await coinGecko.getSimplePrices(['ethereum'], { include24hChange: true });

    const ethChange = ethPrice['ethereum']?.usd_24h_change || 0;
    const fearScore = sentiment.overall; // 0-100, lower is fear

    // 2. Get Whale Data
    const whales = await this.getWhaleSignals(100000); // Check larger whales >$100k

    // 3. Get TVL Data
    const tvl = await this.getTVLAnalysis();

    // Evaluate Signals
    const isExtremeFear = fearScore < 25;
    const isPriceCrash = ethChange < -8; // >8% drop in 24h
    const isWhaleAccumulating = whales.summary.netDirection === 'bullish';
    const isTvlStable = Math.abs(tvl.tvlChange24h) < 5; // TVL didn't crash as hard as price

    // Calculate Score (0-100)
    let score = 0;
    if (isExtremeFear) score += 30;
    if (isPriceCrash) score += 30;
    if (isWhaleAccumulating) score += 20; // Whales buying the dip
    if (isTvlStable) score += 20;     // Fundamentals strong

    // Decision logic
    let recommendation: 'BUY' | 'WAIT' | 'AVOID' = 'AVOID';
    let detected = false;

    // True Capitulation Fishing: High Fear + Price Crash + Smart Money Buying
    if (score >= 70 && isWhaleAccumulating) {
      recommendation = 'BUY';
      detected = true;
    } else if (score >= 50) {
      recommendation = 'WAIT'; // Watchlist
    }

    return {
      detected,
      score,
      signals: {
        extremeFear: isExtremeFear,
        priceCrash: isPriceCrash,
        whaleAccumulation: isWhaleAccumulating,
        tvlStable: isTvlStable
      },
      recommendation
    };
  }
}
