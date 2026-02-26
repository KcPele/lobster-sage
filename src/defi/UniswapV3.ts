/**
 * Uniswap V3 Router Integration for Base
 * 
 * Handles token swaps via Uniswap V3 SwapRouter02
 * 
 * Contracts on Base:
 * - SwapRouter02: 0x2626664c2603336E57B271c5C0b26F421741e481
 * - QuoterV2: 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
 * - Factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD
 */

import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type Hash,
  type WalletClient,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  UNISWAP_ADDRESSES,
  BASE_TOKENS,
  SEPOLIA_TOKENS,
  FeeTier,
  SWAP_ROUTER_ABI,
  QUOTER_V2_ABI,
  ERC20_ABI,
} from './uniswap-abis';

// Re-export for external consumers
export {
  UNISWAP_ADDRESSES,
  BASE_TOKENS,
  SEPOLIA_TOKENS,
  FeeTier,
  SWAP_ROUTER_ABI,
  QUOTER_V2_ABI,
  ERC20_ABI,
};

// ============ Types ============

export interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  slippagePercent?: number; // Default 0.5%
  recipient?: Address;
  deadline?: number; // Unix timestamp
}

export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
  gasEstimate: bigint;
  fee: number;
}

export interface SwapResult {
  hash: Hash;
  amountIn: bigint;
  amountOut: bigint;
  tokenIn: Address;
  tokenOut: Address;
  timestamp: number;
}

// ============ Uniswap V3 Client ============

export class UniswapV3 {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any;
  private walletClient?: WalletClient;
  private addresses: typeof UNISWAP_ADDRESSES.base;
  private tokens: typeof BASE_TOKENS;
  private network: 'base' | 'baseSepolia';

  constructor(
    network: 'base' | 'baseSepolia' = 'base',
    walletClient?: WalletClient,
    customRpcUrl?: string
  ) {
    this.network = network;
    const chain = network === 'base' ? base : baseSepolia;
    this.addresses = UNISWAP_ADDRESSES[network];
    this.tokens = network === 'base' ? BASE_TOKENS : SEPOLIA_TOKENS as typeof BASE_TOKENS;
    this.walletClient = walletClient;

    this.publicClient = createPublicClient({
      chain,
      transport: customRpcUrl ? http(customRpcUrl) : http(),
    });
  }

  /**
   * Set wallet client for transactions
   */
  setWalletClient(walletClient: WalletClient): void {
    this.walletClient = walletClient;
  }

  /**
   * Get account address
   */
  private getAccount(): Address {
    if (!this.walletClient?.account) {
      throw new Error('Wallet client not initialized or no account');
    }
    return this.walletClient.account.address;
  }

  /**
   * Get token decimals
   */
  async getTokenDecimals(tokenAddress: Address): Promise<number> {
    const decimals = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'decimals',
    });
    return decimals;
  }

  /**
   * Get token balance
   */
  async getTokenBalance(tokenAddress: Address, account?: Address): Promise<bigint> {
    const address = account || this.getAccount();
    return this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    });
  }

  /**
   * Check and approve token spending
   */
  async ensureApproval(tokenAddress: Address, amount: bigint): Promise<Hash | null> {
    if (!this.walletClient) throw new Error('Wallet client not set');
    
    const account = this.getAccount();
    const currentAllowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, this.addresses.swapRouter02],
    });

    if (currentAllowance >= amount) {
      return null; // Already approved
    }

    // Approve max amount to save gas on future swaps
    const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [this.addresses.swapRouter02, maxApproval],
      chain: this.network === 'base' ? base : baseSepolia,
      account: this.walletClient.account!,
    });

    // Wait for approval
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async getQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    feeTier: FeeTier = FeeTier.MEDIUM
  ): Promise<SwapQuote> {
    try {
      // Use staticCall to simulate the quote
      const result = await this.publicClient.simulateContract({
        address: this.addresses.quoterV2,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn,
          tokenOut,
          amountIn,
          fee: feeTier,
          sqrtPriceLimitX96: 0n,
        }],
      });

      const [amountOut, , , gasEstimate] = result.result as [bigint, bigint, number, bigint];

      // Calculate price impact (simplified)
      const priceImpact = amountIn > 0n
        ? Number((amountIn - amountOut) * 10000n / amountIn) / 100
        : 0;

      return {
        amountIn,
        amountOut,
        priceImpact,
        gasEstimate,
        fee: feeTier / 10000,
      };
    } catch (error) {
      console.error('Quote failed:', error);
      throw new Error(`Failed to get quote: ${error}`);
    }
  }

  /**
   * Find the fee tier that gives the best output for a given swap.
   * Quotes all four fee tiers in parallel, returns the one with highest amountOut.
   */
  async getBestFeeTier(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint
  ): Promise<{ feeTier: FeeTier; quote: SwapQuote }> {
    const tiers = [FeeTier.LOWEST, FeeTier.LOW, FeeTier.MEDIUM, FeeTier.HIGH];

    const results = await Promise.allSettled(
      tiers.map(async (tier) => {
        const quote = await this.getQuote(tokenIn, tokenOut, amountIn, tier);
        return { feeTier: tier, quote };
      })
    );

    let best: { feeTier: FeeTier; quote: SwapQuote } | null = null;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (!best || result.value.quote.amountOut > best.quote.amountOut) {
          best = result.value;
        }
      }
    }

    if (!best) {
      throw new Error('All fee tier quotes failed');
    }

    console.log(`Best fee tier: ${best.feeTier / 100}bps (${(best.feeTier / 10000 * 100).toFixed(2)}%), output: ${best.quote.amountOut.toString()}`);
    return best;
  }

  async getSwapQuote(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    slippagePercent?: number;
  }): Promise<{
    amountIn: bigint;
    amountOut: bigint;
    priceImpact: number;
    gasEstimate: bigint;
    amountOutMinimum: bigint;
  }> {
    const { quote } = await this.getBestFeeTier(
      params.tokenIn,
      params.tokenOut,
      params.amountIn
    );

    const slippagePercent = params.slippagePercent ?? 0.5;
    const slippageBps = BigInt(Math.floor(slippagePercent * 100));
    const amountOutMinimum = quote.amountOut * (10000n - slippageBps) / 10000n;

    return {
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      priceImpact: quote.priceImpact,
      gasEstimate: quote.gasEstimate,
      amountOutMinimum,
    };
  }

  async swap(params: SwapParams): Promise<SwapResult> {
    if (!this.walletClient) throw new Error('Wallet client not set');

    const {
      tokenIn,
      tokenOut,
      amountIn,
      slippagePercent = 0.5,
      recipient,
      deadline,
    } = params;

    const account = this.getAccount();
    const to = recipient || account;
    // Note: deadline is handled by SwapRouter02 internally
    void deadline; // Mark as intentionally unused

    // Get best fee tier and quote
    const { feeTier: bestTier, quote } = await this.getBestFeeTier(tokenIn, tokenOut, amountIn);

    const slippageBps = BigInt(Math.floor(slippagePercent * 100));
    const amountOutMinimum = quote.amountOut * (10000n - slippageBps) / 10000n;

    await this.ensureApproval(tokenIn, amountIn);

    const swapParams = {
      tokenIn,
      tokenOut,
      fee: bestTier,
      recipient: to,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0n,
    };

    // Execute swap
    const hash = await this.walletClient.writeContract({
      address: this.addresses.swapRouter02,
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [swapParams],
      chain: this.network === 'base' ? base : baseSepolia,
      account: this.walletClient.account!,
    });

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({ hash });

    return {
      hash,
      amountIn,
      amountOut: amountOutMinimum, // Actual amount may differ
      tokenIn,
      tokenOut,
      timestamp: Date.now(),
    };
  }

  /**
   * Swap ETH to token
   */
  async swapEthToToken(
    tokenOut: Address,
    amountInEth: string,
    slippagePercent?: number
  ): Promise<SwapResult> {
    const amountIn = parseUnits(amountInEth, 18);
    return this.swap({
      tokenIn: this.tokens.WETH,
      tokenOut,
      amountIn,
      slippagePercent,
    });
  }

  /**
   * Swap token to ETH
   */
  async swapTokenToEth(
    tokenIn: Address,
    amountIn: bigint,
    slippagePercent?: number
  ): Promise<SwapResult> {
    return this.swap({
      tokenIn,
      tokenOut: this.tokens.WETH,
      amountIn,
      slippagePercent,
    });
  }

  /**
   * Swap USDC to ETH
   */
  async swapUsdcToEth(amountUsdc: string, slippagePercent?: number): Promise<SwapResult> {
    const decimals = await this.getTokenDecimals(this.tokens.USDC);
    const amountIn = parseUnits(amountUsdc, decimals);
    return this.swapTokenToEth(this.tokens.USDC, amountIn, slippagePercent);
  }

  /**
   * Swap ETH to USDC
   */
  async swapEthToUsdc(amountEth: string, slippagePercent?: number): Promise<SwapResult> {
    return this.swapEthToToken(this.tokens.USDC, amountEth, slippagePercent);
  }

  /**
   * Get token addresses
   */
  getTokens(): typeof BASE_TOKENS {
    return this.tokens;
  }

  /**
   * Get router address
   */
  getRouterAddress(): Address {
    return this.addresses.swapRouter02;
  }

  /**
   * Wrap ETH to WETH by directly depositing to the WETH contract
   * This is the most gas-efficient way to get WETH
   */
  async wrapEth(amountEth: string): Promise<{ hash: Hash; amountOut: bigint }> {
    if (!this.walletClient) throw new Error('Wallet client not set');

    const amount = parseUnits(amountEth, 18);
    const WETH_ABI = [
      {
        inputs: [],
        name: 'deposit',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
      },
    ] as const;

    console.log(`💱 Wrapping ${amountEth} ETH to WETH...`);
    
    const hash = await this.walletClient.writeContract({
      address: this.tokens.WETH,
      abi: WETH_ABI,
      functionName: 'deposit',
      args: [],
      value: amount,
      chain: this.network === 'base' ? base : baseSepolia,
      account: this.walletClient.account!,
    });

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Wrap TX: ${hash}`);

    return { hash, amountOut: amount };
  }

  /**
   * Unwrap WETH to ETH by withdrawing from the WETH contract
   * This converts wrapped ETH back to native ETH
   */
  async unwrapWeth(amountWeth: string): Promise<{ hash: Hash; amountOut: bigint }> {
    if (!this.walletClient) throw new Error('Wallet client not set');

    const amount = parseUnits(amountWeth, 18);
    
    // Check WETH balance first
    const wethBalance = await this.getTokenBalance(this.tokens.WETH);
    if (wethBalance < amount) {
      throw new Error(`Insufficient WETH balance. Have: ${formatUnits(wethBalance, 18)}, Need: ${amountWeth}`);
    }

    const WETH_ABI = [
      {
        inputs: [{ name: 'wad', type: 'uint256' }],
        name: 'withdraw',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ] as const;

    console.log(`💱 Unwrapping ${amountWeth} WETH to ETH...`);
    
    const hash = await this.walletClient.writeContract({
      address: this.tokens.WETH,
      abi: WETH_ABI,
      functionName: 'withdraw',
      args: [amount],
      chain: this.network === 'base' ? base : baseSepolia,
      account: this.walletClient.account!,
    });

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Unwrap TX: ${hash}`);

    return { hash, amountOut: amount };
  }
}

// ============ Singleton Export ============

let uniswapInstance: UniswapV3 | null = null;

export function getUniswap(network?: 'base' | 'baseSepolia'): UniswapV3 {
  if (!uniswapInstance) {
    uniswapInstance = new UniswapV3(network);
  }
  return uniswapInstance;
}

export function resetUniswap(): void {
  uniswapInstance = null;
}
