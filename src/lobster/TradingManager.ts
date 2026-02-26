/** TradingManager - Token swaps, quotes, compounding, and trading strategy */

import { WalletManager } from '../wallet/manager';
import { UniswapV3, BASE_TOKENS, SEPOLIA_TOKENS } from '../defi/UniswapV3';
import { AaveV3 } from '../defi/AaveV3';
import { YieldOptimizer } from '../yield/optimizer';
import { TradingStrategyManager, fetchTokenPrices } from '../yield/tradingStrategy';
import { MarketAnalyzer } from './MarketAnalyzer';
import { getCoinGecko } from '../data/coingecko';
import { parseUnits, formatUnits } from 'viem';
import { getTokenDecimals } from '../defi/token-registry';
import * as leverage from './LeverageManager';

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  slippage?: number;
}

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  gasEstimate: string;
  route: string;
  error?: string;
}

export interface CompoundYieldParams {
  amount?: string; // If not specified, compounds all available yield
  minApy?: number;
}

export interface CompoundYieldResult {
  success: boolean;
  steps: Array<{
    action: string;
    status: string;
    txHash?: string;
    details?: any;
  }>;
  totalProfitUsd?: number;
  error?: string;
}

export interface TradingStrategyConfig {
  takeProfitPercent?: number;
  stopLossPercent?: number;
  minApyThreshold?: number;
  maxPositionSizeEth?: number;
  enabled?: boolean;
}

export interface TradingMode {
  mode: 'conservative' | 'aggressive' | 'capitulation-fishing';
}

export class TradingManager {
  private wallet: WalletManager;
  private uniswap: UniswapV3;
  private aave: AaveV3;
  private yieldOptimizer: YieldOptimizer;
  private tradingStrategy: TradingStrategyManager;
  private marketAnalyzer: MarketAnalyzer | null;

  constructor(
    wallet: WalletManager,
    uniswap: UniswapV3,
    aave: AaveV3,
    yieldOptimizer: YieldOptimizer,
    tradingStrategy: TradingStrategyManager,
    marketAnalyzer?: MarketAnalyzer
  ) {
    this.wallet = wallet;
    this.uniswap = uniswap;
    this.aave = aave;
    this.yieldOptimizer = yieldOptimizer;
    this.tradingStrategy = tradingStrategy;
    this.marketAnalyzer = marketAnalyzer || null;
  }

  async swapTokens(params: SwapParams): Promise<any> { return this.yieldOptimizer.swapTokens(params); }

  async unwrapWeth(amount: string): Promise<any> { return this.uniswap.unwrapWeth(amount); }

  async wrapEth(amount: string): Promise<any> { return this.uniswap.wrapEth(amount); }

  async swapAndSupply(params: {
    tokenIn: string; tokenOut: string; amount: string; slippage?: number; supplyToAave?: boolean;
  }): Promise<any> {
    return leverage.swapAndSupply(params, (p) => this.swapTokens(p), (t, a) => this.yieldOptimizer.supplyToAave(t, a));
  }

  async openLeveragedPosition(params: {
    supplyToken: string; borrowToken: string; initialAmount: string;
    loops?: number; minHealthFactor?: number;
    borrowFn: (token: string, amount: string, mode: 'variable') => Promise<any>;
    supplyFn: (token: string, amount: string) => Promise<any>;
    getAccountData: () => Promise<any>;
  }): Promise<any> {
    return leverage.openLeveragedPosition(params, (p) => this.swapTokens(p));
  }

  async closeLeveragedPosition(params: {
    supplyToken: string; debtToken: string;
    repayFn: (token: string, amount: string, mode: 'variable') => Promise<any>;
    withdrawFn: (token: string, amount?: string) => Promise<any>;
    getAccountData: () => Promise<any>;
  }): Promise<any> {
    return leverage.closeLeveragedPosition(params, (p) => this.swapTokens(p));
  }

  async getSwapQuote(params: SwapParams): Promise<SwapQuote> {
    try {
      const { tokenIn, tokenOut, amount, slippage = 0.5 } = params;

      // Validate inputs
      if (!tokenIn || !tokenOut || !amount) {
        return {
          amountIn: amount,
          amountOut: '0',
          priceImpact: 0,
          gasEstimate: '0',
          route: '',
          error: 'tokenIn, tokenOut, and amount are required'
        };
      }

      // Get token addresses
      const networkId = await this.wallet.getNetworkId();
      const TOKENS: any = networkId === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;

      // Handle ETH -> WETH mapping for address lookup
      const tokenInKey = tokenIn.toUpperCase() === 'ETH' ? 'WETH' : tokenIn.toUpperCase();
      const tokenOutKey = tokenOut.toUpperCase() === 'ETH' ? 'WETH' : tokenOut.toUpperCase();

      const tokenInAddress = TOKENS[tokenInKey];
      const tokenOutAddress = TOKENS[tokenOutKey];

      if (!tokenInAddress || !tokenOutAddress) {
        return {
          amountIn: amount,
          amountOut: '0',
          priceImpact: 0,
          gasEstimate: '0',
          route: '',
          error: `Unsupported token: ${!tokenInAddress ? tokenIn : tokenOut}`
        };
      }

      // Get decimals
      const decimalsIn = getTokenDecimals(tokenIn);
      const decimalsOut = getTokenDecimals(tokenOut);

      // Convert amount to bigint
      const amountIn = parseUnits(amount, decimalsIn);

      // Get quote from Uniswap
      const quote = await this.uniswap.getSwapQuote({
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        amountIn,
        slippagePercent: slippage / 100
      });

      // Calculate price impact (simplified - in production you'd compare to spot price)
      const priceImpact = quote.priceImpact;

      // Format outputs
      const amountOut = formatUnits(quote.amountOut, decimalsOut);
      const gasEstimate = formatUnits(quote.gasEstimate, 18);

      return {
        amountIn: amount,
        amountOut,
        priceImpact: Number((priceImpact * 100).toFixed(4)),
        gasEstimate,
        route: `${tokenIn} -> ${tokenOut}`,
      };

    } catch (error: any) {
      console.error('Swap quote error:', error);
      return {
        amountIn: params.amount,
        amountOut: '0',
        priceImpact: 0,
        gasEstimate: '0',
        route: '',
        error: error.message
      };
    }
  }

  async compoundYield(params: CompoundYieldParams = {}): Promise<CompoundYieldResult> {
    const steps: Array<{
      action: string;
      status: string;
      txHash?: string;
      details?: any;
    }> = [];

    try {
      console.log('Starting yield compounding...');

      // Import getAllPositions dynamically to avoid circular dependency
      // This will be called from LobsterSage which has access to PortfolioManager
      // For now, we'll use a simpler approach

      // Step 1: Get current positions from Aave
      steps.push({ action: 'Fetching current positions', status: 'pending' });

      const coinGecko = getCoinGecko();
      const ethPrice = await coinGecko.getEthPrice();

      // Check WETH position
      const networkId = await this.wallet.getNetworkId();
      const TOKENS: any = networkId === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;
      const walletAddress = await this.wallet.getAddress();

      let totalAvailableUsd = 0;
      const positions: Array<{ token: string; supplied: string; valueUsd: number }> = [];

      try {
        const wethBalance = await this.aave.getAssetBalance(TOKENS.WETH as `0x${string}`, walletAddress as `0x${string}`);
        const supplied = Number(wethBalance.supplied) / 1e18;
        if (supplied > 0) {
          const valueUsd = supplied * ethPrice;
          positions.push({ token: 'WETH', supplied: supplied.toFixed(6), valueUsd });
          totalAvailableUsd += valueUsd;
        }
      } catch (error) {
        console.warn('Could not fetch WETH position:', error);
      }

      // Check USDC position
      try {
        const usdcBalance = await this.aave.getAssetBalance(TOKENS.USDC as `0x${string}`, walletAddress as `0x${string}`);
        const supplied = Number(usdcBalance.supplied) / 1e6;
        if (supplied > 0) {
          positions.push({ token: 'USDC', supplied: supplied.toFixed(2), valueUsd: supplied });
          totalAvailableUsd += supplied;
        }
      } catch (error) {
        console.warn('Could not fetch USDC position:', error);
      }

      steps[steps.length - 1].status = 'complete';
      steps[steps.length - 1].details = { positions, totalAvailableUsd };

      if (totalAvailableUsd < 1) {
        return {
          success: false,
          steps,
          error: `Insufficient yield to compound. Available: $${totalAvailableUsd.toFixed(2)}, minimum: $1.00`
        };
      }

      steps.push({
        action: 'Available yield identified',
        status: 'complete',
        details: { totalAvailableUsd: totalAvailableUsd.toFixed(2) }
      });

      // Step 2: Find best opportunity
      steps.push({ action: 'Scanning for best yield opportunity', status: 'pending' });
      const opportunities = await this.yieldOptimizer.scanOpportunities();

      if (opportunities.length === 0) {
        return {
          success: false,
          steps,
          error: 'No yield opportunities found'
        };
      }

      // Sort by APY and pick the best
      opportunities.sort((a, b) => b.apy - a.apy);
      const bestOpportunity = opportunities[0];
      steps[steps.length - 1].status = 'complete';
      steps[steps.length - 1].details = {
        protocol: bestOpportunity.protocol,
        strategy: bestOpportunity.strategy,
        apy: bestOpportunity.apy
      };

      // Step 3: Withdraw from current positions
      for (const position of positions) {
        steps.push({
          action: `Withdrawing ${position.token} from Aave`,
          status: 'pending'
        });

        try {
          const withdrawResult = await this.yieldOptimizer.withdrawFromAave(position.token, 'all');
          if (withdrawResult.success) {
            steps[steps.length - 1].status = 'complete';
            steps[steps.length - 1].txHash = withdrawResult.txHash;
          } else {
            steps[steps.length - 1].status = 'failed';
            steps[steps.length - 1].details = { error: withdrawResult.error };
          }
        } catch (error: any) {
          steps[steps.length - 1].status = 'failed';
          steps[steps.length - 1].details = { error: error.message };
        }
      }

      // Step 4: Swap to best opportunity token
      steps.push({ action: 'Swapping to optimal token', status: 'pending' });

      // Calculate amount to compound (convert USD to ETH)
      const amountEth = (totalAvailableUsd / ethPrice).toFixed(6);

      const compoundResult = await this.yieldOptimizer.findBestOpportunityAndEnter({
        amountEth,
        minApy: params.minApy || bestOpportunity.apy * 0.9 // Allow slight variation
      });

      if (compoundResult.success) {
        steps[steps.length - 1].status = 'complete';
        steps[steps.length - 1].txHash = compoundResult.supplyTx;
        steps[steps.length - 1].details = {
          opportunity: compoundResult.opportunity,
          tokenUsed: compoundResult.tokenUsed,
          expectedApy: compoundResult.expectedApy
        };
      } else {
        steps[steps.length - 1].status = 'failed';
        steps[steps.length - 1].details = { error: compoundResult.error };
        return {
          success: false,
          steps,
          error: compoundResult.error
        };
      }

      return {
        success: true,
        steps,
        totalProfitUsd: totalAvailableUsd
      };

    } catch (error: any) {
      console.error('Yield compounding error:', error);
      steps.push({
        action: 'Compounding failed',
        status: 'failed',
        details: { error: error.message }
      });
      return {
        success: false,
        steps,
        error: error.message
      };
    }
  }

  // ==================== Trading Strategy ====================

  getTradingStrategy(): any { return this.tradingStrategy.getStrategy(); }
  setTradingStrategy(updates: TradingStrategyConfig): any { return this.tradingStrategy.setStrategy(updates); }
  setTradingMode(mode: 'conservative' | 'aggressive' | 'capitulation-fishing'): any { return this.tradingStrategy.setMode(mode); }
  enableAutonomousTrading(): void { this.tradingStrategy.enableAutonomousTrading(); }
  disableAutonomousTrading(): void { this.tradingStrategy.disableAutonomousTrading(); }
  getTradingHistory(limit: number = 20): any[] { return this.tradingStrategy.getActionHistory(limit); }

  private buildCycleHandlers(withdrawFn: (token: string) => any, enterFn: (opp: any, amt: string) => any) {
    return {
      getOpportunities: () => this.yieldOptimizer.scanOpportunities(),
      exitPosition: async (pos: any) => { const r = await withdrawFn(pos.token); return { success: r.success, txHash: r.txHash }; },
      enterPosition: async (opp: any, amt: string) => { const r = await enterFn(opp, amt); return { success: r.success, txHash: r.supplyTx }; },
      updatePrices: fetchTokenPrices,
      getMarketSnapshot: this.marketAnalyzer ? () => this.marketAnalyzer!.getMarketSnapshot() : undefined,
    };
  }

  async runTradingCycle(_getAll: () => any, withdrawFn: (token: string) => any, enterFn: (opp: any, amt: string) => any): Promise<any> {
    const prices = await fetchTokenPrices();
    this.tradingStrategy.updatePrices(prices);
    return this.tradingStrategy.runTradingCycle(this.buildCycleHandlers(withdrawFn, enterFn));
  }

  async runPureTradingCycle(_getAll: () => any, withdrawFn: (token: string) => any, enterFn: (opp: any, amt: string) => any): Promise<any> {
    const prices = await fetchTokenPrices();
    this.tradingStrategy.updatePrices(prices);
    return this.tradingStrategy.runTradingCycle(this.buildCycleHandlers(withdrawFn, enterFn));
  }

  async runDryRunTradingCycle(getPortfolioSummary: () => any, getMarketSentiment: () => any): Promise<any> {
    const prices = await fetchTokenPrices();
    this.tradingStrategy.updatePrices(prices);
    const positions = this.tradingStrategy.getPositions();
    const portfolioPnL = this.tradingStrategy.calculatePortfolioPnL();
    const opportunities = await this.yieldOptimizer.scanOpportunities();
    const portfolio = await getPortfolioSummary();
    const sentiment = await getMarketSentiment();

    return {
      mode: 'DRY_RUN', tradesExecuted: 0,
      analysis: {
        portfolio: { totalValue: portfolio.totalValue, activePositions: positions.length, unrealizedPnL: portfolioPnL.totalPnL, unrealizedPnLPercent: portfolioPnL.totalPnLPercent },
        opportunities: opportunities.map((op: any) => ({ protocol: op.protocol, strategy: op.strategy, apy: op.apy, risk: op.risk, token: op.token })),
        sentiment: { score: sentiment.score, fearGreedIndex: sentiment.fearGreedIndex, socialVolume: sentiment.socialVolume },
        positions: positions.map((p: any) => ({ protocol: p.protocol, strategy: p.strategy, token: p.token, amount: p.currentAmount, apy: p.apy, unrealizedPnLPercent: p.unrealizedPnLPercent, entryTime: new Date(p.entryTime).toISOString() })),
      },
      timestamp: new Date().toISOString(),
      note: 'No trades executed - analysis only',
    };
  }
}
