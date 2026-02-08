/**
 * Lobster Manager Module
 *
 * Exports all manager classes for organized functionality
 */

export { PortfolioManager } from './PortfolioManager';
export { MarketAnalyzer } from './MarketAnalyzer';
export { TradingManager } from './TradingManager';
export { YieldManager } from './YieldManager';
export { PredictionManager } from './PredictionManager';

export type {
  TokenBalance,
  AllTokenBalances,
  AavePosition,
  PositionWithPnL,
  AllPositions
} from './PortfolioManager';

export type {
  MarketSentiment,
  AssetAnalysis,
  WhaleSignals,
  TVLAnalysis,
  MarketSnapshot,
  CapitulationSignal
} from './MarketAnalyzer';

export type {
  SwapParams,
  SwapQuote,
  CompoundYieldParams,
  CompoundYieldResult,
  TradingStrategyConfig,
  TradingMode
} from './TradingManager';

export type {
  YieldOpportunity,
  SupplyResult,
  WithdrawResult,
  BestOpportunityResult
} from './YieldManager';

export type {
  ProphecyResult,
  ResolveProphecyResult,
  SocialPostResult,
  PredictionCycleResult
} from './PredictionManager';
