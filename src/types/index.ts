// Core Types for LobsterSage

export * from '../sage/types';
export * from '../social/types';

export interface AutonomousConfig {
  predictionInterval: number;  // milliseconds
  yieldCheckInterval: number;  // milliseconds
  socialInterval: number;      // milliseconds
}

export interface PortfolioSummary {
  totalValue: number;
  totalValueChange24h: number;
  activePredictions: number;
  reputationScore: number;
  yieldPositions: number;
  lastUpdate: number;
}

export interface AgentConfig {
  network: string;
  rpcUrl: string;
  contracts: {
    prophecyNFT: string;
    reputation: string;
  };
  wallet: {
    type: 'cdp' | 'privateKey';
  };
  sage: {
    mode: 'autonomous' | 'interactive' | 'test';
    predictionInterval: number;
    yieldRebalanceInterval: number;
    minConfidence: number;
  };
  social: {
    postPredictions: boolean;
    postYieldReports: boolean;
    postDailySummary: boolean;
  };
}
