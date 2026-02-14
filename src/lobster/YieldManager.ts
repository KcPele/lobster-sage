/**
 * YieldManager - Handles all yield operations
 *
 * Handles:
 * - Aave V3 supply and withdraw operations
 * - Yield opportunity scanning
 * - Yield optimization and rebalancing
 * - Finding best yield opportunities
 */

import type { WalletManager } from '../wallet/manager';
import { UniswapV3, BASE_TOKENS, SEPOLIA_TOKENS } from '../defi/UniswapV3';
import type { AaveV3 } from '../defi/AaveV3';
import { YieldOptimizer } from '../yield/optimizer';
import { parseUnits } from 'viem';

export interface YieldOpportunity {
  protocol: string;
  strategy: string;
  apy: number;
  tvl: number;
  risk: 'low' | 'medium' | 'high';
  token: string;
  chain: string;
  tokenAddress?: string;
}

export interface SupplyResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface WithdrawResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface BestOpportunityResult {
  success: boolean;
  opportunity?: YieldOpportunity;
  tokenUsed?: string;
  wrapTx?: string;
  approveTx?: string;
  supplyTx?: string;
  expectedApy?: number;
  error?: string;
}

/**
 * YieldManager class for handling all yield operations
 */
export class YieldManager {
  private wallet: WalletManager;
  private uniswap: UniswapV3;
  private aave: AaveV3;
  private yieldOptimizer: YieldOptimizer;

  constructor(
    wallet: WalletManager,
    uniswap: UniswapV3,
    aave: AaveV3,
    yieldOptimizer: YieldOptimizer
  ) {
    this.wallet = wallet;
    this.uniswap = uniswap;
    this.aave = aave;
    this.yieldOptimizer = yieldOptimizer;
  }

  /**
   * Supply WETH to Aave V3 - wraps ETH and deposits to Aave
   * This is the most reliable yield farming approach that works on both testnet and mainnet
   */
  async supplyWethToAave(amountEth: string): Promise<any> {
    return this.yieldOptimizer.supplyWethToAave(amountEth);
  }

  /**
   * Withdraw tokens from Aave V3
   * @param token - Token to withdraw ('WETH', 'USDC', or address)
   * @param amount - Amount to withdraw ('all' for full withdrawal)
   */
  async withdrawFromAave(token: string, amount?: string): Promise<any> {
    return this.yieldOptimizer.withdrawFromAave(token, amount);
  }

  /**
   * Supply any token to Aave V3
   */
  async supplyToAave(token: string, amount: string): Promise<any> {
    return this.yieldOptimizer.supplyToAave(token, amount);
  }

  /**
   * Get yield opportunities
   */
  async getYieldOpportunities(): Promise<YieldOpportunity[]> {
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
   * Find best yield opportunity and enter automatically
   * Scans all markets and picks the highest APY
   */
  async findBestOpportunityAndEnter(params: {
    amountEth: string;
    minApy?: number;
  }): Promise<BestOpportunityResult> {
    return this.yieldOptimizer.findBestOpportunityAndEnter(params);
  }

  /**
   * Scan for yield opportunities
   */
  async scanOpportunities(): Promise<YieldOpportunity[]> {
    return this.yieldOptimizer.scanOpportunities();
  }

  /**
   * Calculate optimal allocation across opportunities
   */
  async calculateOptimalAllocation(opportunities: YieldOpportunity[]): Promise<any> {
    return this.yieldOptimizer.calculateOptimalAllocation(opportunities);
  }

  /**
   * Check if rebalancing is needed
   */
  async shouldRebalance(allocation: any): Promise<boolean> {
    return this.yieldOptimizer.shouldRebalance(allocation);
  }

  /**
   * Execute rebalancing
   */
  async rebalance(allocation: any): Promise<any> {
    return this.yieldOptimizer.rebalance(allocation);
  }

  /**
   * Resolve a token symbol to its on-chain address
   */
  private async resolveTokenAddress(symbol: string): Promise<`0x${string}`> {
    const networkId = await this.wallet.getNetworkId();
    const TOKENS: any = networkId === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;
    const key = symbol.toUpperCase() === 'ETH' ? 'WETH' : symbol.toUpperCase();
    const address = TOKENS[key];
    if (!address) throw new Error(`Unsupported token: ${symbol}`);
    return address as `0x${string}`;
  }

  /**
   * Borrow tokens from Aave V3
   */
  async borrowFromAave(
    token: string,
    amount: string,
    interestRateMode: 'stable' | 'variable' = 'variable'
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const tokenAddress = await this.resolveTokenAddress(token);
      const decimals = ['USDC', 'USDBC'].includes(token.toUpperCase()) ? 6 : 18;
      const amountBigInt = parseUnits(amount, decimals);
      const rateMode = interestRateMode === 'stable' ? 1 : 2;

      const txHash = await this.aave.borrow(tokenAddress, amountBigInt, rateMode);
      await this.aave.waitForTransaction(txHash);

      return { success: true, txHash };
    } catch (error: any) {
      console.error('Borrow error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Repay Aave V3 debt
   */
  async repayAave(
    token: string,
    amount: string,
    interestRateMode: 'stable' | 'variable' = 'variable'
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const tokenAddress = await this.resolveTokenAddress(token);
      const decimals = ['USDC', 'USDBC'].includes(token.toUpperCase()) ? 6 : 18;
      const rateMode = interestRateMode === 'stable' ? 1 : 2;

      let amountBigInt: bigint;
      if (amount === 'all') {
        // Use max uint256 to repay all debt
        amountBigInt = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      } else {
        amountBigInt = parseUnits(amount, decimals);
      }

      // Ensure approval for repayment
      if (amount !== 'all') {
        await this.uniswap.ensureApproval(tokenAddress, amountBigInt);
      }

      const txHash = await this.aave.repay(tokenAddress, amountBigInt, rateMode);
      await this.aave.waitForTransaction(txHash);

      return { success: true, txHash };
    } catch (error: any) {
      console.error('Repay error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get full Aave account data (collateral, debt, health factor)
   */
  async getAaveAccountData(): Promise<any> {
    const walletAddress = await this.wallet.getAddress();
    return this.aave.getFormattedUserAccountData(walletAddress as `0x${string}`);
  }

  /**
   * Emergency withdraw from all positions
   */
  async emergencyWithdraw(): Promise<void> {
    return this.yieldOptimizer.emergencyWithdraw();
  }

  /**
   * Run yield optimization cycle
   */
  async runYieldCycle(): Promise<void> {
    console.log('Running yield optimization cycle...');

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
    console.log(`Rebalanced: ${rebalanceTx.hash}`);

    console.log('Yield cycle complete');
  }
}
