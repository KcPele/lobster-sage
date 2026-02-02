import { type Address, parseEther, formatEther } from 'viem';

/**
 * Test fixtures for prediction-related testing
 */

// Prediction types
export type PredictionType = 'price' | 'event' | 'sports' | 'crypto' | 'custom';
export type PredictionStatus = 'pending' | 'active' | 'resolved' | 'cancelled' | 'disputed';
export type PredictionOutcome = 'yes' | 'no' | 'unknown' | null;

export interface Prediction {
  id: string;
  title: string;
  description: string;
  type: PredictionType;
  status: PredictionStatus;
  creator: Address;
  createdAt: number;
  resolveAt: number;
  resolvedAt?: number;
  stakeAmount: bigint;
  totalStakeYes: bigint;
  totalStakeNo: bigint;
  outcome: PredictionOutcome;
  resolutionSource?: string;
  tags: string[];
}

export interface PredictionMarket {
  id: string;
  name: string;
  predictions: Prediction[];
  totalVolume: bigint;
  totalPredictions: number;
}

// Mock addresses
const MOCK_ADDRESSES = {
  creator1: '0x1234567890123456789012345678901234567890' as Address,
  creator2: '0x0987654321098765432109876543210987654321' as Address,
  participant1: '0xabcdef1234567890abcdef1234567890abcdef12' as Address,
  participant2: '0xfedcba0987654321fedcba0987654321fedcba09' as Address,
};

/**
 * Creates a prediction fixture with default values
 */
export function createPredictionFixture(
  overrides: Partial<Prediction> = {}
): Prediction {
  const now = Math.floor(Date.now() / 1000);
  
  return {
    id: `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: 'Will ETH price exceed $5000 by end of Q1?',
    description: 'Prediction on whether Ethereum price will be above $5000 USD by March 31, 2024.',
    type: 'price',
    status: 'active',
    creator: MOCK_ADDRESSES.creator1,
    createdAt: now - 86400, // 1 day ago
    resolveAt: now + 2592000, // 30 days from now
    stakeAmount: parseEther('0.1'),
    totalStakeYes: parseEther('5'),
    totalStakeNo: parseEther('3'),
    outcome: null,
    resolutionSource: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    tags: ['ethereum', 'price', 'crypto'],
    ...overrides,
  };
}

/**
 * Creates multiple prediction fixtures
 */
export function createPredictionsFixture(
  count: number,
  baseOverrides: Partial<Prediction> = {}
): Prediction[] {
  const types: PredictionType[] = ['price', 'event', 'sports', 'crypto', 'custom'];
  const statuses: PredictionStatus[] = ['pending', 'active', 'resolved', 'cancelled'];
  
  return Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];
    const status = statuses[i % statuses.length];
    
    return createPredictionFixture({
      id: `pred-${i + 1}`,
      title: `Test Prediction ${i + 1}`,
      type,
      status,
      creator: i % 2 === 0 ? MOCK_ADDRESSES.creator1 : MOCK_ADDRESSES.creator2,
      ...baseOverrides,
    });
  });
}

/**
 * Creates a resolved prediction fixture
 */
export function createResolvedPrediction(
  outcome: 'yes' | 'no',
  overrides: Partial<Prediction> = {}
): Prediction {
  const now = Math.floor(Date.now() / 1000);
  
  return createPredictionFixture({
    status: 'resolved',
    outcome,
    resolvedAt: now - 3600, // Resolved 1 hour ago
    ...overrides,
  });
}

/**
 * Creates an expired prediction fixture
 */
export function createExpiredPrediction(
  overrides: Partial<Prediction> = {}
): Prediction {
  const now = Math.floor(Date.now() / 1000);
  
  return createPredictionFixture({
    status: 'pending',
    resolveAt: now - 86400, // Should have resolved 1 day ago
    ...overrides,
  });
}

/**
 * Creates a high-stakes prediction fixture
 */
export function createHighStakesPrediction(
  overrides: Partial<Prediction> = {}
): Prediction {
  return createPredictionFixture({
    stakeAmount: parseEther('10'),
    totalStakeYes: parseEther('100'),
    totalStakeNo: parseEther('50'),
    ...overrides,
  });
}

/**
 * Creates a prediction market fixture
 */
export function createPredictionMarketFixture(
  overrides: Partial<PredictionMarket> = {}
): PredictionMarket {
  const predictions = createPredictionsFixture(5);
  const totalVolume = predictions.reduce(
    (sum, p) => sum + p.totalStakeYes + p.totalStakeNo,
    0n
  );
  
  return {
    id: 'market-1',
    name: 'Crypto Predictions Market',
    predictions,
    totalVolume,
    totalPredictions: predictions.length,
    ...overrides,
  };
}

/**
 * Prediction validation test cases
 */
export const PREDICTION_VALIDATION_CASES = {
  valid: {
    title: 'Valid Prediction Title',
    description: 'A valid description with sufficient detail.',
    stakeAmount: parseEther('0.01'),
    resolveAt: Math.floor(Date.now() / 1000) + 86400,
  },
  invalid: {
    emptyTitle: '',
    shortTitle: 'A',
    emptyDescription: '',
    shortDescription: 'Short',
    zeroStake: 0n,
    negativeStake: parseEther('-1'),
    pastResolveTime: Math.floor(Date.now() / 1000) - 86400,
    invalidAddress: '0xinvalid',
  },
  edgeCases: {
    maxTitleLength: 'A'.repeat(280),
    unicodeTitle: '🚀 Crypto Prediction 🌙',
    veryLongDescription: 'Description '.repeat(1000),
    tinyStake: 1n,
    hugeStake: parseEther('1000000'),
    farFutureResolve: Math.floor(Date.now() / 1000) + 31536000, // 1 year
  },
};

/**
 * Mock prediction outcomes for testing
 */
export const PREDICTION_OUTCOMES = {
  correct: {
    predicted: 'yes' as const,
    actual: 'yes' as const,
    confidence: 0.85,
  },
  incorrect: {
    predicted: 'yes' as const,
    actual: 'no' as const,
    confidence: 0.75,
  },
  uncertain: {
    predicted: 'unknown' as const,
    actual: 'yes' as const,
    confidence: 0.5,
  },
  highConfidence: {
    predicted: 'yes' as const,
    actual: 'yes' as const,
    confidence: 0.95,
  },
  lowConfidence: {
    predicted: 'yes' as const,
    actual: 'no' as const,
    confidence: 0.51,
  },
};

// Export mock addresses for use in tests
export { MOCK_ADDRESSES };
