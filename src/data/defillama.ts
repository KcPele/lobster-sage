/**
 * DefiLlama API Integration
 * 
 * Free API for DeFi protocol data:
 * - TVL (Total Value Locked)
 * - Protocol information
 * - Historical data
 * - Chain-specific data
 * 
 * API Docs: https://defillama.com/docs/api
 * No API key required!
 */

const BASE_URL = 'https://api.llama.fi';
const COINS_URL = 'https://coins.llama.fi';

// ============ Types ============

export interface ProtocolTVL {
  id: string;
  name: string;
  symbol: string;
  chain: string;
  tvl: number;
  change_1h: number | null;
  change_1d: number | null;
  change_7d: number | null;
  category: string;
  url: string;
  logo: string;
}

export interface ChainTVL {
  name: string;
  tvl: number;
  tokenSymbol: string;
  cmcId: string;
  chainId: number | null;
}

export interface ProtocolDetails {
  id: string;
  name: string;
  symbol: string;
  description: string;
  chain: string;
  chains: string[];
  tvl: number;
  chainTvls: Record<string, number>;
  change_1h: number | null;
  change_1d: number | null;
  change_7d: number | null;
  mcap: number | null;
  category: string;
  url: string;
  twitter: string | null;
  audit_links: string[];
}

export interface YieldPool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase: number | null;
  apyReward: number | null;
  apy: number;
  rewardTokens: string[] | null;
  pool: string;
  apyPct1D: number | null;
  apyPct7D: number | null;
  apyPct30D: number | null;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  poolMeta: string | null;
  underlyingTokens: string[] | null;
}

export interface TokenPrice {
  decimals: number;
  symbol: string;
  price: number;
  timestamp: number;
  confidence: number;
}

// ============ DefiLlama Client ============

export class DefiLlamaClient {
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL: number = 60 * 1000; // 1 minute cache

  constructor(cacheTTL?: number) {
    if (cacheTTL) this.cacheTTL = cacheTTL;
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
   * Generic fetch wrapper with error handling
   */
  private async fetch<T>(url: string): Promise<T> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`DefiLlama API error: ${response.status} ${response.statusText}`);
      }
      return await response.json() as T;
    } catch (error) {
      console.error(`DefiLlama fetch error for ${url}:`, error);
      throw error;
    }
  }

  // ============ TVL Endpoints ============

  /**
   * Get all protocols with their TVL
   */
  async getAllProtocols(): Promise<ProtocolTVL[]> {
    return this.fetchWithCache('all-protocols', () =>
      this.fetch<ProtocolTVL[]>(`${BASE_URL}/protocols`)
    );
  }

  /**
   * Get protocols on Base chain
   */
  async getBaseProtocols(): Promise<ProtocolTVL[]> {
    const all = await this.getAllProtocols();
    return all.filter(p => 
      p.chain?.toLowerCase() === 'base' || 
      p.chain?.toLowerCase().includes('base')
    );
  }

  /**
   * Get top protocols by TVL on Base
   */
  async getTopBaseProtocols(limit: number = 10): Promise<ProtocolTVL[]> {
    const baseProtocols = await this.getBaseProtocols();
    return baseProtocols
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, limit);
  }

  /**
   * Get detailed protocol info
   */
  async getProtocol(slug: string): Promise<ProtocolDetails> {
    return this.fetchWithCache(`protocol-${slug}`, () =>
      this.fetch<ProtocolDetails>(`${BASE_URL}/protocol/${slug}`)
    );
  }

  /**
   * Get TVL for all chains
   */
  async getAllChainsTVL(): Promise<ChainTVL[]> {
    return this.fetchWithCache('all-chains', () =>
      this.fetch<ChainTVL[]>(`${BASE_URL}/v2/chains`)
    );
  }

  /**
   * Get Base chain TVL
   */
  async getBaseTVL(): Promise<number> {
    const chains = await this.getAllChainsTVL();
    const base = chains.find(c => c.name.toLowerCase() === 'base');
    return base?.tvl || 0;
  }

  /**
   * Get historical TVL for a chain
   */
  async getChainHistoricalTVL(chain: string): Promise<{ date: number; tvl: number }[]> {
    return this.fetchWithCache(`chain-tvl-${chain}`, () =>
      this.fetch<{ date: number; tvl: number }[]>(`${BASE_URL}/v2/historicalChainTvl/${chain}`)
    );
  }

  // ============ Yields Endpoints ============

  /**
   * Get all yield pools
   */
  async getAllYieldPools(): Promise<{ data: YieldPool[] }> {
    return this.fetchWithCache('all-yields', () =>
      this.fetch<{ data: YieldPool[] }>(`${BASE_URL}/pools`)
    );
  }

  /**
   * Get yield pools on Base chain
   */
  async getBaseYieldPools(): Promise<YieldPool[]> {
    const { data } = await this.getAllYieldPools();
    return data.filter(p => p.chain.toLowerCase() === 'base');
  }

  /**
   * Get top yield opportunities on Base
   */
  async getTopBaseYields(limit: number = 20): Promise<YieldPool[]> {
    const pools = await this.getBaseYieldPools();
    return pools
      .filter(p => p.tvlUsd > 100000) // Minimum $100k TVL
      .sort((a, b) => b.apy - a.apy)
      .slice(0, limit);
  }

  /**
   * Get yields for specific protocols on Base
   */
  async getProtocolYields(protocols: string[]): Promise<YieldPool[]> {
    const pools = await this.getBaseYieldPools();
    const protocolsLower = protocols.map(p => p.toLowerCase());
    return pools.filter(p => protocolsLower.includes(p.project.toLowerCase()));
  }

  /**
   * Get stablecoin yields on Base
   */
  async getStablecoinYields(): Promise<YieldPool[]> {
    const pools = await this.getBaseYieldPools();
    return pools
      .filter(p => p.stablecoin && p.tvlUsd > 50000)
      .sort((a, b) => b.apy - a.apy);
  }

  // ============ Price Endpoints ============

  /**
   * Get current token prices
   * @param tokens Array of token identifiers in format "chain:address" (e.g., "base:0x...")
   */
  async getTokenPrices(tokens: string[]): Promise<Record<string, TokenPrice>> {
    const tokenString = tokens.join(',');
    const response = await this.fetch<{ coins: Record<string, TokenPrice> }>(
      `${COINS_URL}/prices/current/${tokenString}`
    );
    return response.coins;
  }

  /**
   * Get Base token prices by address
   */
  async getBaseTokenPrice(address: string): Promise<TokenPrice | null> {
    try {
      const prices = await this.getTokenPrices([`base:${address}`]);
      return prices[`base:${address}`] || null;
    } catch {
      return null;
    }
  }

  /**
   * Get common Base token prices
   */
  async getCommonBasePrices(): Promise<Record<string, number>> {
    const tokens = [
      'coingecko:ethereum',  // ETH
      'coingecko:usd-coin',  // USDC
      'base:0x4200000000000000000000000000000000000006', // WETH on Base
      'base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      'base:0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI on Base
    ];

    try {
      const prices = await this.getTokenPrices(tokens);
      return {
        ETH: prices['coingecko:ethereum']?.price || 0,
        WETH: prices['base:0x4200000000000000000000000000000000000006']?.price || 0,
        USDC: prices['base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913']?.price || 1,
        DAI: prices['base:0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb']?.price || 1,
      };
    } catch {
      // Fallback prices if API fails
      return { ETH: 2500, WETH: 2500, USDC: 1, DAI: 1 };
    }
  }

  // ============ Utility Methods ============

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get TVL changes summary for Base protocols
   */
  async getBaseTVLChanges(): Promise<{
    protocol: string;
    tvl: number;
    change24h: number;
    change7d: number;
  }[]> {
    const protocols = await this.getTopBaseProtocols(20);
    return protocols.map(p => ({
      protocol: p.name,
      tvl: p.tvl,
      change24h: p.change_1d || 0,
      change7d: p.change_7d || 0,
    }));
  }
}

// ============ Singleton Export ============

let defiLlamaInstance: DefiLlamaClient | null = null;

export function getDefiLlama(): DefiLlamaClient {
  if (!defiLlamaInstance) {
    defiLlamaInstance = new DefiLlamaClient();
  }
  return defiLlamaInstance;
}

export function resetDefiLlama(): void {
  defiLlamaInstance = null;
}
