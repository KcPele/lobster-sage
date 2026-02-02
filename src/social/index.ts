// index.ts - Social Layer exports for LobsterSage

export { TwitterClient } from './twitter-client';
export { FarcasterClient } from './farcaster-client';
export { ContentGenerator, contentGenerator } from './content-templates';

export type {
  TwitterConfig,
  FarcasterConfig,
  PredictionData,
  PredictionResult,
  YieldUpdate,
  PortfolioSummary,
  SocialPost,
  Cast,
  Mention,
  EngagementResponse,
  ContentType,
} from './types';
