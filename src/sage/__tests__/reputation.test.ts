/**
 * Reputation System Tests
 * 
 * Tests for onchain reputation scoring, rank calculations,
 * and contract interactions (mocked)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  OnchainReputationSystem, 
  MAX_POINTS,
  getReputationSystem,
  resetReputationSystem,
  type PredictionResult,
} from '../reputation.js';

// ============ Mock Data ============

const MOCK_CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_USER_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';
const MOCK_RECORDER_ADDRESS = '0x1111111111111111111111111111111111111111';

// Mock ethers Contract
const createMockContract = (overrides: Partial<any> = {}) => ({
  getReputation: vi.fn().mockResolvedValue({
    totalScore: 5000n,
    accuracyPoints: 2000n,
    volumePoints: 1250n,
    consistencyPoints: 1000n,
    yieldPoints: 750n,
    predictionsMade: 10n,
    predictionsCorrect: 7n,
    predictionsWrong: 3n,
    totalVolume: 5000n * 10n ** 18n, // $5000
    totalYieldProfit: 500n * 10n ** 18n, // $500
    lastActiveDay: 100n,
    consecutiveDays: 15n,
    burns: 1n,
    ...overrides.reputation,
  }),
  getScore: vi.fn().mockResolvedValue(overrides.score ?? 5000n),
  getRank: vi.fn().mockResolvedValue(overrides.rank ?? 5n),
  getLeaderboard: vi.fn().mockResolvedValue([
    ['0x111...', '0x222...', '0x333...'],
    [8000n, 7000n, 6000n],
  ]),
  getAccuracy: vi.fn().mockResolvedValue(7000n), // 70%
  isTopPercent: vi.fn().mockResolvedValue(overrides.isTopPercent ?? true),
  totalUsers: vi.fn().mockResolvedValue(overrides.totalUsers ?? 100n),
  authorizedRecorders: vi.fn().mockResolvedValue(overrides.isAuthorized ?? false),
  
  // Write functions
  recordPrediction: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
  recordVolume: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
  recordActivity: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
  recordYield: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
  recordBurn: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
  
  // Tiers
  volumeTier1: vi.fn().mockResolvedValue(100n * 10n ** 18n),
  volumeTier2: vi.fn().mockResolvedValue(500n * 10n ** 18n),
  volumeTier3: vi.fn().mockResolvedValue(1000n * 10n ** 18n),
  volumeTier4: vi.fn().mockResolvedValue(5000n * 10n ** 18n),
  volumeTier5: vi.fn().mockResolvedValue(10000n * 10n ** 18n),
  
  ...overrides.functions,
});

// Mock Provider
const createMockProvider = () => ({
  getBlockNumber: vi.fn().mockResolvedValue(1000n),
});

// ============ Test Suite ============

describe('Reputation System', () => {
  let reputation: OnchainReputationSystem;

  beforeEach(() => {
    resetReputationSystem();
    reputation = new OnchainReputationSystem(MOCK_CONTRACT_ADDRESS, createMockProvider() as any);
    
    // Inject mock contract
    (reputation as any).contract = createMockContract();
    (reputation as any).isAuthorizedRecorder = true;
  });

  describe('Score Calculation', () => {
    it('should calculate score with correct weights (40% accuracy, 25% volume, 20% consistency, 15% yield)', () => {
      const accuracyData = { correct: 7, total: 10 }; // 70% accuracy
      const volumeUsd = 5000;
      const consecutiveDays = 15;
      const yieldUsd = 500;

      const result = reputation.calculateScore(accuracyData, volumeUsd, consecutiveDays, yieldUsd);

      // Verify total is sum of components
      expect(result.totalScore).toBe(
        result.accuracyPoints + 
        result.volumePoints + 
        result.consistencyPoints + 
        result.yieldPoints
      );

      // Verify accuracy percentage is correct
      expect(result.accuracyPercentage).toBe(70);
    });

    it('should cap accuracy points at 4000 (40% of max)', () => {
      const accuracyData = { correct: 10, total: 10 }; // 100% accuracy
      const result = reputation.calculateScore(accuracyData, 0, 0, 0);

      expect(result.accuracyPoints).toBeLessThanOrEqual(MAX_POINTS.ACCURACY);
    });

    it('should reduce accuracy weight for fewer than 5 predictions', () => {
      const smallData = { correct: 3, total: 4 }; // 75% but small sample
      const largeData = { correct: 75, total: 100 }; // 75% with large sample

      const smallResult = reputation.calculateScore(smallData, 0, 0, 0);
      const largeResult = reputation.calculateScore(largeData, 0, 0, 0);

      // Small sample should have proportionally lower accuracy points
      const smallRatio = smallResult.accuracyPoints / MAX_POINTS.ACCURACY;
      const largeRatio = largeResult.accuracyPoints / MAX_POINTS.ACCURACY;
      
      expect(smallRatio).toBeLessThan(largeRatio);
    });

    it('should calculate volume points based on tiers', () => {
      const testCases = [
        { volume: 0, expectedPoints: 0 },
        { volume: 50, expectedPoints: 0 }, // Below tier 1
        { volume: 100, expectedPoints: 500 }, // Tier 1: 20% of 2500
        { volume: 500, expectedPoints: 1000 }, // Tier 2: 40% of 2500
        { volume: 1000, expectedPoints: 1500 }, // Tier 3: 60% of 2500
        { volume: 5000, expectedPoints: 2000 }, // Tier 4: 80% of 2500
        { volume: 10000, expectedPoints: 2500 }, // Tier 5: 100% of 2500
        { volume: 50000, expectedPoints: 2500 }, // Above max tier
      ];

      for (const { volume, expectedPoints } of testCases) {
        const result = reputation.calculateScore({ correct: 0, total: 0 }, volume, 0, 0);
        expect(result.volumePoints).toBe(expectedPoints);
      }
    });

    it('should calculate consistency points based on consecutive days', () => {
      const testCases = [
        { days: 0, expectedRatio: 0 },
        { days: 7, expectedRatio: 7 / 30 },
        { days: 15, expectedRatio: 15 / 30 },
        { days: 30, expectedRatio: 1 },
        { days: 60, expectedRatio: 1 }, // Capped at 30 days
      ];

      for (const { days, expectedRatio } of testCases) {
        const result = reputation.calculateScore({ correct: 0, total: 0 }, 0, days, 0);
        const expectedPoints = Math.round(expectedRatio * MAX_POINTS.CONSISTENCY);
        expect(result.consistencyPoints).toBe(expectedPoints);
      }
    });

    it('should calculate yield points based on profit tiers', () => {
      const testCases = [
        { yield: 0, expectedPoints: 0 },
        { yield: 5, expectedPoints: 0 }, // Below tier 1
        { yield: 10, expectedPoints: 300 }, // Tier 1: 20% of 1500
        { yield: 50, expectedPoints: 600 }, // Tier 2: 40% of 1500
        { yield: 100, expectedPoints: 900 }, // Tier 3: 60% of 1500
        { yield: 500, expectedPoints: 1200 }, // Tier 4: 80% of 1500
        { yield: 1000, expectedPoints: 1500 }, // Tier 5: 100% of 1500
        { yield: 5000, expectedPoints: 1500 }, // Above max tier
      ];

      for (const { yield: yieldUsd, expectedPoints } of testCases) {
        const result = reputation.calculateScore({ correct: 0, total: 0 }, 0, 0, yieldUsd);
        expect(result.yieldPoints).toBe(expectedPoints);
      }
    });

    it('should return zero score for new user with no activity', () => {
      const result = reputation.calculateScore({ correct: 0, total: 0 }, 0, 0, 0);

      expect(result.totalScore).toBe(0);
      expect(result.accuracyPoints).toBe(0);
      expect(result.volumePoints).toBe(0);
      expect(result.consistencyPoints).toBe(0);
      expect(result.yieldPoints).toBe(0);
    });
  });

  describe('Accuracy Updates', () => {
    it('should update accuracy when prediction resolves correctly', async () => {
      const result: PredictionResult = {
        predicted: true,
        actual: true,
        confidence: 85,
        stakeAmountUsd: 100,
      };

      const breakdown = await reputation.updateAccuracy(MOCK_USER_ADDRESS, result, false);

      expect(breakdown).not.toBeNull();
      expect(breakdown!.predictionsMade).toBeGreaterThan(0);
    });

    it('should update accuracy when prediction resolves incorrectly', async () => {
      const result: PredictionResult = {
        predicted: true,
        actual: false,
        confidence: 60,
        stakeAmountUsd: 100,
      };

      const breakdown = await reputation.updateAccuracy(MOCK_USER_ADDRESS, result, false);

      expect(breakdown).not.toBeNull();
      expect(breakdown!.predictionsMade).toBeGreaterThan(0);
    });

    it('should cache predictions locally when not submitting to chain', async () => {
      const result: PredictionResult = {
        predicted: true,
        actual: true,
        confidence: 75,
        stakeAmountUsd: 50,
      };

      await reputation.updateAccuracy(MOCK_USER_ADDRESS, result, false);
      
      const cached = reputation.getCachedPredictions(MOCK_USER_ADDRESS);
      expect(cached).toHaveLength(1);
      expect(cached[0].confidence).toBe(75);
    });

    it('should call contract when submitting correct prediction onchain', async () => {
      const result: PredictionResult = {
        predicted: true,
        actual: true,
        confidence: 90,
        stakeAmountUsd: 200,
      };

      await reputation.updateAccuracy(MOCK_USER_ADDRESS, result, true);

      const contract = (reputation as any).contract;
      expect(contract.recordPrediction).toHaveBeenCalledWith(
        MOCK_USER_ADDRESS,
        true,
        90,
        0
      );
    });
  });

  describe('Volume Tracking', () => {
    it('should update volume tracking', async () => {
      const breakdown = await reputation.updateVolume(MOCK_USER_ADDRESS, 1000, false);

      expect(breakdown).not.toBeNull();
      expect(breakdown!.totalVolumeUsd).toBeGreaterThan(0);
    });

    it('should cache volume records locally', async () => {
      await reputation.updateVolume(MOCK_USER_ADDRESS, 500, false);
      await reputation.updateVolume(MOCK_USER_ADDRESS, 300, false);
      
      const cached = reputation.getCachedVolumes(MOCK_USER_ADDRESS);
      expect(cached).toHaveLength(2);
      expect(cached[0].amountUsd + cached[1].amountUsd).toBe(800);
    });

    it('should accumulate volume across multiple updates', async () => {
      await reputation.updateVolume(MOCK_USER_ADDRESS, 1000, false);
      await reputation.updateVolume(MOCK_USER_ADDRESS, 2000, false);
      await reputation.updateVolume(MOCK_USER_ADDRESS, 3000, false);

      const cached = reputation.getCachedVolumes(MOCK_USER_ADDRESS);
      const totalVolume = cached.reduce((sum, v) => sum + v.amountUsd, 0);
      
      expect(totalVolume).toBe(6000);
    });
  });

  describe('Consistency Tracking', () => {
    it('should update consistency with daily activity', async () => {
      const breakdown = await reputation.updateConsistency(MOCK_USER_ADDRESS, 'prediction', false);

      expect(breakdown).not.toBeNull();
    });

    it('should cache activity records', async () => {
      await reputation.updateConsistency(MOCK_USER_ADDRESS, 'prediction', false);
      
      const cached = reputation.getCachedActivities(MOCK_USER_ADDRESS);
      expect(cached.length).toBeGreaterThan(0);
      expect(cached[0].action).toBe('prediction');
    });

    it('should not duplicate activity for same day', async () => {
      await reputation.updateConsistency(MOCK_USER_ADDRESS, 'prediction', false);
      await reputation.updateConsistency(MOCK_USER_ADDRESS, 'yield', false);
      
      const cached = reputation.getCachedActivities(MOCK_USER_ADDRESS);
      // Should only have one entry for today
      const today = new Date().toISOString().split('T')[0];
      const todayActivities = cached.filter(a => a.date === today);
      expect(todayActivities.length).toBe(1);
    });
  });

  describe('Rank Calculations', () => {
    it('should calculate percentile rank correctly', async () => {
      // Mock: rank 5 out of 100 users
      const mockContract = createMockContract({ rank: 5n, totalUsers: 100n });
      (reputation as any).contract = mockContract;

      const rank = await reputation.getRank(MOCK_USER_ADDRESS);

      // Rank 5 out of 100 should be in top 5% = 96th percentile
      expect(rank).toBeGreaterThan(90);
      expect(rank).toBeLessThanOrEqual(100);
    });

    it('should return 0 for unranked user', async () => {
      const mockContract = createMockContract({ rank: 0n, totalUsers: 100n });
      (reputation as any).contract = mockContract;

      const rank = await reputation.getRank(MOCK_USER_ADDRESS);

      expect(rank).toBe(0);
    });

    it('should return 100 for top user', async () => {
      // Mock: rank 1 out of 100 users
      const mockContract = createMockContract({ rank: 1n, totalUsers: 100n });
      (reputation as any).contract = mockContract;

      const rank = await reputation.getRank(MOCK_USER_ADDRESS);

      expect(rank).toBe(100);
    });

    it('should handle single user edge case', async () => {
      const mockContract = createMockContract({ 
        rank: 1n,
        totalUsers: 1n 
      });
      (reputation as any).contract = mockContract;

      const rank = await reputation.getRank(MOCK_USER_ADDRESS);

      expect(rank).toBe(100);
    });
  });

  describe('Leaderboard Position', () => {
    it('should return correct leaderboard position', async () => {
      const mockContract = createMockContract({ rank: 5n });
      (reputation as any).contract = mockContract;

      const position = await reputation.getLeaderboardPosition(MOCK_USER_ADDRESS);

      expect(position).toBe(5);
    });

    it('should return 0 for user not on leaderboard', async () => {
      const mockContract = createMockContract({ rank: 0n });
      (reputation as any).contract = mockContract;

      const position = await reputation.getLeaderboardPosition(MOCK_USER_ADDRESS);

      expect(position).toBe(0);
    });
  });

  describe('Contract Integration', () => {
    it('should fetch reputation from contract', async () => {
      const breakdown = await reputation.getReputation(MOCK_USER_ADDRESS);

      expect(breakdown.totalScore).toBe(5000);
      expect(breakdown.accuracyPoints).toBe(2000);
      expect(breakdown.predictionsMade).toBe(10);
      expect(breakdown.predictionsCorrect).toBe(7);
    });

    it('should fetch score only from contract', async () => {
      const score = await reputation.getScore(MOCK_USER_ADDRESS);

      expect(score).toBe(5000);
    });

    it('should fetch leaderboard from contract', async () => {
      const leaderboard = await reputation.getLeaderboard(3);

      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].score).toBe(8000);
    });

    it('should check if user is in top N percent', async () => {
      const mockContract = createMockContract({ isTopPercent: true });
      (reputation as any).contract = mockContract;

      const isTop10 = await reputation.isTopPercent(MOCK_USER_ADDRESS, 10);

      expect(isTop10).toBe(true);
    });

    it('should handle contract errors gracefully', async () => {
      (reputation as any).contract = {
        getReputation: vi.fn().mockRejectedValue(new Error('Contract error')),
      };

      const breakdown = await reputation.getReputation(MOCK_USER_ADDRESS);

      expect(breakdown.totalScore).toBe(0);
      expect(breakdown.accuracyPoints).toBe(0);
    });
  });

  describe('Reputation Tiers', () => {
    it('should return correct tier for Legendary score', () => {
      const tier = reputation.getTier(9000);
      expect(tier).toBe('Legendary 🦞');
    });

    it('should return correct tier for Prophet score', () => {
      const tier = reputation.getTier(8000);
      expect(tier).toBe('Prophet 🔮');
    });

    it('should return correct tier for Oracle score', () => {
      const tier = reputation.getTier(6500);
      expect(tier).toBe('Oracle 🌟');
    });

    it('should return correct tier for Seer score', () => {
      const tier = reputation.getTier(5000);
      expect(tier).toBe('Seer 👁️');
    });

    it('should return correct tier for Adept score', () => {
      const tier = reputation.getTier(4000);
      expect(tier).toBe('Adept 📿');
    });

    it('should return correct tier for Apprentice score', () => {
      const tier = reputation.getTier(2000);
      expect(tier).toBe('Apprentice 📖');
    });

    it('should return Novice for low score', () => {
      const tier = reputation.getTier(500);
      expect(tier).toBe('Novice 🌱');
    });
  });

  describe('Cache Management', () => {
    it('should clear all cached data for a user', async () => {
      // Add some cached data
      await reputation.updateAccuracy(MOCK_USER_ADDRESS, {
        predicted: true,
        actual: true,
        confidence: 80,
        stakeAmountUsd: 100,
      }, false);
      
      await reputation.updateVolume(MOCK_USER_ADDRESS, 500, false);
      await reputation.updateConsistency(MOCK_USER_ADDRESS, 'prediction', false);

      // Verify data exists
      expect(reputation.getCachedPredictions(MOCK_USER_ADDRESS)).toHaveLength(1);
      expect(reputation.getCachedVolumes(MOCK_USER_ADDRESS)).toHaveLength(1);
      expect(reputation.getCachedActivities(MOCK_USER_ADDRESS).length).toBeGreaterThan(0);

      // Clear cache
      reputation.clearCache(MOCK_USER_ADDRESS);

      // Verify data is cleared
      expect(reputation.getCachedPredictions(MOCK_USER_ADDRESS)).toHaveLength(0);
      expect(reputation.getCachedVolumes(MOCK_USER_ADDRESS)).toHaveLength(0);
      expect(reputation.getCachedActivities(MOCK_USER_ADDRESS)).toHaveLength(0);
    });
  });

  describe('Singleton Instance', () => {
    it('should return same instance from getReputationSystem', () => {
      const instance1 = getReputationSystem();
      const instance2 = getReputationSystem();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getReputationSystem();
      resetReputationSystem();
      const instance2 = getReputationSystem();

      expect(instance1).not.toBe(instance2);
    });
  });
});

// ============ Edge Cases ============

describe('Reputation System Edge Cases', () => {
  let reputation: OnchainReputationSystem;

  beforeEach(() => {
    resetReputationSystem();
    reputation = new OnchainReputationSystem(MOCK_CONTRACT_ADDRESS, createMockProvider() as any);
    (reputation as any).contract = createMockContract();
  });

  it('should handle undefined contract gracefully', async () => {
    (reputation as any).contract = null;

    await expect(reputation.getRank(MOCK_USER_ADDRESS)).rejects.toThrow('Contract not initialized');
    await expect(reputation.getLeaderboardPosition(MOCK_USER_ADDRESS)).rejects.toThrow('Contract not initialized');
  });

  it('should handle very large volume values', () => {
    const result = reputation.calculateScore({ correct: 10, total: 10 }, 1000000000, 30, 0);
    
    expect(result.volumePoints).toBe(MAX_POINTS.VOLUME);
  });

  it('should handle very large yield values', () => {
    const result = reputation.calculateScore({ correct: 10, total: 10 }, 0, 0, 1000000);
    
    expect(result.yieldPoints).toBe(MAX_POINTS.YIELD);
  });

  it('should handle zero total predictions', () => {
    const result = reputation.calculateScore({ correct: 0, total: 0 }, 0, 0, 0);
    
    expect(result.accuracyPercentage).toBe(0);
    expect(result.accuracyPoints).toBe(0);
  });

  it('should handle streak calculation with gaps', async () => {
    // Add activity for today
    await reputation.updateConsistency(MOCK_USER_ADDRESS, 'prediction', false);
    
    // Manually add old activity to simulate broken streak
    const activities = (reputation as any).activityCache.get(MOCK_USER_ADDRESS);
    activities.push({
      date: '2024-01-01', // Very old date
      timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
      action: 'prediction',
    });

    const stats = (reputation as any).getLocalStats(MOCK_USER_ADDRESS);
    
    // Streak should only count consecutive days from today
    expect(stats.consecutiveDays).toBe(1);
  });

  it('should calculate volume points with boundary values', () => {
    const boundaryTests = [
      { volume: 99.99, expected: 0 },
      { volume: 100, expected: 500 },
      { volume: 499.99, expected: 500 },
      { volume: 500, expected: 1000 },
      { volume: 999.99, expected: 1000 },
      { volume: 1000, expected: 1500 },
      { volume: 4999.99, expected: 1500 },
      { volume: 5000, expected: 2000 },
      { volume: 9999.99, expected: 2000 },
      { volume: 10000, expected: 2500 },
    ];

    for (const { volume, expected } of boundaryTests) {
      const result = reputation.calculateScore({ correct: 0, total: 0 }, volume, 0, 0);
      expect(result.volumePoints).toBe(expected);
    }
  });
});
