import { WalletManager } from './wallet/manager';
import { PredictorEngine } from './sage/predictor';
import { Prophesier } from './sage/prophesier';
import { ReputationSystem } from './sage/reputation';
import { AnalyticsEngine } from './sage/analytics';
import { YieldOptimizer } from './yield/optimizer';
import { TwitterClient } from './social/TwitterClient';
import { FarcasterClient } from './social/farcaster-client';
import { SocialPublisher } from './social';
import { AaveV3 } from './defi/AaveV3';
import { config } from './config';
import { Prediction, PortfolioSummary, AutonomousConfig } from './types';

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
  private wallet: WalletManager;
  private predictor: PredictorEngine;
  private prophesier: Prophesier;
  private reputation: ReputationSystem;
  private analytics: AnalyticsEngine;
  private yieldOptimizer: YieldOptimizer;
  private social: SocialPublisher;
  private aave: AaveV3;
  
  private isRunning: boolean = false;
  private lastPredictionTime: number = 0;
  private lastYieldCheck: number = 0;
  private lastSocialPost: number = 0;

  constructor() {
    this.wallet = new WalletManager(config.wallet);
    this.predictor = new PredictorEngine(config.sage);
    this.prophesier = new Prophesier(config.contracts.prophecyNFT, this.wallet);
    this.reputation = new ReputationSystem(config.contracts.reputation, this.wallet);
    this.analytics = new AnalyticsEngine();
    this.yieldOptimizer = new YieldOptimizer(config.yield);
    this.social = new SocialPublisher(config.social);
    this.aave = new AaveV3(config.network.rpcUrl, this.wallet);
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    console.log('🦞 Initializing LobsterSage...');
    
    await this.wallet.initialize();
    await this.reputation.initialize();
    await this.social.initialize();
    await this.yieldOptimizer.initialize(this.wallet);
    
    console.log('✅ LobsterSage initialized');
    console.log(`📍 Wallet: ${this.wallet.getAddress()}`);
    console.log(`💰 Balance: ${await this.wallet.getBalance('ETH')} ETH`);
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

        // Check mentions/replies
        await this.checkEngagement();

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
    const marketData = await this.analytics.scanBaseEcosystem();
    const sentiment = await this.analytics.analyzeSentiment();
    const metrics = await this.analytics.trackOnchainMetrics();

    // Generate prediction
    const prediction = await this.predictor.generatePrediction({
      marketData,
      sentiment,
      metrics
    });

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

    // Post to social
    await this.social.postPrediction({
      ...prediction,
      nftId: nft.tokenId,
      txHash: trade.hash
    });

    // Update reputation volume
    await this.reputation.updateVolume(prediction.stakeAmount);

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

    // Post yield update
    await this.social.postYieldUpdate({
      protocol: allocation.bestProtocol,
      apy: allocation.bestApy,
      change: allocation.improvement
    });

    console.log('✅ Yield cycle complete');
  }

  /**
   * Run social posting cycle
   */
  private async runSocialCycle(): Promise<void> {
    console.log('📱 Running social cycle...');

    // Get portfolio summary
    const portfolio = await this.getPortfolioSummary();
    
    // Post daily summary
    await this.social.postDailySummary(portfolio);

    // Update reputation consistency
    await this.reputation.updateConsistency();

    console.log('✅ Social cycle complete');
  }

  /**
   * Check for mentions and replies
   */
  private async checkEngagement(): Promise<void> {
    // Check X mentions
    const xMentions = await this.social.getXMentions();
    for (const mention of xMentions) {
      await this.handleMention(mention, 'twitter');
    }

    // Check Farcaster notifications
    const farcasterNotifications = await this.social.getFarcasterNotifications();
    for (const notification of farcasterNotifications) {
      await this.handleMention(notification, 'farcaster');
    }
  }

  /**
   * Handle a mention/reply
   */
  private async handleMention(mention: any, platform: 'twitter' | 'farcaster'): Promise<void> {
    // Generate response based on mention content
    const response = await this.generateResponse(mention.text);
    
    if (platform === 'twitter') {
      await this.social.replyToX(mention.id, response);
    } else {
      await this.social.replyToFarcaster(mention.id, response);
    }
  }

  /**
   * Generate a response to a mention
   */
  private async generateResponse(mentionText: string): Promise<string> {
    // Simple response generation
    if (mentionText.toLowerCase().includes('prediction')) {
      const portfolio = await this.getPortfolioSummary();
      return `I currently have ${portfolio.activePredictions} active predictions. Check my profile for the latest! 🦞`;
    }
    
    if (mentionText.toLowerCase().includes('yield') || mentionText.toLowerCase().includes('apy')) {
      return `My current blended APY is optimized across Aave, Uniswap, and Aerodrome. DM me for details! 💰`;
    }

    return `Thanks for reaching out! I'm an autonomous AI agent building reputation through predictions on Base. Follow along! 🦞`;
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(): Promise<PortfolioSummary> {
    const ethBalance = await this.wallet.getBalance('ETH');
    const usdcBalance = await this.wallet.getBalance('USDC');
    
    const totalValue = ethBalance * 2500 + usdcBalance; // Approximate ETH price
    
    const activePredictions = await this.prophesier.getActivePredictionsCount();
    const reputationScore = await this.reputation.getScore();
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
  async makePrediction(market: string, timeframe: string): Promise<Prediction | null> {
    const marketData = await this.analytics.scanBaseEcosystem();
    const sentiment = await this.analytics.analyzeSentiment();
    
    return this.predictor.generatePrediction({
      marketData: { ...marketData, targetMarket: market },
      sentiment,
      metrics: {},
      timeframe
    });
  }

  /**
   * Get current reputation
   */
  async getReputation(): Promise<any> {
    return this.reputation.getFullStats();
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
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default LobsterSage;
