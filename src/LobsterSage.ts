/**
 * LobsterSage - Autonomous DeFi Trading Agent for Base Blockchain
 *
 * Core orchestrator that delegates to specialized managers for:
 * - Trading (swaps, borrow, repay, leverage)
 * - Yield optimization (Aave supply/withdraw)
 * - Portfolio tracking
 * - Market analysis
 */

import { WalletManager, getWalletManager } from './wallet/manager';
import { Prophesier } from './sage/prophesier';
import { OnchainReputationSystem, getReputationSystem } from './sage/reputation';
import { BaseAnalytics, getAnalytics } from './sage/analytics';
import { YieldOptimizer } from './yield/optimizer';
import { AaveV3 } from './defi/AaveV3';
import { UniswapV3 } from './defi/UniswapV3';
import { TradingStrategyManager } from './yield/tradingStrategy';
import { getConfig, Config } from './config';
import { PortfolioSummary, AutonomousConfig } from './types';
import { FarcasterClient } from './social/farcaster-client';

// Import managers
import {
  PortfolioManager,
  MarketAnalyzer,
  TradingManager,
  YieldManager,
} from './lobster';

/**
 * LobsterSage - Main orchestrator class
 * Delegates functionality to specialized managers
 */
export class LobsterSage {
  // Core components
  private wallet!: WalletManager;
  private prophesier!: Prophesier;
  private reputation!: OnchainReputationSystem;
  private analytics: BaseAnalytics;
  private yieldOptimizer: YieldOptimizer;
  private aave!: AaveV3;
  private uniswap!: UniswapV3;
  private tradingStrategy: TradingStrategyManager;
  private config: Config;
  private farcaster: FarcasterClient | null = null;

  // Managers
  private portfolioManager!: PortfolioManager;
  private marketAnalyzer!: MarketAnalyzer;
  private tradingManager!: TradingManager;
  private yieldManager!: YieldManager;

  // State
  private isRunning: boolean = false;
  private lastYieldCheck: number = 0;

  constructor() {
    this.config = getConfig();

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

    // Initialize AaveV3
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

    // Initialize Farcaster client if configured
    if (this.config.farcasterEnabled && process.env.NEYNAR_API_KEY) {
      this.farcaster = new FarcasterClient({
        apiKey: process.env.NEYNAR_API_KEY,
        signerUuid: process.env.NEYNAR_SIGNER_UUID || '',
        fid: parseInt(process.env.FARCASTER_FID || '0'),
      });
      console.log('📡 Farcaster client initialized');
    }

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
    console.log(`⏰ Yield check interval: ${config.yieldCheckInterval / 60000} min`);

    // Main loop
    while (this.isRunning) {
      const now = Date.now();

      try {
        // Optimize yields
        if (now - this.lastYieldCheck >= config.yieldCheckInterval) {
          await this.yieldManager.runYieldCycle();
          this.lastYieldCheck = now;
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

  // ==========================================
  // PORTFOLIO (delegated to PortfolioManager)
  // ==========================================

  async getPortfolioSummary(): Promise<PortfolioSummary> { return this.portfolioManager.getPortfolioSummary(); }
  async getAllTokenBalances(): Promise<any> { return this.portfolioManager.getAllTokenBalances(); }
  async getAllPositions(): Promise<any> { return this.portfolioManager.getAllPositions(); }
  async getActivePositionsWithPnL(): Promise<any> { return this.portfolioManager.getActivePositionsWithPnL(); }
  async getAaveAssetBalance(assetSymbol: string): Promise<any> { return this.portfolioManager.getAaveAssetBalance(assetSymbol); }
  async getWalletAddress(): Promise<string> { return this.portfolioManager.getWalletAddress(); }
  async getBalance(): Promise<string> { return this.portfolioManager.getBalance(); }
  async getActivePredictions(): Promise<any[]> { return this.portfolioManager.getActivePredictions(); }

  // ==========================================
  // MARKET ANALYSIS (delegated to MarketAnalyzer)
  // ==========================================

  async getMarketSentiment(): Promise<any> { return this.marketAnalyzer.getMarketSentiment(); }
  async getMarketAnalysis(): Promise<any> { return this.marketAnalyzer.getMarketAnalysis(); }
  async getEcosystemTrends(): Promise<any[]> { return this.marketAnalyzer.getEcosystemTrends(); }
  async getAssetAnalysis(symbol: string): Promise<any> { return this.marketAnalyzer.getAssetAnalysis(symbol); }
  async getWhaleSignals(minValueUsd?: number): Promise<any> { return this.marketAnalyzer.getWhaleSignals(minValueUsd); }
  async getTVLAnalysis(): Promise<any> { return this.marketAnalyzer.getTVLAnalysis(); }
  async getMarketSnapshot(): Promise<any> { return this.marketAnalyzer.getMarketSnapshot(); }
  async detectCapitulation(): Promise<any> { return this.marketAnalyzer.detectCapitulation(); }

  // ==========================================
  // TRADING (delegated to TradingManager)
  // ==========================================

  async swapTokens(params: { tokenIn: string; tokenOut: string; amount: string; slippage?: number }): Promise<any> {
    return this.tradingManager.swapTokens(params);
  }
  async unwrapWeth(amount: string): Promise<any> { return this.tradingManager.unwrapWeth(amount); }
  async getSwapQuote(params: { tokenIn: string; tokenOut: string; amount: string; slippage?: number }): Promise<any> {
    return this.tradingManager.getSwapQuote(params);
  }
  async compoundYield(params?: { amount?: string; minApy?: number }): Promise<any> {
    return this.tradingManager.compoundYield(params);
  }
  getTradingStrategy(): any { return this.tradingManager.getTradingStrategy(); }
  setTradingStrategy(updates: any): any { return this.tradingManager.setTradingStrategy(updates); }
  setTradingMode(mode: 'conservative' | 'aggressive' | 'capitulation-fishing'): any {
    return this.tradingManager.setTradingMode(mode);
  }
  enableAutonomousTrading(): void { this.tradingManager.enableAutonomousTrading(); }
  disableAutonomousTrading(): void { this.tradingManager.disableAutonomousTrading(); }
  getTradingHistory(limit?: number): any[] { return this.tradingManager.getTradingHistory(limit); }

  async runTradingCycle(): Promise<any> {
    return this.tradingManager.runTradingCycle(
      () => this.getAllPositions(),
      (token) => this.withdrawFromAave(token),
      (opp, amt) => this.findBestOpportunityAndEnter({ amountEth: amt, minApy: opp.apy })
    );
  }

  async runPureTradingCycle(): Promise<any> {
    return this.tradingManager.runPureTradingCycle(
      () => this.getAllPositions(),
      (token) => this.withdrawFromAave(token),
      (opp, amt) => this.findBestOpportunityAndEnter({ amountEth: amt, minApy: opp.apy })
    );
  }

  async runDryRunTradingCycle(): Promise<any> {
    return this.tradingManager.runDryRunTradingCycle(
      () => this.getPortfolioSummary(),
      () => this.getMarketSentiment()
    );
  }

  // ==========================================
  // YIELD (delegated to YieldManager)
  // ==========================================

  async supplyWethToAave(amountEth: string): Promise<any> { return this.yieldManager.supplyWethToAave(amountEth); }
  async withdrawFromAave(token: string, amount?: string): Promise<any> { return this.yieldManager.withdrawFromAave(token, amount); }
  async supplyToAave(token: string, amount: string): Promise<any> { return this.yieldManager.supplyToAave(token, amount); }
  async getYieldOpportunities(): Promise<any[]> { return this.yieldManager.getYieldOpportunities(); }
  async optimizeYields(): Promise<any> { return this.yieldManager.optimizeYields(); }
  async getYieldPositions(): Promise<any[]> { return this.yieldManager.getYieldPositions(); }
  async findBestOpportunityAndEnter(params: { amountEth: string; minApy?: number }): Promise<any> {
    return this.yieldManager.findBestOpportunityAndEnter(params);
  }

  // ==========================================
  // AAVE & ADVANCED TRADING
  // ==========================================

  async borrowFromAave(token: string, amount: string, mode: 'stable' | 'variable' = 'variable'): Promise<any> {
    return this.yieldManager.borrowFromAave(token, amount, mode);
  }
  async repayAave(token: string, amount: string, mode: 'stable' | 'variable' = 'variable'): Promise<any> {
    return this.yieldManager.repayAave(token, amount, mode);
  }
  async getAaveAccountData(): Promise<any> { return this.yieldManager.getAaveAccountData(); }
  async wrapEth(amount: string): Promise<any> { return this.tradingManager.wrapEth(amount); }

  async swapAndSupply(params: { tokenIn: string; tokenOut: string; amount: string; slippage?: number; supplyToAave?: boolean }): Promise<any> {
    return this.tradingManager.swapAndSupply(params);
  }

  async openLeveragedPosition(params: { supplyToken: string; borrowToken: string; initialAmount: string; loops?: number; minHealthFactor?: number }): Promise<any> {
    return this.tradingManager.openLeveragedPosition({
      ...params,
      borrowFn: (t, a, m) => this.borrowFromAave(t, a, m),
      supplyFn: (t, a) => this.supplyToAave(t, a),
      getAccountData: () => this.getAaveAccountData(),
    });
  }

  async closeLeveragedPosition(params: { supplyToken: string; debtToken: string }): Promise<any> {
    return this.tradingManager.closeLeveragedPosition({
      ...params,
      repayFn: (t, a, m) => this.repayAave(t, a, m),
      withdrawFn: (t, a) => this.withdrawFromAave(t, a),
      getAccountData: () => this.getAaveAccountData(),
    });
  }

  // ==========================================
  // SOCIAL / FARCASTER
  // ==========================================

  async postToFarcaster(text: string): Promise<any> {
    if (!this.farcaster) return { success: false, error: 'Farcaster not configured. Set NEYNAR_API_KEY, NEYNAR_SIGNER_UUID, and FARCASTER_FID env vars.' };
    try {
      const result = await this.farcaster.postCast({ text });
      return { success: true, hash: result.hash, text: result.text };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async postFarcasterThread(casts: string[]): Promise<any> {
    if (!this.farcaster) return { success: false, error: 'Farcaster not configured' };
    try {
      const results = await this.farcaster.postThread(casts);
      return { success: true, casts: results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // EMERGENCY METHODS
  // ==========================================

  async emergencyExit(): Promise<void> {
    console.log('EMERGENCY EXIT INITIATED');
    this.stopAutonomousMode();
    await this.yieldManager.emergencyWithdraw();
    console.log('Emergency exit complete');
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
