/**
 * Performance Tracker — records closed trades and equity snapshots
 * to calculate win rate, Sharpe ratio, max drawdown, and profit factor.
 * Persists to data/performance.json.
 */
import { saveJson, loadJson } from '../utils/persistence';

export interface ClosedTrade {
  id: string;
  protocol: string;
  token: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  pnl: number;        // USD
  pnlPercent: number;
  holdTimeMs: number;
}

export interface EquitySnapshot {
  timestamp: number;
  totalValueEth: number;
}

interface PerformanceData {
  trades: ClosedTrade[];
  equitySnapshots: EquitySnapshot[];
}

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number;           // 0-100%
  avgWinPercent: number;
  avgLossPercent: number;
  profitFactor: number;      // gross profit / gross loss
  maxDrawdownPercent: number;
  sharpeRatio: number;
  bestTrade: { pnlPercent: number; token: string } | null;
  worstTrade: { pnlPercent: number; token: string } | null;
  avgHoldTimeHours: number;
  totalPnlUsd: number;
}

const PERSISTENCE_FILE = 'performance.json';
const MAX_EQUITY_SNAPSHOTS = 365; // ~1 year of daily snapshots

export class PerformanceTracker {
  private data: PerformanceData;

  constructor() {
    this.data = loadJson<PerformanceData>(PERSISTENCE_FILE, {
      trades: [],
      equitySnapshots: [],
    });
  }

  recordClosedPosition(params: {
    id: string;
    protocol: string;
    token: string;
    entryPrice: number;
    exitPrice: number;
    entryTime: number;
    pnl: number;
    pnlPercent: number;
  }): void {
    const now = Date.now();
    this.data.trades.push({
      ...params,
      exitTime: now,
      holdTimeMs: now - params.entryTime,
    });
    this.save();
  }

  recordEquitySnapshot(totalValueEth: number): void {
    this.data.equitySnapshots.push({
      timestamp: Date.now(),
      totalValueEth,
    });
    // Trim old snapshots
    if (this.data.equitySnapshots.length > MAX_EQUITY_SNAPSHOTS) {
      this.data.equitySnapshots = this.data.equitySnapshots.slice(-MAX_EQUITY_SNAPSHOTS);
    }
    this.save();
  }

  getMetrics(): PerformanceMetrics {
    const trades = this.data.trades;

    if (trades.length === 0) {
      return {
        totalTrades: 0, winRate: 0, avgWinPercent: 0, avgLossPercent: 0,
        profitFactor: 0, maxDrawdownPercent: 0, sharpeRatio: 0,
        bestTrade: null, worstTrade: null, avgHoldTimeHours: 0, totalPnlUsd: 0,
      };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    const winRate = (wins.length / trades.length) * 100;

    const avgWinPercent = wins.length > 0
      ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length
      : 0;

    const avgLossPercent = losses.length > 0
      ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length
      : 0;

    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const totalPnlUsd = trades.reduce((s, t) => s + t.pnl, 0);

    const avgHoldTimeHours = trades.reduce((s, t) => s + t.holdTimeMs, 0) / trades.length / 3600000;

    // Best / worst
    const sorted = [...trades].sort((a, b) => b.pnlPercent - a.pnlPercent);
    const bestTrade = { pnlPercent: sorted[0].pnlPercent, token: sorted[0].token };
    const worstTrade = { pnlPercent: sorted[sorted.length - 1].pnlPercent, token: sorted[sorted.length - 1].token };

    // Max drawdown from equity snapshots
    const maxDrawdownPercent = this.calculateMaxDrawdown();

    // Sharpe ratio from trade returns (annualized)
    const sharpeRatio = this.calculateSharpe(trades);

    return {
      totalTrades: trades.length,
      winRate: Number(winRate.toFixed(1)),
      avgWinPercent: Number(avgWinPercent.toFixed(2)),
      avgLossPercent: Number(avgLossPercent.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
      sharpeRatio: Number(sharpeRatio.toFixed(2)),
      bestTrade,
      worstTrade,
      avgHoldTimeHours: Number(avgHoldTimeHours.toFixed(1)),
      totalPnlUsd: Number(totalPnlUsd.toFixed(2)),
    };
  }

  private calculateMaxDrawdown(): number {
    const snaps = this.data.equitySnapshots;
    if (snaps.length < 2) return 0;

    let peak = snaps[0].totalValueEth;
    let maxDrawdown = 0;

    for (const snap of snaps) {
      if (snap.totalValueEth > peak) {
        peak = snap.totalValueEth;
      }
      const drawdown = peak > 0 ? ((peak - snap.totalValueEth) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private calculateSharpe(trades: ClosedTrade[]): number {
    if (trades.length < 2) return 0;

    const returns = trades.map(t => t.pnlPercent);
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize: assume ~1 trade per day
    return (mean / stdDev) * Math.sqrt(365);
  }

  private save(): void {
    saveJson(PERSISTENCE_FILE, this.data);
  }
}

let instance: PerformanceTracker | null = null;
export function getPerformanceTracker(): PerformanceTracker {
  if (!instance) instance = new PerformanceTracker();
  return instance;
}
