/**
 * Sage Module Type Definitions
 * Core types for the LobsterSage Prediction Engine
 */

import type { Address, Hash } from 'viem';
import type { WalletManager } from '../wallet/manager.js';

// ============ Prediction Types ============

/**
 * Direction of a market prediction
 */
export type PredictionDirection = 'bullish' | 'bearish' | 'neutral';

/**
 * Current status of a prediction
 */
export type PredictionStatus = 'pending' | 'active' | 'resolved' | 'expired' | 'cancelled';

/**
 * Outcome result of a resolved prediction
 */
export type PredictionOutcome = 'correct' | 'incorrect' | 'invalid' | null;

/**
 * Type of market being predicted
 */
export type MarketType = 'crypto' | 'defi' | 'nft' | 'macro' | 'custom';

/**
 * Timeframe for prediction resolution
 */
export type PredictionTimeframe = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';

/**
 * Confidence tier based on score
 */
export type ConfidenceTier = 'low' | 'medium' | 'high' | 'very_high';

/**
 * Core Prediction interface
 */
export interface Prediction {
  /** Unique prediction ID */
  id: string;
  /** Market/asset being predicted (e.g., "ETH", "BTC", "Aave TVL") */
  market: string;
  /** Direction of prediction */
  direction: PredictionDirection;
  /** Confidence score (0-100%) */
  confidence: number;
  /** Timeframe for resolution */
  timeframe: PredictionTimeframe;
  /** Unix timestamp when prediction was created */
  createdAt: number;
  /** Unix timestamp when prediction resolves */
  resolveAt: number;
  /** Unix timestamp when prediction was resolved */
  resolvedAt?: number;
  /** Amount staked on prediction (in wei) */
  stakeAmount: bigint;
  /** Current status */
  status: PredictionStatus;
  /** Outcome after resolution */
  outcome?: PredictionOutcome;
  /** Entry price at prediction time */
  entryPrice?: number;
  /** Target price for resolution */
  targetPrice?: number;
  /** Actual price at resolution */
  exitPrice?: number;
  /** AI-generated reasoning for prediction */
  reasoning: string;
  /** Market data snapshot at creation */
  marketData: MarketData;
  /** Associated ProphecyNFT token ID (if minted) */
  prophecyNftId?: number;
  /** Creator address */
  creator: Address;
  /** Tags for categorization */
  tags: string[];
}

/**
 * Market data snapshot for analysis
 */
export interface MarketData {
  /** Asset symbol */
  asset: string;
  /** Current price in USD */
  price: number;
  /** 24h price change percentage */
  change24h: number;
  /** 24h trading volume */
  volume24h: number;
  /** Market cap */
  marketCap?: number;
  /** Onchain metrics */
  onchain: OnchainMetrics;
  /** Social sentiment data */
  sentiment: SentimentData;
  /** Timestamp of data collection */
  timestamp: number;
}

/**
 * Onchain metrics for analysis
 */
export interface OnchainMetrics {
  /** Total Value Locked (for DeFi protocols) */
  tvl?: number;
  /** Number of active addresses */
  activeAddresses?: number;
  /** Transaction count in last 24h */
  txCount24h?: number;
  /** Gas usage trend (gwei) */
  gasTrend?: number;
  /** Whale wallet activity score (-100 to 100) */
  whaleActivity: number;
  /** Exchange inflow/outflow ratio */
  exchangeFlow: number;
  /** Network congestion level (0-100) */
  congestion: number;
  /** Large transaction count (> $100k) */
  largeTxCount: number;
}

/**
 * Social sentiment data
 */
export interface SentimentData {
  /** Overall sentiment score (-100 to 100) */
  overall: number;
  /** Twitter/X sentiment score */
  twitter: number;
  /** Farcaster sentiment score */
  farcaster: number;
  /** Social volume (mentions per hour) */
  socialVolume: number;
  /** Fear & Greed index (0-100) */
  fearGreedIndex: number;
  /** Trending keywords */
  trendingKeywords: string[];
  /** Influencer sentiment */
  influencerScore: number;
}

// ============ ProphecyNFT Types ============

/**
 * ProphecyNFT structure matching the smart contract
 */
export interface ProphecyNFT {
  /** Token ID */
  tokenId: number;
  /** Prophet (creator) address */
  prophet: Address;
  /** Target being predicted */
  target: string;
  /** Prediction type (0=Price, 1=Event, 2=Yield, 3=Other) */
  predictionType: number;
  /** The prediction text/description */
  prediction: string;
  /** Confidence score (0-100) */
  confidence: number;
  /** Amount staked (in wei) */
  stakeAmount: bigint;
  /** Creation timestamp */
  createdAt: number;
  /** Resolution timestamp */
  resolvesAt: number;
  /** Whether resolved */
  resolved: boolean;
  /** Whether prediction was successful */
  successful: boolean;
  /** Accuracy score (0-10000) */
  accuracyScore: number;
  /** Metadata URI */
  tokenURI: string;
}

/**
 * Value assessment for a ProphecyNFT
 */
export interface ProphecyValue {
  /** Current estimated value in ETH */
  currentValue: bigint;
  /** Potential reward if successful */
  potentialReward: bigint;
  /** Total return (stake + reward) if successful */
  totalReturn: bigint;
  /** Risk/reward ratio */
  riskRewardRatio: number;
  /** Time remaining until resolution (seconds) */
  timeRemaining: number;
  /** Probability of success based on current market */
  successProbability: number;
}

// ============ Predictor Engine Types ============

/**
 * Configuration for the PredictorEngine
 */
export interface PredictorConfig {
  /** Minimum confidence threshold (0-100) */
  minConfidence: number;
  /** Maximum confidence cap (0-100) */
  maxConfidence: number;
  /** Default stake amount in ETH */
  defaultStake: bigint;
  /** Maximum stake amount in ETH */
  maxStake: bigint;
  /** Prediction timeframes to consider */
  allowedTimeframes: PredictionTimeframe[];
  /** Markets to analyze */
  markets: string[];
  /** AI model configuration */
  aiConfig?: AIConfig;
}

/**
 * AI/ML configuration
 */
export interface AIConfig {
  /** Model provider */
  provider: 'openai' | 'anthropic' | 'local' | 'mock';
  /** Model name */
  model: string;
  /** Temperature for generation */
  temperature: number;
  /** Maximum tokens */
  maxTokens: number;
}

/**
 * Result of market analysis
 */
export interface AnalysisResult {
  /** Analyzed market/asset */
  market: string;
  /** Raw market data */
  marketData: MarketData;
  /** Technical analysis score (-100 to 100) */
  technicalScore: number;
  /** Onchain analysis score (-100 to 100) */
  onchainScore: number;
  /** Sentiment analysis score (-100 to 100) */
  sentimentScore: number;
  /** Combined AI score (-100 to 100) */
  aiScore: number;
  /** Analysis timestamp */
  timestamp: number;
  /** Key indicators identified */
  keyIndicators: string[];
  /** Risk level (0-100) */
  riskLevel: number;
}

/**
 * Generated prediction result
 */
export interface GeneratedPrediction {
  /** Unique ID */
  id: string;
  /** Predicted direction */
  direction: PredictionDirection;
  /** Confidence score (0-100) */
  confidence: number;
  /** Recommended timeframe */
  timeframe: PredictionTimeframe;
  /** Recommended stake amount */
  stakeAmount: bigint;
  /** Entry price */
  entryPrice: number;
  /** Target price */
  targetPrice: number;
  /** Stop loss price */
  stopLossPrice: number;
  /** AI reasoning */
  reasoning: string;
  /** Analysis result reference */
  analysis: AnalysisResult;
  /** Valid until timestamp */
  validUntil: number;
}

/**
 * Prediction validation result
 */
export interface ValidationResult {
  /** Whether prediction passes validation */
  valid: boolean;
  /** Validation errors if any */
  errors: string[];
  /** Warnings if any */
  warnings: string[];
  /** Confidence tier */
  confidenceTier: ConfidenceTier;
  /** Risk assessment */
  riskAssessment: 'low' | 'medium' | 'high';
}

/**
 * Resolution result
 */
export interface ResolutionResult {
  /** Prediction ID */
  predictionId: string;
  /** Whether prediction was correct */
  success: boolean;
  /** Accuracy score (0-10000) */
  accuracyScore: number;
  /** Exit price */
  exitPrice: number;
  /** Profit/loss in ETH */
  pnl: bigint;
  /** Resolution timestamp */
  timestamp: number;
  /** Resolution notes */
  notes?: string;
}

/**
 * Accuracy tracking for a predictor
 */
export interface AccuracyTracker {
  /** Total predictions made */
  totalPredictions: number;
  /** Correct predictions */
  correctPredictions: number;
  /** Incorrect predictions */
  incorrectPredictions: number;
  /** Invalid/cancelled predictions */
  invalidPredictions: number;
  /** Overall accuracy percentage (0-100) */
  accuracy: number;
  /** Average confidence of correct predictions */
  avgConfidenceCorrect: number;
  /** Average confidence of incorrect predictions */
  avgConfidenceIncorrect: number;
  /** Predictions by timeframe */
  byTimeframe: Record<PredictionTimeframe, { total: number; correct: number }>;
  /** Predictions by direction */
  byDirection: Record<PredictionDirection, { total: number; correct: number }>;
  /** Last updated timestamp */
  lastUpdated: number;
}

// ============ Prophesier Types ============

/**
 * Configuration for the Prophesier
 */
export interface ProphesierConfig {
  /** ProphecyNFT contract address */
  prophecyNftContract: Address;
  /** Reputation contract address */
  reputationContract: Address;
  /** Mint fee in ETH */
  mintFee: bigint;
  /** Minimum stake in ETH */
  minStake: bigint;
  /** Maximum stake in ETH */
  maxStake: bigint;
  /** IPFS/Arweave gateway for metadata */
  metadataGateway: string;
}

/**
 * Mint result
 */
export interface MintResult {
  /** Success status */
  success: boolean;
  /** Token ID if successful */
  tokenId?: number;
  /** Transaction hash */
  txHash?: Hash;
  /** Error message if failed */
  error?: string;
  /** Explorer URL */
  explorerUrl?: string;
}

/**
 * Stake result
 */
export interface StakeResult {
  /** Success status */
  success: boolean;
  /** Amount staked */
  amount: bigint;
  /** Transaction hash */
  txHash?: Hash;
  /** Error message if failed */
  error?: string;
}

/**
 * Burn result
 */
export interface BurnResult {
  /** Success status */
  success: boolean;
  /** Token ID burned */
  tokenId: number;
  /** Reputation recovered */
  reputationRecovered: boolean;
  /** Transaction hash */
  txHash?: Hash;
  /** Error message if failed */
  error?: string;
}

// ============ Sage Orchestrator Types ============

/**
 * Main Sage configuration
 */
export interface SageConfig {
  /** Predictor configuration */
  predictor: PredictorConfig;
  /** Prophesier configuration */
  prophesier: ProphesierConfig;
  /** Wallet manager instance */
  walletManager: WalletManager;
  /** Network configuration */
  network: 'base-sepolia' | 'base-mainnet';
  /** Autonomous mode settings */
  autonomous: {
    enabled: boolean;
    predictionIntervalMs: number;
    maxConcurrentPredictions: number;
  };
}

/**
 * Sage status
 */
export interface SageStatus {
  /** Whether Sage is running */
  running: boolean;
  /** Current mode */
  mode: 'idle' | 'analyzing' | 'predicting' | 'trading' | 'resolving';
  /** Active predictions count */
  activePredictions: number;
  /** Total predictions made */
  totalPredictions: number;
  /** Current accuracy */
  currentAccuracy: number;
  /** Last prediction timestamp */
  lastPredictionAt: number | null;
  /** Last action timestamp */
  lastActionAt: number | null;
  /** Errors in current session */
  sessionErrors: string[];
}

/**
 * Sage event types
 */
export type SageEvent =
  | { type: 'prediction_created'; prediction: Prediction }
  | { type: 'prediction_minted'; prediction: Prediction; tokenId: number }
  | { type: 'prediction_resolved'; prediction: Prediction; result: ResolutionResult }
  | { type: 'prediction_failed'; prediction: Prediction; error: string }
  | { type: 'market_analyzed'; analysis: AnalysisResult }
  | { type: 'error'; error: Error; context: string };

// ============ Utility Types ============

/**
 * Event listener callback
 */
export type SageEventListener = (event: SageEvent) => void;

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Gas configuration
 */
export interface GasConfig {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasLimit?: bigint;
}
