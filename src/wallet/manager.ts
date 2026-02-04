import { CdpClient, type EvmServerAccount } from '@coinbase/cdp-sdk';
import { ethers } from 'ethers';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  type WalletClient,
  type PublicClient,
  type Chain,
} from 'viem';
import { privateKeyToAccount, toAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';

export interface WalletConfig {
  apiKeyId?: string;
  apiKeyPrivate?: string;
  networkId?: string;
  walletData?: string;
  walletAddress?: string;
  privateKey?: string;
  accountName?: string;
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
 * using Coinbase CDP SDK with viem WalletClient support or private key fallback
 */
export class WalletManager {
  private publicClient: PublicClient | null = null;
  private walletClient: WalletClient | null = null;
  private cdpClient: CdpClient | null = null;
  private cdpAccount: EvmServerAccount | null = null;
  private networkId: string;
  private isInitialized = false;
  private walletAddress: string = '';
  private chain: Chain;
  private useCdp = false;

  constructor(config?: WalletConfig) {
    this.networkId = config?.networkId || process.env.NETWORK_ID || 'base-sepolia';
    this.chain = this.networkId === 'base-mainnet' ? base : baseSepolia;
  }

  /**
   * Initialize the wallet manager with CDP SDK or Private Key
   */
  async initialize(config?: WalletConfig): Promise<void> {
    // Initialize public client for reading blockchain data (always needed)
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(this.getRpcUrl()),
    });

    // Option 1: Try CDP FIRST (preferred for Base hackathon - Coinbase stack)
    const apiKeyId = config?.apiKeyId || process.env.CDP_API_KEY_ID;
    const apiKeySecret = config?.apiKeyPrivate || process.env.CDP_API_KEY_SECRET;
    const walletSecret = process.env.CDP_WALLET_SECRET;

    if (apiKeyId && apiKeySecret) {
      try {
        console.log('🔷 Attempting CDP SDK initialization (Coinbase Developer Platform)...');
        console.log(`   API Key ID: ${apiKeyId.substring(0, 30)}...`);
        console.log(`   Network: ${this.networkId}`);

        // Initialize CDP Client
        this.cdpClient = new CdpClient({
          apiKeyId,
          apiKeySecret,
          walletSecret, // Optional but recommended for write operations
        });

        // Get or create a named account for this agent
        const accountName = config?.accountName || process.env.CDP_ACCOUNT_NAME || 'lobster-sage-main';
        console.log(`   Using account name: ${accountName}`);
        
        this.cdpAccount = await this.cdpClient.evm.getOrCreateAccount({ 
          name: accountName 
        });
        
        this.walletAddress = this.cdpAccount.address;
        
        // Create viem-compatible account using toAccount()
        // EvmServerAccount already has sign, signMessage, signTransaction, signTypedData
        const viemAccount = toAccount({
          address: this.walletAddress as `0x${string}`,
          
          // Sign message using CDP account
          signMessage: async ({ message }) => {
            const result = await this.cdpAccount!.signMessage({ message });
            return result as `0x${string}`;
          },
          
          // Sign typed data using CDP account
          signTypedData: async (typedData) => {
            const result = await this.cdpAccount!.signTypedData(typedData as any);
            return result as `0x${string}`;
          },
          
          // Sign transaction using CDP account
          signTransaction: async (transaction) => {
            const result = await this.cdpAccount!.signTransaction(transaction);
            return result as `0x${string}`;
          },
        });

        // Create WalletClient with the wrapped CDP account
        this.walletClient = createWalletClient({
          account: viemAccount,
          chain: this.chain,
          transport: http(this.getRpcUrl()),
        });

        this.useCdp = true;
        this.isInitialized = true;
        
        console.log(`✅ WalletManager initialized with CDP SDK on ${this.networkId}`);
        console.log(`📍 Address: ${this.walletAddress}`);
        console.log(`🔗 WalletClient available for DeFi operations!`);
        return;
      } catch (error: any) {
        console.error('Failed to initialize with CDP SDK:', error.message);
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
        this.walletClient = createWalletClient({
          account,
          chain: this.chain,
          transport: http(this.getRpcUrl()),
        });
        
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
    console.log('   2. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET for CDP');
    
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
   * Get network ID
   */
  getNetworkId(): string {
    return this.networkId;
  }

  /**
   * Get raw token balance with decimals
   */
  async getTokenBalanceRaw(tokenAddress: string): Promise<{ value: bigint, decimals: number }> {
    if (!this.publicClient || !this.walletAddress) {
      return { value: 0n, decimals: 18 };
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

      return { value: balance, decimals };
    } catch (error) {
      console.error(`Failed to get token balance for ${tokenAddress}:`, error);
      return { value: 0n, decimals: 18 };
    }
  }

  /**
   * Get token balance (formatted)
   */
  async getTokenBalance(tokenAddress: string): Promise<string> {
    const raw = await this.getTokenBalanceRaw(tokenAddress);
    return ethers.formatUnits(raw.value, raw.decimals);
  }

  /**
   * Export wallet data for backup
   */
  async exportWallet(): Promise<string> {
    if (this.useCdp && this.cdpAccount) {
      return JSON.stringify({ 
        address: this.walletAddress, 
        type: 'cdp',
        accountName: this.cdpAccount.name || 'lobster-sage-main'
      });
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
   * Get the underlying CDP account (for native CDP operations)
   */
  getCdpAccount(): EvmServerAccount | null {
    return this.cdpAccount;
  }

  /**
   * Get the underlying CDP client
   */
  getCdpClient(): CdpClient | null {
    return this.cdpClient;
  }

  /**
   * Check if using CDP
   */
  isUsingCdp(): boolean {
    return this.useCdp;
  }

  /**
   * Get the underlying wallet provider (for backward compatibility)
   * Returns the walletClient which now works for both CDP and private key modes
   */
  getWalletProvider(): WalletClient | null {
    return this.walletClient;
  }

  /**
   * Get the underlying viem wallet client
   * This is the KEY method - now works with CDP accounts too!
   */
  getWalletClient(): WalletClient | null {
    return this.walletClient;
  }

  /**
   * Get public client for reading blockchain data
   */
  getPublicClient(): PublicClient | null {
    return this.publicClient;
  }

  /**
   * Execute a native CDP swap (bonus feature!)
   * Uses CDP's built-in swap functionality via network-scoped account
   */
  async cdpSwap(params: {
    fromToken: string;
    toToken: string;
    fromAmount: bigint;
    slippageBps?: number;
  }): Promise<{ transactionHash: string }> {
    if (!this.cdpAccount) {
      throw new Error('CDP account not available - this method only works in CDP mode');
    }

    const network = this.networkId === 'base-mainnet' ? 'base' : 'base-sepolia';
    
    // Get network-scoped account for swap operations
    const networkAccount = await this.cdpAccount.useNetwork(network as 'base' | 'base-sepolia');
    
    // Check if swap is available on this network account
    if (!('swap' in networkAccount)) {
      throw new Error(`Swap not available for network ${network}. Try using Uniswap instead.`);
    }

    const result = await (networkAccount as any).swap({
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      slippageBps: params.slippageBps || 100, // Default 1% slippage
    });

    return { transactionHash: result.transactionHash };
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
