import { WalletManager } from '../wallet/manager.js';

// Common token addresses on Base
export const TOKENS = {
  baseSepolia: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    WETH: '0x4200000000000000000000000000000000000006',
  },
  baseMainnet: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    WETH: '0x4200000000000000000000000000000000000006',
    cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    BRETT: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
    DEGEN: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
    BUILD: '0x3C6E1fF85b2d501E58F20645C10f88b162e09402',
  },
};

// Protocol addresses
export const PROTOCOLS = {
  uniswap: {
    v3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    v3Router: '0x2626664c2603336E57B271c5C0b26F421741e481',
    v3Quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    v3NFTManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  },
  aave: {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolDataProvider: '0x2d8A3C567805972153fc67B4693D429b04e843Bd',
    rewardsController: '0xf9cc4F0D883F4379D0d4F4667FE33898eADf6ad7',
  },
};

// ERC20 ABI
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function transferFrom(address, address, uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// Uniswap V3 ABI
export const UNISWAP_V3_ROUTER_ABI = [
  'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactOutputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
];

// Aave V3 ABI
export const AAVE_POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

/**
 * Get token address by symbol
 */
export function getTokenAddress(symbol: string, network: 'base-sepolia' | 'base-mainnet' = 'base-sepolia'): string {
  const tokens = network === 'base-mainnet' ? TOKENS.baseMainnet : TOKENS.baseSepolia;
  const address = tokens[symbol as keyof typeof tokens];
  if (!address) {
    throw new Error(`Token ${symbol} not found on ${network}`);
  }
  return address;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.replace(/0+$/, '');
  
  return trimmedFractional.length > 0 
    ? `${integerPart}.${trimmedFractional}`
    : integerPart.toString();
}

/**
 * Parse token amount to bigint
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const [integerStr, fractionalStr = ''] = amount.split('.');
  const integerPart = BigInt(integerStr);
  const fractionalPart = fractionalStr.padEnd(decimals, '0').slice(0, decimals);
  
  return (integerPart * 10n ** BigInt(decimals)) + BigInt(fractionalPart);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry utility with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delayMs * Math.pow(2, i));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Format address for display
 */
export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Calculate percentage change
 */
export function calculatePercentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
