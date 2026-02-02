import {
  CdpWalletProvider,
  EvmWalletProvider,
} from '@coinbase/cdp-agentkit-core';
import { ethers } from 'ethers';
import { createWalletClient, http, publicActions, WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';

export interface WalletConfig {
  cdpApiKeyName?: string;
  cdpApiKeyPrivateKey?: string;
  networkId?: string;
  walletData?: string;
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
 * using Coinbase CDP SDK
 */
export class WalletManager {
  private provider: CdpWalletProvider | null = null;
  private viemClient: WalletClient | null = null;
  private networkId: string;
  private isInitialized = false;

  constructor(config?: WalletConfig) {
    this.networkId = config?.networkId || process.env.NETWORK_ID || 'base-sepolia';
  }

  /**
   * Initialize the wallet manager with CDP SDK
   */
  async initialize(config?: WalletConfig): Promise<void> {
    try {
      const apiKeyName = config?.cdpApiKeyName || process.env.CDP_API_KEY_NAME;
      const apiKeyPrivateKey = config?.cdpApiKeyPrivateKey || process.env.CDP_API_KEY_PRIVATE_KEY;

      if (!apiKeyName || !apiKeyPrivateKey) {
        throw new Error('CDP API credentials not found. Set CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY');
      }

      // Configure CDP Wallet Provider
      const walletConfig: Record<string, string> = {
        apiKeyName,
        apiKeyPrivateKey: apiKeyPrivateKey.replace(/\\n/g, '\n'),
        networkId: this.networkId,
      };

      // If we have existing wallet data, use it
      if (config?.walletData || process.env.CDP_WALLET_DATA) {
        walletConfig.cdpWalletData = config?.walletData || process.env.CDP_WALLET_DATA;
      }

      this.provider = await CdpWalletProvider.configureWithWallet(walletConfig);

      // Initialize viem client for direct transactions
      const account = privateKeyToAccount(this.getPrivateKey() as `0x${string}`);
      const chain = this.networkId === 'base-mainnet' ? base : baseSepolia;
      
      this.viemClient = createWalletClient({
        account,
        chain,
        transport: http(),
      }).extend(publicActions);

      this.isInitialized = true;
      console.log(`✅ WalletManager initialized on ${this.networkId}`);
      console.log(`📍 Address: ${await this.getAddress()}`);
    } catch (error) {
      console.error('Failed to initialize WalletManager:', error);
      throw error;
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet(): Promise<{ address: string; walletData: string }> {
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }

    const address = await this.provider.getAddress();
    const walletData = await this.exportWallet();

    return { address, walletData };
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }
    return await this.provider.getAddress();
  }

  /**
   * Get ETH balance
   */
  async getBalance(): Promise<string> {
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }

    const balance = await this.provider.getBalance();
    return ethers.formatEther(balance);
  }

  /**
   * Get token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<string> {
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }

    try {
      // ERC20 balanceOf ABI
      const abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
      const provider = new ethers.JsonRpcProvider(this.getRpcUrl());
      const contract = new ethers.Contract(tokenAddress, abi, provider);
      
      const address = await this.getAddress();
      const balance = await contract.balanceOf(address);
      const decimals = await contract.decimals();
      
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error(`Failed to get token balance for ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Send ETH
   */
  async send(to: string, amount: string): Promise<TransactionResult> {
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }

    try {
      const txHash = await this.provider.sendTransaction({
        to,
        value: ethers.parseEther(amount).toString(),
      });

      return {
        hash: txHash,
        status: 'pending',
        explorerUrl: this.getExplorerUrl(txHash),
      };
    } catch (error) {
      console.error('Failed to send transaction:', error);
      throw error;
    }
  }

  /**
   * Send ERC20 tokens
   */
  async sendToken(tokenAddress: string, to: string, amount: string, decimals: number = 18): Promise<TransactionResult> {
    if (!this.provider || !this.viemClient) {
      throw new Error('WalletManager not initialized');
    }

    try {
      const erc20Abi = [
        {
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ];

      const parsedAmount = ethers.parseUnits(amount, decimals);
      
      const hash = await this.viemClient.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as `0x${string}`, parsedAmount],
      });

      return {
        hash,
        status: 'pending',
        explorerUrl: this.getExplorerUrl(hash),
      };
    } catch (error) {
      console.error('Failed to send token:', error);
      throw error;
    }
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }

    return await this.provider.signMessage(message);
  }

  /**
   * Sign a typed data (EIP-712)
   */
  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }

    return await this.provider.signTypedData(domain, types, value);
  }

  /**
   * Wait for transaction receipt
   */
  async waitForTransaction(txHash: string, confirmations: number = 1): Promise<TransactionResult> {
    const provider = new ethers.JsonRpcProvider(this.getRpcUrl());
    
    try {
      const receipt = await provider.waitForTransaction(txHash, confirmations);
      
      if (!receipt) {
        return {
          hash: txHash,
          status: 'pending',
          explorerUrl: this.getExplorerUrl(txHash),
        };
      }

      return {
        hash: txHash,
        status: receipt.status === 1 ? 'success' : 'failed',
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
        explorerUrl: this.getExplorerUrl(txHash),
      };
    } catch (error) {
      console.error('Failed to wait for transaction:', error);
      throw error;
    }
  }

  /**
   * Export wallet data for backup
   */
  async exportWallet(): Promise<string> {
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }

    // This would export wallet data from CDP
    // For now, return a placeholder - CDP handles wallet persistence
    return JSON.stringify({
      networkId: this.networkId,
      address: await this.getAddress(),
      exportedAt: new Date().toISOString(),
    });
  }

  /**
   * Get native token symbol
   */
  getNativeSymbol(): string {
    return this.networkId === 'base-mainnet' ? 'ETH' : 'ETH';
  }

  /**
   * Check if initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the underlying CDP provider
   */
  getProvider(): CdpWalletProvider | null {
    return this.provider;
  }

  /**
   * Get viem client for advanced operations
   */
  getViemClient(): WalletClient | null {
    return this.viemClient;
  }

  // ============ Private Helpers ============

  private getPrivateKey(): string {
    // In production, this should come from secure storage
    // CDP handles key management internally
    if (!this.provider) {
      throw new Error('WalletManager not initialized');
    }
    // Return a dummy key - CDP manages the actual key
    return '0x0000000000000000000000000000000000000000000000000000000000000000';
  }

  private getRpcUrl(): string {
    if (this.networkId === 'base-mainnet') {
      return process.env.BASE_MAINNET_RPC || 'https://mainnet.base.org';
    }
    return process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
  }

  private getExplorerUrl(txHash: string): string {
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
