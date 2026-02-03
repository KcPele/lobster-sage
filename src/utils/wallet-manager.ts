import { type Address, formatEther, isAddress } from 'viem';
import type { WalletClient, PublicClient, Account, Chain, Transport } from 'viem';

export interface WalletManagerConfig {
  privateKey: string;
  chainId: number;
  rpcUrl?: string;
}

export interface WalletInfo {
  address: Address;
  balance: bigint;
  chainId: number;
  isConnected: boolean;
}

/**
 * Manages wallet connections and operations
 */
export class WalletManager {
  private walletClient: WalletClient<Transport, Chain, Account> | null = null;
  private publicClient: PublicClient<Transport, Chain> | null = null;
  private config: WalletManagerConfig;

  constructor(config: WalletManagerConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Validates the wallet configuration
   */
  private validateConfig(): void {
    if (!this.config.privateKey) {
      throw new Error('Private key is required');
    }
    if (!this.config.chainId) {
      throw new Error('Chain ID is required');
    }
  }

  /**
   * Initializes the wallet connection
   */
  async initialize(
    walletClient: WalletClient<Transport, Chain, Account>,
    publicClient: PublicClient<Transport, Chain>
  ): Promise<void> {
    this.walletClient = walletClient;
    this.publicClient = publicClient;
  }

  /**
   * Gets the connected wallet address
   */
  getAddress(): Address | null {
    return this.walletClient?.account?.address ?? null;
  }

  /**
   * Gets wallet information
   */
  async getWalletInfo(): Promise<WalletInfo> {
    if (!this.publicClient || !this.walletClient?.account) {
      throw new Error('Wallet not initialized');
    }

    const address = this.walletClient.account.address;
    const balance = await this.publicClient.getBalance({ address });
    
    return {
      address,
      balance,
      chainId: this.config.chainId,
      isConnected: true,
    };
  }

  /**
   * Checks if the wallet has sufficient balance
   */
  async hasSufficientBalance(requiredAmount: bigint): Promise<boolean> {
    const info = await this.getWalletInfo();
    return info.balance >= requiredAmount;
  }

  /**
   * Sends a transaction
   */
  async sendTransaction(to: Address, value: bigint): Promise<`0x${string}`> {
    if (!this.walletClient?.account) {
      throw new Error('Wallet not initialized');
    }

    if (!isAddress(to)) {
      throw new Error('Invalid recipient address');
    }

    if (value <= 0n) {
      throw new Error('Value must be greater than 0');
    }

    const hash = await this.walletClient.sendTransaction({
      account: this.walletClient.account,
      to,
      value,
    });

    return hash;
  }

  /**
   * Gets the wallet balance formatted as ETH
   */
  async getBalanceFormatted(): Promise<string> {
    const info = await this.getWalletInfo();
    return formatEther(info.balance);
  }

  /**
   * Checks if wallet is connected
   */
  isConnected(): boolean {
    return this.walletClient !== null && this.publicClient !== null;
  }

  /**
   * Disconnects the wallet
   */
  disconnect(): void {
    this.walletClient = null;
    this.publicClient = null;
  }
}
