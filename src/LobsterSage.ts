/**
 * LobsterSage - Autonomous AI Agent for Base Blockchain
 *
 * Core orchestrator that combines:
 * - Prediction engine (novelty)
 * - Reputation system (scoring)
 * - Yield optimization (utility)
 * - Social engagement (transparency)
 *
 * Refactored to use dedicated managers for each responsibility area.
 */

import { WalletManager, getWalletManager } from './wallet/manager';
import { PredictorEngine, Prediction } from './sage/predictor';
import { Prophesier } from './sage/prophesier';
import { OnchainReputationSystem, getReputationSystem } from './sage/reputation';
import { BaseAnalytics, getAnalytics } from './sage/analytics';
import { YieldOptimizer } from './yield/optimizer';
import { TwitterClient } from './social/twitter-client';
import { FarcasterClient } from './social/farcaster-client';
import { AaveV3 } from './defi/AaveV3';
import { UniswapV3 } from './defi/UniswapV3';
import { TradingStrategyManager } from './yield/tradingStrategy';
import { getConfig, Config } from './config';
import { PortfolioSummary, AutonomousConfig } from './types';

// Import managers
import {
  PortfolioManager,
  MarketAnalyzer,
  TradingManager,
  YieldManager,
  PredictionManager
} from './lobster';

/**
 * LobsterSage - Main orchestrator class
 * Delegates functionality to specialized managers
 */
export class LobsterSage {
  // Core components
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

  // Managers
  private portfolioManager!: PortfolioManager;
  private marketAnalyzer!: MarketAnalyzer;
  private tradingManager!: TradingManager;
  private yieldManager!: YieldManager;
  private predictionManager!: PredictionManager;

  // State
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
      enabled: true,
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

    // Initialize managers
    this.portfolioManager = new PortfolioManager(
      this.wallet,
      this.uniswap,
      this.aave,
      this.prophesier,
      this.reputation,
      this.yieldOptimizer
    );

    this.marketAnalyzer = new MarketAnalyzer(this.analytics);

    this.tradingManager = new TradingManager(
      this.wallet,
      this.uniswap,
      this.aave,
      this.yieldOptimizer,
      this.tradingStrategy
    );

    this.yieldManager = new YieldManager(
      this.wallet,
      this.uniswap,
      this.aave,
      this.yieldOptimizer
    );

    this.predictionManager = new PredictionManager(
      this.wallet,
      this.predictor,
      this.prophesier,
      this.reputation,
      this.analytics,
      this.twitter,
      this.farcaster,
      this.config.minConfidence
    );

    const address = await this.wallet.getAddress();
    const balance = await this.wallet.getBalance();

    console.log('✅ LobsterSage initialized');
    console.log(`📍 Wallet: ${address}`);
    console.log(`💰 Balance: ${balance} ETH`);
  }

  // ==========================================
  // AUTONOMOUS MODE METHODS
  // ==========================================

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
          await this.yieldManager.runYieldCycle();
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
   * Run social posting cycle
   */
  private async runSocialCycle(): Promise<void> {
    console.log('📱 Running social cycle...');

    // Get portfolio summary
    const portfolio = await this.portfolioManager.getPortfolioSummary();

    // Import content generator
    const { contentGenerator } = await import('./social/content-templates');

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

  // ==========================================
  // PORTFOLIO METHODS (delegated to PortfolioManager)
  // ==========================================

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(): Promise<PortfolioSummary> {
    return this.portfolioManager.getPortfolioSummary();
  }

  /**
   * Get all token balances with USD values
   */
  async getAllTokenBalances(): Promise<{
    tokens: Record<string, { balance: string; usdValue: number }>;
    totalUsd: number;
  }> {
    return this.portfolioManager.getAllTokenBalances();
  }

  /**
   * Get all positions across protocols
   */
  async getAllPositions(): Promise<{
    predictions: any[];
    aave: Array<{
      token: string;
      supplied: string;
      apy: number;
      valueUsd: number;
    }>;
    wallet: Record<string, { balance: string; usdValue: number }>;
  }> {
    return this.portfolioManager.getAllPositions();
  }

  /**
   * Get active positions with real-time P&L
   */
  async getActivePositionsWithPnL(): Promise<{
    tokenId: string;
    market: string;
    direction: string;
    entryPrice: number;
    currentPrice: number;
    pnlPercent: number;
    pnlUsd: number;
    stakeAmount: number;
    remainingTimeMs: number;
    status: string;
  }[]> {
    return this.portfolioManager.getActivePositionsWithPnL();
  }

  /**
   * Get Aave asset balance
   */
  async getAaveAssetBalance(assetSymbol: string): Promise<{
    supplied: string;
    stableDebt: string;
    variableDebt: string;
  }> {
    return this.portfolioManager.getAaveAssetBalance(assetSymbol);
  }

  /**
   * Get wallet address
   */
  async getWalletAddress(): Promise<string> {
    return this.portfolioManager.getWalletAddress();
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<string> {
    return this.portfolioManager.getBalance();
  }

  /**
   * Get active predictions
   */
  async getActivePredictions(): Promise<any[]> {
    return this.portfolioManager.getActivePredictions();
  }

  // ==========================================
  // MARKET ANALYSIS METHODS (delegated to MarketAnalyzer)
  // ==========================================

  /**
   * Get market sentiment
   */
  async getMarketSentiment(): Promise<{
    score: number;
    fearGreedIndex: number;
    socialVolume: number;
  }> {
    return this.marketAnalyzer.getMarketSentiment();
  }

  /**
   * Get market analysis
   */
  async getMarketAnalysis(): Promise<any> {
    return this.marketAnalyzer.getMarketAnalysis();
  }

  /**
   * Get ecosystem trends
   */
  async getEcosystemTrends(): Promise<any[]> {
    return this.marketAnalyzer.getEcosystemTrends();
  }

  /**
   * Get analysis for a specific asset
   */
  async getAssetAnalysis(symbol: string): Promise<any> {
    return this.marketAnalyzer.getAssetAnalysis(symbol);
  }

  /**
   * Get whale signals
   */
  async getWhaleSignals(minValueUsd?: number): Promise<any> {
    return this.marketAnalyzer.getWhaleSignals(minValueUsd);
  }

  /**
   * Get TVL analysis
   */
  async getTVLAnalysis(): Promise<any> {
    return this.marketAnalyzer.getTVLAnalysis();
  }

  /**
   * Get market snapshot
   */
  async getMarketSnapshot(): Promise<any> {
    return this.marketAnalyzer.getMarketSnapshot();
  }

  /**
   * Detect capitulation
   */
  async detectCapitulation(): Promise<any> {
    return this.marketAnalyzer.detectCapitulation();
  }

  // ==========================================
  // TRADING METHODS (delegated to TradingManager)
  // ==========================================

  /**
   * Swap tokens
   */
  async swapTokens(params: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    slippage?: number;
  }): Promise<any> {
    return this.tradingManager.swapTokens(params);
  }

  /**
   * Unwrap WETH
   */
  async unwrapWeth(amount: string): Promise<any> {
    return this.tradingManager.unwrapWeth(amount);
  }

  /**
   * Get swap quote
   */
  async getSwapQuote(params: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    slippage?: number;
  }): Promise<any> {
    return this.tradingManager.getSwapQuote(params);
  }

  /**
   * Compound yield
   */
  async compoundYield(params?: {
    amount?: string;
    minApy?: number;
  }): Promise<any> {
    return this.tradingManager.compoundYield(params);
  }

  /**
   * Get trading strategy
   */
  getTradingStrategy(): any {
    return this.tradingManager.getTradingStrategy();
  }

  /**
   * Set trading strategy
   */
  setTradingStrategy(updates: {
    takeProfitPercent?: number;
    stopLossPercent?: number;
    minApyThreshold?: number;
    maxPositionSizeEth?: number;
    enabled?: boolean;
  }): any {
    return this.tradingManager.setTradingStrategy(updates);
  }

  /**
   * Set trading mode
   */
  setTradingMode(mode: 'conservative' | 'aggressive' | 'capitulation-fishing'): any {
    return this.tradingManager.setTradingMode(mode);
  }

  /**
   * Enable autonomous trading
   */
  enableAutonomousTrading(): void {
    this.tradingManager.enableAutonomousTrading();
  }

  /**
   * Disable autonomous trading
   */
  disableAutonomousTrading(): void {
    this.tradingManager.disableAutonomousTrading();
  }

  /**
   * Get trading history
   */
  getTradingHistory(limit?: number): any[] {
    return this.tradingManager.getTradingHistory(limit);
  }

  /**
   * Run trading cycle
   */
  async runTradingCycle(): Promise<any> {
    return this.tradingManager.runTradingCycle(
      () => this.getAllPositions(),
      (token) => this.withdrawFromAave(token),
      (opportunity, amountEth) => this.findBestOpportunityAndEnter({ amountEth, minApy: opportunity.apy })
    );
  }

  /**
   * Run pure trading cycle
   */
  async runPureTradingCycle(): Promise<any> {
    return this.tradingManager.runPureTradingCycle(
      () => this.getAllPositions(),
      (token) => this.withdrawFromAave(token),
      (opportunity, amountEth) => this.findBestOpportunityAndEnter({ amountEth, minApy: opportunity.apy })
    );
  }

  /**
   * Run dry-run trading cycle
   */
  async runDryRunTradingCycle(): Promise<any> {
    return this.tradingManager.runDryRunTradingCycle(
      () => this.getPortfolioSummary(),
      () => this.getMarketSentiment()
    );
  }

  // ==========================================
  // YIELD METHODS (delegated to YieldManager)
  // ==========================================

  /**
   * Supply WETH to Aave
   */
  async supplyWethToAave(amountEth: string): Promise<any> {
    return this.yieldManager.supplyWethToAave(amountEth);
  }

  /**
   * Withdraw from Aave
   */
  async withdrawFromAave(token: string, amount?: string): Promise<any> {
    return this.yieldManager.withdrawFromAave(token, amount);
  }

  /**
   * Supply to Aave
   */
  async supplyToAave(token: string, amount: string): Promise<any> {
    return this.yieldManager.supplyToAave(token, amount);
  }

  /**
   * Get yield opportunities
   */
  async getYieldOpportunities(): Promise<any[]> {
    return this.yieldManager.getYieldOpportunities();
  }

  /**
   * Optimize yields
   */
  async optimizeYields(): Promise<any> {
    return this.yieldManager.optimizeYields();
  }

  /**
   * Get yield positions
   */
  async getYieldPositions(): Promise<any[]> {
    return this.yieldManager.getYieldPositions();
  }

  /**
   * Find best opportunity and enter
   */
  async findBestOpportunityAndEnter(params: {
    amountEth: string;
    minApy?: number;
  }): Promise<any> {
    return this.yieldManager.findBestOpportunityAndEnter(params);
  }

  // ==========================================
  // PREDICTION METHODS (delegated to PredictionManager)
  // ==========================================

  /**
   * Make a prediction
   */
  async makePrediction(market: string, timeframe: string): Promise<Prediction | null> {
    return this.predictionManager.makePrediction(market, timeframe);
  }

  /**
   * Mint prediction as NFT
   */
  async mintPredictionAsNFT(prediction: Prediction): Promise<any> {
    return this.predictionManager.mintPredictionAsNFT(prediction);
  }

  /**
   * Run prediction cycle
   */
  async runPredictionCycle(): Promise<any> {
    return this.predictionManager.runPredictionCycle(this.config.agentMode);
  }

  /**
   * Run single prediction cycle (for testing/demo)
   */
  async runSinglePredictionCycle(): Promise<any> {
    return this.runPredictionCycle();
  }

  /**
   * Resolve prophecy
   */
  async resolveProphecy(
    tokenId: number,
    wasCorrect: boolean,
    accuracyScore?: number
  ): Promise<{ txHash: string; successful: boolean }> {
    return this.predictionManager.resolveProphecy(tokenId, wasCorrect, accuracyScore);
  }

  /**
   * Get prophecies ready to resolve
   */
  getPropheciesReadyToResolve(): any[] {
    return this.predictionManager.getPropheciesReadyToResolve();
  }

  /**
   * Get active prophecies
   */
  getActivePropheciesFromAgent(): any[] {
    return this.predictionManager.getActiveProphecies();
  }

  /**
   * Get reputation
   */
  async getReputation(): Promise<any> {
    return this.predictionManager.getReputation();
  }

  /**
   * Post to Farcaster
   */
  async postToFarcaster(text: string): Promise<{ hash: string } | null> {
    const result = await this.predictionManager.postToFarcaster(text);
    return result.success ? { hash: result.hash! } : null;
  }

  // ==========================================
  // EMERGENCY METHODS
  // ==========================================

  /**
   * Emergency exit - close all positions
   */
  async emergencyExit(): Promise<void> {
    console.log('🚨 EMERGENCY EXIT INITIATED');

    this.stopAutonomousMode();

    // Close yield positions
    await this.yieldManager.emergencyWithdraw();

    // Exit prediction trades
    await this.predictionManager.emergencyExit();

    console.log('✅ Emergency exit complete');
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default LobsterSage;
