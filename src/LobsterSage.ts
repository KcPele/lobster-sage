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
import { UniswapV3 } from './defi/UniswapV3';
import { TradingStrategyManager, fetchTokenPrices } from './yield/tradingStrategy';
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
  private farcaster: FarcasterClient | null = null;
  private aave!: AaveV3;
  private uniswap!: UniswapV3;
  private tradingStrategy: TradingStrategyManager;
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

    // Initialize trading strategy manager
    this.tradingStrategy = new TradingStrategyManager({
      takeProfitPercent: 10,
      stopLossPercent: 5,
      minApyThreshold: 2,
      enabled: false, // Disabled by default for safety
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
    
    // Initialize prophesier with contract and network
    const network = this.config.network === 'base-mainnet' ? 'base' : 'baseSepolia';
    this.prophesier = new Prophesier(
      this.config.prophecyNftContract,
      this.wallet,
      network
    );
    
    // Initialize reputation system
    this.reputation = getReputationSystem(this.config.reputationContract);
    await this.reputation.initialize();
    
    // Initialize AaveV3 (reuse network variable from above)
    this.aave = new AaveV3(network);
    
    // Initialize UniswapV3
    this.uniswap = new UniswapV3(network);
    
    // Attempt to connect wallet client to DeFi modules
    try {
      const walletClient = this.wallet.getWalletClient();
      
      if (walletClient) {
        console.log('🔗 Connecting Wallet Client to DeFi modules...');
        this.aave.setWalletClient(walletClient);
        this.uniswap.setWalletClient(walletClient);
      } else {
        console.warn('⚠️  No direct WalletClient available (CDP mode active). DeFi execution will be READ-ONLY.');
        console.warn('    To enable execution (Aave/Uniswap), ensure PRIVATE_KEY fallback is active or use a supported wallet provider.');
      }
    } catch (err) {
      console.warn('⚠️  Could not attach wallet client to DeFi modules:', err);
    }
    
    // Initialize social clients if configured
    if (this.config.twitterEnabled && process.env.TWITTER_API_KEY) {
      this.twitter = new TwitterClient({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
      });
    }
    if (this.config.farcasterEnabled && process.env.NEYNAR_API_KEY) {
      this.farcaster = new FarcasterClient({
        apiKey: process.env.NEYNAR_API_KEY!,
        signerUuid: process.env.NEYNAR_SIGNER_UUID!,
        fid: parseInt(process.env.FARCASTER_FID || '0'),
      });
    }
    
    // Initialize yield optimizer with AaveV3 for real DeFi interactions
    await this.yieldOptimizer.initialize(this.wallet, this.aave, this.uniswap);
    
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
  private async runPredictionCycle(): Promise<any> {
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
      return null;
    }

    // Validate prediction
    const isValid = await this.predictor.validatePrediction(prediction);
    if (!isValid) {
      console.log('Prediction did not meet criteria');
      return null;
    }

    // Mint Prophecy NFT - REAL ONCHAIN TRANSACTION
    const nft = await this.prophesier.mintProphecy(prediction);
    console.log(`✅ Minted Prophecy NFT #${nft.tokenId}`);
    
    const txHash = nft.txHash || 'simulated';
    const basescanUrl = nft.txHash 
      ? `https://sepolia.basescan.org/tx/${nft.txHash}` 
      : null;

    // Post to Farcaster if configured
    if (this.farcaster) {
      try {
        const castContent = `🔮 New Prophecy from LobsterSage!

${prediction.direction.toUpperCase()}: ${prediction.market} → $${prediction.targetPrice}
Confidence: ${prediction.confidence}%
Timeframe: ${prediction.timeframe}

${basescanUrl ? `🔗 TX: ${basescanUrl}` : ''}

Built on @base with @coinbase AgentKit 🦞`;

        const cast = await this.farcaster.postCast({ text: castContent });
        console.log(`📢 Posted to Farcaster: ${cast.hash}`);
      } catch (error: any) {
        console.error('Failed to post to Farcaster:', error.message);
      }
    }

    // Post to Twitter if configured
    if (this.twitter) {
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
    }

    console.log('✅ Prediction cycle complete');
    return { prediction, nft, txHash, basescanUrl };
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
   * Mint a prediction as an NFT - REAL ONCHAIN TRANSACTION
   */
  async mintPredictionAsNFT(prediction: Prediction): Promise<any> {
    console.log(`🔮 Minting prediction as Prophecy NFT...`);
    return this.prophesier.mintProphecy(prediction);
  }

  /**
   * Post to Farcaster
   */
  async postToFarcaster(text: string): Promise<{ hash: string } | null> {
    if (!this.farcaster) {
      console.log('⚠️ Farcaster not configured');
      return null;
    }
    
    console.log(`📢 Posting to Farcaster: ${text.substring(0, 50)}...`);
    const result = await this.farcaster.postCast({ text });
    console.log(`✅ Posted to Farcaster: ${result.hash}`);
    return result;
  }

  /**
   * Resolve a prophecy - mark it as correct or incorrect
   * Called after the prediction timeframe ends
   */
  async resolveProphecy(
    tokenId: number,
    wasCorrect: boolean,
    accuracyScore: number = 5000
  ): Promise<{ txHash: string; successful: boolean }> {
    console.log(`⚖️ Resolving prophecy #${tokenId}...`);
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
  getActivePropheciesFromAgent(): any[] {
    return this.prophesier.getActiveProphecies();
  }

  /**
   * Run a single prediction cycle (for testing/demo)
   * This is the same as what autonomous mode does, but on-demand
   */
  async runSinglePredictionCycle(): Promise<any> {
    return this.runPredictionCycle();
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
   * Supply WETH to Aave V3 - wraps ETH and deposits to Aave
   * This is the most reliable yield farming approach that works on both testnet and mainnet
   */
  async supplyWethToAave(amountEth: string): Promise<any> {
    return this.yieldOptimizer.supplyWethToAave(amountEth);
  }

  // ==========================================
  // FULL TRADING CYCLE METHODS
  // ==========================================

  /**
   * Withdraw tokens from Aave V3
   * @param token - Token to withdraw ('WETH', 'USDC', or address)
   * @param amount - Amount to withdraw ('all' for full withdrawal)
   */
  async withdrawFromAave(token: string, amount?: string): Promise<any> {
    return this.yieldOptimizer.withdrawFromAave(token, amount);
  }

  /**
   * Swap any token pair via Uniswap V3
   * Handles ETH wrapping/unwrapping automatically
   */
  async swapTokens(params: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    slippage?: number;
  }): Promise<any> {
    return this.yieldOptimizer.swapTokens(params);
  }

  /**
   * Supply any token to Aave V3
   */
  async supplyToAave(token: string, amount: string): Promise<any> {
    return this.yieldOptimizer.supplyToAave(token, amount);
  }

  /**
   * Find best yield opportunity and enter automatically
   * Scans all markets and picks the highest APY
   */
  async findBestOpportunityAndEnter(params: {
    amountEth: string;
    minApy?: number;
  }): Promise<any> {
    return this.yieldOptimizer.findBestOpportunityAndEnter(params);
  }

  /**
   * Unwrap WETH to ETH
   */
  async unwrapWeth(amount: string): Promise<any> {
    if (!this.uniswap) throw new Error('Uniswap not initialized');
    return this.uniswap.unwrapWeth(amount);
  }

  // ==========================================
  // AUTONOMOUS TRADING CYCLE
  // ==========================================

  /**
   * Get current trading strategy
   */
  getTradingStrategy(): any {
    return this.tradingStrategy.getStrategy();
  }

  /**
   * Update trading strategy
   */
  setTradingStrategy(updates: {
    takeProfitPercent?: number;
    stopLossPercent?: number;
    minApyThreshold?: number;
    maxPositionSizeEth?: number;
    enabled?: boolean;
  }): any {
    return this.tradingStrategy.setStrategy(updates);
  }

  /**
   * Enable autonomous trading
   */
  enableAutonomousTrading(): void {
    this.tradingStrategy.enableAutonomousTrading();
  }

  /**
   * Disable autonomous trading
   */
  disableAutonomousTrading(): void {
    this.tradingStrategy.disableAutonomousTrading();
  }

  /**
   * Run a complete trading cycle
   * Checks positions for exit signals, finds opportunities, executes trades
   */
  async runTradingCycle(): Promise<any> {
    // Update prices first
    const prices = await fetchTokenPrices();
    this.tradingStrategy.updatePrices(prices);

    return this.tradingStrategy.runTradingCycle({
      getOpportunities: () => this.yieldOptimizer.scanOpportunities(),
      exitPosition: async (position) => {
        const result = await this.withdrawFromAave(position.token);
        return { success: result.success, txHash: result.txHash };
      },
      enterPosition: async (opportunity, amountEth) => {
        const result = await this.findBestOpportunityAndEnter({ 
          amountEth, 
          minApy: opportunity.apy 
        });
        return { success: result.success, txHash: result.supplyTx };
      },
      updatePrices: fetchTokenPrices,
    });
  }

  /**
   * Get trading action history
   */
  getTradingHistory(limit: number = 20): any[] {
    return this.tradingStrategy.getActionHistory(limit);
  }

  /**
   * Get market sentiment (Fear/Greed approximation)
   */
  async getMarketSentiment(): Promise<any> {
    try {
      const trends = await this.getEcosystemTrends();

      // Calculate sentiment from trends
      let bullishCount = 0;
      let bearishCount = 0;
      let sentimentScore = 50; // Neutral base

      trends.forEach(trend => {
        if (trend.severity === 'critical') {
          if (trend.category === 'tvl_growth' || trend.category === 'volume_spike') {
            bullishCount += 2;
          } else if (trend.category === 'whale_activity') {
            // Check if whale activity is buy or sell
            const movement = trend.metrics?.type;
            if (movement === 'buy') {
              bullishCount++;
            } else if (movement === 'sell') {
              bearishCount++;
            }
          }
        } else if (trend.severity === 'high') {
          if (trend.category === 'launch' || trend.category === 'governance') {
            bullishCount++;
          }
        }
      });

      // Calculate score (0-100)
      const totalSignals = bullishCount + bearishCount;
      if (totalSignals > 0) {
        sentimentScore = Math.round(50 + ((bullishCount - bearishCount) / totalSignals) * 40);
      }

      return {
        score: sentimentScore,
        trend: sentimentScore > 70
          ? 'extreme_greed'
          : sentimentScore > 55
          ? 'greed'
          : sentimentScore > 45
          ? 'neutral'
          : sentimentScore > 25
          ? 'fear'
          : 'extreme_fear',
        bullishSignals: bullishCount,
        bearishSignals: bearishCount,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error getting market sentiment:', error);
      return { score: 50, trend: 'neutral' };
    }
  }

  /**
   * Get on-chain metrics
   */
  async getOnchainMetrics(): Promise<any> {
    try {
      const client = this.wallet.getPublicClient();

      // Get latest block
      const block = await client.getBlock();

      // Get pending transactions (approximated by comparing block timestamps)
      // In production, you'd use mempool APIs
      const currentGasPrice = await client.getGasPrice();

      // Estimate congestion based on gas price
      // Base average gas: ~0.001 gwei for L1, ~1 gwei for L2
      const baseGasPrice = 1000000000n; // 1 gwei
      const gasRatio = Number(currentGasPrice) / Number(baseGasPrice);

      const congestionLevel = Math.min(100, Math.round(gasRatio * 100));

      // Estimate pending transactions
      const pendingTxCount = Math.round(congestionLevel * 10); // Rough estimate

      return {
        blockNumber: block.number,
        baseFeePerGas: Number(currentGasPrice),
        congestionLevel,
        gasTrend: congestionLevel > 70 ? 'rising' : congestionLevel > 40 ? 'stable' : 'falling',
        estimatedPendingTx: pendingTxCount,
        recommendation:
          congestionLevel > 70
            ? 'High congestion - consider waiting'
            : congestionLevel > 40
            ? 'Moderate congestion'
            : 'Low congestion - good time to trade',
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error getting on-chain metrics:', error);
      return {
        congestionLevel: 50,
        gasTrend: 'stable',
        recommendation: 'Unable to fetch metrics',
      };
    }
  }

  /**
   * Track whale activity
   */
  async trackWhaleActivity(symbol: string = 'ETH'): Promise<any> {
    try {
      // Get whale movements from analytics
      const analytics = await this.analytics.getFullSnapshot();
      const whaleMovements = analytics?.whaleMovements || [];

      // Filter by symbol
      const symbolMovements = whaleMovements
        .filter((m: any) =>
          m.asset?.toLowerCase() === symbol.toLowerCase() ||
          symbol.toLowerCase().includes(m.asset?.toLowerCase() || '')
        )
        .slice(0, 10); // Last 10 movements

      // Calculate sentiment
      const buys = symbolMovements.filter((m: any) => m.type === 'buy').length;
      const sells = symbolMovements.filter((m: any) => m.type === 'sell').length;
      const totalVolume = symbolMovements.reduce((sum: number, m: any) => sum + (m.valueUsd || 0), 0);

      const sentiment =
        buys > sells * 1.5
          ? 'bullish'
          : sells > buys * 1.5
          ? 'bearish'
          : 'neutral';

      return {
        recent: symbolMovements,
        totalVolume,
        buyPressure: Math.round((buys / (buys + sells || 1)) * 100),
        sellPressure: Math.round((sells / (buys + sells || 1)) * 100),
        sentiment,
        buyCount: buys,
        sellCount: sells,
      };
    } catch (error) {
      console.error('Error tracking whale activity:', error);
      return {
        recent: [],
        totalVolume: 0,
        buyPressure: 50,
        sellPressure: 50,
        sentiment: 'neutral',
      };
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default LobsterSage;
