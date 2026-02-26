/**
 * DeFi Operations - Handles Aave withdraw/supply and Uniswap swap execution.
 * Extracted from optimizer.ts to keep files under 500 lines.
 */
import { WalletManager } from '../wallet/manager';
import { AaveV3 } from '../defi/AaveV3';
import { UniswapV3, BASE_TOKENS, SEPOLIA_TOKENS } from '../defi/UniswapV3';
import { formatUnits, parseEther } from 'viem';
import { getApyAggregator } from '../data/apy-aggregator';
import { getTradingConstants } from '../config/trading';
import { getTokenDecimals } from '../defi/token-registry';
import type { YieldOpportunity, YieldPosition } from './optimizer';

export class DefiOperations {
  private wallet: WalletManager;
  private aave: AaveV3;
  private uniswap: UniswapV3;
  private getPositions: () => YieldPosition[];
  private setPositions: (p: YieldPosition[]) => void;
  private triggerSave: () => void;

  constructor(
    wallet: WalletManager,
    aave: AaveV3,
    uniswap: UniswapV3,
    getPositions: () => YieldPosition[],
    setPositions: (p: YieldPosition[]) => void,
    triggerSave: () => void,
  ) {
    this.wallet = wallet;
    this.aave = aave;
    this.uniswap = uniswap;
    this.getPositions = getPositions;
    this.setPositions = setPositions;
    this.triggerSave = triggerSave;
  }

  private async getTokens() {
    const nid = await this.wallet.getNetworkId();
    return nid === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;
  }

  /**
   * Withdraw tokens from Aave V3
   */
  async withdrawFromAave(token: string, amount?: string): Promise<{
    success: boolean;
    txHash?: string;
    amountWithdrawn?: string;
    tokenSymbol?: string;
    error?: string;
  }> {
    try {
      const TOKENS = await this.getTokens();

      let tokenAddress: string;
      let tokenSymbol: string;

      if (token.toUpperCase() === 'WETH') {
        tokenAddress = TOKENS.WETH;
        tokenSymbol = 'WETH';
      } else if (token.toUpperCase() === 'USDC') {
        tokenAddress = TOKENS.USDC;
        tokenSymbol = 'USDC';
      } else {
        tokenAddress = token;
        tokenSymbol = 'TOKEN';
      }

      const walletAddress = await this.wallet.getAddress();

      try {
        await this.aave.getUserAccountData(walletAddress as `0x${string}`);
      } catch (_e) {
        // Continue even if we can't get account data
      }

      let withdrawAmount: bigint;
      if (amount === 'all' || !amount) {
        withdrawAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        console.log(`Withdrawing ALL ${tokenSymbol} from Aave...`);
      } else {
        const decimals = getTokenDecimals(tokenSymbol);
        withdrawAmount = BigInt(Math.floor(parseFloat(amount) * (10 ** decimals)));
        console.log(`Withdrawing ${amount} ${tokenSymbol} from Aave...`);
      }

      const hash = await this.aave.withdraw(
        tokenAddress as `0x${string}`,
        withdrawAmount
      );

      console.log(`Aave Withdraw TX: ${hash}`);

      const positions = this.getPositions();
      this.setPositions(positions.filter(p => p.tokenAddress !== tokenAddress));
      this.triggerSave();

      return {
        success: true,
        txHash: hash,
        amountWithdrawn: amount || 'all',
        tokenSymbol,
      };
    } catch (error: any) {
      console.error('Aave withdrawal failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Universal token swap - swap any token pair via Uniswap V3
   */
  async swapTokens(params: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    slippage?: number;
  }): Promise<{
    success: boolean;
    txHash?: string;
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: string;
    amountOut?: string;
    error?: string;
  }> {
    try {
      const TOKENS = await this.getTokens();

      const resolveToken = (t: string): string => {
        if (t.toUpperCase() === 'ETH') return 'ETH';
        if (t.toUpperCase() === 'WETH') return TOKENS.WETH;
        if (t.toUpperCase() === 'USDC') return TOKENS.USDC;
        return t;
      };

      const tokenInResolved = resolveToken(params.tokenIn);
      const tokenOutResolved = resolveToken(params.tokenOut);

      console.log(`Swapping ${params.amount} ${params.tokenIn} -> ${params.tokenOut}...`);

      // Case 1: ETH -> WETH (wrap)
      if (tokenInResolved === 'ETH' && tokenOutResolved === TOKENS.WETH) {
        const result = await this.uniswap.wrapEth(params.amount);
        return {
          success: true, txHash: result.hash,
          tokenIn: 'ETH', tokenOut: 'WETH',
          amountIn: params.amount, amountOut: params.amount,
        };
      }

      // Case 2: WETH -> ETH (unwrap)
      if (tokenInResolved === TOKENS.WETH && tokenOutResolved === 'ETH') {
        const result = await this.uniswap.unwrapWeth(params.amount);
        return {
          success: true, txHash: result.hash,
          tokenIn: 'WETH', tokenOut: 'ETH',
          amountIn: params.amount, amountOut: params.amount,
        };
      }

      // Case 3: ETH -> Token (wrap then swap)
      if (tokenInResolved === 'ETH') {
        console.log('  Step 1: Wrapping ETH to WETH...');
        await this.uniswap.wrapEth(params.amount);

        console.log('  Step 2: Swapping WETH to token...');
        const result = await this.uniswap.swap({
          tokenIn: TOKENS.WETH as `0x${string}`,
          tokenOut: tokenOutResolved as `0x${string}`,
          amountIn: parseEther(params.amount),
          slippagePercent: params.slippage || getTradingConstants().slippage.defaultPercent,
        });

        return {
          success: true, txHash: result.hash,
          tokenIn: 'ETH', tokenOut: params.tokenOut,
          amountIn: params.amount,
          amountOut: formatUnits(result.amountOut, getTokenDecimals(params.tokenOut)),
        };
      }

      // Case 4: Token -> ETH (swap then unwrap)
      if (tokenOutResolved === 'ETH') {
        console.log('  Step 1: Swapping token to WETH...');
        const decimals = getTokenDecimals(params.tokenIn);
        const amountIn = BigInt(Math.floor(parseFloat(params.amount) * (10 ** decimals)));

        const swapResult = await this.uniswap.swap({
          tokenIn: tokenInResolved as `0x${string}`,
          tokenOut: TOKENS.WETH as `0x${string}`,
          amountIn,
          slippagePercent: params.slippage || getTradingConstants().slippage.defaultPercent,
        });

        console.log('  Step 2: Unwrapping WETH to ETH...');
        const wethAmount = formatUnits(swapResult.amountOut, 18);
        const unwrapResult = await this.uniswap.unwrapWeth(wethAmount);

        return {
          success: true, txHash: unwrapResult.hash,
          tokenIn: params.tokenIn, tokenOut: 'ETH',
          amountIn: params.amount, amountOut: wethAmount,
        };
      }

      // Case 5: Token -> Token (direct swap)
      const decimalsIn = getTokenDecimals(params.tokenIn);
      const decimalsOut = getTokenDecimals(params.tokenOut);
      const amountIn = BigInt(Math.floor(parseFloat(params.amount) * (10 ** decimalsIn)));

      const result = await this.uniswap.swap({
        tokenIn: tokenInResolved as `0x${string}`,
        tokenOut: tokenOutResolved as `0x${string}`,
        amountIn,
        slippagePercent: params.slippage || getTradingConstants().slippage.defaultPercent,
      });

      return {
        success: true, txHash: result.hash,
        tokenIn: params.tokenIn, tokenOut: params.tokenOut,
        amountIn: params.amount,
        amountOut: formatUnits(result.amountOut, decimalsOut),
      };
    } catch (error: any) {
      console.error('Swap failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Supply any token to Aave V3
   */
  async supplyToAave(token: string, amount: string): Promise<{
    success: boolean;
    txHash?: string;
    tokenSymbol?: string;
    amountSupplied?: string;
    apy?: number;
    error?: string;
  }> {
    try {
      const TOKENS = await this.getTokens();

      let tokenAddress: string;
      let tokenSymbol: string;
      let decimals: number;

      if (token.toUpperCase() === 'WETH') {
        tokenAddress = TOKENS.WETH;
        tokenSymbol = 'WETH';
        decimals = getTokenDecimals('WETH');
      } else if (token.toUpperCase() === 'USDC') {
        tokenAddress = TOKENS.USDC;
        tokenSymbol = 'USDC';
        decimals = getTokenDecimals('USDC');
      } else {
        tokenAddress = token;
        tokenSymbol = 'TOKEN';
        decimals = 18;
      }

      console.log(`Supplying ${amount} ${tokenSymbol} to Aave V3...`);

      const supplyAmount = BigInt(Math.floor(parseFloat(amount) * (10 ** decimals)));
      const hash = await this.aave.supply(tokenAddress as `0x${string}`, supplyAmount);

      console.log(`Aave Supply TX: ${hash}`);

      const tokenApy = await getApyAggregator().getApy(tokenSymbol, 'aave-v3');
      const positions = this.getPositions();
      positions.push({
        protocol: 'Aave V3',
        strategy: `${tokenSymbol} Supply`,
        amount: parseFloat(amount),
        apy: tokenApy.apyTotal,
        earned: 0,
        entryTime: Date.now(),
        tokenAddress,
      });
      this.setPositions(positions);
      this.triggerSave();

      return {
        success: true,
        txHash: hash,
        tokenSymbol,
        amountSupplied: amount,
        apy: tokenApy.apyTotal,
      };
    } catch (error: any) {
      console.error('Aave supply failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find the best yield opportunity and enter automatically
   */
  async findBestOpportunityAndEnter(
    scanOpportunities: () => Promise<YieldOpportunity[]>,
    params: {
      amountEth: string;
      minApy?: number;
    }
  ): Promise<{
    success: boolean;
    opportunity?: YieldOpportunity;
    swapTx?: string;
    supplyTx?: string;
    tokenUsed?: string;
    amountSupplied?: string;
    expectedApy?: number;
    error?: string;
  }> {
    try {
      console.log(`Finding best yield opportunity for ${params.amountEth} ETH...`);

      const opportunities = await scanOpportunities();
      const minApy = params.minApy || getTradingConstants().entry.minApy;

      const validOpps = opportunities
        .filter(o => o.apy >= minApy)
        .sort((a, b) => b.apy - a.apy);

      if (validOpps.length === 0) {
        return {
          success: false,
          error: `No opportunities found with APY >= ${minApy}%`
        };
      }

      const bestOpp = validOpps[0];
      console.log(`Best opportunity: ${bestOpp.protocol} ${bestOpp.strategy} @ ${bestOpp.apy}% APY`);

      const TOKENS = await this.getTokens();

      // If WETH is best, just wrap and supply
      if (bestOpp.token === 'WETH' || bestOpp.tokenAddress === TOKENS.WETH) {
        console.log('  Step 1: Wrapping ETH to WETH...');
        const wrapResult = await this.uniswap.wrapEth(params.amountEth);

        console.log('  Step 2: Supplying WETH to Aave...');
        const supplyResult = await this.supplyToAave('WETH', params.amountEth);

        return {
          success: true,
          opportunity: bestOpp,
          swapTx: wrapResult.hash,
          supplyTx: supplyResult.txHash,
          tokenUsed: 'WETH',
          amountSupplied: params.amountEth,
          expectedApy: bestOpp.apy,
        };
      }

      // Otherwise, swap ETH to the best token and supply
      console.log(`  Step 1: Swapping ETH to ${bestOpp.token}...`);
      const swapResult = await this.swapTokens({
        tokenIn: 'ETH',
        tokenOut: bestOpp.token,
        amount: params.amountEth,
      });

      if (!swapResult.success) {
        return { success: false, error: `Swap failed: ${swapResult.error}` };
      }

      console.log(`  Step 2: Supplying ${bestOpp.token} to Aave...`);
      const supplyResult = await this.supplyToAave(
        bestOpp.token,
        swapResult.amountOut || params.amountEth
      );

      return {
        success: true,
        opportunity: bestOpp,
        swapTx: swapResult.txHash,
        supplyTx: supplyResult.txHash,
        tokenUsed: bestOpp.token,
        amountSupplied: swapResult.amountOut,
        expectedApy: bestOpp.apy,
      };
    } catch (error: any) {
      console.error('Auto-enter failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Supply WETH to Aave - wraps ETH then supplies
   */
  async supplyWethToAave(amountEth: string): Promise<{
    success: boolean;
    wrapTxHash?: string;
    supplyTxHash?: string;
    amountSupplied?: string;
    error?: string;
  }> {
    try {
      const TOKENS = await this.getTokens();

      // Check balance with gas reserve
      const ethBalStr = await this.wallet.getBalance();
      const ethBal = parseEther(ethBalStr);
      const requestedAmount = parseEther(amountEth);
      const gasReserve = parseEther(getTradingConstants().gas.reserveEth);
      const maxAvailable = ethBal - gasReserve;

      if (requestedAmount > maxAvailable) {
        return {
          success: false,
          error: `Insufficient ETH. Have: ${ethBalStr}, Requested: ${amountEth}, Gas reserve: 0.01`
        };
      }

      console.log(`Balance: ${ethBalStr} ETH, Wrapping: ${amountEth} ETH`);

      // Wrap ETH -> WETH
      console.log('Wrapping ETH -> WETH...');
      const wrapResult = await this.uniswap.wrapEth(amountEth);
      console.log(`Wrap TX: ${wrapResult.hash}`);

      // Supply WETH to Aave
      console.log('Supplying WETH to Aave V3...');
      const supplyHash = await this.aave.supply(TOKENS.WETH, wrapResult.amountOut);
      console.log(`Supply TX: ${supplyHash}`);

      await this.aave.waitForTransaction(supplyHash as `0x${string}`, 2);

      // Track position with real APY
      const currentWethApy = await getApyAggregator().getApy('WETH', 'aave-v3');
      const positions = this.getPositions();
      positions.push({
        protocol: 'Aave V3',
        strategy: 'WETH Supply',
        amount: Number(amountEth),
        apy: currentWethApy.apyTotal,
        earned: 0,
        entryTime: Date.now(),
        tokenAddress: TOKENS.WETH,
      });
      this.setPositions(positions);
      this.triggerSave();

      return {
        success: true,
        wrapTxHash: wrapResult.hash,
        supplyTxHash: supplyHash,
        amountSupplied: amountEth,
      };
    } catch (error: any) {
      console.error('Supply failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}
