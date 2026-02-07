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
import { getCoinGecko, BASE_TOKEN_IDS } from './data/coingecko';
import { getDuneAnalytics, WhaleTransaction } from './data/dune-client';
import { getDefiLlama, ProtocolTVL } from './data/defillama';

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
  /**
   * Run an autonomous prediction cycle
   * Picks a random asset, analyzes it, and mints/posts if confidence is high
   */
  private async runPredictionCycle(): Promise<any> {
    console.log('🔮 Running autonomous prediction cycle...');

    // 1. Pick a random market to analyze
    const markets = Object.keys(BASE_TOKEN_IDS);
    const randomMarket = markets[Math.floor(Math.random() * markets.length)];
    const timeframe = '24h';

    console.log(`🔎 Analyzing ${randomMarket} for ${timeframe} timeframe...`);

    // 2. Generate Prediction (uses real CoinGecko data)
    const prediction = await this.makePrediction(randomMarket, timeframe);

    if (!prediction) {
      console.log('❌ Could not generate valid prediction data');
      return null;
    }

    // 3. Validate Confidence
    // Only act on high confidence predictions in autonomous mode
    const minConfidence = this.config.agentMode === 'autonomous' ? 70 : 60;
    
    if (prediction.confidence < minConfidence) {
      console.log(`📉 Confidence too low (${prediction.confidence}% < ${minConfidence}%). Skipping.`);
      return null;
    }

    console.log(`🚀 High confidence detected! Executing prophecy...`);

    // 4. Mint Prophecy NFT - REAL ONCHAIN TRANSACTION
    // This will use the wallet (CDP or Private Key)
    let nft;
    try {
      nft = await this.prophesier.mintProphecy(prediction);
      console.log(`✅ Minted Prophecy NFT #${nft.tokenId}`);
    } catch (error: any) {
      console.error('❌ Failed to mint prophecy:', error.message);
      return null;
    }
    
    const txHash = nft.txHash || 'simulated';
    const basescanUrl = nft.txHash 
      ? `https://sepolia.basescan.org/tx/${nft.txHash}` 
      : null;

    // 5. Post to Farcaster (Auto-Post Feature)
    if (this.farcaster) {
      try {
        const castContent = `🔮 New Prophecy from LobsterSage!

${prediction.direction.toUpperCase()}: ${prediction.market} → $${prediction.targetPrice}
Confidence: ${prediction.confidence}%
Timeframe: ${prediction.timeframe}

${basescanUrl ? `🔗 TX: ${basescanUrl}` : ''}

Built on @base with @coinbase AgentKit 🦞
#LobsterSage #Base #Predictons`;

        const cast = await this.farcaster.postCast({ text: castContent });
        console.log(`📢 Posted to Farcaster: ${cast.hash}`);
      } catch (error: any) {
        console.error('⚠️ Failed to post to Farcaster:', error.message);
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
        
        // await this.twitter.tweet(content); // Enable if Twitter method exists
        console.log('🐦 Would post to Twitter:', content);
      } catch (error) {
        console.error('⚠️ Failed to generate Twitter content');
      }
    }

    console.log('✅ Autonomous cycle complete');
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
   * Make a manual prediction for any supported market
   * Supports: ETH, BTC, SOL, AERO, DOGE, AVAX, MATIC, ARB, OP, etc.
   */
  async makePrediction(market: string, timeframe: string): Promise<Prediction | null> {
    const symbol = market.toUpperCase();
    const coinGecko = getCoinGecko();
    
    // Validate market is supported
    const coinId = BASE_TOKEN_IDS[symbol];
    if (!coinId) {
      console.warn(`⚠️ Unsupported market: ${symbol}. Supported: ${Object.keys(BASE_TOKEN_IDS).join(', ')}`);
      return null;
    }
    
    // Fetch real market data from CoinGecko
    console.log(`📊 Fetching market data for ${symbol}...`);
    const [prices, marketData, sentiment] = await Promise.all([
      coinGecko.getSimplePrices([coinId], { include24hChange: true, include24hVol: true }),
      coinGecko.getMarketData([coinId]),
      this.analytics.analyzeSentiment()
    ]);
    
    const priceData = prices[coinId];
    const tokenMarketData = marketData[0];
    
    if (!priceData) {
      console.warn(`⚠️ Could not fetch price for ${symbol}`);
      return null;
    }
    
    const price = priceData.usd;
    const priceChange24h = priceData.usd_24h_change || 0;
    const volume24h = priceData.usd_24h_vol || tokenMarketData?.total_volume || 0;
    const liquidity = tokenMarketData?.market_cap || 0;
    
    console.log(`📈 ${symbol}: $${price.toFixed(2)} (${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}% 24h)`);
    
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
   * Get active positions with real-time P&L
   * Returns active prophecies with current price, unrealized P&L, and remaining time
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
    const prophecies = this.prophesier.getActiveProphecies();
    
    if (prophecies.length === 0) {
      return [];
    }
    
    // Get unique markets to fetch prices
    const markets = [...new Set(prophecies.map(p => p.market))];
    const coinGecko = getCoinGecko();
    
    // Fetch current prices for all markets
    const coinIds = markets
      .map(m => BASE_TOKEN_IDS[m.toUpperCase()])
      .filter(Boolean);
    
    const prices = coinIds.length > 0 
      ? await coinGecko.getSimplePrices(coinIds)
      : {};
    
    return prophecies.map(p => {
      const coinId = BASE_TOKEN_IDS[p.market.toUpperCase()];
      const currentPrice = coinId ? (prices[coinId]?.usd || p.targetPrice) : p.targetPrice;
      const entryPrice = p.targetPrice / (p.direction === 'bullish' ? 1.1 : 0.9); // Reverse calculate
      
      // Calculate P&L based on direction
      let pnlPercent = 0;
      if (p.direction === 'bullish') {
        pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else if (p.direction === 'bearish') {
        pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
      }
      
      const stakeAmount = p.stakeAmount || 0.01;
      const pnlUsd = (pnlPercent / 100) * stakeAmount * currentPrice;
      
      // Calculate remaining time
      const endTimeMs = p.mintedAt + this.parseTimeframe(p.timeframe);
      const remainingTimeMs = Math.max(0, endTimeMs - Date.now());
      
      return {
        tokenId: p.tokenId,
        market: p.market,
        direction: p.direction,
        entryPrice,
        currentPrice,
        pnlPercent: Number(pnlPercent.toFixed(2)),
        pnlUsd: Number(pnlUsd.toFixed(4)),
        stakeAmount,
        remainingTimeMs,
        status: p.status
      };
    });
  }

  /**
   * Parse timeframe string to milliseconds
   */
  private parseTimeframe(timeframe: string): number {
    const match = timeframe.match(/^(\d+)([hdw])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
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
  async getAssetAnalysis(symbol: string): Promise<{
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
  } | null> {
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
  async getWhaleSignals(minValueUsd: number = 50000): Promise<{
    transactions: WhaleTransaction[];
    summary: {
      totalTransactions: number;
      totalVolumeUsd: number;
      netDirection: 'bullish' | 'bearish' | 'neutral';
    };
    timestamp: number;
  }> {
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
  async getTVLAnalysis(): Promise<{
    chainTVL: number;
    topProtocols: ProtocolTVL[];
    tvlChange24h: number;
    timestamp: number;
  }> {
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
   * Detect potential market capitulation
   * Signals "buy" when:
   * 1. Price is down significantly (Fear)
   * 2. Whales are accumulating (Smart Money)
   * 3. TVL is relatively stable (Protocol Health)
   */
  async detectCapitulation(): Promise<{
    detected: boolean;
    score: number;
    signals: {
      extremeFear: boolean;
      priceCrash: boolean;
      whaleAccumulation: boolean;
      tvlStable: boolean;
    };
    recommendation: 'BUY' | 'WAIT' | 'AVOID';
  }> {
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
   * Set trading mode (applies preset configuration)
   * @param mode - 'conservative' | 'aggressive' | 'capitulation-fishing'
   */
  setTradingMode(mode: 'conservative' | 'aggressive' | 'capitulation-fishing'): any {
    return this.tradingStrategy.setMode(mode);
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
    console.log('🔄 STARTING FULL AUTONOMOUS CYCLE');

    // 1. Run Prediction Cycle (Analysis, Minting, Posting)
    // This handles the "LobsterSage" prediction part
    await this.runPredictionCycle();

    // 2. Run Yield Farming Strategy
    // This handles the DeFi yield optimization part
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
   * Run pure DeFi trading cycle WITHOUT NFT minting
   * This is for competition mode - shows real trading activity only
   */
  async runPureTradingCycle(): Promise<any> {
    console.log('💰 STARTING PURE DEFI TRADING CYCLE (no NFTs)');

    // Update prices first
    const prices = await fetchTokenPrices();
    this.tradingStrategy.updatePrices(prices);

    // Run the trading strategy with real DeFi transactions
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
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default LobsterSage;
