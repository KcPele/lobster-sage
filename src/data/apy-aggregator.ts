/**
 * APY Aggregator - Fetches real-time APY data from DefiLlama.
 * Falls back to conservative hardcoded values when the API is unavailable.
 * Cache TTL: 2 minutes (balances freshness vs API rate limits).
 */
import { getDefiLlama } from './defillama';
import type { YieldPool } from './defillama';
import { getTradingConstants } from '../config/trading';

export interface TokenApy {
  token: string;
  protocol: string;
  apyBase: number;
  apyReward: number;
  apyTotal: number;
  tvlUsd: number;
  lastUpdated: number;
  source: 'live' | 'fallback';
}

export class ApyAggregator {
  private cache: Map<string, { data: TokenApy; timestamp: number }> = new Map();

  /**
   * Get APY for a specific token on a specific protocol on Base.
   */
  async getApy(token: string, protocol: string = 'aave-v3'): Promise<TokenApy> {
    const cacheKey = `${protocol}-${token}`;
    const cached = this.cache.get(cacheKey);
    const cacheTTL = getTradingConstants().apy.cacheTtlMs;
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      return cached.data;
    }

    try {
      const defiLlama = getDefiLlama();
      const pools: YieldPool[] = await defiLlama.getProtocolYields([protocol]);

      // Find the pool matching this token symbol on Base
      const pool = pools.find(
        (p) =>
          p.chain.toLowerCase() === 'base' &&
          p.symbol.toUpperCase().includes(token.toUpperCase())
      );

      if (pool) {
        const result: TokenApy = {
          token,
          protocol,
          apyBase: pool.apyBase ?? 0,
          apyReward: pool.apyReward ?? 0,
          apyTotal: pool.apy,
          tvlUsd: pool.tvlUsd,
          lastUpdated: Date.now(),
          source: 'live',
        };
        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
        console.log(`APY fetched (live): ${token}/${protocol} = ${result.apyTotal.toFixed(2)}%`);
        return result;
      }
    } catch (error) {
      console.warn(`APY fetch failed for ${token}/${protocol}:`, error);
    }

    // Fallback to conservative estimates
    const fallbacks = getTradingConstants().apy.fallbacks;
    const fallbackApy = fallbacks[token] ?? 2.0;
    const fallback: TokenApy = {
      token,
      protocol,
      apyBase: fallbackApy,
      apyReward: 0,
      apyTotal: fallbackApy,
      tvlUsd: 0,
      lastUpdated: Date.now(),
      source: 'fallback',
    };
    this.cache.set(cacheKey, { data: fallback, timestamp: Date.now() });
    console.log(`APY fetched (fallback): ${token}/${protocol} = ${fallback.apyTotal.toFixed(2)}%`);
    return fallback;
  }

  /**
   * Get APYs for all common tokens on a protocol.
   */
  async getAllApys(protocol: string = 'aave-v3'): Promise<TokenApy[]> {
    const tokens = ['USDC', 'WETH', 'DAI', 'cbETH'];
    return Promise.all(tokens.map((t) => this.getApy(t, protocol)));
  }

  clearCache(): void {
    this.cache.clear();
  }
}

let instance: ApyAggregator | null = null;
export function getApyAggregator(): ApyAggregator {
  if (!instance) instance = new ApyAggregator();
  return instance;
}

export function resetApyAggregator(): void {
  instance = null;
}
