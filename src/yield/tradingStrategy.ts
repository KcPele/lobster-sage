/** Trading Strategy & Autonomous Trading Loop */
import { type Address } from 'viem';
import { getCoinGecko, BASE_TOKEN_IDS } from '../data/coingecko';
import { saveJson, loadJson } from '../utils/persistence';
import { getTradingConstants } from '../config/trading';
import { getPerformanceTracker } from './performanceTracker';
import type { MarketSnapshot } from '../lobster/MarketAnalyzer';

export interface TradingStrategy {
  takeProfitPercent: number;     // Exit when up by this % (e.g., 10 = +10%)
  stopLossPercent: number;       // Exit when down by this % (e.g., 5 = -5%)
  minApyThreshold: number;       // Minimum APY to consider entering (e.g., 2%)
  rebalanceThreshold: number;    // APY improvement needed to rebalance (e.g., 3%)
  maxPositionSizeEth: number;    // Max position size in ETH
  enabled: boolean;              // Whether autonomous trading is enabled
  mode?: TradingMode;            // Current trading mode
}

// Trading modes for different market conditions
export type TradingMode = 'conservative' | 'aggressive' | 'capitulation-fishing';

// Preset configurations for each trading mode
export const MODE_PRESETS: Record<TradingMode, Partial<TradingStrategy>> = {
  conservative: {
    takeProfitPercent: 8,
    stopLossPercent: 3,
    minApyThreshold: 3,
    maxPositionSizeEth: 0.5,
    rebalanceThreshold: 4,
  },
  aggressive: {
    takeProfitPercent: 15,
    stopLossPercent: 8,
    minApyThreshold: 1,
    maxPositionSizeEth: 2,
    rebalanceThreshold: 2,
  },
  'capitulation-fishing': {
    takeProfitPercent: 25,
    stopLossPercent: 15,
    minApyThreshold: 0,  // Enter regardless of APY during capitulation
    maxPositionSizeEth: 0.3,
    rebalanceThreshold: 1,
  },
};

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

  // Trailing stop
  highWaterMark: number;         // Peak price since entry
  trailingStopPercent: number;   // Trailing stop distance from peak
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

export class TradingStrategyManager {
  private strategy: TradingStrategy;
  private positions: EnhancedPosition[] = [];
  private actionHistory: TradingAction[] = [];

  constructor(config?: Partial<TradingStrategy>) {
    this.strategy = {
      takeProfitPercent: 10,
      stopLossPercent: 5,
      minApyThreshold: 2,
      rebalanceThreshold: 3,
      maxPositionSizeEth: 1,
      enabled: true,
      ...config,
    };
    // Load persisted state
    this.positions = loadJson<EnhancedPosition[]>('trading-positions.json', []);
    this.actionHistory = loadJson<TradingAction[]>('trading-history.json', []);
  }


  getStrategy(): TradingStrategy {
    return { ...this.strategy };
  }

  setStrategy(updates: Partial<TradingStrategy>): TradingStrategy {
    this.strategy = { ...this.strategy, ...updates };
    console.log('📊 Trading strategy updated:', this.strategy);
    return this.strategy;
  }

  /**
   * Set trading mode (applies preset configuration)
   */
  setMode(mode: TradingMode): TradingStrategy {
    const preset = MODE_PRESETS[mode];
    if (!preset) {
      throw new Error(`Unknown trading mode: ${mode}. Valid modes: conservative, aggressive, capitulation-fishing`);
    }
    
    this.strategy = { 
      ...this.strategy, 
      ...preset, 
      mode 
    };
    
    console.log(`🎯 Trading mode set to: ${mode}`);
    return this.strategy;
  }

  /**
   * Get current trading mode
   */
  getMode(): TradingMode | undefined {
    return this.strategy.mode;
  }

  enableAutonomousTrading(): void {
    this.strategy.enabled = true;
    console.log('🤖 Autonomous trading ENABLED');
  }

  disableAutonomousTrading(): void {
    this.strategy.enabled = false;
    console.log('⏸️ Autonomous trading DISABLED');
  }


  addPosition(position: Omit<EnhancedPosition, 'id' | 'unrealizedPnL' | 'unrealizedPnLPercent' | 'highWaterMark' | 'trailingStopPercent'>): EnhancedPosition {
    const id = `${position.protocol}-${position.token}-${Date.now()}`;
    const enhanced: EnhancedPosition = {
      ...position,
      id,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      highWaterMark: position.currentPrice,
      trailingStopPercent: this.strategy.stopLossPercent,
    };
    this.positions.push(enhanced);
    saveJson('trading-positions.json', this.positions);
    return enhanced;
  }

  removePosition(id: string): void {
    const pos = this.positions.find(p => p.id === id);
    if (pos) {
      getPerformanceTracker().recordClosedPosition({
        id: pos.id,
        protocol: pos.protocol,
        token: pos.token,
        entryPrice: pos.entryPrice,
        exitPrice: pos.currentPrice,
        entryTime: pos.entryTime,
        pnl: pos.unrealizedPnL,
        pnlPercent: pos.unrealizedPnLPercent,
      });
    }
    this.positions = this.positions.filter(p => p.id !== id);
    saveJson('trading-positions.json', this.positions);
  }

  getPositions(): EnhancedPosition[] {
    return [...this.positions];
  }


  updatePrices(priceMap: Record<string, number>): void {
    for (const position of this.positions) {
      const newPrice = priceMap[position.token] || position.currentPrice;
      position.currentPrice = newPrice;
      position.currentValueUsd = position.currentAmount * newPrice;
      position.unrealizedPnL = position.currentValueUsd - position.entryValueUsd;
      position.unrealizedPnLPercent = (position.unrealizedPnL / position.entryValueUsd) * 100;

      // Update trailing stop high-water mark
      if (newPrice > (position.highWaterMark || 0)) {
        position.highWaterMark = newPrice;
      }
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


  shouldTakeProfit(position: EnhancedPosition): boolean {
    return position.unrealizedPnLPercent >= this.strategy.takeProfitPercent;
  }

  shouldStopLoss(position: EnhancedPosition, marketRegime?: string): boolean {
    let threshold = this.strategy.stopLossPercent;
    // Tighten stop-loss in bearish/volatile markets
    if (marketRegime === 'bearish' || marketRegime === 'volatile') {
      threshold *= 1 - getTradingConstants().stopLoss.bearishTighteningPercent / 100;
    }

    // Fixed stop-loss from entry
    if (position.unrealizedPnLPercent <= -threshold) return true;

    // Trailing stop-loss from peak
    if (position.highWaterMark > 0 && position.currentPrice > 0) {
      const trailingPercent = position.trailingStopPercent || threshold;
      const dropFromPeak = ((position.highWaterMark - position.currentPrice) / position.highWaterMark) * 100;
      if (dropFromPeak >= trailingPercent) return true;
    }

    return false;
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


  analyzePosition(position: EnhancedPosition, marketRegime?: string): TradingAction {
    if (this.shouldTakeProfit(position)) {
      return {
        type: 'EXIT',
        reason: `Take profit triggered: +${position.unrealizedPnLPercent.toFixed(2)}% (threshold: ${this.strategy.takeProfitPercent}%)`,
        position,
        timestamp: Date.now(),
      };
    }

    if (this.shouldStopLoss(position, marketRegime)) {
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


  recordAction(action: TradingAction): void {
    this.actionHistory.push(action);
    const maxActions = getTradingConstants().history.maxActions;
    if (this.actionHistory.length > maxActions) {
      this.actionHistory = this.actionHistory.slice(-maxActions);
    }
    saveJson('trading-history.json', this.actionHistory);
  }

  getActionHistory(limit: number = 20): TradingAction[] {
    return this.actionHistory.slice(-limit);
  }

  /** Run a complete trading cycle */
  async runTradingCycle(callbacks: {
    getOpportunities: () => Promise<any[]>;
    exitPosition: (position: EnhancedPosition) => Promise<{ success: boolean; txHash?: string }>;
    enterPosition: (opportunity: any, amountEth: string) => Promise<{ success: boolean; txHash?: string }>;
    updatePrices?: () => Promise<Record<string, number>>;
    getMarketSnapshot?: () => Promise<MarketSnapshot>;
  }): Promise<TradingCycleResult> {
    const actions: TradingAction[] = [];

    try {
      console.log('Starting trading cycle...');

      // Step 1: Update prices
      if (callbacks.updatePrices) {
        const prices = await callbacks.updatePrices();
        this.updatePrices(prices);
      }

      // Step 1.5: Get market context
      let marketSnapshot: MarketSnapshot | null = null;
      if (callbacks.getMarketSnapshot) {
        try {
          marketSnapshot = await callbacks.getMarketSnapshot();
          console.log(`Market regime: ${marketSnapshot.regime}, action: ${marketSnapshot.recommendedAction}, confidence: ${marketSnapshot.confidence}%`);
        } catch (e) {
          console.warn('Could not fetch market snapshot, proceeding without');
        }
      }

      // Step 2: Check existing positions for exit signals
      for (const position of this.positions) {
        const decision = this.analyzePosition(position, marketSnapshot?.regime);

        if (decision.type === 'EXIT' && this.strategy.enabled) {
          const result = await callbacks.exitPosition(position);
          if (result.success) {
            decision.txHash = result.txHash;
            this.removePosition(position.id);
          }
        }

        actions.push(decision);
        this.recordAction(decision);
      }

      // Step 3: Look for new opportunities
      const opportunities = await callbacks.getOpportunities();
      console.log(`Found ${opportunities.length} opportunities`);

      // Step 4: Enter best opportunity (gated by market signals)
      let skipEntry = false;
      if (marketSnapshot) {
        if (marketSnapshot.recommendedAction === 'exit') {
          console.log('Market signals recommend EXIT - skipping new entries');
          skipEntry = true;
          actions.push({ type: 'HOLD', reason: `Market ${marketSnapshot.regime} - signals recommend exit (confidence: ${marketSnapshot.confidence}%)`, timestamp: Date.now() });
        } else if (marketSnapshot.recommendedAction === 'wait' && marketSnapshot.confidence > getTradingConstants().confidence.marketSkipThreshold) {
          console.log('Market signals recommend WAIT (high confidence) - skipping entry');
          skipEntry = true;
          actions.push({ type: 'HOLD', reason: `Market wait signal (confidence: ${marketSnapshot.confidence}%)`, timestamp: Date.now() });
        }
      }

      if (this.strategy.enabled && this.positions.length === 0 && !skipEntry) {
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

          const amountEth = Math.min(this.strategy.maxPositionSizeEth, getTradingConstants().entry.defaultSizeEth).toString();
          const result = await callbacks.enterPosition(bestOpp, amountEth);

          if (result.success) {
            enterAction.txHash = result.txHash;
          }

          actions.push(enterAction);
          this.recordAction(enterAction);
        }
      }

      return {
        success: true,
        actions,
        positionsChecked: this.positions.length,
        opportunitiesScanned: opportunities.length,
      };
    } catch (error: any) {
      console.error('Trading cycle failed:', error.message);
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


export async function fetchTokenPrices(): Promise<Record<string, number>> {
  const coinGecko = getCoinGecko();
  
  // Map internal symbols to CoinGecko IDs
  const symbolToId: Record<string, string> = {
    'ETH': BASE_TOKEN_IDS.ETH || 'ethereum',
    'WETH': BASE_TOKEN_IDS.WETH || 'weth',
    'USDC': BASE_TOKEN_IDS.USDC || 'usd-coin',
    'USDbC': 'bridged-usd-coin-base',
    'DAI': BASE_TOKEN_IDS.DAI || 'dai',
    'cbETH': BASE_TOKEN_IDS.CBETH || 'coinbase-wrapped-staked-eth',
  };

  try {
    const ids = Object.values(symbolToId);
    const prices = await coinGecko.getSimplePrices(ids);
    
    const result: Record<string, number> = {};
    for (const [symbol, id] of Object.entries(symbolToId)) {
      if (prices[id]?.usd) {
        result[symbol] = prices[id].usd;
      } else {
        console.warn(`⚠️ Price missing for ${symbol} (${id})`);
        // Fallback to 0 or safe default? 
        // User asked to remove mock data, so we won't hardcode values.
        result[symbol] = 0;
      }
    }
    return result;
  } catch (error) {
    console.error('❌ Failed to fetch token prices:', error);
    return {};
  }
}

export default TradingStrategyManager;
