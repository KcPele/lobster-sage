/**
 * Reputation scoring system for prediction makers
 */

export interface ReputationScore {
  address: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  reputationScore: number;
  streak: number;
  lastPredictionAt: number | null;
}

export interface PredictionResult {
  predicted: 'yes' | 'no' | 'unknown';
  actual: 'yes' | 'no';
  confidence: number;
}

export interface ReputationUpdate {
  address: string;
  result: PredictionResult;
  stakeAmount: bigint;
}

// Reputation calculation constants
const REPUTATION_CONSTANTS = {
  BASE_SCORE: 1000,
  MAX_STREAK_BONUS: 500,
  MIN_CONFIDENCE_THRESHOLD: 0.6,
  HIGH_CONFIDENCE_THRESHOLD: 0.8,
  ACCURACY_WEIGHT: 0.6,
  STREAK_WEIGHT: 0.2,
  VOLUME_WEIGHT: 0.2,
  DECAY_DAYS: 30,
  DECAY_RATE: 0.05,
};

/**
 * Calculates reputation score based on prediction history
 */
export function calculateReputationScore(
  predictions: PredictionResult[],
  currentStreak: number = 0
): number {
  if (predictions.length === 0) {
    return REPUTATION_CONSTANTS.BASE_SCORE;
  }

  const correct = predictions.filter(p => p.predicted === p.actual).length;
  const accuracy = correct / predictions.length;

  // Volume score (logarithmic to prevent spam)
  const volumeScore = Math.log10(predictions.length + 1) * 100;

  // Streak bonus (capped)
  const streakBonus = Math.min(
    currentStreak * 50,
    REPUTATION_CONSTANTS.MAX_STREAK_BONUS
  );

  // Confidence bonus for high-confidence correct predictions
  const confidenceBonus = predictions.reduce((sum, p) => {
    if (p.predicted === p.actual && p.confidence >= REPUTATION_CONSTANTS.HIGH_CONFIDENCE_THRESHOLD) {
      return sum + (p.confidence * 100);
    }
    return sum;
  }, 0);

  // Calculate weighted score
  const score =
    REPUTATION_CONSTANTS.BASE_SCORE +
    accuracy * 500 +
    streakBonus +
    Math.min(confidenceBonus, 200) +
    volumeScore * REPUTATION_CONSTANTS.VOLUME_WEIGHT;

  return Math.round(score);
}

/**
 * Updates streak based on prediction result
 */
export function updateStreak(
  currentStreak: number,
  result: PredictionResult
): number {
  if (result.predicted === result.actual) {
    return currentStreak + 1;
  }
  return 0; // Reset streak on incorrect prediction
}

/**
 * Calculates accuracy percentage
 */
export function calculateAccuracy(predictions: PredictionResult[]): number {
  if (predictions.length === 0) return 0;
  
  const correct = predictions.filter(p => p.predicted === p.actual).length;
  return Math.round((correct / predictions.length) * 100) / 100;
}

/**
 * Applies time decay to reputation score
 */
export function applyTimeDecay(
  score: number,
  lastActiveTimestamp: number,
  currentTimestamp: number = Date.now()
): number {
  const daysInactive = Math.floor(
    (currentTimestamp - lastActiveTimestamp) / (1000 * 60 * 60 * 24)
  );

  if (daysInactive <= REPUTATION_CONSTANTS.DECAY_DAYS) {
    return score;
  }

  const decayPeriods = Math.floor(
    (daysInactive - REPUTATION_CONSTANTS.DECAY_DAYS) / REPUTATION_CONSTANTS.DECAY_DAYS
  );
  
  const decayMultiplier = Math.pow(
    1 - REPUTATION_CONSTANTS.DECAY_RATE,
    decayPeriods
  );

  return Math.round(score * decayMultiplier);
}

/**
 * Gets reputation tier based on score
 */
export function getReputationTier(score: number): string {
  if (score >= 5000) return 'Legendary';
  if (score >= 4000) return 'Expert';
  if (score >= 3000) return 'Advanced';
  if (score >= 2000) return 'Intermediate';
  if (score >= 1000) return 'Novice';
  return 'Rookie';
}

/**
 * Validates if a prediction confidence is acceptable
 */
export function isValidConfidence(confidence: number): boolean {
  return confidence >= 0 && confidence <= 1;
}

/**
 * Reputation manager class for tracking multiple users
 */
export class ReputationManager {
  private scores: Map<string, ReputationScore> = new Map();

  /**
   * Gets or creates a reputation score for an address
   */
  getScore(address: string): ReputationScore {
    if (!this.scores.has(address)) {
      this.scores.set(address, {
        address,
        totalPredictions: 0,
        correctPredictions: 0,
        accuracy: 0,
        reputationScore: REPUTATION_CONSTANTS.BASE_SCORE,
        streak: 0,
        lastPredictionAt: null,
      });
    }
    return this.scores.get(address)!;
  }

  /**
   * Updates reputation after a prediction result
   */
  updateReputation(update: ReputationUpdate): ReputationScore {
    const currentScore = this.getScore(update.address);
    
    // Create result object
    const result: PredictionResult = {
      predicted: update.result.predicted,
      actual: update.result.actual,
      confidence: update.result.confidence,
    };

    // Update stats
    const predictions: PredictionResult[] = Array(currentScore.totalPredictions)
      .fill(null)
      .map((_, i) => 
        i < currentScore.correctPredictions 
          ? { predicted: 'yes', actual: 'yes', confidence: 0.7 }
          : { predicted: 'yes', actual: 'no', confidence: 0.7 }
      );
    predictions.push(result);

    const newStreak = updateStreak(currentScore.streak, result);
    const newAccuracy = calculateAccuracy(predictions);
    const newScore = calculateReputationScore(predictions, newStreak);

    const updated: ReputationScore = {
      address: update.address,
      totalPredictions: currentScore.totalPredictions + 1,
      correctPredictions: result.predicted === result.actual 
        ? currentScore.correctPredictions + 1 
        : currentScore.correctPredictions,
      accuracy: newAccuracy,
      reputationScore: newScore,
      streak: newStreak,
      lastPredictionAt: Date.now(),
    };

    this.scores.set(update.address, updated);
    return updated;
  }

  /**
   * Gets leaderboard sorted by reputation score
   */
  getLeaderboard(limit: number = 10): ReputationScore[] {
    return Array.from(this.scores.values())
      .sort((a, b) => b.reputationScore - a.reputationScore)
      .slice(0, limit);
  }

  /**
   * Resets a user's reputation
   */
  resetReputation(address: string): void {
    this.scores.delete(address);
  }
}
