import { WalletManager, getWalletManager } from './wallet/manager';
import { PredictorEngine, Prediction } from './sage/predictor';
import { Prophesier } from './sage/prophesier';
import { OnchainReputationSystem, getReputationSystem } from './sage/reputation';
import { BaseAnalytics, getAnalytics } from './sage/analytics';
import { YieldOptimizer } from './yield/optimizer';
import { TwitterClient } from './social/twitter-client';
import { FarcasterClient } from './social/farcaster-client';
import { contentGenerator } from './social/content-templates';
import { AaveV3 } from './defi/AaveV3';
import { getConfig, Config } from './config';
import { PortfolioSummary, AutonomousConfig } from './types';

/**
 * LobsterSage - Autonomous AI Agent for Base Blockchain
 * 
 * Core orchestrator that combines:
 * - Prediction engine (novelty)
 * - Reputation system (scoring)
 * - Yield optimization (utility)
 * - Social engagement (transparency)
 */
export class LobsterSage {
  private wallet!: WalletManager;
  private predictor: PredictorEngine;
  private prophesier!: Prophesier;
  private reputation!: OnchainReputationSystem;
  private analytics: BaseAnalytics;
  private yieldOptimizer: YieldOptimizer;
  private twitter: TwitterClient | null = null;
  // @ts-expect-error Farcaster integration pending
  private farcaster: FarcasterClient | null = null;
  // @ts-expect-error Aave integration for yield cycles
  private aave!: AaveV3;
  private config: Config;
  
  private isRunning: boolean = false;
  private lastPredictionTime: number = 0;
  private lastYieldCheck: number = 0;
  private lastSocialPost: number = 0;

  constructor() {
    this.config = getConfig();
    
    // Initialize predictor with config
    this.predictor = new PredictorEngine({
      minConfidence: this.config.minConfidence,
      maxStakePercent: 20,
      defaultTimeframe: '7d'
    });
    
    // Initialize analytics
    this.analytics = getAnalytics();
    
    // Initialize yield optimizer
    this.yieldOptimizer = new YieldOptimizer({
      minRebalanceThreshold: 2,
      maxSlippage: 0.5,
      riskTolerance: 'moderate',
      rebalanceInterval: this.config.yieldRebalanceInterval * 1000
    });
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    console.log('🦞 Initializing LobsterSage...');
    
    // Initialize wallet with new AgentKit config
    this.wallet = getWalletManager({
      apiKeyId: this.config.apiKeyId,
      apiKeyPrivate: this.config.apiKeyPrivate,
      networkId: this.config.network
    });
    await this.wallet.initialize();
    
    // Initialize prophesier with contract
    this.prophesier = new Prophesier(
      this.config.prophecyNftContract,
      this.wallet
    );
    
    // Initialize reputation system
    this.reputation = getReputationSystem(this.config.reputationContract);
    await this.reputation.initialize();
    
    // Initialize AaveV3
    const network = this.config.network === 'base-mainnet' ? 'base' : 'baseSepolia';
    this.aave = new AaveV3(network);
    
    // Initialize social clients if configured
    if (this.config.twitterEnabled && process.env.TWITTER_API_KEY) {
      this.twitter = new TwitterClient({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
      });
    }
    if (this.config.farcasterEnabled && process.env.FARCASTER_API_KEY) {
      this.farcaster = new FarcasterClient({
        apiKey: process.env.FARCASTER_API_KEY!,
        signerUuid: process.env.FARCASTER_SIGNER_UUID!,
        fid: parseInt(process.env.FARCASTER_FID || '0'),
      });
    }
    
    // Initialize yield optimizer
    await this.yieldOptimizer.initialize(this.wallet);
    
    const address = await this.wallet.getAddress();
    const balance = await this.wallet.getBalance();
    
    console.log('✅ LobsterSage initialized');
    console.log(`📍 Wallet: ${address}`);
    console.log(`💰 Balance: ${balance} ETH`);
  }

  /**
   * Start autonomous mode
   */
  async startAutonomousMode(config: AutonomousConfig): Promise<void> {
    if (this.isRunning) {
      console.log('Autonomous mode already running');
      return;
    }

    this.isRunning = true;
    console.log('🤖 Starting autonomous mode...');
    console.log(`⏰ Prediction interval: ${config.predictionInterval / 60000} min`);
    console.log(`⏰ Yield check interval: ${config.yieldCheckInterval / 60000} min`);
    console.log(`⏰ Social post interval: ${config.socialInterval / 60000} min`);

    // Main loop
    while (this.isRunning) {
      const now = Date.now();

      try {
        // Generate predictions
        if (now - this.lastPredictionTime >= config.predictionInterval) {
          await this.runPredictionCycle();
          this.lastPredictionTime = now;
        }

        // Optimize yields
        if (now - this.lastYieldCheck >= config.yieldCheckInterval) {
          await this.runYieldCycle();
          this.lastYieldCheck = now;
        }

        // Post to social
        if (now - this.lastSocialPost >= config.socialInterval) {
          await this.runSocialCycle();
          this.lastSocialPost = now;
        }

        // Sleep before next check
        await this.sleep(60000); // 1 minute

      } catch (error) {
        console.error('Error in autonomous loop:', error);
        await this.sleep(300000); // 5 minutes on error
      }
    }
  }

  /**
   * Stop autonomous mode
   */
  stopAutonomousMode(): void {
    this.isRunning = false;
    console.log('⏸️ Autonomous mode stopped');
  }

  /**
   * Run a prediction cycle
   */
  private async runPredictionCycle(): Promise<void> {
    console.log('🔮 Running prediction cycle...');

    // Scan ecosystem
    await this.analytics.scanBaseEcosystem();
    const sentiment = await this.analytics.analyzeSentiment();
    const onchainData = await this.analytics.trackOnchainMetrics();

    // Convert to prediction input format
    const predictionInput = {
      marketData: {
        price: 2500, // Would fetch real price
        volume24h: 1000000,
        priceChange24h: sentiment.fearGreedIndex > 50 ? 5 : -5,
        liquidity: 500000000,
        targetMarket: 'ETH'
      },
      sentiment: {
        score: (sentiment.overall - 50) / 50, // Normalize to -1 to 1
        volume: sentiment.socialVolume,
        trending: sentiment.trendingKeywords
      },
      metrics: {
        whaleMovements: onchainData.whales.length,
        tvlChange: onchainData.tvl.length > 0 ? onchainData.tvl[0].changePercent : 0,
        activeAddresses: onchainData.metrics.activeAddresses24h
      }
    };

    // Generate prediction
    const prediction = await this.predictor.generatePrediction(predictionInput);

    if (!prediction) {
      console.log('No high-confidence predictions this cycle');
      return;
    }

    // Validate prediction
    const isValid = await this.predictor.validatePrediction(prediction);
    if (!isValid) {
      console.log('Prediction did not meet criteria');
      return;
    }

    // Mint Prophecy NFT
    const nft = await this.prophesier.mintProphecy(prediction);
    console.log(`✅ Minted Prophecy NFT #${nft.tokenId}`);

    // Stake on prediction (trade)
    const trade = await this.prophesier.stakeOnPrediction(prediction);
    console.log(`💰 Staked on prediction: ${trade.hash}`);

    // Post to social if configured
    if (this.twitter) {
      const content = contentGenerator.predictionAnnouncement({
        id: nft.tokenId,
        asset: prediction.market.replace('/', ''),
        direction: prediction.direction as 'bullish' | 'bearish' | 'neutral',
        confidence: prediction.confidence / 100,
        timeframe: prediction.timeframe,
        reasoning: prediction.reasoning,
        timestamp: new Date()
      }, trade.hash);
      console.log('Would post to Twitter:', content);
    }

    console.log('✅ Prediction cycle complete');
  }

  /**
   * Run yield optimization cycle
   */
  private async runYieldCycle(): Promise<void> {
    console.log('🚜 Running yield optimization cycle...');

    // Scan opportunities
    const opportunities = await this.yieldOptimizer.scanOpportunities();
    
    if (opportunities.length === 0) {
      console.log('No yield opportunities found');
      return;
    }

    // Calculate optimal allocation
    const allocation = await this.yieldOptimizer.calculateOptimalAllocation(opportunities);
    
    // Check if rebalancing is needed
    const shouldRebalance = await this.yieldOptimizer.shouldRebalance(allocation);
    
    if (!shouldRebalance) {
      console.log('Current allocation is optimal');
      return;
    }

    // Execute rebalancing
    const rebalanceTx = await this.yieldOptimizer.rebalance(allocation);
    console.log(`✅ Rebalanced: ${rebalanceTx.hash}`);

    console.log('✅ Yield cycle complete');
  }

  /**
   * Run social posting cycle
   */
  private async runSocialCycle(): Promise<void> {
    console.log('📱 Running social cycle...');

    // Get portfolio summary
    const portfolio = await this.getPortfolioSummary();
    
    // Generate content
    const content = contentGenerator.dailySummary({
      totalValue: portfolio.totalValue,
      dayChange: portfolio.totalValueChange24h || 0,
      dayChangePercent: portfolio.totalValue > 0 ? (portfolio.totalValueChange24h / portfolio.totalValue) * 100 : 0,
      activePositions: portfolio.activePredictions,
      bestPerformer: { asset: 'ETH', change: 0 },
      worstPerformer: { asset: 'ETH', change: 0 },
      timestamp: new Date()
    });

    console.log('Daily Summary:', content);

    console.log('✅ Social cycle complete');
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(): Promise<PortfolioSummary> {
    const ethBalance = parseFloat(await this.wallet.getBalance());
    
    const totalValue = ethBalance * 2500; // Approximate ETH price
    
    const activePredictions = await this.prophesier.getActivePredictionsCount();
    const reputationData = await this.reputation.getReputation(await this.wallet.getAddress());
    const reputationScore = reputationData ? reputationData.totalScore / 100 : 0;
    const yieldPositions = await this.yieldOptimizer.getPositions();

    return {
      totalValue,
      totalValueChange24h: 0, // Calculate from history
      activePredictions,
      reputationScore,
      yieldPositions: yieldPositions.length,
      lastUpdate: Date.now()
    };
  }

  /**
   * Make a manual prediction
   */
  async makePrediction(market: string, _timeframe: string): Promise<Prediction | null> {
    await this.analytics.scanBaseEcosystem();
    const sentiment = await this.analytics.analyzeSentiment();
    
    return this.predictor.generatePrediction({
      marketData: {
        price: 2500,
        volume24h: 1000000,
        priceChange24h: 5,
        liquidity: 500000000,
        targetMarket: market
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
      }
    });
  }

  /**
   * Get current reputation
   */
  async getReputation(): Promise<any> {
    const address = await this.wallet.getAddress();
    return this.reputation.getReputation(address);
  }

  /**
   * Emergency exit - close all positions
   */
  async emergencyExit(): Promise<void> {
    console.log('🚨 EMERGENCY EXIT INITIATED');
    
    this.stopAutonomousMode();
    
    // Close yield positions
    await this.yieldOptimizer.emergencyWithdraw();
    
    // Exit prediction trades
    await this.prophesier.emergencyExit();
    
    console.log('✅ Emergency exit complete');
  }

  /**
   * Get wallet address
   */
  async getWalletAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<string> {
    return this.wallet.getBalance();
  }

  /**
   * Get active predictions
   */
  async getActivePredictions(): Promise<any[]> {
    const count = await this.prophesier.getActivePredictionsCount();
    return Array(count).fill({ status: 'active' });
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
   * Get yield opportunities
   */
  async getYieldOpportunities(): Promise<any[]> {
    return this.yieldOptimizer.getOpportunities();
  }

  /**
   * Optimize yields
   */
  async optimizeYields(): Promise<any> {
    return this.yieldOptimizer.optimizePositions();
  }

  /**
   * Get yield positions
   */
  async getYieldPositions(): Promise<any[]> {
    return this.yieldOptimizer.getPositions();
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default LobsterSage;
