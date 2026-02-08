/**
 * TradingManager - Handles all trading operations
 *
 * Handles:
 * - Token swaps via Uniswap V3
 * - WETH wrapping/unwrapping
 * - Swap quotes and price impact calculations
 * - Yield compounding
 * - Trading strategy management
 */

import { WalletManager } from '../wallet/manager';
import { UniswapV3, BASE_TOKENS, SEPOLIA_TOKENS } from '../defi/UniswapV3';
import { AaveV3 } from '../defi/AaveV3';
import { YieldOptimizer } from '../yield/optimizer';
import { TradingStrategyManager, fetchTokenPrices } from '../yield/tradingStrategy';
import { getCoinGecko } from '../data/coingecko';
import { parseUnits, formatUnits } from 'viem';

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

/**
 * TradingManager class for handling all trading operations
 */
export class TradingManager {
  private wallet: WalletManager;
  private uniswap: UniswapV3;
  private aave: AaveV3;
  private yieldOptimizer: YieldOptimizer;
  private tradingStrategy: TradingStrategyManager;

  constructor(
    wallet: WalletManager,
    uniswap: UniswapV3,
    aave: AaveV3,
    yieldOptimizer: YieldOptimizer,
    tradingStrategy: TradingStrategyManager
  ) {
    this.wallet = wallet;
    this.uniswap = uniswap;
    this.aave = aave;
    this.yieldOptimizer = yieldOptimizer;
    this.tradingStrategy = tradingStrategy;
  }

  /**
   * Swap any token pair via Uniswap V3
   * Handles ETH wrapping/unwrapping automatically
   */
  async swapTokens(params: SwapParams): Promise<any> {
    return this.yieldOptimizer.swapTokens(params);
  }

  /**
   * Unwrap WETH to ETH
   */
  async unwrapWeth(amount: string): Promise<any> {
    if (!this.uniswap) throw new Error('Uniswap not initialized');
    return this.uniswap.unwrapWeth(amount);
  }

  /**
   * Get swap quote before executing
   * Returns expected output, price impact, and gas estimate
   */
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
      const decimalsIn = (tokenIn.toUpperCase() === 'USDC' || tokenIn.toUpperCase() === 'USDBC') ? 6 : 18;
      const decimalsOut = (tokenOut.toUpperCase() === 'USDC' || tokenOut.toUpperCase() === 'USDBC') ? 6 : 18;

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

  /**
   * Compound yield profits by withdrawing, swapping, and re-supplying
   * Automatically finds the best opportunity and reinvests profits
   */
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

  // ==========================================
  // TRADING STRATEGY METHODS
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
  setTradingStrategy(updates: TradingStrategyConfig): any {
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
   * Get trading action history
   */
  getTradingHistory(limit: number = 20): any[] {
    return this.tradingStrategy.getActionHistory(limit);
  }

  /**
   * Run a complete trading cycle
   * Checks positions for exit signals, finds opportunities, executes trades
   */
  async runTradingCycle(_getAllPositions: () => any, withdrawFn: (token: string) => any, enterFn: (opportunity: any, amountEth: string) => any): Promise<any> {
    console.log('STARTING FULL AUTONOMOUS CYCLE');

    // Update prices first
    const prices = await fetchTokenPrices();
    this.tradingStrategy.updatePrices(prices);

    return this.tradingStrategy.runTradingCycle({
      getOpportunities: () => this.yieldOptimizer.scanOpportunities(),
      exitPosition: async (position) => {
        const result = await withdrawFn(position.token);
        return { success: result.success, txHash: result.txHash };
      },
      enterPosition: async (opportunity, amountEth) => {
        const result = await enterFn(opportunity, amountEth);
        return { success: result.success, txHash: result.supplyTx };
      },
      updatePrices: fetchTokenPrices,
    });
  }

  /**
   * Run pure DeFi trading cycle WITHOUT NFT minting
   * This is for competition mode - shows real trading activity only
   */
  async runPureTradingCycle(_getAllPositions: () => any, withdrawFn: (token: string) => any, enterFn: (opportunity: any, amountEth: string) => any): Promise<any> {
    console.log('STARTING PURE DEFI TRADING CYCLE (no NFTs)');

    // Update prices first
    const prices = await fetchTokenPrices();
    this.tradingStrategy.updatePrices(prices);

    // Run the trading strategy with real DeFi transactions
    return this.tradingStrategy.runTradingCycle({
      getOpportunities: () => this.yieldOptimizer.scanOpportunities(),
      exitPosition: async (position) => {
        const result = await withdrawFn(position.token);
        return { success: result.success, txHash: result.txHash };
      },
      enterPosition: async (opportunity, amountEth) => {
        const result = await enterFn(opportunity, amountEth);
        return { success: result.success, txHash: result.supplyTx };
      },
      updatePrices: fetchTokenPrices,
    });
  }

  /**
   * Run dry-run trading cycle - ANALYZE ONLY, NO TRADES
   * Perfect for posting updates without executing transactions
   */
  async runDryRunTradingCycle(getPortfolioSummary: () => any, getMarketSentiment: () => any): Promise<any> {
    console.log('STARTING DRY-RUN CYCLE (analysis only, no trades)');

    // Update prices
    const prices = await fetchTokenPrices();
    this.tradingStrategy.updatePrices(prices);

    // Get current positions
    const positions = this.tradingStrategy.getPositions();
    const portfolioPnL = this.tradingStrategy.calculatePortfolioPnL();

    // Scan opportunities
    const opportunities = await this.yieldOptimizer.scanOpportunities();

    // Get portfolio summary
    const portfolio = await getPortfolioSummary();

    // Get market sentiment
    const sentiment = await getMarketSentiment();

    return {
      mode: 'DRY_RUN',
      tradesExecuted: 0,
      analysis: {
        portfolio: {
          totalValue: portfolio.totalValue,
          activePositions: positions.length,
          unrealizedPnL: portfolioPnL.totalPnL,
          unrealizedPnLPercent: portfolioPnL.totalPnLPercent,
        },
        opportunities: opportunities.map(op => ({
          protocol: op.protocol,
          strategy: op.strategy,
          apy: op.apy,
          risk: op.risk,
          token: op.token,
        })),
        sentiment: {
          score: sentiment.score,
          fearGreedIndex: sentiment.fearGreedIndex,
          socialVolume: sentiment.socialVolume,
        },
        positions: positions.map(p => ({
          protocol: p.protocol,
          strategy: p.strategy,
          token: p.token,
          amount: p.currentAmount,
          apy: p.apy,
          unrealizedPnLPercent: p.unrealizedPnLPercent,
          entryTime: new Date(p.entryTime).toISOString(),
        })),
      },
      timestamp: new Date().toISOString(),
      note: 'No trades executed - analysis only',
    };
  }
}
