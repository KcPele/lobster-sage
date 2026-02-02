// types.ts - Social Layer Types for LobsterSage

export interface TwitterConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

export interface FarcasterConfig {
  apiKey: string;
  signerUuid: string;
  fid: number;
}

export interface PredictionData {
  id: string;
  asset: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timeframe: string;
  reasoning: string;
  entryPrice?: number;
  targetPrice?: number;
  timestamp: Date;
}

export interface PredictionResult {
  predictionId: string;
  asset: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  result: 'win' | 'loss' | 'pending';
  pnl: number;
  exitPrice?: number;
  timestamp: Date;
}

export interface YieldUpdate {
  protocol: string;
  apy: number;
  tvl: number;
  token: string;
  chain: string;
  strategy: string;
  timestamp: Date;
  url?: string;
}

export interface PortfolioSummary {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  activePositions: number;
  bestPerformer: {
    asset: string;
    change: number;
  };
  worstPerformer: {
    asset: string;
    change: number;
  };
  timestamp: Date;
}

export interface SocialPost {
  text: string;
  media?: string[];
  replyTo?: string;
  quoteTweet?: string;
}

export interface Cast {
  text: string;
  embeds?: string[];
  parent?: string;
  mentions?: string[];
}

export interface Mention {
  id: string;
  author: string;
  text: string;
  timestamp: Date;
  platform: 'twitter' | 'farcaster';
}

export interface EngagementResponse {
  id: string;
  platform: 'twitter' | 'farcaster';
  responseText: string;
  originalPostId: string;
  timestamp: Date;
}

export type ContentType = 
  | 'prediction_announcement'
  | 'prediction_result'
  | 'yield_update'
  | 'daily_summary'
  | 'engagement_response';
