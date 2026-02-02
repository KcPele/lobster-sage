/**
 * Reputation System - Onchain Reputation Scoring
 * 
 * This module manages onchain reputation for predictors.
 * Integrates with Reputation.sol smart contract for:
 * - Score calculation: 40% accuracy, 25% volume, 20% consistency, 15% yield
 * - Onchain updates for predictions, volume, activity, and yield
 * - Leaderboard tracking and ranking
 */

import { ethers, Contract, Provider, Signer } from 'ethers';
import { getConfig, getRpcUrl } from '../config/index.js';

// ABI for Reputation.sol contract
const REPUTATION_ABI = [
  // View functions
  'function getReputation(address user) external view returns (tuple(uint256 totalScore, uint256 accuracyPoints, uint256 volumePoints, uint256 consistencyPoints, uint256 yieldPoints, uint256 predictionsMade, uint256 predictionsCorrect, uint256 predictionsWrong, uint256 totalVolume, uint256 totalYieldProfit, uint256 lastActiveDay, uint256 consecutiveDays, uint256 burns))',
  'function getScore(address user) external view returns (uint256)',
  'function getRank(address user) external view returns (uint256)',
  'function getLeaderboard(uint256 count) external view returns (address[] memory, uint256[] memory)',
  'function getAccuracy(address user) external view returns (uint256)',
  'function isTopPercent(address user, uint256 percent) external view returns (bool)',
  'function totalUsers() external view returns (uint256)',
  'function authorizedRecorders(address) external view returns (bool)',
  
  // State variables
  'function volumeTier1() external view returns (uint256)',
  'function volumeTier2() external view returns (uint256)',
  'function volumeTier3() external view returns (uint256)',
  'function volumeTier4() external view returns (uint256)',
  'function volumeTier5() external view returns (uint256)',
  'function yieldTier1() external view returns (uint256)',
  'function yieldTier2() external view returns (uint256)',
  'function yieldTier3() external view returns (uint256)',
  'function yieldTier4() external view returns (uint256)',
  'function yieldTier5() external view returns (uint256)',
  
  // Write functions
  'function recordPrediction(address user, bool success, uint256 confidence, uint256 accuracyScore) external',
  'function recordVolume(address user, uint256 volume) external',
  'function recordActivity(address user) external',
  'function recordYield(address user, uint256 profit) external',
  'function recordBurn(address user) external',
  'function authorizeRecorder(address recorder) external',
  'function revokeRecorder(address recorder) external',
  
  // Events
  'event ReputationUpdated(address indexed user, uint256 oldScore, uint256 newScore, string reason)',
  'event PredictionRecorded(address indexed user, bool success, uint256 confidence, uint256 accuracyScore)',
  'event YieldRecorded(address indexed user, uint256 profit)',
  'event ActivityRecorded(address indexed user, uint256 day)',
];

// Weight constants (must match contract)
export const REPUTATION_WEIGHTS = {
  ACCURACY: 40,      // 40% weight
  VOLUME: 25,        // 25% weight
  CONSISTENCY: 20,   // 20% weight
  YIELD: 15,         // 15% weight
} as const;

// Max points for each category
export const MAX_POINTS = {
  ACCURACY: 4000,    // 40% of 10000
  VOLUME: 2500,      // 25% of 10000
  CONSISTENCY: 2000, // 20% of 10000
  YIELD: 1500,       // 15% of 10000
  TOTAL: 10000,
} as const;

// Volume tiers in USD (18 decimals)
export const VOLUME_TIERS = {
  TIER1: 100n,       // $100
  TIER2: 500n,       // $500
  TIER3: 1000n,      // $1,000
  TIER4: 5000n,      // $5,000
  TIER5: 10000n,     // $10,000
} as const;

// Yield tiers in USD (18 decimals)
export const YIELD_TIERS = {
  TIER1: 10n,        // $10
  TIER2: 50n,        // $50
  TIER3: 100n,       // $100
  TIER4: 500n,       // $500
  TIER5: 1000n,      // $1,000
} as const;

// Conversion constants
const USD_DECIMALS = 18;

/**
 * Reputation data structure from contract
 */
export interface ReputationData {
  totalScore: bigint;
  accuracyPoints: bigint;
  volumePoints: bigint;
  consistencyPoints: bigint;
  yieldPoints: bigint;
  predictionsMade: bigint;
  predictionsCorrect: bigint;
  predictionsWrong: bigint;
  totalVolume: bigint;
  totalYieldProfit: bigint;
  lastActiveDay: bigint;
  consecutiveDays: bigint;
  burns: bigint;
}

/**
 * Calculated reputation score breakdown
 */
export interface ReputationBreakdown {
  totalScore: number;
  accuracyPoints: number;
  volumePoints: number;
  consistencyPoints: number;
  yieldPoints: number;
  accuracyPercentage: number;
  predictionsMade: number;
  predictionsCorrect: number;
  consecutiveDays: number;
  totalVolumeUsd: number;
  totalYieldUsd: number;
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  address: string;
  score: number;
  rank: number;
}

/**
 * Prediction result for accuracy calculation
 */
export interface PredictionResult {
  predicted: boolean;
  actual: boolean;
  confidence: number; // 0-100
  stakeAmountUsd: number;
}

/**
 * Volume record for tracking
 */
export interface VolumeRecord {
  timestamp: number;
  amountUsd: number;
  predictionId?: string;
}

/**
 * Activity streak record
 */
export interface ActivityRecord {
  date: string; // YYYY-MM-DD
  timestamp: number;
  action: 'prediction' | 'yield' | 'burn';
}

/**
 * Onchain Reputation System
 * Manages reputation scoring with smart contract integration
 */
export class OnchainReputationSystem {
  private contract: Contract | null = null;
  private provider: Provider | null = null;
  private signer: Signer | null = null;
  private contractAddress: string;
  private isAuthorizedRecorder: boolean = false;

  // Local cache for calculations before onchain submission
  private predictionCache: Map<string, PredictionResult[]> = new Map();
  private volumeCache: Map<string, VolumeRecord[]> = new Map();
  private activityCache: Map<string, ActivityRecord[]> = new Map();

  constructor(contractAddress?: string, providerOrSigner?: Provider | Signer) {
    const config = getConfig();
    this.contractAddress = contractAddress || config.reputationContract;
    
    if (providerOrSigner) {
      if ('getSigner' in providerOrSigner) {
        // It's a Provider
        this.provider = providerOrSigner as Provider;
      } else {
        // It's a Signer
        this.signer = providerOrSigner as Signer;
        this.provider = this.signer.provider;
      }
    } else {
      // Create default provider
      const rpcUrl = getRpcUrl();
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }
  }

  /**
   * Initialize the contract connection
   */
  async initialize(): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not available');
    }

    if (this.signer) {
      this.contract = new Contract(this.contractAddress, REPUTATION_ABI, this.signer);
      // Check if this address is an authorized recorder
      const address = await this.signer.getAddress();
      this.isAuthorizedRecorder = await this.contract.authorizedRecorders(address);
    } else {
      this.contract = new Contract(this.contractAddress, REPUTATION_ABI, this.provider);
    }
  }

  /**
   * Calculate reputation score from component parts
   * Weights: 40% accuracy, 25% volume, 20% consistency, 15% yield
   */
  calculateScore(
    accuracyData: { correct: number; total: number },
    volumeUsd: number,
    consecutiveDays: number,
    yieldUsd: number
  ): ReputationBreakdown {
    // Calculate accuracy points (40% weight = max 4000 points)
    let accuracyPoints = 0;
    if (accuracyData.total > 0) {
      const accuracyRatio = accuracyData.total < 5 
        ? (accuracyData.correct / accuracyData.total) * 0.4 // Reduced weight until 5 predictions
        : accuracyData.correct / accuracyData.total;
      accuracyPoints = Math.round(accuracyRatio * MAX_POINTS.ACCURACY);
    }

    // Calculate volume points (25% weight = max 2500 points)
    const volumePoints = this.calculateVolumePoints(volumeUsd);

    // Calculate consistency points (20% weight = max 2000 points)
    const consistencyPoints = this.calculateConsistencyPoints(consecutiveDays);

    // Calculate yield points (15% weight = max 1500 points)
    const yieldPoints = this.calculateYieldPoints(yieldUsd);

    // Total score
    const totalScore = accuracyPoints + volumePoints + consistencyPoints + yieldPoints;

    return {
      totalScore,
      accuracyPoints,
      volumePoints,
      consistencyPoints,
      yieldPoints,
      accuracyPercentage: accuracyData.total > 0 
        ? Math.round((accuracyData.correct / accuracyData.total) * 10000) / 100 
        : 0,
      predictionsMade: accuracyData.total,
      predictionsCorrect: accuracyData.correct,
      consecutiveDays,
      totalVolumeUsd: volumeUsd,
      totalYieldUsd: yieldUsd,
    };
  }

  /**
   * Calculate volume points based on USD tiers
   */
  calculateVolumePoints(volumeUsd: number): number {
    if (volumeUsd >= 10000) return MAX_POINTS.VOLUME;
    if (volumeUsd >= 5000) return Math.round(MAX_POINTS.VOLUME * 0.8);
    if (volumeUsd >= 1000) return Math.round(MAX_POINTS.VOLUME * 0.6);
    if (volumeUsd >= 500) return Math.round(MAX_POINTS.VOLUME * 0.4);
    if (volumeUsd >= 100) return Math.round(MAX_POINTS.VOLUME * 0.2);
    return 0;
  }

  /**
   * Calculate consistency points based on consecutive days
   */
  calculateConsistencyPoints(consecutiveDays: number): number {
    // Max points at 30+ day streak
    if (consecutiveDays >= 30) return MAX_POINTS.CONSISTENCY;
    return Math.round((consecutiveDays / 30) * MAX_POINTS.CONSISTENCY);
  }

  /**
   * Calculate yield points based on profit tiers
   */
  calculateYieldPoints(yieldUsd: number): number {
    if (yieldUsd >= 1000) return MAX_POINTS.YIELD;
    if (yieldUsd >= 500) return Math.round(MAX_POINTS.YIELD * 0.8);
    if (yieldUsd >= 100) return Math.round(MAX_POINTS.YIELD * 0.6);
    if (yieldUsd >= 50) return Math.round(MAX_POINTS.YIELD * 0.4);
    if (yieldUsd >= 10) return Math.round(MAX_POINTS.YIELD * 0.2);
    return 0;
  }

  /**
   * Update accuracy when a prediction resolves
   * This is called when a prediction outcome is known
   */
  async updateAccuracy(
    userAddress: string,
    result: PredictionResult,
    submitToChain: boolean = true
  ): Promise<ReputationBreakdown | null> {
    // Cache the prediction result
    if (!this.predictionCache.has(userAddress)) {
      this.predictionCache.set(userAddress, []);
    }
    this.predictionCache.get(userAddress)!.push(result);

    if (!submitToChain || !this.contract || !this.isAuthorizedRecorder) {
      // Return local calculation only
      const stats = this.getLocalStats(userAddress);
      return this.calculateScore(
        { correct: stats.correct, total: stats.total },
        stats.volumeUsd,
        stats.consecutiveDays,
        stats.yieldUsd
      );
    }

    try {
      const success = result.predicted === result.actual;
      const tx = await this.contract.recordPrediction(
        userAddress,
        success,
        Math.round(result.confidence),
        0 // accuracyScore calculated on-chain
      );
      await tx.wait();

      // Return updated reputation
      return await this.getReputation(userAddress);
    } catch (error) {
      console.error('Failed to update accuracy onchain:', error);
      return null;
    }
  }

  /**
   * Update volume tracking
   */
  async updateVolume(
    userAddress: string,
    amountUsd: number,
    submitToChain: boolean = true
  ): Promise<ReputationBreakdown | null> {
    // Cache the volume record
    if (!this.volumeCache.has(userAddress)) {
      this.volumeCache.set(userAddress, []);
    }
    this.volumeCache.get(userAddress)!.push({
      timestamp: Date.now(),
      amountUsd,
    });

    if (!submitToChain || !this.contract || !this.isAuthorizedRecorder) {
      const stats = this.getLocalStats(userAddress);
      return this.calculateScore(
        { correct: stats.correct, total: stats.total },
        stats.volumeUsd,
        stats.consecutiveDays,
        stats.yieldUsd
      );
    }

    try {
      // Convert to wei (18 decimals)
      const volumeInWei = ethers.parseUnits(amountUsd.toString(), USD_DECIMALS);
      const tx = await this.contract.recordVolume(userAddress, volumeInWei);
      await tx.wait();

      return await this.getReputation(userAddress);
    } catch (error) {
      console.error('Failed to update volume onchain:', error);
      return null;
    }
  }

  /**
   * Update consistency (daily activity streak)
   */
  async updateConsistency(
    userAddress: string,
    action: 'prediction' | 'yield' | 'burn' = 'prediction',
    submitToChain: boolean = true
  ): Promise<ReputationBreakdown | null> {
    const today = new Date().toISOString().split('T')[0];
    
    // Cache the activity
    if (!this.activityCache.has(userAddress)) {
      this.activityCache.set(userAddress, []);
    }
    
    const activities = this.activityCache.get(userAddress)!;
    const alreadyActiveToday = activities.some(a => a.date === today);
    
    if (!alreadyActiveToday) {
      activities.push({
        date: today,
        timestamp: Date.now(),
        action,
      });
    }

    if (!submitToChain || !this.contract || !this.isAuthorizedRecorder) {
      const stats = this.getLocalStats(userAddress);
      return this.calculateScore(
        { correct: stats.correct, total: stats.total },
        stats.volumeUsd,
        stats.consecutiveDays,
        stats.yieldUsd
      );
    }

    try {
      const tx = await this.contract.recordActivity(userAddress);
      await tx.wait();

      return await this.getReputation(userAddress);
    } catch (error) {
      console.error('Failed to update consistency onchain:', error);
      return null;
    }
  }

  /**
   * Update yield/profit tracking
   */
  async updateYield(
    userAddress: string,
    profitUsd: number,
    submitToChain: boolean = true
  ): Promise<ReputationBreakdown | null> {
    // This is tracked in local stats
    const currentStats = this.getLocalStats(userAddress);
    const newYieldUsd = currentStats.yieldUsd + profitUsd;

    if (!submitToChain || !this.contract || !this.isAuthorizedRecorder) {
      return this.calculateScore(
        { correct: currentStats.correct, total: currentStats.total },
        currentStats.volumeUsd,
        currentStats.consecutiveDays,
        newYieldUsd
      );
    }

    try {
      const profitInWei = ethers.parseUnits(profitUsd.toString(), USD_DECIMALS);
      const tx = await this.contract.recordYield(userAddress, profitInWei);
      await tx.wait();

      return await this.getReputation(userAddress);
    } catch (error) {
      console.error('Failed to update yield onchain:', error);
      return null;
    }
  }

  /**
   * Record a burn (for failed prophecy cleanup)
   */
  async recordBurn(
    userAddress: string,
    submitToChain: boolean = true
  ): Promise<ReputationBreakdown | null> {
    if (!submitToChain || !this.contract || !this.isAuthorizedRecorder) {
      const stats = this.getLocalStats(userAddress);
      // Small local bonus for accountability
      return this.calculateScore(
        { correct: stats.correct, total: stats.total },
        stats.volumeUsd,
        stats.consecutiveDays,
        stats.yieldUsd
      );
    }

    try {
      const tx = await this.contract.recordBurn(userAddress);
      await tx.wait();

      return await this.getReputation(userAddress);
    } catch (error) {
      console.error('Failed to record burn onchain:', error);
      return null;
    }
  }

  /**
   * Get local cached stats for a user
   */
  private getLocalStats(userAddress: string): {
    correct: number;
    total: number;
    volumeUsd: number;
    consecutiveDays: number;
    yieldUsd: number;
  } {
    const predictions = this.predictionCache.get(userAddress) || [];
    const correct = predictions.filter(p => p.predicted === p.actual).length;
    
    const volumes = this.volumeCache.get(userAddress) || [];
    const volumeUsd = volumes.reduce((sum, v) => sum + v.amountUsd, 0);
    
    const activities = this.activityCache.get(userAddress) || [];
    const consecutiveDays = this.calculateLocalStreak(activities);
    
    // Yield would need to be tracked separately or fetched from contract
    const yieldUsd = 0;

    return {
      correct,
      total: predictions.length,
      volumeUsd,
      consecutiveDays,
      yieldUsd,
    };
  }

  /**
   * Calculate streak from activity records
   */
  private calculateLocalStreak(activities: ActivityRecord[]): number {
    if (activities.length === 0) return 0;

    // Sort by date descending
    const sorted = [...activities].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    // Check if active today or yesterday to maintain streak
    const mostRecent = sorted[0].date;
    if (mostRecent !== today && mostRecent !== yesterday) {
      return 0; // Streak broken
    }

    // Count consecutive days
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(sorted[i - 1].date);
      const currDate = new Date(sorted[i].date);
      const diffDays = Math.floor(
        (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Get user's percentile rank among all predictors
   * Returns 0-100 (100 = top predictor)
   */
  async getRank(userAddress: string): Promise<number> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const rank = await this.contract.getRank(userAddress);
      const totalUsers = await this.contract.totalUsers();
      
      if (rank === 0n) {
        return 0; // Not ranked
      }
      
      if (totalUsers === 0n) {
        return 100;
      }

      // Convert to percentile (lower rank number = higher percentile)
      const rankNum = Number(rank);
      const totalNum = Number(totalUsers);
      const percentile = Math.round(((totalNum - rankNum + 1) / totalNum) * 100);
      
      return Math.min(100, Math.max(0, percentile));
    } catch (error) {
      console.error('Failed to get rank:', error);
      return 0;
    }
  }

  /**
   * Get user's position on leaderboard
   * Returns 1-based position (1 = #1 rank)
   */
  async getLeaderboardPosition(userAddress: string): Promise<number> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const rank = await this.contract.getRank(userAddress);
      return rank === 0n ? 0 : Number(rank);
    } catch (error) {
      console.error('Failed to get leaderboard position:', error);
      return 0;
    }
  }

  /**
   * Get full reputation data for a user from the contract
   */
  async getReputation(userAddress: string): Promise<ReputationBreakdown> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const data = await this.contract.getReputation(userAddress);
      
      return {
        totalScore: Number(data.totalScore),
        accuracyPoints: Number(data.accuracyPoints),
        volumePoints: Number(data.volumePoints),
        consistencyPoints: Number(data.consistencyPoints),
        yieldPoints: Number(data.yieldPoints),
        accuracyPercentage: Number(data.predictionsMade) > 0
          ? Math.round((Number(data.predictionsCorrect) / Number(data.predictionsMade)) * 10000) / 100
          : 0,
        predictionsMade: Number(data.predictionsMade),
        predictionsCorrect: Number(data.predictionsCorrect),
        consecutiveDays: Number(data.consecutiveDays),
        totalVolumeUsd: Number(ethers.formatUnits(data.totalVolume, USD_DECIMALS)),
        totalYieldUsd: Number(ethers.formatUnits(data.totalYieldProfit, USD_DECIMALS)),
      };
    } catch (error) {
      console.error('Failed to get reputation:', error);
      // Return default empty reputation
      return {
        totalScore: 0,
        accuracyPoints: 0,
        volumePoints: 0,
        consistencyPoints: 0,
        yieldPoints: 0,
        accuracyPercentage: 0,
        predictionsMade: 0,
        predictionsCorrect: 0,
        consecutiveDays: 0,
        totalVolumeUsd: 0,
        totalYieldUsd: 0,
      };
    }
  }

  /**
   * Get just the total score
   */
  async getScore(userAddress: string): Promise<number> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const score = await this.contract.getScore(userAddress);
      return Number(score);
    } catch (error) {
      console.error('Failed to get score:', error);
      return 0;
    }
  }

  /**
   * Get top N users from leaderboard
   */
  async getLeaderboard(count: number = 100): Promise<LeaderboardEntry[]> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const [addresses, scores] = await this.contract.getLeaderboard(count);
      
      return addresses.map((addr: string, index: number) => ({
        address: addr,
        score: Number(scores[index]),
        rank: index + 1,
      })).filter((entry: LeaderboardEntry) => entry.address !== ethers.ZeroAddress);
    } catch (error) {
      console.error('Failed to get leaderboard:', error);
      return [];
    }
  }

  /**
   * Check if user is in top N percent
   */
  async isTopPercent(userAddress: string, percent: number): Promise<boolean> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      return await this.contract.isTopPercent(userAddress, percent);
    } catch (error) {
      console.error('Failed to check top percent:', error);
      return false;
    }
  }

  /**
   * Get total number of users with reputation
   */
  async getTotalUsers(): Promise<number> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const total = await this.contract.totalUsers();
      return Number(total);
    } catch (error) {
      console.error('Failed to get total users:', error);
      return 0;
    }
  }

  /**
   * Check if this instance is authorized to record onchain
   */
  isRecorder(): boolean {
    return this.isAuthorizedRecorder;
  }

  /**
   * Get the user's tier based on score
   */
  getTier(score: number): string {
    if (score >= 9000) return 'Legendary 🦞';
    if (score >= 7500) return 'Prophet 🔮';
    if (score >= 6000) return 'Oracle 🌟';
    if (score >= 4500) return 'Seer 👁️';
    if (score >= 3000) return 'Adept 📿';
    if (score >= 1500) return 'Apprentice 📖';
    return 'Novice 🌱';
  }

  /**
   * Get user's cached prediction history
   */
  getCachedPredictions(userAddress: string): PredictionResult[] {
    return this.predictionCache.get(userAddress) || [];
  }

  /**
   * Get user's cached volume history
   */
  getCachedVolumes(userAddress: string): VolumeRecord[] {
    return this.volumeCache.get(userAddress) || [];
  }

  /**
   * Get user's cached activity history
   */
  getCachedActivities(userAddress: string): ActivityRecord[] {
    return this.activityCache.get(userAddress) || [];
  }

  /**
   * Clear all cached data for a user
   */
  clearCache(userAddress: string): void {
    this.predictionCache.delete(userAddress);
    this.volumeCache.delete(userAddress);
    this.activityCache.delete(userAddress);
  }
}

// Export singleton instance for convenience
let reputationSystemInstance: OnchainReputationSystem | null = null;

export function getReputationSystem(
  contractAddress?: string,
  providerOrSigner?: Provider | Signer
): OnchainReputationSystem {
  if (!reputationSystemInstance) {
    reputationSystemInstance = new OnchainReputationSystem(contractAddress, providerOrSigner);
  }
  return reputationSystemInstance;
}

export function resetReputationSystem(): void {
  reputationSystemInstance = null;
}
