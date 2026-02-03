/**
 * CoinGecko API Integration
 * 
 * Free API for cryptocurrency price data:
 * - Current prices
 * - Historical prices
 * - Market data (volume, market cap, etc.)
 * - OHLC data
 * 
 * API Docs: https://www.coingecko.com/en/api/documentation
 * Free tier: 10-30 calls/minute (no API key needed)
 */

const BASE_URL = 'https://api.coingecko.com/api/v3';

// Rate limiting: max 10-30 calls per minute on free tier
const RATE_LIMIT_DELAY = 2500; // 2.5 seconds between calls to be safe
let lastCallTime = 0;

// ============ Types ============

export interface SimplePriceResponse {
  [coinId: string]: {
    usd: number;
    usd_24h_change?: number;
    usd_24h_vol?: number;
    usd_market_cap?: number;
    last_updated_at?: number;
  };
}

export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  circulating_supply: number;
  total_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  atl: number;
  atl_change_percentage: number;
  last_updated: string;
}

export interface OHLCData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
  thumb: string;
  score: number;
}

export interface GlobalData {
  active_cryptocurrencies: number;
  markets: number;
  total_market_cap: { usd: number };
  total_volume: { usd: number };
  market_cap_percentage: { btc: number; eth: number };
  market_cap_change_percentage_24h_usd: number;
}

// Token addresses on Base
export const BASE_TOKEN_IDS: Record<string, string> = {
  ETH: 'ethereum',
  WETH: 'weth',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',
  CBETH: 'coinbase-wrapped-staked-eth',
  AERO: 'aerodrome-finance',
  COMP: 'compound-governance-token',
  AAVE: 'aave',
  UNI: 'uniswap',
  LINK: 'chainlink',
};

// ============ CoinGecko Client ============

export class CoinGeckoClient {
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL: number = 30 * 1000; // 30 seconds cache (prices change fast)

  constructor(cacheTTL?: number) {
    if (cacheTTL) this.cacheTTL = cacheTTL;
  }

  /**
   * Rate limit helper
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    if (timeSinceLastCall < RATE_LIMIT_DELAY) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastCall));
    }
    lastCallTime = Date.now();
  }

  /**
   * Get cached data or fetch new
   */
  private async fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * Generic fetch wrapper with error handling and rate limiting
   */
  private async fetch<T>(url: string): Promise<T> {
    await this.rateLimit();
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (response.status === 429) {
        // Rate limited - wait and retry once
        console.warn('CoinGecko rate limited, waiting 60s...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        return this.fetch<T>(url);
      }
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json() as T;
    } catch (error) {
      console.error(`CoinGecko fetch error for ${url}:`, error);
      throw error;
    }
  }

  // ============ Price Endpoints ============

  /**
   * Get simple prices for multiple coins
   */
  async getSimplePrices(
    coinIds: string[],
    options?: {
      include24hChange?: boolean;
      include24hVol?: boolean;
      includeMarketCap?: boolean;
    }
  ): Promise<SimplePriceResponse> {
    const ids = coinIds.join(',');
    const params = new URLSearchParams({
      ids,
      vs_currencies: 'usd',
      include_24hr_change: String(options?.include24hChange ?? true),
      include_24hr_vol: String(options?.include24hVol ?? false),
      include_market_cap: String(options?.includeMarketCap ?? false),
    });

    return this.fetchWithCache(`prices-${ids}`, () =>
      this.fetch<SimplePriceResponse>(`${BASE_URL}/simple/price?${params}`)
    );
  }

  /**
   * Get price for a single coin
   */
  async getPrice(coinId: string): Promise<number> {
    const prices = await this.getSimplePrices([coinId]);
    return prices[coinId]?.usd || 0;
  }

  /**
   * Get prices for common Base tokens
   */
  async getBaseTokenPrices(): Promise<Record<string, number>> {
    const ids = Object.values(BASE_TOKEN_IDS);
    const prices = await this.getSimplePrices(ids, { include24hChange: true });
    
    const result: Record<string, number> = {};
    for (const [symbol, id] of Object.entries(BASE_TOKEN_IDS)) {
      result[symbol] = prices[id]?.usd || 0;
    }
    return result;
  }

  /**
   * Get ETH price
   */
  async getEthPrice(): Promise<number> {
    return this.getPrice('ethereum');
  }

  // ============ Market Data Endpoints ============

  /**
   * Get market data for coins
   */
  async getMarketData(
    coinIds: string[],
    options?: {
      perPage?: number;
      page?: number;
      sparkline?: boolean;
      priceChangePercentage?: string;
    }
  ): Promise<CoinMarketData[]> {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      ids: coinIds.join(','),
      order: 'market_cap_desc',
      per_page: String(options?.perPage ?? 100),
      page: String(options?.page ?? 1),
      sparkline: String(options?.sparkline ?? false),
      price_change_percentage: options?.priceChangePercentage ?? '24h,7d',
    });

    return this.fetchWithCache(`market-${coinIds.join(',')}`, () =>
      this.fetch<CoinMarketData[]>(`${BASE_URL}/coins/markets?${params}`)
    );
  }

  /**
   * Get market data for Base tokens
   */
  async getBaseTokenMarketData(): Promise<CoinMarketData[]> {
    const ids = Object.values(BASE_TOKEN_IDS);
    return this.getMarketData(ids);
  }

  /**
   * Get top coins by market cap
   */
  async getTopCoins(limit: number = 20): Promise<CoinMarketData[]> {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: String(limit),
      page: '1',
      sparkline: 'false',
      price_change_percentage: '24h,7d',
    });

    return this.fetchWithCache(`top-coins-${limit}`, () =>
      this.fetch<CoinMarketData[]>(`${BASE_URL}/coins/markets?${params}`)
    );
  }

  // ============ OHLC Data ============

  /**
   * Get OHLC data for a coin
   * @param coinId CoinGecko coin ID
   * @param days Number of days (1, 7, 14, 30, 90, 180, 365, max)
   */
  async getOHLC(coinId: string, days: number | 'max' = 7): Promise<OHLCData[]> {
    const response = await this.fetch<number[][]>(
      `${BASE_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`
    );

    return response.map(([timestamp, open, high, low, close]) => ({
      timestamp,
      open,
      high,
      low,
      close,
    }));
  }

  /**
   * Get ETH OHLC data
   */
  async getEthOHLC(days: number = 7): Promise<OHLCData[]> {
    return this.getOHLC('ethereum', days);
  }

  // ============ Trending & Global ============

  /**
   * Get trending coins
   */
  async getTrending(): Promise<TrendingCoin[]> {
    const response = await this.fetchWithCache('trending', () =>
      this.fetch<{ coins: { item: TrendingCoin }[] }>(`${BASE_URL}/search/trending`)
    );
    return response.coins.map(c => c.item);
  }

  /**
   * Get global market data
   */
  async getGlobalData(): Promise<GlobalData> {
    const response = await this.fetchWithCache('global', () =>
      this.fetch<{ data: GlobalData }>(`${BASE_URL}/global`)
    );
    return response.data;
  }

  /**
   * Get fear & greed approximation from market data
   * (CoinGecko doesn't have this directly, so we approximate)
   */
  async getFearGreedApproximation(): Promise<number> {
    const global = await this.getGlobalData();
    const change = global.market_cap_change_percentage_24h_usd;
    
    // Map -10% to +10% change to 0-100 fear/greed scale
    // -10% = 0 (extreme fear), +10% = 100 (extreme greed)
    const normalized = Math.min(100, Math.max(0, (change + 10) * 5));
    return Math.round(normalized);
  }

  // ============ Utility Methods ============

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get price changes summary
   */
  async getPriceChanges(): Promise<{
    symbol: string;
    price: number;
    change24h: number;
  }[]> {
    const ids = Object.values(BASE_TOKEN_IDS).slice(0, 10); // Limit to avoid rate limits
    const prices = await this.getSimplePrices(ids, { include24hChange: true });
    
    return Object.entries(BASE_TOKEN_IDS)
      .filter(([_, id]) => ids.includes(id))
      .map(([symbol, id]) => ({
        symbol,
        price: prices[id]?.usd || 0,
        change24h: prices[id]?.usd_24h_change || 0,
      }));
  }

  /**
   * Convert token symbol to CoinGecko ID
   */
  getTokenId(symbol: string): string | null {
    return BASE_TOKEN_IDS[symbol.toUpperCase()] || null;
  }
}

// ============ Singleton Export ============

let coinGeckoInstance: CoinGeckoClient | null = null;

export function getCoinGecko(): CoinGeckoClient {
  if (!coinGeckoInstance) {
    coinGeckoInstance = new CoinGeckoClient();
  }
  return coinGeckoInstance;
}

export function resetCoinGecko(): void {
  coinGeckoInstance = null;
}
