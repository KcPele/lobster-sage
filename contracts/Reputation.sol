// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Reputation
 * @notice Onchain reputation scoring system for predictors
 * @dev Tracks accuracy, volume, consistency, and yield for each address
 */
contract Reputation is Ownable, Pausable {
    
    // ============ Structs ============
    
    struct ReputationData {
        uint256 totalScore;           // Overall reputation score (0-10000)
        uint256 accuracyPoints;       // Points from correct predictions (0-4000)
        uint256 volumePoints;         // Points from prediction volume (0-2500)
        uint256 consistencyPoints;    // Points from daily activity (0-2000)
        uint256 yieldPoints;          // Points from yield profits (0-1500)
        
        uint256 predictionsMade;      // Total predictions
        uint256 predictionsCorrect;   // Correct predictions
        uint256 predictionsWrong;     // Wrong predictions
        uint256 totalVolume;          // Total USD value of predictions
        uint256 totalYieldProfit;     // Total profit from yield
        uint256 lastActiveDay;        // Last day user was active
        uint256 consecutiveDays;      // Streak of consecutive active days
        uint256 burns;                // Number of failed prophecies burned
    }
    
    // ============ State Variables ============
    
    // user => reputation data
    mapping(address => ReputationData) public reputations;
    
    // Authorized contracts that can update reputation
    mapping(address => bool) public authorizedRecorders;
    
    // Global leaderboard (top 100)
    address[100] public leaderboard;
    
    // Total users with reputation
    uint256 public totalUsers;
    
    // Scoring parameters
    uint256 public constant ACCURACY_WEIGHT = 40;     // 40% weight
    uint256 public constant VOLUME_WEIGHT = 25;       // 25% weight
    uint256 public constant CONSISTENCY_WEIGHT = 20;  // 20% weight
    uint256 public constant YIELD_WEIGHT = 15;        // 15% weight
    
    uint256 public constant MAX_ACCURACY_POINTS = 4000;
    uint256 public constant MAX_VOLUME_POINTS = 2500;
    uint256 public constant MAX_CONSISTENCY_POINTS = 2000;
    uint256 public constant MAX_YIELD_POINTS = 1500;
    
    // Volume tiers for points (in USD, 18 decimals)
    uint256 public volumeTier1 = 100e18;   // $100
    uint256 public volumeTier2 = 500e18;   // $500
    uint256 public volumeTier3 = 1000e18;  // $1,000
    uint256 public volumeTier4 = 5000e18;  // $5,000
    uint256 public volumeTier5 = 10000e18; // $10,000
    
    // Yield profit tiers (in USD, 18 decimals)
    uint256 public yieldTier1 = 10e18;     // $10
    uint256 public yieldTier2 = 50e18;     // $50
    uint256 public yieldTier3 = 100e18;    // $100
    uint256 public yieldTier4 = 500e18;    // $500
    uint256 public yieldTier5 = 1000e18;   // $1,000
    
    // ============ Events ============
    
    event ReputationUpdated(
        address indexed user,
        uint256 oldScore,
        uint256 newScore,
        string reason
    );
    
    event PredictionRecorded(
        address indexed user,
        bool success,
        uint256 confidence,
        uint256 accuracyScore
    );
    
    event YieldRecorded(address indexed user, uint256 profit);
    event ActivityRecorded(address indexed user, uint256 day);
    event BurnRecorded(address indexed user, uint256 burnCount);
    event RecorderAuthorized(address recorder);
    event RecorderRevoked(address recorder);
    
    // ============ Modifiers ============
    
    modifier onlyRecorder() {
        require(authorizedRecorders[msg.sender] || msg.sender == owner(), "Not authorized recorder");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address initialOwner) Ownable(initialOwner) {}
    
    // ============ Core Functions ============
    
    /**
     * @notice Record a prediction result
     * @param user The predictor
     * @param success Whether prediction was correct
     * @param confidence Confidence level (0-100)
     * @param accuracyScore Precision score (0-10000)
     */
    function recordPrediction(
        address user,
        bool success,
        uint256 confidence,
        uint256 accuracyScore
    ) external onlyRecorder whenNotPaused {
        ReputationData storage rep = reputations[user];
        
        uint256 oldScore = rep.totalScore;
        
        // Update prediction counts
        rep.predictionsMade++;
        if (success) {
            rep.predictionsCorrect++;
        } else {
            rep.predictionsWrong++;
        }
        
        // Recalculate accuracy points
        rep.accuracyPoints = _calculateAccuracyPoints(rep);
        
        // Confidence bonus for correct high-confidence predictions
        if (success && confidence >= 80) {
            rep.accuracyPoints = rep.accuracyPoints + (confidence - 80) * 5;
            if (rep.accuracyPoints > MAX_ACCURACY_POINTS) {
                rep.accuracyPoints = MAX_ACCURACY_POINTS;
            }
        }
        
        // Recalculate total score
        _updateTotalScore(rep);
        
        // Update leaderboard
        _updateLeaderboard(user);
        
        emit PredictionRecorded(user, success, confidence, accuracyScore);
        emit ReputationUpdated(user, oldScore, rep.totalScore, "prediction");
    }
    
    /**
     * @notice Record yield profit for a user
     * @param user The user
     * @param profit Profit amount in USD (18 decimals)
     */
    function recordYield(address user, uint256 profit) external onlyRecorder whenNotPaused {
        ReputationData storage rep = reputations[user];
        
        uint256 oldScore = rep.totalScore;
        rep.totalYieldProfit += profit;
        
        // Recalculate yield points
        rep.yieldPoints = _calculateYieldPoints(rep.totalYieldProfit);
        
        // Recalculate total score
        _updateTotalScore(rep);
        
        // Update leaderboard
        _updateLeaderboard(user);
        
        emit YieldRecorded(user, profit);
        emit ReputationUpdated(user, oldScore, rep.totalScore, "yield");
    }
    
    /**
     * @notice Record daily activity for a user
     * @param user The user
     */
    function recordActivity(address user) external onlyRecorder whenNotPaused {
        ReputationData storage rep = reputations[user];
        
        uint256 currentDay = block.timestamp / 1 days;
        
        // Only count once per day
        if (rep.lastActiveDay == currentDay) {
            return;
        }
        
        uint256 oldScore = rep.totalScore;
        
        // Update streak
        if (rep.lastActiveDay == currentDay - 1) {
            rep.consecutiveDays++;
        } else {
            rep.consecutiveDays = 1;
        }
        rep.lastActiveDay = currentDay;
        
        // Recalculate consistency points
        rep.consistencyPoints = _calculateConsistencyPoints(rep.consecutiveDays);
        
        // Recalculate total score
        _updateTotalScore(rep);
        
        // Update leaderboard
        _updateLeaderboard(user);
        
        emit ActivityRecorded(user, currentDay);
        emit ReputationUpdated(user, oldScore, rep.totalScore, "activity");
    }
    
    /**
     * @notice Record a burn for reputation recovery
     * @param user The user
     */
    function recordBurn(address user) external onlyRecorder whenNotPaused {
        ReputationData storage rep = reputations[user];
        
        uint256 oldScore = rep.totalScore;
        rep.burns++;
        
        // Small reputation boost for burning failed predictions
        // Shows accountability
        uint256 burnBonus = 50; // 0.5% of max
        rep.accuracyPoints = rep.accuracyPoints + burnBonus;
        if (rep.accuracyPoints > MAX_ACCURACY_POINTS) {
            rep.accuracyPoints = MAX_ACCURACY_POINTS;
        }
        
        // Recalculate total score
        _updateTotalScore(rep);
        
        emit BurnRecorded(user, rep.burns);
        emit ReputationUpdated(user, oldScore, rep.totalScore, "burn");
    }
    
    /**
     * @notice Record prediction volume for a user
     * @param user The user
     * @param volume Volume in USD (18 decimals)
     */
    function recordVolume(address user, uint256 volume) external onlyRecorder whenNotPaused {
        ReputationData storage rep = reputations[user];
        
        uint256 oldScore = rep.totalScore;
        rep.totalVolume += volume;
        
        // Recalculate volume points
        rep.volumePoints = _calculateVolumePoints(rep.totalVolume);
        
        // Recalculate total score
        _updateTotalScore(rep);
        
        // Update leaderboard
        _updateLeaderboard(user);
        
        emit ReputationUpdated(user, oldScore, rep.totalScore, "volume");
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get full reputation data for a user
     */
    function getReputation(address user) external view returns (ReputationData memory) {
        return reputations[user];
    }
    
    /**
     * @notice Get just the total score
     */
    function getScore(address user) external view returns (uint256) {
        return reputations[user].totalScore;
    }
    
    /**
     * @notice Get user's rank on leaderboard
     */
    function getRank(address user) external view returns (uint256) {
        for (uint256 i = 0; i < 100; i++) {
            if (leaderboard[i] == user) {
                return i + 1;
            }
        }
        return 0; // Not in top 100
    }
    
    /**
     * @notice Get top N users from leaderboard
     */
    function getLeaderboard(uint256 count) external view returns (address[] memory, uint256[] memory) {
        uint256 actualCount = count > 100 ? 100 : count;
        address[] memory users = new address[](actualCount);
        uint256[] memory scores = new uint256[](actualCount);
        
        for (uint256 i = 0; i < actualCount; i++) {
            users[i] = leaderboard[i];
            scores[i] = reputations[leaderboard[i]].totalScore;
        }
        
        return (users, scores);
    }
    
    /**
     * @notice Calculate accuracy percentage
     */
    function getAccuracy(address user) external view returns (uint256) {
        ReputationData storage rep = reputations[user];
        if (rep.predictionsMade == 0) return 0;
        return (rep.predictionsCorrect * 100) / rep.predictionsMade;
    }
    
    /**
     * @notice Check if user is in top N%
     */
    function isTopPercent(address user, uint256 percent) external view returns (bool) {
        if (totalUsers == 0) return false;
        uint256 rank = this.getRank(user);
        if (rank == 0) return false;
        return (rank * 100) / totalUsers <= percent;
    }
    
    // ============ Admin Functions ============
    
    function authorizeRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = true;
        emit RecorderAuthorized(recorder);
    }
    
    function revokeRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = false;
        emit RecorderRevoked(recorder);
    }
    
    function setVolumeTiers(
        uint256 t1, uint256 t2, uint256 t3, uint256 t4, uint256 t5
    ) external onlyOwner {
        volumeTier1 = t1;
        volumeTier2 = t2;
        volumeTier3 = t3;
        volumeTier4 = t4;
        volumeTier5 = t5;
    }
    
    function setYieldTiers(
        uint256 t1, uint256 t2, uint256 t3, uint256 t4, uint256 t5
    ) external onlyOwner {
        yieldTier1 = t1;
        yieldTier2 = t2;
        yieldTier3 = t3;
        yieldTier4 = t4;
        yieldTier5 = t5;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ Internal Functions ============
    
    function _calculateAccuracyPoints(ReputationData storage rep) internal view returns (uint256) {
        if (rep.predictionsMade < 5) {
            // Need at least 5 predictions for full accuracy scoring
            return (rep.predictionsCorrect * MAX_ACCURACY_POINTS) / 10; // Max 40% without enough data
        }
        
        uint256 accuracy = (rep.predictionsCorrect * 100) / rep.predictionsMade;
        return (accuracy * MAX_ACCURACY_POINTS) / 100;
    }
    
    function _calculateVolumePoints(uint256 volume) internal view returns (uint256) {
        if (volume >= volumeTier5) return MAX_VOLUME_POINTS;
        if (volume >= volumeTier4) return (MAX_VOLUME_POINTS * 4) / 5;
        if (volume >= volumeTier3) return (MAX_VOLUME_POINTS * 3) / 5;
        if (volume >= volumeTier2) return (MAX_VOLUME_POINTS * 2) / 5;
        if (volume >= volumeTier1) return MAX_VOLUME_POINTS / 5;
        return 0;
    }
    
    function _calculateConsistencyPoints(uint256 consecutiveDays) internal pure returns (uint256) {
        // Max points at 30+ day streak
        if (consecutiveDays >= 30) return MAX_CONSISTENCY_POINTS;
        return (consecutiveDays * MAX_CONSISTENCY_POINTS) / 30;
    }
    
    function _calculateYieldPoints(uint256 totalYield) internal view returns (uint256) {
        if (totalYield >= yieldTier5) return MAX_YIELD_POINTS;
        if (totalYield >= yieldTier4) return (MAX_YIELD_POINTS * 4) / 5;
        if (totalYield >= yieldTier3) return (MAX_YIELD_POINTS * 3) / 5;
        if (totalYield >= yieldTier2) return (MAX_YIELD_POINTS * 2) / 5;
        if (totalYield >= yieldTier1) return MAX_YIELD_POINTS / 5;
        return 0;
    }
    
    function _updateTotalScore(ReputationData storage rep) internal {
        rep.totalScore = rep.accuracyPoints + rep.volumePoints + rep.consistencyPoints + rep.yieldPoints;
    }
    
    function _updateLeaderboard(address user) internal {
        ReputationData storage rep = reputations[user];
        
        // Check if user already in leaderboard
        int256 existingIndex = -1;
        for (uint256 i = 0; i < 100; i++) {
            if (leaderboard[i] == user) {
                existingIndex = int256(i);
                break;
            }
        }
        
        // Find insertion point
        uint256 insertIndex = 100;
        for (uint256 i = 0; i < 100; i++) {
            address currentAddr = leaderboard[i];
            if (currentAddr == address(0) || reputations[currentAddr].totalScore < rep.totalScore) {
                insertIndex = i;
                break;
            }
        }
        
        if (insertIndex >= 100) return; // Not high enough score
        
        // Shift and insert
        if (existingIndex >= 0) {
            // Remove from old position
            for (uint256 i = uint256(existingIndex); i < 99; i++) {
                leaderboard[i] = leaderboard[i + 1];
            }
            leaderboard[99] = address(0);
        } else {
            totalUsers++;
        }
        
        // Insert at new position
        for (uint256 i = 99; i > insertIndex; i--) {
            leaderboard[i] = leaderboard[i - 1];
        }
        leaderboard[insertIndex] = user;
    }
}
