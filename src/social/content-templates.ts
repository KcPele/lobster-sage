// content-templates.ts - Content templates for LobsterSage social posts

import {
  PredictionData,
  PredictionResult,
  YieldUpdate,
  PortfolioSummary,
} from './types';

// Emojis and formatting helpers
const EMOJIS = {
  lobster: '🦞',
  chartUp: '📈',
  chartDown: '📉',
  chartNeutral: '➖',
  target: '🎯',
  crystalBall: '🔮',
  money: '💰',
  rocket: '🚀',
  fire: '🔥',
  warning: '⚠️',
  check: '✅',
  cross: '❌',
  clock: '⏰',
  link: '🔗',
  thread: '🧵',
  yield: '💸',
  eth: 'Ξ',
  btc: '₿',
  usdc: '💵',
};

// Content generator class
export class ContentGenerator {
  private formatPercent(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  private formatCurrency(value: number): string {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  }

  private getDirectionEmoji(direction: string): string {
    switch (direction) {
      case 'bullish':
        return EMOJIS.chartUp;
      case 'bearish':
        return EMOJIS.chartDown;
      default:
        return EMOJIS.chartNeutral;
    }
  }

  /**
   * Generate prediction announcement post
   */
  predictionAnnouncement(prediction: PredictionData, txUrl?: string): string {
    const emoji = this.getDirectionEmoji(prediction.direction);
    const confidence = Math.round(prediction.confidence * 100);

    let text = `${EMOJIS.crystalBall} Prediction Alert ${emoji}

Asset: $${prediction.asset}
Direction: ${prediction.direction.toUpperCase()}
Confidence: ${confidence}%
Timeframe: ${prediction.timeframe}

${prediction.reasoning.slice(0, 150)}${prediction.reasoning.length > 150 ? '...' : ''}

${EMOJIS.target} Target: ${prediction.targetPrice ? this.formatCurrency(prediction.targetPrice) : 'TBD'}
ID: #${prediction.id.slice(-6)}`;

    if (txUrl) {
      text += `\n\n${EMOJIS.link} ${txUrl}`;
    }

    return text;
  }

  /**
   * Generate prediction result announcement
   */
  predictionResult(result: PredictionResult, txUrl?: string): string {
    const isWin = result.result === 'win';
    const emoji = isWin ? EMOJIS.chartUp : EMOJIS.chartDown;
    const resultEmoji = isWin ? EMOJIS.check : EMOJIS.cross;
    const pnlEmoji = result.pnl >= 0 ? EMOJIS.money : EMOJIS.warning;

    let text = `${resultEmoji} Prediction Result ${emoji}

Asset: $${result.asset}
Direction: ${result.direction.toUpperCase()}
Result: ${result.result.toUpperCase()}
PnL: ${pnlEmoji} ${this.formatPercent(result.pnl)}

${EMOJIS.lobster} LobsterSage strikes again!`;

    if (txUrl) {
      text += `\n\n${EMOJIS.link} ${txUrl}`;
    }

    return text;
  }

  /**
   * Generate yield update post
   */
  yieldUpdate(update: YieldUpdate): string {
    const tvlFormatted = this.formatCurrency(update.tvl);
    const apyFormatted = this.formatPercent(update.apy);

    let text = `${EMOJIS.yield} Yield Update ${EMOJIS.fire}

Protocol: ${update.protocol}
Strategy: ${update.strategy}
APY: ${apyFormatted}
TVL: ${tvlFormatted}
Chain: ${update.chain}
Token: $${update.token}

${EMOJIS.clock} ${update.timestamp.toLocaleDateString()}`;

    if (update.url) {
      text += `\n\n${EMOJIS.link} ${update.url}`;
    }

    return text;
  }

  /**
   * Generate daily portfolio summary
   */
  dailySummary(summary: PortfolioSummary): string {
    const changeEmoji = summary.dayChange >= 0 ? EMOJIS.chartUp : EMOJIS.chartDown;
    const changeFormatted = this.formatPercent(summary.dayChangePercent);

    let text = `${EMOJIS.lobster} LobsterSage Daily Report ${changeEmoji}

Portfolio Value: ${this.formatCurrency(summary.totalValue)}
24h Change: ${changeFormatted}
Active Positions: ${summary.activePositions}

${EMOJIS.rocket} Best: $${summary.bestPerformer.asset} ${this.formatPercent(summary.bestPerformer.change)}
${EMOJIS.warning} Worst: $${summary.worstPerformer.asset} ${this.formatPercent(summary.worstPerformer.change)}

Trading with wisdom 🦞🔮`;

    return text;
  }

  /**
   * Generate engagement response
   */
  engagementResponse(
    _originalText: string,
    sentiment: 'positive' | 'neutral' | 'negative' | 'question'
  ): string {
    const responses: Record<string, string[]> = {
      positive: [
        `${EMOJIS.lobster} Thanks! The crustacean wisdom is strong with this one 🦞✨`,
        `${EMOJIS.crystalBall} Appreciate the vibes! More predictions coming soon 🔮`,
        `${EMOJIS.money} Glad you're enjoying the alpha! Stay tuned 🚀`,
      ],
      neutral: [
        `${EMOJIS.lobster} Noted! The Lobster Sage is always watching... 👀`,
        `${EMOJIS.crystalBall} Interesting perspective. The crystal ball sees many possibilities 🔮`,
        `Thanks for sharing! The underwater wisdom flows both ways 🌊🦞`,
      ],
      negative: [
        `${EMOJIS.lobster} Every prediction can't be perfect. The sea is unpredictable 🌊`,
        `${EMOJIS.crystalBall} The crystal ball gets foggy sometimes. Learning from every trade 🔮`,
        `Appreciate the feedback. Even lobsters have bad days 🦞`,
      ],
      question: [
        `${EMOJIS.lobster} Great question! The Lobster Sage uses on-chain data + AI analysis 🔮`,
        `${EMOJIS.crystalBall} I analyze market sentiment, on-chain flows, and technical patterns 🦞`,
        `My predictions combine multiple data sources. Stay tuned for methodology thread! 🧵`,
      ],
    };

    const pool = responses[sentiment] || responses.neutral;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Generate thread for detailed prediction
   */
  predictionThread(prediction: PredictionData): string[] {
    const emoji = this.getDirectionEmoji(prediction.direction);
    const confidence = Math.round(prediction.confidence * 100);

    const tweet1 = `${EMOJIS.crystalBall} Prediction Thread: $${prediction.asset} ${emoji}

Asset: $${prediction.asset}
Direction: ${prediction.direction.toUpperCase()}
Confidence: ${confidence}%
Timeframe: ${prediction.timeframe}

${EMOJIS.thread} 🧵👇`;

    const tweet2 = `${EMOJIS.target} Price Targets:

Entry: ${prediction.entryPrice ? `$${prediction.entryPrice}` : 'Current'}
Target: ${prediction.targetPrice ? `$${prediction.targetPrice}` : 'TBD'}

Risk management is key. Never risk more than you can afford to lose. ${EMOJIS.warning}`;

    const tweet3 = `${EMOJIS.crystalBall} Reasoning:

${prediction.reasoning}

This is not financial advice. DYOR. ${EMOJIS.lobster}`;

    return [tweet1, tweet2, tweet3];
  }

  /**
   * Format transaction link
   */
  formatTransactionLink(
    txHash: string,
    chain: 'ethereum' | 'base' | 'arbitrum' | 'optimism' = 'base'
  ): string {
    const explorers: Record<string, string> = {
      ethereum: 'https://etherscan.io/tx/',
      base: 'https://basescan.org/tx/',
      arbitrum: 'https://arbiscan.io/tx/',
      optimism: 'https://optimistic.etherscan.io/tx/',
    };

    const base = explorers[chain] || explorers.base;
    return `${base}${txHash}`;
  }

  /**
   * Generate welcome message for new followers
   */
  welcomeMessage(username: string): string {
    return `Welcome to the LobsterSage ecosystem, @${username}! 🦞🔮

I post AI-powered crypto predictions, yield opportunities, and portfolio updates.

Follow along and may your trades be blessed with crustacean wisdom! 🌊✨`;
  }
}

// Export singleton instance
export const contentGenerator = new ContentGenerator();
