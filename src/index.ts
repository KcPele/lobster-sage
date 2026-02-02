import { WalletManager, getWalletManager } from './wallet/manager.js';
import { getConfig } from './config/index.js';

/**
 * LobsterSage - Autonomous OpenClaw Agent for Base
 * 
 * Core capabilities:
 * - Prediction engine (mint Prophecy NFTs)
 * - Yield optimization (DeFi strategies)
 * - Reputation tracking (onchain scoring)
 * - Social engagement (X/Farcaster posts)
 */

export interface LobsterSageOptions {
  mode?: 'autonomous' | 'manual';
  network?: 'base-sepolia' | 'base-mainnet';
}

export class LobsterSage {
  private walletManager: WalletManager;
  private config: ReturnType<typeof getConfig>;
  private isRunning = false;

  constructor(options: LobsterSageOptions = {}) {
    this.config = getConfig();
    this.walletManager = getWalletManager({
      networkId: options.network || this.config.network,
    });
  }

  /**
   * Initialize LobsterSage
   */
  async initialize(): Promise<void> {
    console.log('\n🦞 Initializing LobsterSage...\n');

    // Initialize wallet
    await this.walletManager.initialize();

    const address = await this.walletManager.getAddress();
    const balance = await this.walletManager.getBalance();

    console.log(`✅ Wallet connected`);
    console.log(`📍 Address: ${address}`);
    console.log(`💰 Balance: ${balance} ETH`);
    console.log(`🌐 Network: ${this.config.network}`);

    console.log('\n🦞 LobsterSage ready!\n');
  }

  /**
   * Start autonomous mode
   */
  async startAutonomous(): Promise<void> {
    if (this.isRunning) {
      console.log('Already running in autonomous mode');
      return;
    }

    this.isRunning = true;
    console.log('\n🤖 Starting autonomous mode...\n');

    // Main loop would go here
    // For Phase 1, we just demonstrate the structure
    
    console.log('Autonomous mode placeholder - Phase 2 will implement:');
    console.log('  - Prediction engine (every 6 hours)');
    console.log('  - Yield optimization (every 1 hour)');
    console.log('  - Social posting (daily reports)');
    console.log('  - Reputation tracking');

    // Keep running
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 60000)); // Check every minute
      
      if (!this.isRunning) break;
      
      // TODO: Implement prediction/yield loops
    }
  }

  /**
   * Stop autonomous mode
   */
  stopAutonomous(): void {
    this.isRunning = false;
    console.log('\n🛑 Autonomous mode stopped\n');
  }

  /**
   * Get wallet manager
   */
  getWalletManager(): WalletManager {
    return this.walletManager;
  }

  /**
   * Get configuration
   */
  getConfig(): ReturnType<typeof getConfig> {
    return this.config;
  }

  /**
   * Check if running
   */
  isAutonomousRunning(): boolean {
    return this.isRunning;
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'start':
      const sage = new LobsterSage();
      await sage.initialize();
      await sage.startAutonomous();
      break;

    case 'init':
      const initSage = new LobsterSage();
      await initSage.initialize();
      console.log('\n✅ Initialization complete');
      break;

    case 'wallet':
      const walletSage = new LobsterSage();
      await walletSage.initialize();
      const wallet = walletSage.getWalletManager();
      const address = await wallet.getAddress();
      const balance = await wallet.getBalance();
      console.log(`\n📍 Address: ${address}`);
      console.log(`💰 Balance: ${balance} ETH`);
      break;

    case 'help':
    default:
      console.log(`
🦞 LobsterSage - Autonomous Base Agent

Commands:
  init      Initialize LobsterSage
  start     Start in autonomous mode
  wallet    Show wallet info
  help      Show this help message

Environment:
  Set CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY in .env
`);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { getWalletManager, getConfig };
export default LobsterSage;
