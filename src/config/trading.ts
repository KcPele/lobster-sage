/**
 * Centralized Trading Constants
 *
 * All tunable numeric parameters that were previously hardcoded across
 * optimizer, defiOperations, tradingStrategy, and apy-aggregator.
 * Persists to data/trading-config.json so changes survive restarts.
 */
import { saveJson, loadJson } from '../utils/persistence';

export interface TradingConstants {
  gas: {
    reserveEth: string;       // ETH kept for gas (e.g., "0.01")
    costEstimateUsd: number;  // Estimated gas cost in USD for rebalance
  };
  dust: {
    minUsdcRaw: string;       // Minimum USDC (raw bigint string) to trigger swap
    minEthWei: string;        // Minimum ETH (wei string) to wrap/swap
    minWethWei: string;       // Minimum WETH (wei string) to swap
  };
  slippage: {
    defaultPercent: number;   // Default slippage for swaps (e.g., 1)
    maxPercent: number;       // Max allowed slippage
  };
  rebalance: {
    breakEvenDays: number;    // Max days for gas to pay off
    topOpportunities: number; // How many top opps to pick
  };
  apy: {
    cacheTtlMs: number;       // APY cache duration
    fallbacks: Record<string, number>; // Fallback APYs when API fails
  };
  entry: {
    defaultSizeEth: number;   // Default position entry size
    minApy: number;           // Minimum APY to consider entering
  };
  confidence: {
    marketSkipThreshold: number; // Skip entry when market wait confidence > this
  };
  stopLoss: {
    bearishTighteningPercent: number; // Tighten stop-loss by this % in bearish markets
  };
  history: {
    maxActions: number;       // Max trading actions to keep in history
  };
}

const DEFAULT_CONSTANTS: TradingConstants = {
  gas: {
    reserveEth: '0.01',
    costEstimateUsd: 0.5,
  },
  dust: {
    minUsdcRaw: '1000000',          // 1 USDC
    minEthWei: '20000000000000000',  // 0.02 ETH
    minWethWei: '100000000000000',   // 0.0001 WETH
  },
  slippage: {
    defaultPercent: 1,
    maxPercent: 3,
  },
  rebalance: {
    breakEvenDays: 7,
    topOpportunities: 3,
  },
  apy: {
    cacheTtlMs: 2 * 60 * 1000,
    fallbacks: {
      USDC: 3.5,
      WETH: 1.8,
      DAI: 3.0,
      cbETH: 2.5,
    },
  },
  entry: {
    defaultSizeEth: 0.1,
    minApy: 1.0,
  },
  confidence: {
    marketSkipThreshold: 70,
  },
  stopLoss: {
    bearishTighteningPercent: 30,
  },
  history: {
    maxActions: 100,
  },
};

const PERSISTENCE_FILE = 'trading-config.json';

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

let instance: TradingConstants | null = null;

export function getTradingConstants(): TradingConstants {
  if (!instance) {
    const saved = loadJson<Partial<TradingConstants>>(PERSISTENCE_FILE, {});
    instance = deepMerge(DEFAULT_CONSTANTS, saved) as TradingConstants;
  }
  return instance!;
}

export function updateTradingConstants(partial: Partial<TradingConstants>): TradingConstants {
  const current = getTradingConstants();
  instance = deepMerge(current, partial) as TradingConstants;
  saveJson(PERSISTENCE_FILE, instance);
  console.log('Trading constants updated and persisted');
  return instance!;
}

export function resetTradingConstants(): TradingConstants {
  instance = { ...DEFAULT_CONSTANTS };
  saveJson(PERSISTENCE_FILE, instance);
  return instance;
}
