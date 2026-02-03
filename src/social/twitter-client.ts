// twitter-client.ts - X/Twitter API Client for LobsterSage

import {
  TwitterConfig,
  PredictionData,
  PredictionResult,
  YieldUpdate,
  PortfolioSummary,
  SocialPost,
  Mention,
} from './types';
import { contentGenerator } from './content-templates';

// Twitter API v2 response types
interface TwitterTweetResponse {
  data: {
    id: string;
    text: string;
  };
  errors?: TwitterError[];
}

interface TwitterMentionsResponse {
  data: {
    id: string;
    text: string;
    author_id: string;
    created_at: string;
  }[];
  includes?: {
    users: {
      id: string;
      username: string;
    }[];
  };
  meta: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
  errors?: TwitterError[];
}

interface TwitterError {
  message: string;
  code: number;
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export class TwitterClient {
  private config: TwitterConfig;
  private baseUrl = 'https://api.twitter.com/2';
  private lastRateLimit: RateLimitInfo | null = null;

  constructor(config: TwitterConfig) {
    this.config = config;
  }

  /**
   * Get auth headers for API requests
   */
  private getAuthHeaders(): Record<string, string> {
    // In production, use OAuth 2.0 or OAuth 1.0a properly
    // This is a simplified version - use twitter-api-v2 SDK in production
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimit(headers: Headers): void {
    this.lastRateLimit = {
      limit: parseInt(headers.get('x-rate-limit-limit') || '0'),
      remaining: parseInt(headers.get('x-rate-limit-remaining') || '0'),
      reset: parseInt(headers.get('x-rate-limit-reset') || '0'),
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
   * Post a tweet
   */
  async postTweet(post: SocialPost): Promise<{ id: string; text: string }> {
    const url = `${this.baseUrl}/tweets`;

    const payload: Record<string, unknown> = {
      text: post.text,
    };

    if (post.replyTo) {
      payload.reply = {
        in_reply_to_tweet_id: post.replyTo,
      };
    }

    // Note: Media upload requires separate implementation
    // See Twitter API v2 media upload endpoints

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    this.updateRateLimit(response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twitter API error: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as TwitterTweetResponse;
    return {
      id: data.data.id,
      text: data.data.text,
    };
  }

  /**
   * Post a prediction announcement
   */
  async postPrediction(
    prediction: PredictionData,
    txUrl?: string
  ): Promise<{ id: string; text: string }> {
    const text = contentGenerator.predictionAnnouncement(prediction, txUrl);
    return this.postTweet({ text });
  }

  /**
   * Post a prediction result
   */
  async postPredictionResult(
    result: PredictionResult,
    txUrl?: string
  ): Promise<{ id: string; text: string }> {
    const text = contentGenerator.predictionResult(result, txUrl);
    return this.postTweet({ text });
  }

  /**
   * Post a yield update
   */
  async postYieldUpdate(update: YieldUpdate): Promise<{ id: string; text: string }> {
    const text = contentGenerator.yieldUpdate(update);
    return this.postTweet({ text });
  }

  /**
   * Post a daily portfolio summary
   */
  async postDailySummary(summary: PortfolioSummary): Promise<{ id: string; text: string }> {
    const text = contentGenerator.dailySummary(summary);
    return this.postTweet({ text });
  }

  /**
   * Post a thread (multiple connected tweets)
   */
  async postThread(tweets: string[]): Promise<{ id: string; text: string }[]> {
    const results: { id: string; text: string }[] = [];
    let lastTweetId: string | undefined;

    for (const text of tweets) {
      const result = await this.postTweet({
        text,
        replyTo: lastTweetId,
      });
      results.push(result);
      lastTweetId = result.id;
    }

    return results;
  }

  /**
   * Get recent mentions
   */
  async getMentions(maxResults = 10): Promise<Mention[]> {
    // First, get the authenticated user's ID
    const meResponse = await fetch(`${this.baseUrl}/users/me`, {
      headers: this.getAuthHeaders(),
    });

    if (!meResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const meData = (await meResponse.json()) as { data: { id: string } };
    const userId = meData.data.id;

    // Get mentions
    const url = new URL(`${this.baseUrl}/users/${userId}/mentions`);
    url.searchParams.append('max_results', maxResults.toString());
    url.searchParams.append('tweet.fields', 'created_at,author_id');
    url.searchParams.append('expansions', 'author_id');
    url.searchParams.append('user.fields', 'username');

    const response = await fetch(url.toString(), {
      headers: this.getAuthHeaders(),
    });

    this.updateRateLimit(response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twitter API error: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as TwitterMentionsResponse;

    // Map authors to mentions
    const users = new Map(
      data.includes?.users.map(u => [u.id, u.username]) || []
    );

    return data.data.map(tweet => ({
      id: tweet.id,
      author: users.get(tweet.author_id) || tweet.author_id,
      text: tweet.text,
      timestamp: new Date(tweet.created_at),
      platform: 'twitter',
    }));
  }

  /**
   * Reply to a mention
   */
  async replyToMention(
    mentionId: string,
    sentiment: 'positive' | 'neutral' | 'negative' | 'question'
  ): Promise<{ id: string; text: string }> {
    const text = contentGenerator.engagementResponse('', sentiment);
    return this.postTweet({
      text,
      replyTo: mentionId,
    });
  }

  /**
   * Delete a tweet
   */
  async deleteTweet(tweetId: string): Promise<void> {
    const url = `${this.baseUrl}/tweets/${tweetId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    this.updateRateLimit(response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twitter API error: ${JSON.stringify(error)}`);
    }
  }

  /**
   * Get user info
   */
  async getUserInfo(username?: string): Promise<{ id: string; username: string; name: string }> {
    const endpoint = username
      ? `${this.baseUrl}/users/by/username/${username}`
      : `${this.baseUrl}/users/me`;

    const response = await fetch(endpoint, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twitter API error: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as {
      data: { id: string; username: string; name: string };
    };
    return data.data;
  }

  /**
   * Format transaction link for Twitter
   */
  formatTransactionLink(
    txHash: string,
    chain: 'ethereum' | 'base' | 'arbitrum' | 'optimism' = 'base'
  ): string {
    return contentGenerator.formatTransactionLink(txHash, chain);
  }
}
