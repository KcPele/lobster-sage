/**
 * Sage Core Module
 * 
 * This module implements the core prediction engine for LobsterSage.
 * Phase 2: Prediction generation, NFT minting, and trading logic.
 */

// Reputation System
export {
  OnchainReputationSystem,
  getReputationSystem,
  resetReputationSystem,
  REPUTATION_WEIGHTS,
  MAX_POINTS,
  VOLUME_TIERS,
  YIELD_TIERS,
} from './reputation.js';

export type {
  ReputationData,
  ReputationBreakdown,
  LeaderboardEntry,
  PredictionResult,
  VolumeRecord,
  ActivityRecord,
} from './reputation.js';

// Analytics System
export {
  BaseAnalytics,
  getAnalytics,
  resetAnalytics,
  formatWhaleMovement,
  formatInsight,
  getTrendEmoji,
} from './analytics.js';

export type {
  EcosystemTrend,
  WhaleMovement,
  TVLChange,
  VolumeMetrics,
  SentimentData,
  OnchainMetrics,
  MarketInsight,
  AnalyticsSnapshot,
} from './analytics.js';

// Legacy placeholder classes for backward compatibility
export class PredictorEngine {
  // Placeholder for Phase 2 implementation
  // - Market analysis
  // - Prediction generation
  // - Confidence scoring
}

export class Prophesier {
  // Placeholder for Phase 2 implementation
  // - NFT minting integration
  // - Metadata generation
  // - Onchain prediction storage
}

export class ReputationTracker {
  // Placeholder for Phase 2 implementation
  // - Reputation queries
  // - Accuracy tracking
  // - Leaderboard integration
}
