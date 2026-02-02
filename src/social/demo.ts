// demo.ts - Demo script showing LobsterSage social layer usage
// Run with: npx ts-node src/social/demo.ts

import {
  TwitterClient,
  FarcasterClient,
  PredictionData,
  PredictionResult,
  YieldUpdate,
  PortfolioSummary,
} from './index';

// Demo configuration - replace with your actual credentials
const twitterConfig = {
  appKey: process.env.TWITTER_APP_KEY || 'your-app-key',
  appSecret: process.env.TWITTER_APP_SECRET || 'your-app-secret',
  accessToken: process.env.TWITTER_ACCESS_TOKEN || 'your-access-token',
  accessSecret: process.env.TWITTER_ACCESS_SECRET || 'your-access-secret',
};

const farcasterConfig = {
  apiKey: process.env.NEYNAR_API_KEY || 'your-neynar-api-key',
  signerUuid: process.env.NEYNAR_SIGNER_UUID || 'your-signer-uuid',
  fid: parseInt(process.env.FARCASTER_FID || '12345'),
};

// Sample prediction data
const samplePrediction: PredictionData = {
  id: 'pred-demo-001',
  asset: 'ETH',
  direction: 'bullish',
  confidence: 0.78,
  timeframe: '24h',
  reasoning: 'On-chain metrics show increased whale accumulation with decreasing exchange reserves. RSI indicates oversold conditions with bullish divergence forming on 4h timeframe. Network activity at 3-month high.',
  entryPrice: 3250.50,
  targetPrice: 3450.00,
  timestamp: new Date(),
};

// Sample prediction result
const sampleResult: PredictionResult = {
  predictionId: 'pred-demo-001',
  asset: 'ETH',
  direction: 'bullish',
  result: 'win',
  pnl: 6.14,
  exitPrice: 3450.00,
  timestamp: new Date(),
};

// Sample yield update
const sampleYieldUpdate: YieldUpdate = {
  protocol: 'Aave V3',
  apy: 8.45,
  tvl: 1250000000,
  token: 'USDC',
  chain: 'Base',
  strategy: 'Lending',
  timestamp: new Date(),
  url: 'https://app.aave.com',
};

// Sample portfolio summary
const samplePortfolio: PortfolioSummary = {
  totalValue: 150420.50,
  dayChange: 3420.25,
  dayChangePercent: 2.33,
  activePositions: 8,
  bestPerformer: {
    asset: 'ETH',
    change: 6.14,
  },
  worstPerformer: {
    asset: 'LINK',
    change: -2.18,
  },
  timestamp: new Date(),
};

async function demoTwitterClient(): Promise<void> {
  console.log('\n🐦 ========== TWITTER CLIENT DEMO ==========\n');

  const client = new TwitterClient(twitterConfig);

  // Check rate limits
  console.log('Rate limited:', client.isRateLimited());
  console.log('Rate limit reset:', client.getRateLimitResetTime());

  // Demonstrate content generation (without actually posting in demo)
  console.log('\n--- Sample Prediction Post ---');
  const predictionText = `
🔮 Prediction Alert 📈

Asset: $ETH
Direction: BULLISH
Confidence: 78%
Timeframe: 24h

On-chain metrics show increased whale accumulation with decreasing exchange reserves. RSI indicates oversold conditions with bullish divergence forming on...

🎯 Target: $3,450.00
ID: #mo-001

🔗 https://basescan.org/tx/0x...`;
  console.log(predictionText);
  console.log(`Character count: ${predictionText.length}/280`);

  console.log('\n--- Sample Result Post ---');
  const resultText = `
✅ Prediction Result 📈

Asset: $ETH
Direction: BULLISH
Result: WIN
PnL: 💰 +6.14%

🦞 LobsterSage strikes again!`;
  console.log(resultText);
  console.log(`Character count: ${resultText.length}/280`);

  console.log('\n--- Sample Yield Update ---');
  const yieldText = `
💸 Yield Update 🔥

Protocol: Aave V3
Strategy: Lending
APY: +8.45%
TVL: $1.25B
Chain: Base
Token: $USDC

⏰ ${new Date().toLocaleDateString()}

🔗 https://app.aave.com`;
  console.log(yieldText);
  console.log(`Character count: ${yieldText.length}/280`);

  console.log('\n--- Sample Daily Summary ---');
  const summaryText = `
🦞 LobsterSage Daily Report 📈

Portfolio Value: $150.42K
24h Change: +2.33%
Active Positions: 8

🚀 Best: $ETH +6.14%
⚠️ Worst: $LINK -2.18%

Trading with wisdom 🦞🔮`;
  console.log(summaryText);
  console.log(`Character count: ${summaryText.length}/280`);

  console.log('\n--- Transaction Link Formatting ---');
  console.log('Ethereum:', client.formatTransactionLink('0x1234...', 'ethereum'));
  console.log('Base:', client.formatTransactionLink('0x1234...', 'base'));
  console.log('Arbitrum:', client.formatTransactionLink('0x1234...', 'arbitrum'));

  // Note: Uncomment to actually post (requires valid credentials)
  // console.log('\n--- Posting to Twitter ---');
  // try {
  //   const result = await client.postPrediction(samplePrediction);
  //   console.log('Posted:', result.id);
  // } catch (error) {
  //   console.error('Error:', error);
  // }
}

async function demoFarcasterClient(): Promise<void> {
  console.log('\n🌐 ========== FARCASTER CLIENT DEMO ==========\n');

  const client = new FarcasterClient(farcasterConfig);

  // Check rate limits
  console.log('Rate limited:', client.isRateLimited());
  console.log('Rate limit reset:', client.getRateLimitResetTime());

  // Demonstrate content generation (without actually casting in demo)
  console.log('\n--- Sample Prediction Cast ---');
  const predictionCast = `
🔮 Prediction Alert 📈

Asset: $ETH
Direction: BULLISH
Confidence: 78%
Timeframe: 24h

On-chain metrics show increased whale accumulation with decreasing exchange reserves. RSI indicates oversold conditions with bullish divergence forming on 4h timeframe. Network activity at 3-month high.

🎯 Target: $3,450.00
ID: #mo-001`;
  console.log(predictionCast);

  console.log('\n--- Sample Yield Cast ---');
  const yieldCast = `
💸 Yield Update 🔥

Protocol: Aave V3
Strategy: Lending
APY: +8.45%
TVL: $1.25B
Chain: Base
Token: $USDC

⏰ ${new Date().toLocaleDateString()}`;
  console.log(yieldCast);

  console.log('\n--- Sample Thread (Prediction Detail) ---');
  const thread = [
    '🔮 Prediction Thread: $ETH 📈\n\nAsset: $ETH\nDirection: BULLISH\nConfidence: 78%\nTimeframe: 24h\n\n🧵👇',
    '🎯 Price Targets:\n\nEntry: $3,250.50\nTarget: $3,450.00\n\nRisk management is key. Never risk more than you can afford to lose. ⚠️',
    '🔮 Reasoning:\n\nOn-chain metrics show increased whale accumulation with decreasing exchange reserves. RSI indicates oversold conditions.\n\nThis is not financial advice. DYOR. 🦞',
  ];
  thread.forEach((cast, i) => {
    console.log(`\n[${i + 1}/3] ${cast.slice(0, 100)}...`);
  });

  console.log('\n--- Transaction Link Formatting ---');
  console.log('Ethereum:', client.formatTransactionLink('0x1234...', 'ethereum'));
  console.log('Base:', client.formatTransactionLink('0x1234...', 'base'));

  // Note: Uncomment to actually cast (requires valid credentials)
  // console.log('\n--- Casting to Farcaster ---');
  // try {
  //   const result = await client.castPrediction(samplePrediction);
  //   console.log('Cast:', result.hash);
  // } catch (error) {
  //   console.error('Error:', error);
  // }
}

async function demoMentions(): Promise<void> {
  console.log('\n💬 ========== MENTIONS & ENGAGEMENT DEMO ==========\n');

  console.log('--- Sample Mentions ---');
  const sampleMentions = [
    {
      id: 'tw-001',
      author: 'cryptotrader99',
      text: '@LobsterSage great call on ETH! 🚀',
      timestamp: new Date(),
      platform: 'twitter',
    },
    {
      id: 'fc-001',
      author: 'degendealer',
      text: 'hey @lobstersage what do you think about SOL?',
      timestamp: new Date(),
      platform: 'farcaster',
    },
  ];

  sampleMentions.forEach(m => {
    console.log(`[${m.platform}] @${m.author}: ${m.text}`);
  });

  console.log('\n--- Sample Engagement Responses ---');
  const responses = {
    positive: '🦞 Thanks! The crustacean wisdom is strong with this one 🦞✨',
    neutral: '🦞 Noted! The Lobster Sage is always watching... 👀',
    negative: '🦞 Every prediction can\'t be perfect. The sea is unpredictable 🌊',
    question: '🦞 Great question! The Lobster Sage uses on-chain data + AI analysis 🔮',
  };

  Object.entries(responses).forEach(([sentiment, response]) => {
    console.log(`[${sentiment}] ${response}`);
  });
}

async function runDemo(): Promise<void> {
  console.log('\n🦞 ========== LOBSTERSAGE SOCIAL LAYER DEMO ==========\n');
  console.log('This demo shows how the social layer works without making actual API calls.');
  console.log('Set environment variables to enable real posting.\n');

  try {
    await demoTwitterClient();
    await demoFarcasterClient();
    await demoMentions();

    console.log('\n✅ Demo completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Get Twitter API credentials from https://developer.twitter.com');
    console.log('2. Get Neynar API key from https://neynar.com');
    console.log('3. Set environment variables');
    console.log('4. Uncomment posting code in demo.ts');
    console.log('5. Run: npx ts-node src/social/demo.ts');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  runDemo();
}

export { runDemo, samplePrediction, sampleResult, sampleYieldUpdate, samplePortfolio };
