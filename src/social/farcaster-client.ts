// farcaster-client.ts - Farcaster API Client for LobsterSage (via Neynar)

import {
  FarcasterConfig,
  PredictionData,
  PredictionResult,
  YieldUpdate,
  PortfolioSummary,
  Cast,
  Mention,
} from './types';
import { contentGenerator } from './content-templates';

// Neynar API response types
interface NeynarCastResponse {
  cast: {
    hash: string;
    text: string;
    author: {
      fid: number;
      username: string;
      display_name: string;
    };
    timestamp: string;
    reactions?: {
      likes_count: number;
      recasts_count: number;
    };
    replies?: {
      count: number;
    };
  };
  success: boolean;
}

interface NeynarFeedResponse {
  casts: {
    hash: string;
    text: string;
    author: {
      fid: number;
      username: string;
      display_name: string;
    };
    timestamp: string;
    parent_hash?: string;
  }[];
  next?: {
    cursor: string;
  };
}

interface NeynarNotificationsResponse {
  notifications: {
    hash: string;
    text: string;
    author: {
      fid: number;
      username: string;
    };
    timestamp: string;
    type: 'mention' | 'reply' | 'like' | 'recast';
  }[];
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export class FarcasterClient {
  private config: FarcasterConfig;
  private baseUrl = 'https://api.neynar.com/v2';
  private lastRateLimit: RateLimitInfo | null = null;

  constructor(config: FarcasterConfig) {
    this.config = config;
  }

  /**
   * Get auth headers for API requests
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.config.apiKey, // Neynar uses x-api-key or api_key
      'Content-Type': 'application/json',
    };
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimit(headers: Headers): void {
    this.lastRateLimit = {
      limit: parseInt(headers.get('x-ratelimit-limit') || '0'),
      remaining: parseInt(headers.get('x-ratelimit-remaining') || '0'),
      reset: parseInt(headers.get('x-ratelimit-reset') || '0'),
    };
  }

  /**
   * Check if we're rate limited
   */
  isRateLimited(): boolean {
    if (!this.lastRateLimit) return false;
    return this.lastRateLimit.remaining <= 0;
  }

  /**
   * Get time until rate limit resets
   */
  getRateLimitResetTime(): number | null {
    if (!this.lastRateLimit) return null;
    return Math.max(0, this.lastRateLimit.reset - Math.floor(Date.now() / 1000));
  }

  /**
   * Post a cast (Farcaster equivalent of a tweet)
   */
  async postCast(cast: Cast): Promise<{ hash: string; text: string }> {
    const url = `${this.baseUrl}/farcaster/cast`;

    const payload: Record<string, unknown> = {
      signer_uuid: this.config.signerUuid,
      text: cast.text,
    };

    if (cast.parent) {
      payload.parent = cast.parent;
    }

    if (cast.embeds && cast.embeds.length > 0) {
      payload.embeds = cast.embeds.map(url => ({ url }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    this.updateRateLimit(response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Neynar API error: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as NeynarCastResponse;
    return {
      hash: data.cast.hash,
      text: data.cast.text,
    };
  }

  /**
   * Cast a prediction announcement
   */
  async castPrediction(
    prediction: PredictionData,
    txUrl?: string
  ): Promise<{ hash: string; text: string }> {
    const text = contentGenerator.predictionAnnouncement(prediction, txUrl);
    const embeds = txUrl ? [txUrl] : undefined;
    return this.postCast({ text, embeds });
  }

  /**
   * Cast a prediction result
   */
  async castPredictionResult(
    result: PredictionResult,
    txUrl?: string
  ): Promise<{ hash: string; text: string }> {
    const text = contentGenerator.predictionResult(result, txUrl);
    const embeds = txUrl ? [txUrl] : undefined;
    return this.postCast({ text, embeds });
  }

  /**
   * Cast a yield update
   */
  async castYieldUpdate(update: YieldUpdate): Promise<{ hash: string; text: string }> {
    const text = contentGenerator.yieldUpdate(update);
    const embeds = update.url ? [update.url] : undefined;
    return this.postCast({ text, embeds });
  }

  /**
   * Cast a portfolio summary
   */
  async castPortfolioSummary(summary: PortfolioSummary): Promise<{ hash: string; text: string }> {
    const text = contentGenerator.dailySummary(summary);
    return this.postCast({ text });
  }

  /**
   * Post a thread (multiple connected casts)
   */
  async postThread(casts: string[]): Promise<{ hash: string; text: string }[]> {
    const results: { hash: string; text: string }[] = [];
    let lastCastHash: string | undefined;

    for (const text of casts) {
      const result = await this.postCast({
        text,
        parent: lastCastHash,
      });
      results.push(result);
      lastCastHash = result.hash;
    }

    return results;
  }

  /**
   * Get mentions and notifications
   */
  async getMentions(maxResults = 25): Promise<Mention[]> {
    const url = new URL(`${this.baseUrl}/farcaster/notifications`);
    url.searchParams.append('fid', this.config.fid.toString());
    url.searchParams.append('type', 'mentions,replies');
    url.searchParams.append('limit', maxResults.toString());

    const response = await fetch(url.toString(), {
      headers: this.getAuthHeaders(),
    });

    this.updateRateLimit(response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Neynar API error: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as NeynarNotificationsResponse;

    return data.notifications
      .filter(n => n.type === 'mention' || n.type === 'reply')
      .map(n => ({
        id: n.hash,
        author: n.author.username,
        text: n.text,
        timestamp: new Date(n.timestamp),
        platform: 'farcaster',
      }));
  }

  /**
   * Reply to a cast
   */
  async replyToCast(
    parentHash: string,
    sentiment: 'positive' | 'neutral' | 'negative' | 'question'
  ): Promise<{ hash: string; text: string }> {
    const text = contentGenerator.engagementResponse('', sentiment);
    return this.postCast({
      text,
      parent: parentHash,
    });
  }

  /**
   * Delete a cast
   */
  async deleteCast(castHash: string): Promise<void> {
    const url = `${this.baseUrl}/farcaster/cast`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        signer_uuid: this.config.signerUuid,
        target_hash: castHash,
      }),
    });

    this.updateRateLimit(response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Neynar API error: ${JSON.stringify(error)}`);
    }
  }

  /**
   * Get user feed (recent casts)
   */
  async getUserFeed(fid?: number, limit = 25): Promise<{ hash: string; text: string; timestamp: Date }[]> {
    const targetFid = fid || this.config.fid;
    const url = new URL(`${this.baseUrl}/farcaster/feed/user/${targetFid}`);
    url.searchParams.append('limit', limit.toString());

    const response = await fetch(url.toString(), {
      headers: this.getAuthHeaders(),
    });

    this.updateRateLimit(response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Neynar API error: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as NeynarFeedResponse;

    return data.casts.map(cast => ({
      hash: cast.hash,
      text: cast.text,
      timestamp: new Date(cast.timestamp),
    }));
  }

  /**
   * Get cast by hash
   */
  async getCast(castHash: string): Promise<{ hash: string; text: string; author: string }> {
    const url = new URL(`${this.baseUrl}/farcaster/cast`);
    url.searchParams.append('identifier', castHash);
    url.searchParams.append('type', 'hash');

    const response = await fetch(url.toString(), {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Neynar API error: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as NeynarCastResponse;
    return {
      hash: data.cast.hash,
      text: data.cast.text,
      author: data.cast.author.username,
    };
  }

  /**
   * Format transaction link for Farcaster
   */
  formatTransactionLink(
    txHash: string,
    chain: 'ethereum' | 'base' | 'arbitrum' | 'optimism' = 'base'
  ): string {
    return contentGenerator.formatTransactionLink(txHash, chain);
  }

  /**
   * Search casts
   */
  async searchCasts(query: string, limit = 25): Promise<{ hash: string; text: string; author: string }[]> {
    const url = new URL(`${this.baseUrl}/farcaster/cast/search`);
    url.searchParams.append('q', query);
    url.searchParams.append('limit', limit.toString());

    const response = await fetch(url.toString(), {
      headers: this.getAuthHeaders(),
    });

    this.updateRateLimit(response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Neynar API error: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as NeynarFeedResponse;

    return data.casts.map(cast => ({
      hash: cast.hash,
      text: cast.text,
      author: cast.author.username,
    }));
  }
}
