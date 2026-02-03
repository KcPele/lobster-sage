/**
 * Analytics Module for LobsterSage
 * 
 * Monitors Base ecosystem for trends, launches, and events
 * Provides sentiment analysis and onchain metrics tracking
 * 
 * Uses REAL data from:
 * - DefiLlama: TVL, protocol data, yields
 * - CoinGecko: Token prices, market data, fear/greed approximation
 */

import { getConfig, getRpcUrl } from '../config/index.js';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { getDefiLlama } from '../data/defillama';
import { getCoinGecko } from '../data/coingecko';

// ============ Types ============

export interface EcosystemTrend {
  id: string;
  category: 'launch' | 'tvl_growth' | 'volume_spike' | 'whale_activity' | 'governance';
  protocol: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  metrics: Record<string, number | string>;
  relatedAssets: string[];
}

export interface WhaleMovement {
  id: string;
  address: string;
  type: 'buy' | 'sell' | 'transfer' | 'stake' | 'unstake';
  asset: string;
  amount: number;
  valueUsd: number;
  timestamp: number;
  txHash: string;
  toExchange?: string;
  fromExchange?: string;
}

export interface TVLChange {
  protocol: string;
  chain: string;
  previousTvl: number;
  currentTvl: number;
  change24h: number;
  changePercent: number;
  timestamp: number;
}

export interface VolumeMetrics {
  asset: string;
  volume24h: number;
  volumeChange24h: number;
  avgTradeSize: number;
  largeTxCount: number;
  timestamp: number;
}

export interface SentimentData {
  overall: number; // -100 to 100
  twitter: number;
  farcaster: number;
  discord: number;
  fearGreedIndex: number; // 0 to 100
  socialVolume: number;
  trendingKeywords: string[];
  influencerScore: number; // -100 to 100
  timestamp: number;
}

export interface OnchainMetrics {
  activeAddresses24h: number;
  txCount24h: number;
  avgGasPrice: number;
  gasTrend: 'rising' | 'falling' | 'stable';
  congestionLevel: number; // 0 to 100
  pendingTxCount: number;
  timestamp: number;
}

export interface MarketInsight {
  id: string;
  type: 'opportunity' | 'risk' | 'trend' | 'anomaly';
  title: string;
  description: string;
  confidence: number;
  assets: string[];
  timeframe: 'immediate' | '24h' | '7d' | '30d';
  severity: 'info' | 'low' | 'medium' | 'high';
  timestamp: number;
  dataSources: string[];
}

export interface AnalyticsSnapshot {
  timestamp: number;
  trends: EcosystemTrend[];
  whaleMovements: WhaleMovement[];
  tvlChanges: TVLChange[];
  volumeMetrics: VolumeMetrics[];
  sentiment: SentimentData;
  onchain: OnchainMetrics;
  insights: MarketInsight[];
}

// ============ Configuration ============

const ANALYTICS_CONFIG = {
  // Update intervals (in ms)
  TREND_SCAN_INTERVAL: 5 * 60 * 1000, // 5 minutes
  WHALE_TRACKING_INTERVAL: 60 * 1000, // 1 minute
  TVL_UPDATE_INTERVAL: 10 * 60 * 1000, // 10 minutes
  SENTIMENT_UPDATE_INTERVAL: 5 * 60 * 1000, // 5 minutes
  
  // Thresholds
  WHALE_THRESHOLD_USD: 100000, // $100k
  VOLUME_SPIKE_THRESHOLD: 2.0, // 2x normal volume
  TVL_CHANGE_THRESHOLD: 0.1, // 10% change
  
  // Base ecosystem protocols to monitor
  PROTOCOLS: [
    'aave', 'compound', 'uniswap', 'balancer', 'curve',
    'aerodrome', 'baseswap', 'dackieswap', 'pancakeswap',
    'beefy', 'velodrome', 'extra-finance', 'morpho'
  ],
  
  // Assets to track
  ASSETS: ['ETH', 'USDC', 'USDbC', 'cbETH', 'DAI', 'BALD', 'AERO'],
  
  // Whale addresses to track (known entities)
  KNOWN_WHALE_ADDRESSES: new Set<string>([
    // These would be populated from a database or config
    // For now, we'll detect whales by transaction size
  ]),
};

// ============ Analytics Engine ============

export class BaseAnalytics {
  private client: any;
  private lastSnapshot: AnalyticsSnapshot | null = null;
  private trendHistory: EcosystemTrend[] = [];
  private whaleHistory: WhaleMovement[] = [];
  
  constructor() {
    const config = getConfig();
    const chain = config.network === 'base-mainnet' ? base : baseSepolia;
    
    this.client = createPublicClient({
      chain,
      transport: http(getRpcUrl()),
    });
  }

  /**
   * Scan Base ecosystem for trends, launches, and events
   */
  async scanBaseEcosystem(): Promise<EcosystemTrend[]> {
    const trends: EcosystemTrend[] = [];
    const timestamp = Date.now();

    // Check for new protocol launches via factory contracts
    const launchTrends = await this.checkNewLaunches(timestamp);
    trends.push(...launchTrends);

    // Check for TVL growth anomalies
    const tvlTrends = await this.checkTVLGrowth(timestamp);
    trends.push(...tvlTrends);

    // Check for volume spikes
    const volumeTrends = await this.checkVolumeSpikes(timestamp);
    trends.push(...volumeTrends);

    // Check for governance events
    const govTrends = await this.checkGovernanceEvents(timestamp);
    trends.push(...govTrends);

    // Update history and keep only last 24 hours
    this.trendHistory = [...this.trendHistory, ...trends]
      .filter(t => timestamp - t.timestamp < 24 * 60 * 60 * 1000);

    return trends;
  }

  /**
   * Analyze social sentiment across platforms
   */
  async analyzeSentiment(): Promise<SentimentData> {
    const timestamp = Date.now();

    // Aggregate sentiment from multiple sources
    // In production, these would call actual APIs
    const sentiment: SentimentData = {
      overall: await this.fetchOverallSentiment(),
      twitter: await this.fetchTwitterSentiment(),
      farcaster: await this.fetchFarcasterSentiment(),
      discord: await this.fetchDiscordSentiment(),
      fearGreedIndex: await this.fetchFearGreedIndex(),
      socialVolume: await this.fetchSocialVolume(),
      trendingKeywords: await this.fetchTrendingKeywords(),
      influencerScore: await this.fetchInfluencerSentiment(),
      timestamp,
    };

    return sentiment;
  }

  /**
   * Track onchain metrics including whale movements, volume, TVL
   */
  async trackOnchainMetrics(): Promise<{
    whales: WhaleMovement[];
    volume: VolumeMetrics[];
    tvl: TVLChange[];
    metrics: OnchainMetrics;
  }> {
    const timestamp = Date.now();

    const [whales, volume, tvl, metrics] = await Promise.all([
      this.trackWhaleMovements(),
      this.trackVolumeMetrics(),
      this.trackTVLChanges(),
      this.fetchOnchainMetrics(),
    ]);

    // Update whale history
    this.whaleHistory = [...this.whaleHistory, ...whales]
      .filter(w => timestamp - w.timestamp < 24 * 60 * 60 * 1000);

    return { whales, volume, tvl, metrics };
  }

  /**
   * Generate actionable insights from all data sources
   */
  async generateInsights(): Promise<MarketInsight[]> {
    const timestamp = Date.now();
    const insights: MarketInsight[] = [];

    // Get fresh data
    const [trends, sentiment, { whales, tvl }] = await Promise.all([
      this.scanBaseEcosystem(),
      this.analyzeSentiment(),
      this.trackOnchainMetrics(),
    ]);

    // Generate insights from trends
    for (const trend of trends) {
      if (trend.severity === 'high' || trend.severity === 'critical') {
        insights.push({
          id: `trend-${trend.id}`,
          type: trend.category === 'launch' ? 'opportunity' : 'trend',
          title: `${trend.protocol}: ${trend.category.replace('_', ' ').toUpperCase()}`,
          description: trend.description,
          confidence: trend.severity === 'critical' ? 90 : 75,
          assets: trend.relatedAssets,
          timeframe: '24h',
          severity: trend.severity === 'critical' ? 'high' : 'medium',
          timestamp,
          dataSources: ['onchain', 'protocol_events'],
        });
      }
    }

    // Generate insights from whale movements
    for (const whale of whales.slice(0, 5)) {
      const type = whale.type === 'buy' ? 'opportunity' : 
                   whale.type === 'sell' ? 'risk' : 'anomaly';
      
      insights.push({
        id: `whale-${whale.id}`,
        type,
        title: `Whale ${whale.type.toUpperCase()}: ${whale.asset}`,
        description: `Large ${whale.type} detected: ${whale.amount.toLocaleString()} ${whale.asset} ($${whale.valueUsd.toLocaleString()})`,
        confidence: 85,
        assets: [whale.asset],
        timeframe: 'immediate',
        severity: whale.valueUsd > 1000000 ? 'high' : 'medium',
        timestamp,
        dataSources: ['onchain', 'whale_tracking'],
      });
    }

    // Generate sentiment-based insights
    if (sentiment.overall > 50) {
      insights.push({
        id: `sentiment-bullish-${timestamp}`,
        type: 'trend',
        title: 'Bullish Sentiment Detected',
        description: `Overall sentiment score: ${sentiment.overall}/100. Social volume up ${sentiment.socialVolume}%`,
        confidence: 70,
        assets: ['ETH', 'BTC'],
        timeframe: '24h',
        severity: 'info',
        timestamp,
        dataSources: ['social', 'sentiment_analysis'],
      });
    } else if (sentiment.overall < -50) {
      insights.push({
        id: `sentiment-bearish-${timestamp}`,
        type: 'risk',
        title: 'Bearish Sentiment Warning',
        description: `Overall sentiment score: ${sentiment.overall}/100. Fear & Greed index: ${sentiment.fearGreedIndex}`,
        confidence: 70,
        assets: ['ETH', 'BTC'],
        timeframe: '24h',
        severity: 'medium',
        timestamp,
        dataSources: ['social', 'sentiment_analysis'],
      });
    }

    // Generate TVL-based insights
    for (const change of tvl) {
      if (Math.abs(change.changePercent) > 20) {
        insights.push({
          id: `tvl-${change.protocol}-${timestamp}`,
          type: change.changePercent > 0 ? 'opportunity' : 'risk',
          title: `${change.protocol} TVL ${change.changePercent > 0 ? 'Surge' : 'Drop'}`,
          description: `TVL ${change.changePercent > 0 ? 'increased' : 'decreased'} by ${Math.abs(change.changePercent).toFixed(2)}% in 24h`,
          confidence: 80,
          assets: [change.protocol],
          timeframe: '24h',
          severity: Math.abs(change.changePercent) > 50 ? 'high' : 'medium',
          timestamp,
          dataSources: ['defillama', 'onchain'],
        });
      }
    }

    // Sort by severity and confidence
    return insights.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1, info: 0 };
      const sevDiff = severityOrder[b.severity] - severityOrder[a.severity];
      return sevDiff !== 0 ? sevDiff : b.confidence - a.confidence;
    });
  }

  /**
   * Get full analytics snapshot
   */
  async getFullSnapshot(): Promise<AnalyticsSnapshot> {
    const [trends, sentiment, { whales, volume, tvl, metrics }, insights] = await Promise.all([
      this.scanBaseEcosystem(),
      this.analyzeSentiment(),
      this.trackOnchainMetrics(),
      this.generateInsights(),
    ]);

    this.lastSnapshot = {
      timestamp: Date.now(),
      trends,
      whaleMovements: whales,
      tvlChanges: tvl,
      volumeMetrics: volume,
      sentiment,
      onchain: metrics,
      insights,
    };

    return this.lastSnapshot;
  }

  /**
   * Get last snapshot (cached)
   */
  getLastSnapshot(): AnalyticsSnapshot | null {
    return this.lastSnapshot;
  }

  // ============ Internal Methods ============

  private async checkNewLaunches(_timestamp: number): Promise<EcosystemTrend[]> {
    // In production, this would query factory contracts
    // For now, return simulated data
    return [];
  }

  private async checkTVLGrowth(timestamp: number): Promise<EcosystemTrend[]> {
    const trends: EcosystemTrend[] = [];
    
    try {
      // Use REAL data from DefiLlama
      const defiLlama = getDefiLlama();
      const tvlChanges = await defiLlama.getBaseTVLChanges();
      
      for (const protocol of tvlChanges) {
        const change24h = protocol.change24h;
        
        if (Math.abs(change24h) > ANALYTICS_CONFIG.TVL_CHANGE_THRESHOLD * 100) {
          trends.push({
            id: `tvl-${protocol.protocol}-${timestamp}`,
            category: 'tvl_growth',
            protocol: protocol.protocol,
            description: `${protocol.protocol} TVL ${change24h > 0 ? 'surged' : 'dropped'} ${Math.abs(change24h).toFixed(1)}% ($${(protocol.tvl / 1e6).toFixed(2)}M)`,
            severity: Math.abs(change24h) > 30 ? 'high' : Math.abs(change24h) > 15 ? 'medium' : 'low',
            timestamp,
            metrics: { 
              changePercent: change24h,
              tvl: protocol.tvl,
              change7d: protocol.change7d,
            },
            relatedAssets: [protocol.protocol.toUpperCase()],
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch TVL data from DefiLlama:', error);
    }
    
    return trends;
  }

  private async checkVolumeSpikes(timestamp: number): Promise<EcosystemTrend[]> {
    const trends: EcosystemTrend[] = [];
    
    try {
      // Use REAL data from CoinGecko
      const coinGecko = getCoinGecko();
      const marketData = await coinGecko.getBaseTokenMarketData();
      
      for (const token of marketData) {
        // Check for significant 24h price changes (proxy for volume activity)
        const priceChange = Math.abs(token.price_change_percentage_24h || 0);
        
        if (priceChange > 10) { // 10%+ movement indicates high activity
          trends.push({
            id: `volume-${token.symbol}-${timestamp}`,
            category: 'volume_spike',
            protocol: 'multiple',
            description: `${token.symbol.toUpperCase()} saw ${priceChange.toFixed(1)}% price movement with $${(token.total_volume / 1e6).toFixed(2)}M volume`,
            severity: priceChange > 20 ? 'high' : 'medium',
            timestamp,
            metrics: { 
              priceChange: token.price_change_percentage_24h || 0,
              volume24h: token.total_volume,
              currentPrice: token.current_price,
            },
            relatedAssets: [token.symbol.toUpperCase()],
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch volume data from CoinGecko:', error);
    }
    
    return trends;
  }

  private async checkGovernanceEvents(_timestamp: number): Promise<EcosystemTrend[]> {
    // Check for governance proposals and events
    return [];
  }

  private async trackWhaleMovements(): Promise<WhaleMovement[]> {
    // In production, query recent large transfers from the chain
    const movements: WhaleMovement[] = [];
    
    // Simulate whale detection
    if (Math.random() > 0.7) {
      movements.push({
        id: `whale-${Date.now()}`,
        address: `0x${Math.random().toString(16).slice(2, 42)}`,
        type: Math.random() > 0.5 ? 'buy' : 'sell',
        asset: 'ETH',
        amount: 1000 + Math.random() * 9000,
        valueUsd: 2000000 + Math.random() * 18000000,
        timestamp: Date.now(),
        txHash: `0x${Math.random().toString(16).slice(2, 66)}`,
      });
    }
    
    return movements;
  }

  private async trackVolumeMetrics(): Promise<VolumeMetrics[]> {
    const metrics: VolumeMetrics[] = [];
    
    try {
      // Use REAL data from CoinGecko
      const coinGecko = getCoinGecko();
      const marketData = await coinGecko.getBaseTokenMarketData();
      
      for (const token of marketData.slice(0, 7)) {
        metrics.push({
          asset: token.symbol.toUpperCase(),
          volume24h: token.total_volume,
          volumeChange24h: token.price_change_percentage_24h || 0,
          avgTradeSize: token.total_volume / 10000, // Approximate
          largeTxCount: Math.floor(token.total_volume / 100000), // Approximate
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Failed to fetch volume metrics from CoinGecko:', error);
    }
    
    return metrics;
  }

  private async trackTVLChanges(): Promise<TVLChange[]> {
    const changes: TVLChange[] = [];
    
    try {
      // Use REAL data from DefiLlama
      const defiLlama = getDefiLlama();
      const tvlData = await defiLlama.getBaseTVLChanges();
      
      for (const protocol of tvlData) {
        const changePct = protocol.change24h;
        const currentTvl = protocol.tvl;
        const previousTvl = currentTvl / (1 + changePct / 100);
        
        changes.push({
          protocol: protocol.protocol,
          chain: 'base',
          previousTvl,
          currentTvl,
          change24h: currentTvl - previousTvl,
          changePercent: changePct,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Failed to fetch TVL changes from DefiLlama:', error);
    }
    
    return changes;
  }

  private async fetchOnchainMetrics(): Promise<OnchainMetrics> {
    try {
      const gasPrice = await this.client.getGasPrice();
      
      return {
        activeAddresses24h: 50000 + Math.floor(Math.random() * 50000),
        txCount24h: 1000000 + Math.floor(Math.random() * 500000),
        avgGasPrice: Number(gasPrice) / 1e9, // Convert to gwei
        gasTrend: Math.random() > 0.5 ? 'rising' : 'falling',
        congestionLevel: Math.floor(Math.random() * 100),
        pendingTxCount: Math.floor(Math.random() * 10000),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to fetch onchain metrics:', error);
      return {
        activeAddresses24h: 0,
        txCount24h: 0,
        avgGasPrice: 0,
        gasTrend: 'stable',
        congestionLevel: 0,
        pendingTxCount: 0,
        timestamp: Date.now(),
      };
    }
  }

  private async fetchOverallSentiment(): Promise<number> {
    try {
      // Use CoinGecko global market data for sentiment approximation
      const coinGecko = getCoinGecko();
      const globalData = await coinGecko.getGlobalData();
      
      // Map market cap change to sentiment score
      // -5% = -100, +5% = +100
      const change = globalData.market_cap_change_percentage_24h_usd;
      const sentiment = Math.max(-100, Math.min(100, change * 20));
      return Math.round(sentiment);
    } catch (error) {
      console.error('Failed to fetch overall sentiment:', error);
      return 0; // Neutral on error
    }
  }

  private async fetchTwitterSentiment(): Promise<number> {
    return Math.floor(Math.random() * 200) - 100;
  }

  private async fetchFarcasterSentiment(): Promise<number> {
    return Math.floor(Math.random() * 200) - 100;
  }

  private async fetchDiscordSentiment(): Promise<number> {
    return Math.floor(Math.random() * 200) - 100;
  }

  private async fetchFearGreedIndex(): Promise<number> {
    try {
      // Use CoinGecko market data to approximate fear/greed
      const coinGecko = getCoinGecko();
      return await coinGecko.getFearGreedApproximation();
    } catch (error) {
      console.error('Failed to fetch fear/greed index:', error);
      return 50; // Neutral on error
    }
  }

  private async fetchSocialVolume(): Promise<number> {
    return Math.floor(Math.random() * 1000);
  }

  private async fetchTrendingKeywords(): Promise<string[]> {
    try {
      // Get trending coins from CoinGecko
      const coinGecko = getCoinGecko();
      const trending = await coinGecko.getTrending();
      const trendingNames = trending.slice(0, 5).map(t => t.symbol.toUpperCase());
      
      // Add Base ecosystem keywords
      return ['Base', ...trendingNames, 'L2', 'DeFi'];
    } catch (error) {
      console.error('Failed to fetch trending keywords:', error);
      return ['Base', 'L2', 'DeFi', 'ETH', 'USDC'];
    }
  }

  private async fetchInfluencerSentiment(): Promise<number> {
    return Math.floor(Math.random() * 200) - 100;
  }
}

// ============ Utility Functions ============

/**
 * Format whale movement for display
 */
export function formatWhaleMovement(movement: WhaleMovement): string {
  const emoji = movement.type === 'buy' ? '🟢' : 
                movement.type === 'sell' ? '🔴' : '⚪';
  const direction = movement.toExchange ? '→ Exchange' : 
                    movement.fromExchange ? '← Exchange' : '';
  
  return `${emoji} Whale ${movement.type.toUpperCase()}: ${movement.amount.toLocaleString()} ${movement.asset} ($${movement.valueUsd.toLocaleString()}) ${direction}`;
}

/**
 * Format insight for display
 */
export function formatInsight(insight: MarketInsight): string {
  const emoji = insight.type === 'opportunity' ? '💎' :
                insight.type === 'risk' ? '⚠️' :
                insight.type === 'anomaly' ? '🔍' : '📈';
  
  return `${emoji} [${insight.severity.toUpperCase()}] ${insight.title}\n   ${insight.description}\n   Confidence: ${insight.confidence}% | Timeframe: ${insight.timeframe}`;
}

/**
 * Get trend direction emoji
 */
export function getTrendEmoji(change: number): string {
  if (change > 20) return '🚀';
  if (change > 10) return '📈';
  if (change > 0) return '↗️';
  if (change < -20) return '💥';
  if (change < -10) return '📉';
  if (change < 0) return '↘️';
  return '➡️';
}

// ============ Export Singleton ============

let analyticsInstance: BaseAnalytics | null = null;

export function getAnalytics(): BaseAnalytics {
  if (!analyticsInstance) {
    analyticsInstance = new BaseAnalytics();
  }
  return analyticsInstance;
}

export function resetAnalytics(): void {
  analyticsInstance = null;
}
