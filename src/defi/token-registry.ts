/**
 * Token Registry — single source of truth for token metadata.
 *
 * Replaces scattered `symbol === 'USDC' ? 6 : 18` ternaries with a
 * central lookup so adding a new token is a one-line change.
 */
import { BASE_TOKENS, SEPOLIA_TOKENS } from './uniswap-abis';

export interface TokenInfo {
  symbol: string;
  decimals: number;
  /** Whether the token is pegged to USD (affects price lookups). */
  isStablecoin: boolean;
}

/**
 * Canonical registry of known tokens.
 * Add a new token here and it propagates everywhere.
 */
const TOKEN_REGISTRY: Record<string, TokenInfo> = {
  ETH:   { symbol: 'ETH',   decimals: 18, isStablecoin: false },
  WETH:  { symbol: 'WETH',  decimals: 18, isStablecoin: false },
  USDC:  { symbol: 'USDC',  decimals: 6,  isStablecoin: true  },
  USDbC: { symbol: 'USDbC', decimals: 6,  isStablecoin: true  },
  USDBC: { symbol: 'USDbC', decimals: 6,  isStablecoin: true  },
  DAI:   { symbol: 'DAI',   decimals: 18, isStablecoin: true  },
  cbETH: { symbol: 'cbETH', decimals: 18, isStablecoin: false },
  CBETH: { symbol: 'cbETH', decimals: 18, isStablecoin: false },
  AERO:  { symbol: 'AERO',  decimals: 18, isStablecoin: false },
};

/**
 * Get token decimals for a symbol.  Returns 18 for unknown tokens.
 */
export function getTokenDecimals(symbol: string): number {
  return TOKEN_REGISTRY[symbol.toUpperCase()]?.decimals
      ?? TOKEN_REGISTRY[symbol]?.decimals
      ?? 18;
}

/**
 * Get full token info.  Returns undefined for unknown tokens.
 */
export function getTokenInfo(symbol: string): TokenInfo | undefined {
  return TOKEN_REGISTRY[symbol.toUpperCase()] ?? TOKEN_REGISTRY[symbol];
}

/**
 * Check whether a token is a stablecoin.
 */
export function isStablecoin(symbol: string): boolean {
  return TOKEN_REGISTRY[symbol.toUpperCase()]?.isStablecoin ?? false;
}

/**
 * Resolve a symbol (or address) to its on-chain address for the given network.
 */
export function getTokenAddress(
  symbol: string,
  network: 'base-mainnet' | 'base-sepolia' | string,
): string | undefined {
  const TOKENS: any = network === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;
  const key = symbol.toUpperCase() === 'ETH' ? 'WETH' : symbol.toUpperCase();
  // Try exact key first, then original casing (e.g., "USDbC")
  return TOKENS[key] ?? TOKENS[symbol];
}

/**
 * Resolve a symbol to { address, symbol, decimals } in one call.
 */
export function resolveToken(
  symbolOrAddress: string,
  network: 'base-mainnet' | 'base-sepolia' | string,
): { address: string; symbol: string; decimals: number } | undefined {
  if (symbolOrAddress.startsWith('0x')) {
    // Reverse-lookup by address
    const TOKENS: any = network === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;
    for (const [sym, addr] of Object.entries(TOKENS)) {
      if ((addr as string).toLowerCase() === symbolOrAddress.toLowerCase()) {
        const info = getTokenInfo(sym);
        return { address: addr as string, symbol: sym, decimals: info?.decimals ?? 18 };
      }
    }
    return { address: symbolOrAddress, symbol: 'TOKEN', decimals: 18 };
  }

  const address = getTokenAddress(symbolOrAddress, network);
  if (!address) return undefined;
  const decimals = getTokenDecimals(symbolOrAddress);
  const info = getTokenInfo(symbolOrAddress);
  return { address, symbol: info?.symbol ?? symbolOrAddress, decimals };
}
