import { LobsterSage } from './LobsterSage';

// Re-export main class
export { LobsterSage } from './LobsterSage';

// Export from sage module
export { 
  PredictorEngine,
  Prophesier,
  OnchainReputationSystem, 
  getReputationSystem,
  BaseAnalytics,
  getAnalytics
} from './sage';

// Export from yield module
export { YieldOptimizer } from './yield/optimizer';

// Export from social module  
export { TwitterClient } from './social/twitter-client';
export { FarcasterClient } from './social/farcaster-client';
export { ContentGenerator, contentGenerator } from './social/content-templates';

// Export from wallet module
export { WalletManager, getWalletManager } from './wallet/manager';

// Export from defi module
export { AaveV3 } from './defi/AaveV3';
export { UniswapV3, getUniswap, BASE_TOKENS, FeeTier } from './defi/UniswapV3';

// Export from data module
export { 
  DefiLlamaClient, 
  getDefiLlama,
  CoinGeckoClient,
  getCoinGecko,
} from './data';

// Export types
export * from './types';

// Default export
export default LobsterSage;

// Main entry point for running the agent
async function main() {
  console.log('🦞 LobsterSage Starting...');
  console.log('═'.repeat(50));
  
  try {
    const agent = new LobsterSage();
    await agent.initialize();
    
    console.log('\n✅ Agent initialized successfully!');
    console.log('═'.repeat(50));
    
    console.log('\n📊 Getting portfolio summary...');
    const portfolio = await agent.getPortfolioSummary();
    console.log('Portfolio Summary:');
    console.log(`  💰 Total Value: $${portfolio.totalValue.toFixed(2)}`);
    console.log(`  📈 Active Predictions: ${portfolio.activePredictions}`);
    console.log(`  ⭐ Reputation Score: ${portfolio.reputationScore}`);
    console.log(`  🌾 Yield Positions: ${portfolio.yieldPositions}`);
    
    console.log('\n═'.repeat(50));
    console.log('🎯 Agent ready! Use startAutonomousMode() to begin.');
    
  } catch (error) {
    console.error('\n❌ Failed to initialize agent:');
    console.error(error);
    process.exit(1);
  }
}

// Run if this is the main module
main().catch(console.error);
