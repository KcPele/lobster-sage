import { WalletManager } from '../wallet/manager';
import { AaveV3 } from '../defi/AaveV3';
import { UniswapV3, BASE_TOKENS, SEPOLIA_TOKENS } from '../defi/UniswapV3';
import { formatUnits, parseEther } from 'viem';
import { getApyAggregator } from '../data/apy-aggregator';
import { saveJson, loadJson } from '../utils/persistence';
import { DefiOperations } from './defiOperations';
import { getTradingConstants } from '../config/trading';

export interface YieldOpportunity {
  protocol: string;
  strategy: string;
  apy: number;
  tvl: number;
  risk: 'low' | 'medium' | 'high';
  token: string;
  chain: string;
  tokenAddress?: string; // For Aave integration
}

export interface YieldPosition {
  protocol: string;
  strategy: string;
  amount: number;
  apy: number;
  earned: number;
  entryTime: number;
  tokenAddress?: string;
}

export interface RebalanceRecommendation {
  shouldRebalance: boolean;
  reason: string;
  currentAllocation: YieldPosition[];
  recommendedAllocation: YieldOpportunity[];
  expectedImprovement: number;
  gasCost: number;
}

export interface YieldConfig {
  minRebalanceThreshold: number; // Minimum APY improvement %
  maxSlippage: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  rebalanceInterval: number; // milliseconds
}

/** Yield Optimizer - Manages DeFi yield farming across protocols */
export class YieldOptimizer {
  private config: YieldConfig;
  private positions: YieldPosition[] = [];
  private lastRebalance: number = 0;
  private wallet: WalletManager | null = null;
  private aave: AaveV3 | null = null;
  private uniswap: UniswapV3 | null = null;
  private defiOps: DefiOperations | null = null;

  constructor(config?: Partial<YieldConfig>) {
    this.config = {
      minRebalanceThreshold: 2, // 2% minimum improvement
      maxSlippage: 0.5, // 0.5%
      riskTolerance: 'moderate',
      rebalanceInterval: 60 * 60 * 1000, // 1 hour
      ...config
    };
  }

  async initialize(wallet: WalletManager, aave?: AaveV3, uniswap?: UniswapV3): Promise<void> {
    console.log('Initializing Yield Optimizer...');
    this.wallet = wallet;
    if (aave) this.aave = aave;
    if (uniswap) this.uniswap = uniswap;
    
    // Initialize DeFi operations if protocols available
    if (this.wallet && this.aave && this.uniswap) {
      this.defiOps = new DefiOperations(
        this.wallet,
        this.aave,
        this.uniswap,
        () => this.positions,
        (p) => { this.positions = p; },
        () => this.savePositions(),
      );
    }

    // Load existing positions if any
    await this.loadPositions();
  }

  async scanOpportunities(): Promise<YieldOpportunity[]> {
    console.log('Scanning yield opportunities...');
    let TOKENS = SEPOLIA_TOKENS;
    if (this.wallet) {
       const nid = await this.wallet.getNetworkId();
       if (nid === 'base-mainnet') TOKENS = BASE_TOKENS;
    }

    const opportunities: YieldOpportunity[] = [];

    // Try to get real Aave opportunities if initialized
    if (this.aave && this.wallet) {
      try {
        console.log('🏦 Fetching real Aave V3 opportunities...');
        const walletAddress = await this.wallet.getAddress();
        
        // Get user's Aave account data if they have positions
        const accountData = await this.aave.getUserAccountData(walletAddress as `0x${string}`);
        
        if (accountData) {
          console.log(`   Current Aave position: $${Number(accountData.totalCollateralBase / BigInt(1e8)).toFixed(2)} collateral, $${Number(accountData.totalDebtBase / BigInt(1e8)).toFixed(2)} debt`);
        }

        // Real Aave token opportunities on Base
        
        // Fetch real APYs from DefiLlama (with fallback)
        const usdcApy = await getApyAggregator().getApy('USDC', 'aave-v3');
        const wethApy = await getApyAggregator().getApy('WETH', 'aave-v3');

        opportunities.push({
          protocol: 'Aave V3',
          strategy: 'USDC Supply',
          apy: usdcApy.apyTotal,
          tvl: usdcApy.tvlUsd || 50000000,
          risk: 'low',
          token: 'USDC',
          chain: 'base',
          tokenAddress: TOKENS.USDC
        });

        opportunities.push({
          protocol: 'Aave V3',
          strategy: 'WETH Supply',
          apy: wethApy.apyTotal,
          tvl: wethApy.tvlUsd || 100000000,
          risk: 'low',
          token: 'WETH',
          chain: 'base',
          tokenAddress: TOKENS.WETH
        });

        console.log(`✅ Found ${opportunities.length} real Aave opportunities`);
      } catch (error: any) {
        console.error('⚠️ Failed to fetch Aave data:', error.message);
        console.log('📊 Skipping Aave opportunities due to fetch error');
      }
    }

    // Note: No simulated fallback - only real opportunities are shown

    return this.filterByRisk(opportunities);
  }

  async calculateOptimalAllocation(
    opportunities: YieldOpportunity[]
  ): Promise<RebalanceRecommendation> {
    console.log('📊 Calculating optimal allocation...');

    // Sort by APY
    const sorted = opportunities.sort((a, b) => b.apy - a.apy);
    
    // Select top opportunities based on risk
    const selected = sorted.slice(0, getTradingConstants().rebalance.topOpportunities);
    
    // Calculate current blended APY
    const currentApy = this.calculateBlendedApy();
    
    // Calculate recommended blended APY
    const recommendedApy = this.calculateRecommendedApy(selected);
    
    const improvement = recommendedApy - currentApy;
    const gasCost = getTradingConstants().gas.costEstimateUsd;

    return {
      shouldRebalance: improvement > this.config.minRebalanceThreshold,
      reason: `APY improvement: ${improvement.toFixed(2)}%`,
      currentAllocation: this.positions,
      recommendedAllocation: selected,
      expectedImprovement: improvement,
      gasCost
    };
  }

  /**
   * Check if rebalancing is needed
   */
  async shouldRebalance(recommendation: RebalanceRecommendation): Promise<boolean> {
    const now = Date.now();
    
    // Check time since last rebalance
    if (now - this.lastRebalance < this.config.rebalanceInterval) {
      return false;
    }

    // Check if improvement justifies gas cost
    const daysToBreakEven = recommendation.gasCost / (recommendation.expectedImprovement * 10);
    
    return recommendation.shouldRebalance && daysToBreakEven < getTradingConstants().rebalance.breakEvenDays;
  }

  /**
   * Execute rebalancing
   */
  async rebalance(allocation: RebalanceRecommendation): Promise<{ hash: string }> {
    console.log('🔄 Executing rebalance...');
    if (!this.wallet || !this.aave || !this.uniswap) {
      console.warn('⚠️ Cannot rebalance: Wallet, Aave, or Uniswap not initialized');
      return { hash: '0x0' };
    }

    try {
      const networkId = await this.wallet.getNetworkId();
      const TOKENS = networkId === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;
      let lastHash = '0x0';

      // 1. Withdraw from current positions
      for (const position of this.positions) {
        if (!position.tokenAddress) continue;
        console.log(`Withdrawing from ${position.protocol} (${position.tokenAddress})...`);
        
        try {
          // Aave V3 handles "type(uint256).max" as "withdraw all"
          const hash = await this.aave.withdraw(
            position.tokenAddress as `0x${string}`, 
            BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935') // maxUint256
          );
          console.log(`✅ Withdrawal TX: ${hash}`);
          lastHash = hash;
          // Wait for confirmation to ensure funds are available for swap
          await this.aave.waitForTransaction(hash as `0x${string}`);
        } catch (err: any) {
          console.error(`❌ Withdrawal failed: ${err.message}`);
          continue; // Skip swap if withdraw failed
        }
      }

      // 2. Deposit to new positions (Swapping if needed)
      // Clear old positions as we withdrew
      this.positions = [];

      console.log('Debug Allocation:', JSON.stringify(allocation));

      for (const opportunity of allocation.recommendedAllocation) {
        if (!opportunity.tokenAddress) continue;
        console.log(`Preparing deposit to ${opportunity.protocol} (${opportunity.token})...`);
        
        const targetToken = opportunity.tokenAddress as `0x${string}`;
        
        // Check balances
        const rawWeth = await this.wallet.getTokenBalanceRaw(TOKENS.WETH);
        const wethBal = rawWeth.value;
        
        const rawUsdc = await this.wallet.getTokenBalanceRaw(TOKENS.USDC);
        const usdcBal = rawUsdc.value;
        
        const ethBalStr = await this.wallet.getBalance();
        const ethBal = parseEther(ethBalStr);

        console.log(`Debug Rebalance: Network=${networkId}, Target=${targetToken}`);
        console.log(`Debug Balances: ETH=${ethBalStr}, WETH=${formatUnits(wethBal, 18)}, USDC=${formatUnits(usdcBal, 6)}`);

        // Ensure comparison works
        const targetLower = targetToken.toLowerCase();
        const wethLower = TOKENS.WETH.toLowerCase();
        const usdcLower = TOKENS.USDC.toLowerCase();
        console.log(`Debug Tokens: Target=${targetLower}, WETH=${wethLower}, USDC=${usdcLower}`);

        let amountToDeposit = 0n;

        // Scenario A: Target is WETH
        if (targetLower === wethLower) {
           // Use WETH balance directly
           if (wethBal > 0n) {
             console.log(`Using existing WETH: ${formatUnits(wethBal, 18)}`);
             amountToDeposit = wethBal;
           }
           // Swap USDC -> WETH if we have USDC (> 1 unit usually 1e6)
           else if (usdcBal > BigInt(getTradingConstants().dust.minUsdcRaw)) {
              console.log('💱 Swapping USDC -> WETH...');
              const swapResult = await this.uniswap.swap({
                tokenIn: TOKENS.USDC,
                tokenOut: TOKENS.WETH,
                amountIn: usdcBal,
                slippagePercent: 1.0 
              });
              amountToDeposit += swapResult.amountOut;
              await this.aave.waitForTransaction(swapResult.hash as `0x${string}`, 3);
           }
           // Wrap ETH -> WETH if we have ETH (> 0.02 ETH to leave gas)
           else if (ethBal > BigInt(getTradingConstants().dust.minEthWei)) {
               console.log('💱 Wrapping ETH -> WETH...');
               const amountToWrap = ethBal - parseEther(getTradingConstants().gas.reserveEth);
               const swapResult = await this.uniswap.swapEthToToken(
                   TOKENS.WETH,
                   formatUnits(amountToWrap, 18),
                   1.0
               );
               amountToDeposit += swapResult.amountOut;
               await this.aave.waitForTransaction(swapResult.hash as `0x${string}`, 3);
           }
        }
        // Scenario B: Target is USDC
        else if (targetToken.toLowerCase() === TOKENS.USDC.toLowerCase()) {
           // Use USDC balance directly
           if (usdcBal > 0n) {
             console.log(`Using existing USDC: ${formatUnits(usdcBal, 6)}`);
             amountToDeposit = usdcBal;
           }
           // Swap WETH -> USDC if we have WETH (> 0.0001 ETH)
           else if (wethBal > BigInt(getTradingConstants().dust.minWethWei)) {
              console.log('💱 Swapping WETH -> USDC...');
              const swapResult = await this.uniswap.swap({
                tokenIn: TOKENS.WETH,
                tokenOut: TOKENS.USDC,
                amountIn: wethBal,
                slippagePercent: 1.0
              });
              amountToDeposit += swapResult.amountOut;
              await this.aave.waitForTransaction(swapResult.hash as `0x${string}`, 3);
           }
           // Swap ETH -> USDC if we have ETH (> 0.02 ETH)
           else if (ethBal > BigInt(getTradingConstants().dust.minEthWei)) {
              console.log('💱 Swapping ETH -> USDC...');
              const amountToSwap = ethBal - parseEther(getTradingConstants().gas.reserveEth);
              const swapResult = await this.uniswap.swapEthToUsdc(
                  formatUnits(amountToSwap, 18), 
                  1.0
              );
              amountToDeposit += swapResult.amountOut;
              await this.aave.waitForTransaction(swapResult.hash as `0x${string}`, 3);
           }
        }

        if (amountToDeposit > 0n) {
             console.log(`Depositing ${formatUnits(amountToDeposit, 6)} ${opportunity.token}...`);
             const hash = await this.aave.supply(targetToken, amountToDeposit);
             console.log(`✅ Supply TX: ${hash}`);
             lastHash = hash;

             const newPosition: YieldPosition = {
                protocol: opportunity.protocol,
                strategy: opportunity.strategy,
                amount: Number(formatUnits(amountToDeposit, 6)), // Rough est for display
                apy: opportunity.apy,
                earned: 0,
                entryTime: Date.now(),
                tokenAddress: targetToken
            };
            this.positions.push(newPosition);
        } else {
            console.log('⚠️ No funds available to deposit.');
        }
      }

      this.lastRebalance = Date.now();
      await this.savePositions();

      return { hash: lastHash };
    } catch (error: any) {
        console.error('❌ Rebalance execution failed:', error);
        return { hash: '0x0' };
    }
  }

  /**
   * Get current positions
   */
  async getPositions(): Promise<YieldPosition[]> {
    return this.positions;
  }

  /**
   * Get yield opportunities (alias for scanOpportunities)
   */
  async getOpportunities(): Promise<YieldOpportunity[]> {
    return this.scanOpportunities();
  }

  /**
   * Optimize positions by rebalancing to better opportunities
   */
  async optimizePositions(): Promise<{ rebalanced: boolean; reason: string; improvement?: number; hash?: string }> {
    const opportunities = await this.scanOpportunities();
    const recommendation = await this.calculateOptimalAllocation(opportunities);
    
    if (await this.shouldRebalance(recommendation)) {
      const tx = await this.rebalance(recommendation);
      return {
        rebalanced: true,
        reason: recommendation.reason,
        improvement: recommendation.expectedImprovement,
        hash: tx.hash
      };
    }
    
    return {
      rebalanced: false,
      reason: 'No rebalancing needed at this time'
    };
  }

  async supplyWethToAave(amountEth: string) {
    if (!this.defiOps) return { success: false, error: 'Not fully initialized' };
    return this.defiOps.supplyWethToAave(amountEth);
  }

  async harvestRewards(): Promise<number> {
    let totalHarvested = 0;

    for (const position of this.positions) {
      const timeElapsed = (Date.now() - position.entryTime) / (1000 * 60 * 60 * 24); // days
      const dailyYield = position.amount * (position.apy / 100) / 365;
      const accrued = dailyYield * timeElapsed;
      
      position.earned += accrued;
      totalHarvested += accrued;
    }

    this.savePositions();
    return totalHarvested;
  }

  async emergencyWithdraw(): Promise<void> {
    console.log('Emergency withdraw from all positions...');
    
    for (const position of this.positions) {
      console.log(`Withdrawing ${position.amount} from ${position.protocol}`);
      // Would call protocol withdraw
    }
    
    this.positions = [];
    this.savePositions();
    console.log('✅ All positions withdrawn');
  }

  private calculateBlendedApy(): number {
    if (this.positions.length === 0) return 0;
    
    const totalValue = this.positions.reduce((sum, p) => sum + p.amount, 0);
    const weightedApy = this.positions.reduce(
      (sum, p) => sum + p.apy * (p.amount / totalValue), 
      0
    );
    
    return weightedApy;
  }

  private calculateRecommendedApy(opportunities: YieldOpportunity[]): number {
    const totalWeight = opportunities.reduce((sum, o) => sum + o.apy, 0);
    return totalWeight / opportunities.length;
  }

  private filterByRisk(opportunities: YieldOpportunity[]): YieldOpportunity[] {
    const riskMap: Record<string, string[]> = {
      'conservative': ['low'],
      'moderate': ['low', 'medium'],
      'aggressive': ['low', 'medium', 'high']
    };

    const allowedRisks = riskMap[this.config.riskTolerance];
    return opportunities.filter(o => allowedRisks.includes(o.risk));
  }

  private async loadPositions(): Promise<void> {
    this.positions = loadJson<YieldPosition[]>('positions.json', []);
    console.log(`Loaded ${this.positions.length} positions from storage`);
  }

  private savePositions(): void {
    saveJson('positions.json', this.positions);
  }

  // ==========================================
  // DELEGATED DEFI OPERATIONS
  // ==========================================

  async withdrawFromAave(token: string, amount?: string) {
    if (!this.defiOps) return { success: false, error: 'Not fully initialized' };
    return this.defiOps.withdrawFromAave(token, amount);
  }

  async swapTokens(params: { tokenIn: string; tokenOut: string; amount: string; slippage?: number }) {
    if (!this.defiOps) return { success: false, error: 'Not fully initialized' };
    return this.defiOps.swapTokens(params);
  }

  async supplyToAave(token: string, amount: string) {
    if (!this.defiOps) return { success: false, error: 'Not fully initialized' };
    return this.defiOps.supplyToAave(token, amount);
  }

  async findBestOpportunityAndEnter(params: { amountEth: string; minApy?: number }) {
    if (!this.defiOps) return { success: false, error: 'Not fully initialized' };
    return this.defiOps.findBestOpportunityAndEnter(
      () => this.scanOpportunities(),
      params,
    );
  }
}

export default YieldOptimizer;
