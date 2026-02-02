# Reputation System - Implementation Summary

## Overview
The onchain reputation scoring system for LobsterSage has been successfully built. It integrates with the `Reputation.sol` smart contract to track and calculate predictor reputation scores.

---

## Deliverables

### 1. `/home/kcpele/clawd/lobster-sage/src/sage/reputation.ts`

Core reputation system with the following features:

#### Score Calculation (`calculateScore()`)
- **Weights:** 40% accuracy, 25% volume, 20% consistency, 15% yield
- Max score: 10,000 points
- Accuracy reduced for < 5 predictions (anti-sybil)

#### Update Functions
- `updateAccuracy()` - Called when prediction resolves (correct/incorrect)
- `updateVolume()` - Track total $ value of predictions made
- `updateConsistency()` - Track daily activity streak
- `updateYield()` - Track profits from correct predictions
- `recordBurn()` - Record failed prophecy cleanup for accountability bonus

#### Rank & Leaderboard
- `getRank()` - Calculate percentile rank (0-100) among all predictors
- `getLeaderboardPosition()` - Get 1-based position on leaderboard
- `getLeaderboard()` - Get top N users from contract
- `isTopPercent()` - Check if user is in top N%

#### Contract Integration
- Full integration with `Reputation.sol`
- Read functions: `getReputation()`, `getScore()`
- Write functions: All update methods
- Local caching for offline calculations

#### Tiers System
- Legendary 🦞 (9000+)
- Prophet 🔮 (7500+)
- Oracle 🌟 (6000+)
- Seer 👁️ (4500+)
- Adept 📿 (3000+)
- Apprentice 📖 (1500+)
- Novice 🌱 (<1500)

---

### 2. `/home/kcpele/clawd/lobster-sage/src/sage/analytics.ts`

Comprehensive analytics engine for Base ecosystem monitoring:

#### Ecosystem Scanning (`scanBaseEcosystem()`)
- Monitor protocol launches
- Track TVL growth anomalies
- Detect volume spikes
- Watch governance events

#### Sentiment Analysis (`analyzeSentiment()`)
- Aggregate social sentiment (Twitter, Farcaster, Discord)
- Fear & Greed index tracking
- Trending keywords analysis
- Influencer sentiment scoring

#### Onchain Metrics (`trackOnchainMetrics()`)
- Whale movement detection (>$100k threshold)
- Volume metrics tracking
- TVL change monitoring
- Network congestion stats

#### Insights Generation (`generateInsights()`)
- Opportunity detection
- Risk warnings
- Anomaly alerts
- Trend identification

---

### 3. Contract Integration

#### Uses `Reputation.sol` (already deployed)

**Read Functions:**
- `getReputation(address)` - Full reputation data
- `getScore(address)` - Total score only
- `getRank(address)` - Leaderboard rank
- `getLeaderboard(count)` - Top N users
- `isTopPercent(address, percent)` - Percentile check

**Write Functions (requires authorized recorder):**
- `recordPrediction(user, success, confidence, accuracyScore)`
- `recordVolume(user, volume)`
- `recordActivity(user)` - Daily streak tracking
- `recordYield(user, profit)`
- `recordBurn(user)` - Failed prophecy cleanup

**Contract Weights (matching TypeScript):**
- ACCURACY_WEIGHT = 40 (max 4000 points)
- VOLUME_WEIGHT = 25 (max 2500 points)
- CONSISTENCY_WEIGHT = 20 (max 2000 points)
- YIELD_WEIGHT = 15 (max 1500 points)

---

### 4. `/home/kcpele/clawd/lobster-sage/src/sage/__tests__/reputation.test.ts`

Comprehensive test suite with **44 passing tests**:

#### Test Coverage
- ✅ Score calculations (weights, caps, tiers)
- ✅ Volume points calculation (boundary values)
- ✅ Consistency streak calculation
- ✅ Yield points calculation
- ✅ Accuracy updates (correct/incorrect predictions)
- ✅ Volume tracking (accumulation, caching)
- ✅ Consistency tracking (daily activity)
- ✅ Rank calculations (percentile, edge cases)
- ✅ Leaderboard position tracking
- ✅ Contract integration (mocked)
- ✅ Tier classification
- ✅ Cache management
- ✅ Singleton instance behavior
- ✅ Error handling

---

## Key Metrics

### Accuracy
```typescript
accuracy = correct_predictions / total_predictions
```
- Reduced weight until 5+ predictions
- Confidence bonus for high-confidence correct predictions (80%+)

### Volume
```typescript
$100   → 500 points (20%)
$500   → 1000 points (40%)
$1,000 → 1500 points (60%)
$5,000 → 2000 points (80%)
$10,000→ 2500 points (100%)
```

### Consistency
```typescript
streak_days / 30 * 2000 points
max 30 days for full points
```

### Yield
```typescript
$10    → 300 points (20%)
$50    → 600 points (40%)
$100   → 900 points (60%)
$500   → 1200 points (80%)
$1,000 → 1500 points (100%)
```

---

## Usage Examples

### Calculate Score Locally
```typescript
import { OnchainReputationSystem } from './sage/reputation.js';

const reputation = new OnchainReputationSystem(contractAddress, provider);

const breakdown = reputation.calculateScore(
  { correct: 7, total: 10 },  // 70% accuracy
  5000,                       // $5,000 volume
  15,                         // 15-day streak
  500                         // $500 profit
);
// Result: { totalScore: ~5000, accuracyPoints: 2800, ... }
```

### Update Onchain (Authorized Recorder)
```typescript
await reputation.initialize();

// Record prediction result
await reputation.updateAccuracy(userAddress, {
  predicted: true,
  actual: true,
  confidence: 85,
  stakeAmountUsd: 100
}, true);

// Record volume
await reputation.updateVolume(userAddress, 1000, true);

// Record daily activity
await reputation.updateConsistency(userAddress, 'prediction', true);
```

### Get Analytics Insights
```typescript
import { getAnalytics } from './sage/analytics.js';

const analytics = getAnalytics();

// Get full ecosystem snapshot
const snapshot = await analytics.getFullSnapshot();

// Get actionable insights
const insights = await analytics.generateInsights();

// Format for display
insights.forEach(insight => {
  console.log(formatInsight(insight));
});
```

---

## Files Created/Modified

| File | Description |
|------|-------------|
| `src/sage/reputation.ts` | Core reputation system (existing, verified complete) |
| `src/sage/analytics.ts` | New - Ecosystem analytics engine |
| `src/sage/__tests__/reputation.test.ts` | New - Comprehensive test suite |
| `src/sage/index.ts` | Updated - Export new modules |
| `vitest.config.ts` | Updated - Include new tests |

---

## Next Steps

1. **Deploy Reputation.sol** if not already deployed
2. **Authorize recorder** - Call `authorizeRecorder()` with the Sage agent address
3. **Configure contract addresses** in environment variables
4. **Run analytics** on schedule for ecosystem monitoring
5. **Integrate with prediction flow** - Call update methods on prediction resolution

---

## Test Results

```
✓ src/sage/__tests__/reputation.test.ts (44 tests) 61ms

 Test Files  1 passed (1)
      Tests  44 passed (44)
```

All tests passing! ✅
