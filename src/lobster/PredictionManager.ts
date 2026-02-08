/**
 * PredictionManager - Handles all prediction operations
 *
 * Handles:
 * - Making predictions for supported markets
 * - Minting prediction NFTs
 * - Resolving prophecies
 * - Getting active prophecies and predictions
 * - Social posting for predictions
 */

import { WalletManager } from '../wallet/manager';
import { PredictorEngine, Prediction } from '../sage/predictor';
import { Prophesier } from '../sage/prophesier';
import { OnchainReputationSystem } from '../sage/reputation';
import { BaseAnalytics } from '../sage/analytics';
import { TwitterClient } from '../social/twitter-client';
import { FarcasterClient } from '../social/farcaster-client';
import { contentGenerator } from '../social/content-templates';
import { getCoinGecko, BASE_TOKEN_IDS } from '../data/coingecko';

export interface ProphecyResult {
  tokenId: string;
  txHash: string;
  basescanUrl?: string;
}

export interface ResolveProphecyResult {
  txHash: string;
  successful: boolean;
}

export interface SocialPostResult {
  hash?: string;
  success: boolean;
  error?: string;
}

export interface PredictionCycleResult {
  prediction: Prediction | null;
  nft?: {
    tokenId: string;
    txHash?: string;
  };
  txHash?: string;
  basescanUrl?: string | null;
}

/**
 * PredictionManager class for handling all prediction operations
 */
export class PredictionManager {
  private wallet: WalletManager;
  private predictor: PredictorEngine;
  private prophesier: Prophesier;
  private reputation: OnchainReputationSystem;
  private analytics: BaseAnalytics;
  private twitter: TwitterClient | null;
  private farcaster: FarcasterClient | null;
  private minConfidence: number;

  constructor(
    wallet: WalletManager,
    predictor: PredictorEngine,
    prophesier: Prophesier,
    reputation: OnchainReputationSystem,
    analytics: BaseAnalytics,
    twitter?: TwitterClient | null,
    farcaster?: FarcasterClient | null,
    minConfidence: number = 60
  ) {
    this.wallet = wallet;
    this.predictor = predictor;
    this.prophesier = prophesier;
    this.reputation = reputation;
    this.analytics = analytics;
    this.twitter = twitter || null;
    this.farcaster = farcaster || null;
    this.minConfidence = minConfidence;
  }

  /**
   * Make a manual prediction for any supported market
   * Supports: ETH, BTC, SOL, AERO, DOGE, AVAX, MATIC, ARB, OP, etc.
   */
  async makePrediction(market: string, timeframe: string): Promise<Prediction | null> {
    const symbol = market.toUpperCase();
    const coinGecko = getCoinGecko();

    // Validate market is supported
    const coinId = BASE_TOKEN_IDS[symbol];
    if (!coinId) {
      console.warn(`Unsupported market: ${symbol}. Supported: ${Object.keys(BASE_TOKEN_IDS).join(', ')}`);
      return null;
    }

    // Fetch real market data from CoinGecko
    console.log(`Fetching market data for ${symbol}...`);
    const [prices, marketData, sentiment] = await Promise.all([
      coinGecko.getSimplePrices([coinId], { include24hChange: true, include24hVol: true }),
      coinGecko.getMarketData([coinId]),
      this.analytics.analyzeSentiment()
    ]);

    const priceData = prices[coinId];
    const tokenMarketData = marketData[0];

    if (!priceData) {
      console.warn(`Could not fetch price for ${symbol}`);
      return null;
    }

    const price = priceData.usd;
    const priceChange24h = priceData.usd_24h_change || 0;
    const volume24h = priceData.usd_24h_vol || tokenMarketData?.total_volume || 0;
    const liquidity = tokenMarketData?.market_cap || 0;

    console.log(`${symbol}: $${price.toFixed(2)} (${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}% 24h)`);

    await this.analytics.scanBaseEcosystem();

    return this.predictor.generatePrediction({
      marketData: {
        price,
        volume24h,
        priceChange24h,
        liquidity,
        targetMarket: symbol
      },
      sentiment: {
        score: (sentiment.overall - 50) / 50,
        volume: sentiment.socialVolume,
        trending: sentiment.trendingKeywords
      },
      metrics: {
        whaleMovements: 0,
        tvlChange: 0,
        activeAddresses: 0
      },
      timeframe
    });
  }

  /**
   * Mint a prediction as an NFT - REAL ONCHAIN TRANSACTION
   */
  async mintPredictionAsNFT(prediction: Prediction): Promise<any> {
    console.log(`Minting prediction as Prophecy NFT...`);
    return this.prophesier.mintProphecy(prediction);
  }

  /**
   * Run a prediction cycle
   * Picks a random market, analyzes it, and mints/posts if confidence is high
   */
  async runPredictionCycle(agentMode: 'autonomous' | 'interactive' | 'test' | 'manual' = 'autonomous'): Promise<PredictionCycleResult | null> {
    console.log('Running autonomous prediction cycle...');

    // 1. Pick a random market to analyze
    const markets = Object.keys(BASE_TOKEN_IDS);
    const randomMarket = markets[Math.floor(Math.random() * markets.length)];
    const timeframe = '24h';

    console.log(`Analyzing ${randomMarket} for ${timeframe} timeframe...`);

    // 2. Generate Prediction (uses real CoinGecko data)
    const prediction = await this.makePrediction(randomMarket, timeframe);

    if (!prediction) {
      console.log('Could not generate valid prediction data');
      return null;
    }

    // 3. Validate Confidence
    // Only act on high confidence predictions in autonomous mode
    const minConfidence = agentMode === 'autonomous' ? 70 : this.minConfidence;

    if (prediction.confidence < minConfidence) {
      console.log(`Confidence too low (${prediction.confidence}% < ${minConfidence}%). Skipping.`);
      return null;
    }

    console.log(`High confidence detected! Executing prophecy...`);

    // 4. Mint Prophecy NFT - REAL ONCHAIN TRANSACTION
    let nft;
    try {
      nft = await this.prophesier.mintProphecy(prediction);
      console.log(`Minted Prophecy NFT #${nft.tokenId}`);
    } catch (error: any) {
      console.error('Failed to mint prophecy:', error.message);
      return null;
    }

    const txHash = nft.txHash || 'simulated';
    const basescanUrl = nft.txHash
      ? `https://sepolia.basescan.org/tx/${nft.txHash}`
      : null;

    // 5. Post to Farcaster (Auto-Post Feature)
    if (this.farcaster) {
      try {
        const castContent = `New Prophecy from LobsterSage!

${prediction.direction.toUpperCase()}: ${prediction.market} -> $${prediction.targetPrice}
Confidence: ${prediction.confidence}%
Timeframe: ${prediction.timeframe}

${basescanUrl ? `TX: ${basescanUrl}` : ''}

Built on @base with @coinbase AgentKit
#LobsterSage #Base #Predictions`;

        const cast = await this.farcaster.postCast({ text: castContent });
        console.log(`Posted to Farcaster: ${cast.hash}`);
      } catch (error: any) {
        console.error('Failed to post to Farcaster:', error.message);
      }
    }

    // 6. Post to Twitter if configured
    if (this.twitter) {
      try {
        const content = contentGenerator.predictionAnnouncement({
          id: nft.tokenId,
          asset: prediction.market.replace('/', ''),
          direction: prediction.direction as 'bullish' | 'bearish' | 'neutral',
          confidence: prediction.confidence / 100,
          timeframe: prediction.timeframe,
          reasoning: prediction.reasoning,
          timestamp: new Date()
        }, txHash);

        console.log('Would post to Twitter:', content);
      } catch (error) {
        console.error('Failed to generate Twitter content');
      }
    }

    console.log('Autonomous cycle complete');
    return { prediction, nft, txHash, basescanUrl };
  }

  /**
   * Resolve a prophecy - mark it as correct or incorrect
   * Called after the prediction timeframe ends
   */
  async resolveProphecy(
    tokenId: number,
    wasCorrect: boolean,
    accuracyScore: number = 5000
  ): Promise<ResolveProphecyResult> {
    console.log(`Resolving prophecy #${tokenId}...`);
    return this.prophesier.resolveProphecy(tokenId, wasCorrect, accuracyScore);
  }

  /**
   * Get prophecies that are ready to be resolved
   */
  getPropheciesReadyToResolve(): any[] {
    return this.prophesier.getPropheciesReadyToResolve();
  }

  /**
   * Get all active prophecies
   */
  getActiveProphecies(): any[] {
    return this.prophesier.getActiveProphecies();
  }

  /**
   * Get active predictions count
   */
  async getActivePredictionsCount(): Promise<number> {
    return this.prophesier.getActivePredictionsCount();
  }

  /**
   * Get current reputation
   */
  async getReputation(): Promise<any> {
    const address = await this.wallet.getAddress();
    return this.reputation.getReputation(address);
  }

  /**
   * Post to Farcaster
   */
  async postToFarcaster(text: string): Promise<SocialPostResult> {
    if (!this.farcaster) {
      console.log('Farcaster not configured');
      return { success: false, error: 'Farcaster not configured' };
    }

    console.log(`Posting to Farcaster: ${text.substring(0, 50)}...`);
    try {
      const result = await this.farcaster.postCast({ text });
      console.log(`Posted to Farcaster: ${result.hash}`);
      return { hash: result.hash, success: true };
    } catch (error: any) {
      console.error('Failed to post to Farcaster:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Post to Twitter
   */
  async postToTwitter(content: string): Promise<SocialPostResult> {
    if (!this.twitter) {
      console.log('Twitter not configured');
      return { success: false, error: 'Twitter not configured' };
    }

    console.log(`Posting to Twitter: ${content.substring(0, 50)}...`);
    try {
      // Assuming TwitterClient has a tweet method
      // const result = await this.twitter.tweet(content);
      // return { success: true, hash: result.id };
      console.log('Twitter posting not yet implemented');
      return { success: false, error: 'Twitter posting not yet implemented' };
    } catch (error: any) {
      console.error('Failed to post to Twitter:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Emergency exit from all prediction positions
   */
  async emergencyExit(): Promise<void> {
    return this.prophesier.emergencyExit();
  }

  /**
   * Update minimum confidence threshold
   */
  setMinConfidence(confidence: number): void {
    this.minConfidence = confidence;
  }

  /**
   * Get current minimum confidence
   */
  getMinConfidence(): number {
    return this.minConfidence;
  }
}
