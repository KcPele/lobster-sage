/**
 * Data Module Exports
 * 
 * Real market data from free APIs:
 * - DefiLlama: TVL, protocol data, yields
 * - CoinGecko: Token prices, market data
 */

export {
  DefiLlamaClient,
  getDefiLlama,
  resetDefiLlama,
  type ProtocolTVL,
  type ChainTVL,
  type ProtocolDetails,
  type YieldPool,
  type TokenPrice,
} from './defillama';

export {
  CoinGeckoClient,
  getCoinGecko,
  resetCoinGecko,
  BASE_TOKEN_IDS,
  type SimplePriceResponse,
  type CoinMarketData,
  type OHLCData,
  type TrendingCoin,
  type GlobalData,
} from './coingecko';
