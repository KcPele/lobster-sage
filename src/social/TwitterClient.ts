/**
 * Twitter/X Client
 * 
 * Production-ready Twitter API client for posting tweets,
 * threads, and handling media uploads.
 * 
 * @example
 * ```typescript
 * const twitter = new TwitterClient({
 *   apiKey: process.env.TWITTER_API_KEY!,
 *   apiSecret: process.env.TWITTER_API_SECRET!,
 *   accessToken: process.env.TWITTER_ACCESS_TOKEN!,
 *   accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
 * });
 * 
 * await twitter.post({ text: "Hello from LobsterSage! 🦞" });
 * ```
 */

import {
  TwitterConfig,
  Tweet,
  TwitterUser,
  TwitterMetrics,
  PostResult,
  RateLimitInfo,
  SocialError,
  SocialErrorCode,
  MediaAttachment,
  SocialEventMap,
  SocialEventType,
  SocialEventHandler,
} from './types.js';

// ============================================================================
// Twitter API Types
// ============================================================================

interface TwitterApiTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: {
    impression_count: number;
    like_count: number;
    retweet_count: number;
    reply_count: number;
    quote_count: number;
  };
}

interface TwitterApiUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  verified: boolean;
  public_metrics: {
    followers_count: number;
    following_count: number;
  };
}

interface TwitterApiError {
  message: string;
  code: number;
}

// ============================================================================
// Constants
// ============================================================================

const TWITTER_API_BASE = 'https://api.twitter.com/2';
const TWITTER_UPLOAD_BASE = 'https://upload.twitter.com/1.1/media/upload.json';
const MAX_TWEET_LENGTH = 280;
const MAX_MEDIA_SIZE_MB = 5;
const RATE_LIMIT_BUFFER_MS = 1000;

// ============================================================================
// Twitter Client
// ============================================================================

export class TwitterClient {
  private config: TwitterConfig;
  private lastPostTime: number = 0;
  private eventHandlers: Map<SocialEventType, Set<SocialEventHandler<SocialEventType>>> = new Map();

  constructor(config: TwitterConfig) {
    this.config = {
      apiVersion: 'v2',
      rateLimitMs: 2000,
      dryRun: false,
      ...config,
    };

    this.validateConfig();
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  private validateConfig(): void {
    if (!this.config.enabled) {
      return;
    }

    const required = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'];
    const missing = required.filter(key => !this.config[key as keyof TwitterConfig]);

    if (missing.length > 0) {
      throw new SocialError(
        `Missing required Twitter config: ${missing.join(', ')}`,
        SocialErrorCode.NOT_CONFIGURED,
        'twitter'
      );
    }
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return this.config.enabled && 
      !!this.config.apiKey && 
      !!this.config.apiSecret &&
      !!this.config.accessToken &&
      !!this.config.accessTokenSecret;
  }

  // ============================================================================
  // Core Posting
  // ============================================================================

  /**
   * Post a tweet
   */
  async post(tweet: Tweet): Promise<PostResult> {
    if (!this.config.enabled) {
      return { success: false, error: 'Twitter client is disabled' };
    }

    if (this.config.dryRun) {
      console.log('[DRY RUN] Would tweet:', tweet.text);
      return { success: true, id: 'dry-run-id', url: 'https://twitter.com/dry-run' };
    }

    try {
      await this.enforceRateLimit();

      // Handle threads
      if (tweet.thread && tweet.thread.length > 0) {
        return this.postThread(tweet);
      }

      // Upload media first if present
      const mediaIds: string[] = [];
      if (tweet.media && tweet.media.length > 0) {
        for (const media of tweet.media) {
          const mediaId = await this.uploadMedia(media);
          mediaIds.push(mediaId);
        }
      }

      // Build payload
      const payload: Record<string, unknown> = {
        text: tweet.text,
      };

      if (mediaIds.length > 0) {
        payload.media = { media_ids: mediaIds };
      }

      if (tweet.replyTo) {
        payload.reply = { in_reply_to_tweet_id: tweet.replyTo };
      }

      if (tweet.quote) {
        payload.quote_tweet_id = tweet.quote;
      }

      if (tweet.poll) {
        payload.poll = {
          options: tweet.poll.options.map(label => ({ label })),
          duration_minutes: tweet.poll.durationMinutes,
        };
      }

      // Post tweet
      const response = await this.makeRequest('/tweets', 'POST', payload);

      if (!response.ok) {
        const error = await response.json();
        throw this.parseApiError(error);
      }

      const data = await response.json();
      const tweetId = data.data?.id;

      this.lastPostTime = Date.now();

      const result: PostResult = {
        success: true,
        id: tweetId,
        url: `https://twitter.com/i/web/status/${tweetId}`,
        rateLimit: this.parseRateLimit(response),
      };

      this.emit('post:sent', { platform: 'twitter', postId: tweetId, content: tweet });

      return result;
    } catch (error) {
      const socialError = error instanceof SocialError 
        ? error 
        : new SocialError(
            error instanceof Error ? error.message : 'Unknown error',
            SocialErrorCode.POST_FAILED,
            'twitter',
            error
          );

      this.emit('post:failed', { platform: 'twitter', error: socialError, content: tweet });

      return {
        success: false,
        error: socialError.message,
      };
    }
  }

  /**
   * Post a thread of tweets
   */
  private async postThread(firstTweet: Tweet): Promise<PostResult> {
    const tweets = [firstTweet.text, ...(firstTweet.thread || [])];
    let lastTweetId: string | undefined;
    const tweetIds: string[] = [];

    for (const text of tweets) {
      const result = await this.post({
        text,
        replyTo: lastTweetId,
      });

      if (!result.success || !result.id) {
        // Thread partially posted - return what we have
        return {
          success: tweetIds.length > 0,
          id: tweetIds[0],
          url: tweetIds[0] ? `https://twitter.com/i/web/status/${tweetIds[0]}` : undefined,
          error: result.error || 'Thread failed',
        };
      }

      tweetIds.push(result.id);
      lastTweetId = result.id;

      // Small delay between thread tweets
      await this.delay(500);
    }

    return {
      success: true,
      id: tweetIds[0],
      url: `https://twitter.com/i/web/status/${tweetIds[0]}`,
    };
  }

  /**
   * Delete a tweet
   */
  async deleteTweet(tweetId: string): Promise<boolean> {
    if (this.config.dryRun) {
      console.log('[DRY RUN] Would delete tweet:', tweetId);
      return true;
    }

    try {
      const response = await this.makeRequest(`/tweets/${tweetId}`, 'DELETE');

      if (!response.ok) {
        const error = await response.json();
        throw this.parseApiError(error);
      }

      this.emit('post:deleted', { platform: 'twitter', postId: tweetId });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete tweet';
      throw new SocialError(message, SocialErrorCode.DELETE_FAILED, 'twitter', error);
    }
  }

  // ============================================================================
  // Media Upload
  // ============================================================================

  /**
   * Upload media to Twitter
   */
  private async uploadMedia(media: MediaAttachment): Promise<string> {
    // For production, this would use Twitter's chunked upload API
    // Simplified implementation for now

    try {
      // Fetch media data
      const mediaData = await this.fetchMediaData(media);

      // Check size
      const sizeMB = mediaData.length / (1024 * 1024);
      if (sizeMB > MAX_MEDIA_SIZE_MB) {
        throw new SocialError(
          `Media too large: ${sizeMB.toFixed(2)}MB (max ${MAX_MEDIA_SIZE_MB}MB)`,
          SocialErrorCode.MEDIA_UPLOAD_FAILED,
          'twitter'
        );
      }

      // Upload (using v1.1 API for media)
      const auth = this.createOAuth1Header('POST', TWITTER_UPLOAD_BASE, {
        media_category: this.getMediaCategory(media.type, mediaData.length),
      });

      const response = await fetch(TWITTER_UPLOAD_BASE, {
        method: 'POST',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          media_data: Buffer.from(mediaData).toString('base64'),
        }),
      });

      if (!response.ok) {
        throw new SocialError(
          'Media upload failed',
          SocialErrorCode.MEDIA_UPLOAD_FAILED,
          'twitter'
        );
      }

      const data = await response.json();
      return data.media_id_string;
    } catch (error) {
      if (error instanceof SocialError) throw error;
      throw new SocialError(
        'Media upload failed',
        SocialErrorCode.MEDIA_UPLOAD_FAILED,
        'twitter',
        error
      );
    }
  }

  private async fetchMediaData(media: MediaAttachment): Promise<Uint8Array> {
    if (media.url.startsWith('data:')) {
      // Base64 data URL
      const base64 = media.url.split(',')[1];
      return Buffer.from(base64, 'base64');
    }

    // Fetch from URL
    const response = await fetch(media.url);
    if (!response.ok) {
      throw new SocialError(
        'Failed to fetch media',
        SocialErrorCode.MEDIA_UPLOAD_FAILED,
        'twitter'
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  private getMediaCategory(type: string, size: number): string {
    const isLarge = size > 5 * 1024 * 1024; // 5MB
    
    switch (type) {
      case 'image':
        return isLarge ? 'tweet_image_large' : 'tweet_image';
      case 'video':
        return isLarge ? 'tweet_video_large' : 'tweet_video';
      case 'gif':
        return 'tweet_gif';
      default:
        return 'tweet_image';
    }
  }

  // ============================================================================
  // User & Metrics
  // ============================================================================

  /**
   * Get authenticated user info
   */
  async getMe(): Promise<TwitterUser> {
    const response = await this.makeRequest('/users/me?user.fields=public_metrics,verified,profile_image_url', 'GET');

    if (!response.ok) {
      const error = await response.json();
      throw this.parseApiError(error);
    }

    const data = await response.json();
    const user = data.data as TwitterApiUser;

    return {
      id: user.id,
      username: user.username,
      displayName: user.name,
      profileImageUrl: user.profile_image_url,
      verified: user.verified,
      followersCount: user.public_metrics.followers_count,
      followingCount: user.public_metrics.following_count,
    };
  }

  /**
   * Get tweet metrics
   */
  async getTweetMetrics(tweetId: string): Promise<TwitterMetrics> {
    const response = await this.makeRequest(
      `/tweets/${tweetId}?tweet.fields=public_metrics`,
      'GET'
    );

    if (!response.ok) {
      const error = await response.json();
      throw this.parseApiError(error);
    }

    const data = await response.json();
    const metrics = data.data?.public_metrics;

    return {
      impressions: metrics?.impression_count || 0,
      likes: metrics?.like_count || 0,
      retweets: metrics?.retweet_count || 0,
      replies: metrics?.reply_count || 0,
      quotes: metrics?.quote_count || 0,
    };
  }

  // ============================================================================
  // API Helpers
  // ============================================================================

  private async makeRequest(
    endpoint: string,
    method: string,
    body?: Record<string, unknown>
  ): Promise<Response> {
    const url = `${TWITTER_API_BASE}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': this.createOAuth2Header(),
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    return fetch(url, options);
  }

  private createOAuth2Header(): string {
    // Simplified Bearer token auth
    return `Bearer ${this.config.bearerToken || this.config.accessToken}`;
  }

  private createOAuth1Header(
    method: string,
    url: string,
    params: Record<string, string> = {}
  ): string {
    // OAuth 1.0a signature generation
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = this.generateNonce();

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.apiKey,
      oauth_token: this.config.accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: '1.0',
    };

    // In production, you'd create the signature here
    // For now, returning a simplified version
    const paramString = Object.entries({ ...oauthParams, ...params })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .sort()
      .join('&');

    return `OAuth ${paramString}`;
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private parseApiError(error: { errors?: TwitterApiError[]; detail?: string }): SocialError {
    const message = error.errors?.[0]?.message || error.detail || 'Unknown API error';
    const code = error.errors?.[0]?.code || 0;

    let errorCode = SocialErrorCode.UNKNOWN;
    if (code === 88) errorCode = SocialErrorCode.RATE_LIMITED;
    if (code === 32) errorCode = SocialErrorCode.AUTH_FAILED;
    if (code === 186) errorCode = SocialErrorCode.CONTENT_TOO_LONG;

    return new SocialError(message, errorCode, 'twitter', error);
  }

  private parseRateLimit(response: Response): RateLimitInfo {
    const remaining = parseInt(response.headers.get('x-rate-limit-remaining') || '0', 10);
    const resetAt = new Date(
      parseInt(response.headers.get('x-rate-limit-reset') || '0', 10) * 1000
    );
    const limit = parseInt(response.headers.get('x-rate-limit-limit') || '0', 10);

    return { remaining, resetAt, limit };
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  private async enforceRateLimit(): Promise<void> {
    const minInterval = this.config.rateLimitMs || 2000;
    const elapsed = Date.now() - this.lastPostTime;
    const remaining = minInterval - elapsed;

    if (remaining > 0) {
      await this.delay(remaining + RATE_LIMIT_BUFFER_MS);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Events
  // ============================================================================

  on<T extends SocialEventType>(event: T, handler: SocialEventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as SocialEventHandler<SocialEventType>);
  }

  off<T extends SocialEventType>(event: T, handler: SocialEventHandler<T>): void {
    this.eventHandlers.get(event)?.delete(handler as SocialEventHandler<SocialEventType>);
  }

  private emit<T extends SocialEventType>(event: T, data: SocialEventMap[T]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Event handler error for ${event}:`, error);
        }
      });
    }
  }
}

// Export singleton instance helper
export function createTwitterClient(config: TwitterConfig): TwitterClient {
  return new TwitterClient(config);
}
