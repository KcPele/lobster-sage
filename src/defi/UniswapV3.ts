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
  type Address,
  type Hash,
  type WalletClient,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';

// ============ Contract Addresses ============

export const UNISWAP_ADDRESSES = {
  base: {
    swapRouter02: '0x2626664c2603336E57B271c5C0b26F421741e481' as Address,
    quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as Address,
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD' as Address,
  },
  baseSepolia: {
    // Sepolia testnet addresses (may differ)
    swapRouter02: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4' as Address,
    quoterV2: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3' as Address,
    factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' as Address,
  },
};

// Common token addresses on Base
export const BASE_TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as Address,
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' as Address,
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22' as Address,
};

// Sepolia test tokens
export const SEPOLIA_TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
};

// ============ ABIs ============

export const SWAP_ROUTER_ABI = [
  // exactInputSingle
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  // exactOutputSingle
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'amountInMaximum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactOutputSingle',
    outputs: [{ name: 'amountIn', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  // multicall
  {
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'data', type: 'bytes[]' },
    ],
    name: 'multicall',
    outputs: [{ name: 'results', type: 'bytes[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

export const QUOTER_V2_ABI = [
  // quoteExactInputSingle
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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

// Fee tiers in basis points
export enum FeeTier {
  LOWEST = 100,   // 0.01%
  LOW = 500,      // 0.05%
  MEDIUM = 3000,  // 0.3%
  HIGH = 10000,   // 1%
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

  /**
   * Get quote for a swap
   */
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
   * Execute a swap
   */
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

    // Get quote first
    const quote = await this.getQuote(tokenIn, tokenOut, amountIn);
    
    // Calculate minimum output with slippage
    const slippageBps = BigInt(Math.floor(slippagePercent * 100));
    const amountOutMinimum = quote.amountOut * (10000n - slippageBps) / 10000n;

    // Ensure approval (skip for ETH/WETH wrapping)
    if (tokenIn !== this.tokens.WETH) {
      await this.ensureApproval(tokenIn, amountIn);
    }

    // Build swap parameters
    const swapParams = {
      tokenIn,
      tokenOut,
      fee: FeeTier.MEDIUM,
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
