import { formatEther } from 'viem';

export interface FormatOptions {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
}

/**
 * Formats ETH amount with specified decimals
 */
export function formatEth(
  amount: bigint,
  options: FormatOptions = {}
): string {
  const { decimals = 4, prefix = '', suffix = ' ETH', compact = false } = options;
  
  const ethValue = parseFloat(formatEther(amount));
  
  if (compact && ethValue >= 1000000) {
    return `${prefix}${(ethValue / 1000000).toFixed(decimals)}M${suffix}`;
  }
  
  if (compact && ethValue >= 1000) {
    return `${prefix}${(ethValue / 1000).toFixed(decimals)}K${suffix}`;
  }
  
  return `${prefix}${ethValue.toFixed(decimals)}${suffix}`;
}

/**
 * Formats a percentage value
 */
export function formatPercent(
  value: number,
  options: { decimals?: number; includeSign?: boolean } = {}
): string {
  const { decimals = 2, includeSign = true } = options;
  
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

/**
 * Formats a timestamp to human-readable date
 */
export function formatDate(
  timestamp: number,
  options: { includeTime?: boolean; relative?: boolean } = {}
): string {
  const { includeTime = true, relative = false } = options;
  
  if (relative) {
    const now = Date.now();
    const diff = timestamp * 1000 - now;
    
    if (diff < 0) {
      const absDiff = Math.abs(diff);
      const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      return 'just now';
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `in ${days}d`;
    if (hours > 0) return `in ${hours}h`;
    return 'soon';
  }
  
  const date = new Date(timestamp * 1000);
  const dateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  
  if (!includeTime) return dateStr;
  
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  return `${dateStr} ${timeStr}`;
}

/**
 * Formats a blockchain address for display
 */
export function formatAddress(
  address: string,
  options: { prefix?: number; suffix?: number } = {}
): string {
  const { prefix = 6, suffix = 4 } = options;
  
  if (!address || address.length < prefix + suffix + 2) {
    return address;
  }
  
  return `${address.slice(0, prefix + 2)}...${address.slice(-suffix)}`;
}

/**
 * Formats a prediction title with emoji indicators
 */
export function formatPredictionTitle(
  title: string,
  status: 'active' | 'resolved' | 'pending' | 'cancelled'
): string {
  const statusEmojis: Record<string, string> = {
    active: '🟢',
    resolved: '✅',
    pending: '⏳',
    cancelled: '❌',
  };
  
  return `${statusEmojis[status] || '⚪'} ${title}`;
}

/**
 * Formats reputation score with tier indicator
 */
export function formatReputation(score: number): {
  display: string;
  tier: string;
  emoji: string;
} {
  let tier: string;
  let emoji: string;
  
  if (score >= 5000) {
    tier = 'Legendary';
    emoji = '👑';
  } else if (score >= 4000) {
    tier = 'Expert';
    emoji = '🏆';
  } else if (score >= 3000) {
    tier = 'Advanced';
    emoji = '🥈';
  } else if (score >= 2000) {
    tier = 'Intermediate';
    emoji = '🥉';
  } else if (score >= 1000) {
    tier = 'Novice';
    emoji = '🌱';
  } else {
    tier = 'Rookie';
    emoji = '🆕';
  }
  
  return {
    display: `${score.toLocaleString()} ${emoji}`,
    tier,
    emoji,
  };
}

/**
 * Formats accuracy as a progress bar
 */
export function formatAccuracyBar(
  accuracy: number,
  length: number = 10
): string {
  const filled = Math.round(accuracy * length);
  const empty = length - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Truncates text to specified length with ellipsis
 */
export function truncateText(
  text: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Formats a list of items with proper grammar
 */
export function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Formats odds as a ratio
 */
export function formatOdds(
  yesStake: bigint,
  noStake: bigint
): { yes: string; no: string; ratio: string } {
  const yes = parseFloat(formatEther(yesStake || 1n));
  const no = parseFloat(formatEther(noStake || 1n));
  
  const yesOdds = no / yes;
  const noOdds = yes / no;
  
  return {
    yes: `${yesOdds.toFixed(2)}x`,
    no: `${noOdds.toFixed(2)}x`,
    ratio: `${Math.round(yes)}:${Math.round(no)}`,
  };
}

/**
 * Formats Twitter/social media content
 */
export function formatSocialContent(
  prediction: {
    title: string;
    odds: string;
    timeRemaining: string;
    url?: string;
  },
  maxLength: number = 280
): string {
  let content = `🎯 ${prediction.title}\n\n`;
  content += `📊 Odds: ${prediction.odds}\n`;
  content += `⏰ ${prediction.timeRemaining}`;
  
  if (prediction.url) {
    const remaining = maxLength - content.length - 2;
    if (remaining > 10) {
      content += `\n\n${prediction.url}`;
    }
  }
  
  if (content.length > maxLength) {
    return truncateText(content, maxLength);
  }
  
  return content;
}
