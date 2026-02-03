import { CdpEvmWalletProvider, ViemWalletProvider } from '@coinbase/agentkit';
import { ethers } from 'ethers';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';

export interface WalletConfig {
  apiKeyId?: string;
  apiKeyPrivate?: string;
  networkId?: string;
  walletData?: string;
  walletAddress?: string;
  privateKey?: string;
}

export interface TransactionResult {
  hash: string;
  status: 'success' | 'failed' | 'pending';
  gasUsed?: bigint;
  blockNumber?: bigint;
  explorerUrl: string;
}

export interface TokenBalance {
  token: string;
  symbol: string;
  balance: string;
  decimals: number;
  usdValue?: string;
}

/**
 * Wallet Manager for LobsterSage
 * Handles wallet creation, transaction signing, and balance tracking
 * using Coinbase AgentKit CDP Wallet Provider or Viem with private key
 */
export class WalletManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletProvider: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any = null;
  private networkId: string;
  private isInitialized = false;
  private walletAddress: string = '';

  constructor(config?: WalletConfig) {
    this.networkId = config?.networkId || process.env.NETWORK_ID || 'base-sepolia';
  }

  /**
   * Initialize the wallet manager with CDP AgentKit or Private Key
   */
  async initialize(config?: WalletConfig): Promise<void> {
    const chain = this.networkId === 'base-mainnet' ? base : baseSepolia;
    
    // Initialize public client for reading blockchain data (always needed)
    this.publicClient = createPublicClient({
      chain,
      transport: http(this.getRpcUrl()),
    });

    // Option 1: Try CDP FIRST (preferred for Base hackathon - Coinbase stack)
    const apiKeyId = config?.apiKeyId || process.env.CDP_API_KEY_ID;
    const apiKeySecret = config?.apiKeyPrivate || process.env.CDP_API_KEY_SECRET;
    const walletSecret = process.env.CDP_WALLET_SECRET;

    if (apiKeyId && apiKeySecret && walletSecret) {
      try {
        console.log('🔷 Attempting CDP initialization (Coinbase Developer Platform)...');
        console.log(`   API Key ID: ${apiKeyId.substring(0, 30)}...`);
        console.log(`   Network: ${this.networkId}`);

        // Configure CDP Wallet Provider - SDK reads env vars directly
        const walletConfig: any = {
          networkId: this.networkId,
        };

        // If we have existing wallet address, use it
        if (config?.walletAddress || process.env.CDP_WALLET_ADDRESS) {
          walletConfig.address = config?.walletAddress || process.env.CDP_WALLET_ADDRESS;
          console.log(`   Using existing wallet address: ${walletConfig.address}`);
        }

        // Initialize CDP EVM Wallet Provider
        this.walletProvider = await CdpEvmWalletProvider.configureWithWallet(walletConfig);
        this.walletAddress = await this.walletProvider.getAddress();
        this.isInitialized = true;
        
        console.log(`✅ WalletManager initialized with CDP AgentKit on ${this.networkId}`);
        console.log(`📍 Address: ${this.walletAddress}`);
        console.log(`🔷 Using Coinbase Developer Platform - Full Base stack!`);
        return;
      } catch (error: any) {
        console.error('Failed to initialize with CDP:', error.message);
        if (error.cause) console.error('Cause:', error.cause);
        console.log('⚠️  Falling back to private key...');
      }
    }

    // Option 2: Fallback to private key
    const privateKey = config?.privateKey || process.env.PRIVATE_KEY;
    if (privateKey && privateKey.startsWith('0x') && privateKey.length === 66) {
      try {
        console.log('🔑 Initializing with private key (fallback)...');
        
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        const walletClient = createWalletClient({
          account,
          chain,
          transport: http(this.getRpcUrl()),
        });
        
        // Use type cast to avoid version incompatibility issues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.walletProvider = new ViemWalletProvider(walletClient as any);
        this.walletAddress = account.address;
        this.isInitialized = true;
        
        console.log(`✅ WalletManager initialized with private key on ${this.networkId}`);
        console.log(`📍 Address: ${this.walletAddress}`);
        return;
      } catch (error: any) {
        console.error('Failed to initialize with private key:', error.message);
      }
    }

    // Option 3: Fall back to demo mode
    console.log('⚠️  No valid wallet credentials found. Running in DEMO mode.');
    console.log('   Options:');
    console.log('   1. Set PRIVATE_KEY (0x... format, 66 chars) for direct wallet access');
    console.log('   2. Set CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET for CDP');
    
    this.isInitialized = true;
    this.walletAddress = '0x0000000000000000000000000000000000000001';
    console.log(`✅ WalletManager initialized in DEMO mode on ${this.networkId}`);
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('WalletManager not initialized');
    }
    return this.walletAddress || 'Unknown';
  }

  /**
   * Get ETH balance
   */
  async getBalance(): Promise<string> {
    if (!this.publicClient || !this.walletAddress) {
      return '0';
    }

    try {
      const balance = await this.publicClient.getBalance({
        address: this.walletAddress as `0x${string}`,
      });
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Failed to get balance:', error);
      return '0';
    }
  }

  /**
   * Get token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<string> {
    if (!this.publicClient || !this.walletAddress) {
      return '0';
    }

    try {
      // ERC20 balanceOf ABI
      const abi = [
        {
          inputs: [{ name: 'account', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
        {
          inputs: [],
          name: 'decimals',
          outputs: [{ name: '', type: 'uint8' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const;

      const [balance, decimals] = await Promise.all([
        this.publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi,
          functionName: 'balanceOf',
          args: [this.walletAddress as `0x${string}`],
        }),
        this.publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi,
          functionName: 'decimals',
        }),
      ]);

      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error(`Failed to get token balance for ${tokenAddress}:`, error);
      return '0';
    }
  }

  /**
   * Export wallet data for backup
   */
  async exportWallet(): Promise<string> {
    if (!this.walletProvider) {
      throw new Error('WalletManager not initialized with real wallet');
    }
    // exportWallet only exists on CDP provider, not Viem provider
    if (typeof this.walletProvider.exportWallet === 'function') {
      const walletData = await this.walletProvider.exportWallet();
      return JSON.stringify(walletData);
    }
    return JSON.stringify({ address: this.walletAddress, type: 'private_key' });
  }

  /**
   * Get native token symbol
   */
  getNativeSymbol(): string {
    return 'ETH';
  }

  /**
   * Check if initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the underlying wallet provider
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getWalletProvider(): any {
    return this.walletProvider;
  }

  /**
   * Get public client for reading blockchain data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPublicClient(): any {
    return this.publicClient;
  }

  // ============ Private Helpers ============

  getRpcUrl(): string {
    if (this.networkId === 'base-mainnet') {
      return process.env.BASE_MAINNET_RPC || 'https://mainnet.base.org';
    }
    return process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
  }

  getExplorerUrl(txHash: string): string {
    if (this.networkId === 'base-mainnet') {
      return `https://basescan.org/tx/${txHash}`;
    }
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }
}

// Singleton instance
let walletManagerInstance: WalletManager | null = null;

export function getWalletManager(config?: WalletConfig): WalletManager {
  if (!walletManagerInstance) {
    walletManagerInstance = new WalletManager(config);
  }
  return walletManagerInstance;
}

export function resetWalletManager(): void {
  walletManagerInstance = null;
}
