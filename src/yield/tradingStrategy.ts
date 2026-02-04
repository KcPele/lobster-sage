/**
 * Trading Strategy & Autonomous Trading Loop
 * 
 * Manages P&L tracking, take-profit/stop-loss, and autonomous decision making.
 * Separated from optimizer to keep files under 500 lines.
 */

import { type Address } from 'viem';

// ==========================================
// TRADING STRATEGY TYPES
// ==========================================

export interface TradingStrategy {
  takeProfitPercent: number;     // Exit when up by this % (e.g., 10 = +10%)
  stopLossPercent: number;       // Exit when down by this % (e.g., 5 = -5%)
  minApyThreshold: number;       // Minimum APY to consider entering (e.g., 2%)
  rebalanceThreshold: number;    // APY improvement needed to rebalance (e.g., 3%)
  maxPositionSizeEth: number;    // Max position size in ETH
  enabled: boolean;              // Whether autonomous trading is enabled
}

export interface EnhancedPosition {
  id: string;
  protocol: string;
  strategy: string;
  token: string;
  tokenAddress: Address;
  
  // Entry data
  entryAmount: number;           // Amount deposited
  entryPrice: number;            // USD price at entry
  entryValueUsd: number;         // Total USD value at entry
  entryTime: number;             // Timestamp
  
  // Current data
  currentAmount: number;         // Current amount (with interest)
  currentPrice: number;          // Current USD price
  currentValueUsd: number;       // Current USD value
  apy: number;                   // Current APY
  
  // P&L
  unrealizedPnL: number;         // Dollar P&L
  unrealizedPnLPercent: number;  // Percentage P&L
  earnedInterest: number;        // Interest earned
}

export interface TradingAction {
  type: 'ENTER' | 'EXIT' | 'HOLD' | 'REBALANCE';
  reason: string;
  position?: EnhancedPosition;
  opportunity?: any;
  timestamp: number;
  txHash?: string;
}

export interface TradingCycleResult {
  success: boolean;
  actions: TradingAction[];
  positionsChecked: number;
  opportunitiesScanned: number;
  error?: string;
}

// ==========================================
// TRADING STRATEGY MANAGER
// ==========================================

export class TradingStrategyManager {
  private strategy: TradingStrategy;
  private positions: EnhancedPosition[] = [];
  private actionHistory: TradingAction[] = [];

  constructor(config?: Partial<TradingStrategy>) {
    this.strategy = {
      takeProfitPercent: 10,      // Take profit at +10%
      stopLossPercent: 5,         // Stop loss at -5%
      minApyThreshold: 2,         // Minimum 2% APY to enter
      rebalanceThreshold: 3,      // Rebalance if APY improves by 3%+
      maxPositionSizeEth: 1,      // Max 1 ETH per position
      enabled: false,             // Disabled by default for safety
      ...config,
    };
  }

  // ==========================================
  // STRATEGY CONFIGURATION
  // ==========================================

  getStrategy(): TradingStrategy {
    return { ...this.strategy };
  }

  setStrategy(updates: Partial<TradingStrategy>): TradingStrategy {
    this.strategy = { ...this.strategy, ...updates };
    console.log('📊 Trading strategy updated:', this.strategy);
    return this.strategy;
  }

  enableAutonomousTrading(): void {
    this.strategy.enabled = true;
    console.log('🤖 Autonomous trading ENABLED');
  }

  disableAutonomousTrading(): void {
    this.strategy.enabled = false;
    console.log('⏸️ Autonomous trading DISABLED');
  }

  // ==========================================
  // POSITION MANAGEMENT
  // ==========================================

  addPosition(position: Omit<EnhancedPosition, 'id' | 'unrealizedPnL' | 'unrealizedPnLPercent'>): EnhancedPosition {
    const id = `${position.protocol}-${position.token}-${Date.now()}`;
    const enhanced: EnhancedPosition = {
      ...position,
      id,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
    };
    this.positions.push(enhanced);
    return enhanced;
  }

  removePosition(id: string): void {
    this.positions = this.positions.filter(p => p.id !== id);
  }

  getPositions(): EnhancedPosition[] {
    return [...this.positions];
  }

  // ==========================================
  // P&L CALCULATIONS
  // ==========================================

  updatePrices(priceMap: Record<string, number>): void {
    for (const position of this.positions) {
      const newPrice = priceMap[position.token] || position.currentPrice;
      position.currentPrice = newPrice;
      position.currentValueUsd = position.currentAmount * newPrice;
      position.unrealizedPnL = position.currentValueUsd - position.entryValueUsd;
      position.unrealizedPnLPercent = (position.unrealizedPnL / position.entryValueUsd) * 100;
    }
  }

  calculatePortfolioPnL(): {
    totalEntryValue: number;
    totalCurrentValue: number;
    totalPnL: number;
    totalPnLPercent: number;
  } {
    const totalEntryValue = this.positions.reduce((sum, p) => sum + p.entryValueUsd, 0);
    const totalCurrentValue = this.positions.reduce((sum, p) => sum + p.currentValueUsd, 0);
    const totalPnL = totalCurrentValue - totalEntryValue;
    const totalPnLPercent = totalEntryValue > 0 ? (totalPnL / totalEntryValue) * 100 : 0;

    return { totalEntryValue, totalCurrentValue, totalPnL, totalPnLPercent };
  }

  // ==========================================
  // TRADING DECISIONS
  // ==========================================

  shouldTakeProfit(position: EnhancedPosition): boolean {
    return position.unrealizedPnLPercent >= this.strategy.takeProfitPercent;
  }

  shouldStopLoss(position: EnhancedPosition): boolean {
    return position.unrealizedPnLPercent <= -this.strategy.stopLossPercent;
  }

  shouldEnter(apy: number, _currentPositionCount: number): boolean {
    if (!this.strategy.enabled) return false;
    if (apy < this.strategy.minApyThreshold) return false;
    // Could add more complex logic here (max positions, etc.)
    return true;
  }

  shouldRebalance(currentApy: number, newApy: number): boolean {
    const improvement = newApy - currentApy;
    return improvement >= this.strategy.rebalanceThreshold;
  }

  // ==========================================
  // DECISION ENGINE
  // ==========================================

  analyzePosition(position: EnhancedPosition): TradingAction {
    // Check take profit
    if (this.shouldTakeProfit(position)) {
      return {
        type: 'EXIT',
        reason: `Take profit triggered: +${position.unrealizedPnLPercent.toFixed(2)}% (threshold: ${this.strategy.takeProfitPercent}%)`,
        position,
        timestamp: Date.now(),
      };
    }

    // Check stop loss
    if (this.shouldStopLoss(position)) {
      return {
        type: 'EXIT',
        reason: `Stop loss triggered: ${position.unrealizedPnLPercent.toFixed(2)}% (threshold: -${this.strategy.stopLossPercent}%)`,
        position,
        timestamp: Date.now(),
      };
    }

    // Hold
    return {
      type: 'HOLD',
      reason: `Position healthy: P&L ${position.unrealizedPnLPercent.toFixed(2)}%, APY ${position.apy}%`,
      position,
      timestamp: Date.now(),
    };
  }

  analyzeOpportunity(opportunity: any, _hasExistingPosition: boolean): TradingAction | null {
    if (!this.strategy.enabled) return null;
    
    if (opportunity.apy >= this.strategy.minApyThreshold) {
      return {
        type: 'ENTER',
        reason: `Good opportunity: ${opportunity.protocol} ${opportunity.strategy} @ ${opportunity.apy}% APY`,
        opportunity,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  // ==========================================
  // ACTION HISTORY
  // ==========================================

  recordAction(action: TradingAction): void {
    this.actionHistory.push(action);
    // Keep last 100 actions
    if (this.actionHistory.length > 100) {
      this.actionHistory = this.actionHistory.slice(-100);
    }
  }

  getActionHistory(limit: number = 20): TradingAction[] {
    return this.actionHistory.slice(-limit);
  }

  // ==========================================
  // TRADING CYCLE EXECUTION
  // ==========================================

  /**
   * Run a complete trading cycle
   * @param callbacks - Functions to execute actual trades
   */
  async runTradingCycle(callbacks: {
    getOpportunities: () => Promise<any[]>;
    exitPosition: (position: EnhancedPosition) => Promise<{ success: boolean; txHash?: string }>;
    enterPosition: (opportunity: any, amountEth: string) => Promise<{ success: boolean; txHash?: string }>;
    updatePrices?: () => Promise<Record<string, number>>;
  }): Promise<TradingCycleResult> {
    const actions: TradingAction[] = [];

    try {
      console.log('🔄 Starting trading cycle...');

      // Step 1: Update prices if callback provided
      if (callbacks.updatePrices) {
        const prices = await callbacks.updatePrices();
        this.updatePrices(prices);
        console.log('💰 Prices updated');
      }

      // Step 2: Check existing positions for exit signals
      console.log(`📊 Checking ${this.positions.length} positions...`);
      for (const position of this.positions) {
        const decision = this.analyzePosition(position);
        
        if (decision.type === 'EXIT' && this.strategy.enabled) {
          console.log(`🚨 ${decision.reason}`);
          
          // Execute exit
          const result = await callbacks.exitPosition(position);
          if (result.success) {
            decision.txHash = result.txHash;
            this.removePosition(position.id);
            console.log(`✅ Exited position: ${result.txHash}`);
          }
        }
        
        actions.push(decision);
        this.recordAction(decision);
      }

      // Step 3: Look for new opportunities
      const opportunities = await callbacks.getOpportunities();
      console.log(`🔍 Found ${opportunities.length} opportunities`);

      // Step 4: Enter best opportunity if strategy is enabled
      if (this.strategy.enabled && this.positions.length === 0) {
        const bestOpp = opportunities
          .filter(o => o.apy >= this.strategy.minApyThreshold)
          .sort((a, b) => b.apy - a.apy)[0];

        if (bestOpp) {
          const enterAction: TradingAction = {
            type: 'ENTER',
            reason: `Entering ${bestOpp.protocol} ${bestOpp.strategy} @ ${bestOpp.apy}% APY`,
            opportunity: bestOpp,
            timestamp: Date.now(),
          };

          const amountEth = Math.min(this.strategy.maxPositionSizeEth, 0.1).toString();
          const result = await callbacks.enterPosition(bestOpp, amountEth);
          
          if (result.success) {
            enterAction.txHash = result.txHash;
            console.log(`✅ Entered position: ${result.txHash}`);
          }

          actions.push(enterAction);
          this.recordAction(enterAction);
        }
      }

      console.log(`✅ Trading cycle complete: ${actions.length} actions`);

      return {
        success: true,
        actions,
        positionsChecked: this.positions.length,
        opportunitiesScanned: opportunities.length,
      };
    } catch (error: any) {
      console.error('❌ Trading cycle failed:', error.message);
      return {
        success: false,
        actions,
        positionsChecked: this.positions.length,
        opportunitiesScanned: 0,
        error: error.message,
      };
    }
  }
}

// ==========================================
// SIMPLE PRICE FETCHER (Mock for now)
// ==========================================

export async function fetchTokenPrices(): Promise<Record<string, number>> {
  // In production, fetch from CoinGecko, Chainlink, or similar
  // For now, return reasonable mock prices
  return {
    'ETH': 2500,
    'WETH': 2500,
    'USDC': 1,
    'USDbC': 1,
    'DAI': 1,
    'cbETH': 2600,
  };
}

export default TradingStrategyManager;
