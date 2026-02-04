/**
 * Aave V3 Protocol Integration
 * 
 * Handles lending, borrowing, and account management on Aave V3
 * Network: Base Mainnet & Base Sepolia
 */

import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';

// Aave V3 Pool ABI
export const AAVE_V3_POOL_ABI = [
  // Supply
  {
    inputs: [
      { internalType: 'address', name: 'asset', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'address', name: 'onBehalfOf', type: 'address' },
      { internalType: 'uint16', name: 'referralCode', type: 'uint16' },
    ],
    name: 'supply',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Withdraw
  {
    inputs: [
      { internalType: 'address', name: 'asset', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'address', name: 'to', type: 'address' },
    ],
    name: 'withdraw',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Borrow
  {
    inputs: [
      { internalType: 'address', name: 'asset', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'interestRateMode', type: 'uint256' },
      { internalType: 'uint16', name: 'referralCode', type: 'uint16' },
      { internalType: 'address', name: 'onBehalfOf', type: 'address' },
    ],
    name: 'borrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Repay
  {
    inputs: [
      { internalType: 'address', name: 'asset', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'interestRateMode', type: 'uint256' },
      { internalType: 'address', name: 'onBehalfOf', type: 'address' },
    ],
    name: 'repay',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Get User Account Data
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getUserAccountData',
    outputs: [
      { internalType: 'uint256', name: 'totalCollateralBase', type: 'uint256' },
      { internalType: 'uint256', name: 'totalDebtBase', type: 'uint256' },
      { internalType: 'uint256', name: 'availableBorrowsBase', type: 'uint256' },
      { internalType: 'uint256', name: 'currentLiquidationThreshold', type: 'uint256' },
      { internalType: 'uint256', name: 'ltv', type: 'uint256' },
      { internalType: 'uint256', name: 'healthFactor', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC20 ABI for approvals
export const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Protocol addresses
export const AAVE_ADDRESSES = {
  base: {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as Address,
    poolDataProvider: '0x2d8A3C567805972153fc67B4693D429b04e843Bd' as Address,
    rewardsController: '0xf9cc4F0D883F4379D0d4F4667FE33898eADf6ad7' as Address,
  },
  baseSepolia: {
    pool: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27' as Address,
    poolDataProvider: '0xa69D14FB5819297C3824a36a7C3b813Ab625B4Aa' as Address,
    rewardsController: '0x0000000000000000000000000000000000000000' as Address,
  },
};

// Interest rate modes
export enum InterestRateMode {
  NONE = 0,
  STABLE = 1,
  VARIABLE = 2,
}

// User account data interface
export interface UserAccountData {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
}

// Transaction options
export interface TransactionOptions {
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

// Aave V3 Error types
export class AaveV3Error extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'AaveV3Error';
  }
}

export class InsufficientAllowanceError extends AaveV3Error {
  constructor(required: string, current: string) {
    super(
      `Insufficient allowance. Required: ${required}, Current: ${current}`,
      'INSUFFICIENT_ALLOWANCE'
    );
  }
}

export class InsufficientBalanceError extends AaveV3Error {
  constructor(asset: string, required: string, current: string) {
    super(
      `Insufficient ${asset} balance. Required: ${required}, Current: ${current}`,
      'INSUFFICIENT_BALANCE'
    );
  }
}

export class HealthFactorTooLowError extends AaveV3Error {
  constructor(healthFactor: string) {
    super(
      `Health factor too low: ${healthFactor}. Must be >= 1.0 to avoid liquidation.`,
      'HEALTH_FACTOR_TOO_LOW'
    );
  }
}

/**
 * Aave V3 Protocol Integration Class
 */
export class AaveV3 {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private poolAddress: Address;
  private chain: Chain;

  constructor(
    network: 'base' | 'baseSepolia' = 'base',
    walletClient?: WalletClient,
    customRpcUrl?: string
  ) {
    this.chain = network === 'base' ? base : baseSepolia;
    this.poolAddress = AAVE_ADDRESSES[network].pool;
    this.walletClient = walletClient;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: customRpcUrl ? http(customRpcUrl) : http(),
    });
  }

  /**
   * Set wallet client for write operations
   */
  setWalletClient(walletClient: WalletClient): void {
    this.walletClient = walletClient;
  }

  /**
   * Ensure wallet client is available for write operations
   */
  private ensureWalletClient(): WalletClient {
    if (!this.walletClient) {
      throw new AaveV3Error(
        'Wallet client not initialized. Call setWalletClient() first.',
        'WALLET_NOT_INITIALIZED'
      );
    }
    return this.walletClient;
  }

  /**
   * Get the account address from wallet client
   */
  private getAccount(): Address {
    const wallet = this.ensureWalletClient();
    if (!wallet.account) {
      throw new AaveV3Error(
        'No account available in wallet client',
        'NO_ACCOUNT'
      );
    }
    return wallet.account.address;
  }

  /**
   * Check and handle token approval
   */
  private async ensureApproval(
    tokenAddress: Address,
    amount: bigint
  ): Promise<void> {
    const account = this.getAccount();
    const wallet = this.ensureWalletClient();

    try {
      const currentAllowance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account, this.poolAddress],
      });

      if (currentAllowance < amount) {
        const hash = await wallet.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [this.poolAddress, amount],
          chain: this.chain,
          account: wallet.account!,
        });

        // Wait for approval transaction
        await this.publicClient.waitForTransactionReceipt({ hash });
      }
    } catch (error) {
      if (error instanceof AaveV3Error) throw error;
      throw new AaveV3Error(
        `Failed to approve token ${tokenAddress}`,
        'APPROVAL_ERROR',
        error as Error
      );
    }
  }

  /**
   * Supply assets to Aave
   * @param asset - Token address to supply
   * @param amount - Amount to supply (in token units)
   * @param onBehalfOf - Address to supply on behalf of (defaults to sender)
   * @param referralCode - Referral code (default 0)
   * @param options - Transaction options
   * @returns Transaction hash
   */
  async supply(
    asset: Address,
    amount: bigint,
    onBehalfOf?: Address,
    referralCode: number = 0,
    options?: TransactionOptions
  ): Promise<Hash> {
    const wallet = this.ensureWalletClient();
    const account = this.getAccount();
    const recipient = onBehalfOf || account;

    try {
      // Ensure approval
      await this.ensureApproval(asset, amount);

      // Execute supply
      const hash = await wallet.writeContract({
        address: this.poolAddress,
        abi: AAVE_V3_POOL_ABI,
        functionName: 'supply',
        args: [asset, amount, recipient, referralCode],
        chain: this.chain,
        account: wallet.account!,
        gas: options?.gasLimit,
        maxFeePerGas: options?.maxFeePerGas,
        maxPriorityFeePerGas: options?.maxPriorityFeePerGas,
      });

      return hash;
    } catch (error) {
      if (error instanceof AaveV3Error) throw error;
      throw new AaveV3Error(
        `Supply failed for asset ${asset}`,
        'SUPPLY_ERROR',
        error as Error
      );
    }
  }

  /**
   * Withdraw assets from Aave
   * @param asset - Token address to withdraw
   * @param amount - Amount to withdraw (in token units, use max uint256 for all)
   * @param to - Address to send withdrawn assets to (defaults to sender)
   * @param options - Transaction options
   * @returns Transaction hash
   */
  async withdraw(
    asset: Address,
    amount: bigint,
    to?: Address,
    options?: TransactionOptions
  ): Promise<Hash> {
    const wallet = this.ensureWalletClient();
    const account = this.getAccount();
    const recipient = to || account;

    try {
      // Check health factor before withdrawal if withdrawing collateral
      const accountData = await this.getUserAccountData(account);
      if (accountData.totalDebtBase > 0n && amount === maxUint256) {
        // Withdrawing all collateral with debt can be risky
        console.warn('Withdrawing all collateral while having active debt');
      }

      const hash = await wallet.writeContract({
        address: this.poolAddress,
        abi: AAVE_V3_POOL_ABI,
        functionName: 'withdraw',
        args: [asset, amount, recipient],
        chain: this.chain,
        account: wallet.account!,
        gas: options?.gasLimit,
        maxFeePerGas: options?.maxFeePerGas,
        maxPriorityFeePerGas: options?.maxPriorityFeePerGas,
      });

      return hash;
    } catch (error) {
      if (error instanceof AaveV3Error) throw error;
      throw new AaveV3Error(
        `Withdraw failed for asset ${asset}`,
        'WITHDRAW_ERROR',
        error as Error
      );
    }
  }

  /**
   * Borrow assets from Aave
   * @param asset - Token address to borrow
   * @param amount - Amount to borrow (in token units)
   * @param interestRateMode - Interest rate mode (STABLE or VARIABLE)
   * @param referralCode - Referral code (default 0)
   * @param onBehalfOf - Address to borrow on behalf of (defaults to sender)
   * @param options - Transaction options
   * @returns Transaction hash
   */
  async borrow(
    asset: Address,
    amount: bigint,
    interestRateMode: InterestRateMode = InterestRateMode.VARIABLE,
    referralCode: number = 0,
    onBehalfOf?: Address,
    options?: TransactionOptions
  ): Promise<Hash> {
    const wallet = this.ensureWalletClient();
    const account = this.getAccount();
    const recipient = onBehalfOf || account;

    try {
      // Check available borrow capacity
      const accountData = await this.getUserAccountData(account);
      if (accountData.availableBorrowsBase === 0n) {
        throw new AaveV3Error(
          'No borrow capacity available. Supply collateral first.',
          'NO_BORROW_CAPACITY'
        );
      }

      const hash = await wallet.writeContract({
        address: this.poolAddress,
        abi: AAVE_V3_POOL_ABI,
        functionName: 'borrow',
        args: [asset, amount, BigInt(interestRateMode), referralCode, recipient],
        chain: this.chain,
        account: wallet.account!,
        gas: options?.gasLimit,
        maxFeePerGas: options?.maxFeePerGas,
        maxPriorityFeePerGas: options?.maxPriorityFeePerGas,
      });

      return hash;
    } catch (error) {
      if (error instanceof AaveV3Error) throw error;
      throw new AaveV3Error(
        `Borrow failed for asset ${asset}`,
        'BORROW_ERROR',
        error as Error
      );
    }
  }

  /**
   * Repay borrowed assets
   * @param asset - Token address to repay
   * @param amount - Amount to repay (in token units, use max uint256 for full repayment)
   * @param interestRateMode - Interest rate mode of the debt
   * @param onBehalfOf - Address to repay on behalf of (defaults to sender)
   * @param options - Transaction options
   * @returns Transaction hash
   */
  async repay(
    asset: Address,
    amount: bigint,
    interestRateMode: InterestRateMode = InterestRateMode.VARIABLE,
    onBehalfOf?: Address,
    options?: TransactionOptions
  ): Promise<Hash> {
    const wallet = this.ensureWalletClient();
    const account = this.getAccount();
    const recipient = onBehalfOf || account;

    try {
      // Ensure approval
      await this.ensureApproval(asset, amount);

      const hash = await wallet.writeContract({
        address: this.poolAddress,
        abi: AAVE_V3_POOL_ABI,
        functionName: 'repay',
        args: [asset, amount, BigInt(interestRateMode), recipient],
        chain: this.chain,
        account: wallet.account!,
        gas: options?.gasLimit,
        maxFeePerGas: options?.maxFeePerGas,
        maxPriorityFeePerGas: options?.maxPriorityFeePerGas,
      });

      return hash;
    } catch (error) {
      if (error instanceof AaveV3Error) throw error;
      throw new AaveV3Error(
        `Repay failed for asset ${asset}`,
        'REPAY_ERROR',
        error as Error
      );
    }
  }

  /**
   * Get user account data from Aave
   * @param user - User address to query
   * @returns User account data including collateral, debt, and health factor
   */
  async getUserAccountData(user: Address): Promise<UserAccountData> {
    try {
      const data = await this.publicClient.readContract({
        address: this.poolAddress,
        abi: AAVE_V3_POOL_ABI,
        functionName: 'getUserAccountData',
        args: [user],
      });

      return {
        totalCollateralBase: data[0],
        totalDebtBase: data[1],
        availableBorrowsBase: data[2],
        currentLiquidationThreshold: data[3],
        ltv: data[4],
        healthFactor: data[5],
      };
    } catch (error) {
      throw new AaveV3Error(
        `Failed to get account data for ${user}`,
        'ACCOUNT_DATA_ERROR',
        error as Error
      );
    }
  }

  /**
   * Get formatted user account data for display
   * @param user - User address to query
   * @returns Formatted account data
   */
  async getFormattedUserAccountData(user: Address): Promise<{
    totalCollateralUsd: string;
    totalDebtUsd: string;
    availableBorrowsUsd: string;
    liquidationThreshold: string;
    ltv: string;
    healthFactor: string;
    isHealthy: boolean;
  }> {
    const data = await this.getUserAccountData(user);

    // Aave uses 8 decimals for USD values
    const usdDecimals = 8;
    const pctDecimals = 4;

    // Health factor uses 18 decimals, 1e18 = 1.0
    const healthFactorValue = Number(data.healthFactor) / 1e18;

    return {
      totalCollateralUsd: formatUnits(data.totalCollateralBase, usdDecimals),
      totalDebtUsd: formatUnits(data.totalDebtBase, usdDecimals),
      availableBorrowsUsd: formatUnits(data.availableBorrowsBase, usdDecimals),
      liquidationThreshold: `${(Number(data.currentLiquidationThreshold) / 10 ** pctDecimals).toFixed(2)}%`,
      ltv: `${(Number(data.ltv) / 10 ** pctDecimals).toFixed(2)}%`,
      healthFactor: healthFactorValue.toFixed(2),
      isHealthy: healthFactorValue >= 1.0,
    };
  }

  /**
   * Wait for transaction confirmation
   * @param hash - Transaction hash
   * @param confirmations - Number of confirmations to wait for (default 1)
   * @returns Transaction receipt
   */
  async waitForTransaction(
    hash: Hash,
    confirmations: number = 1
  ) {
    try {
      return await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations,
      });
    } catch (error) {
      throw new AaveV3Error(
        `Transaction ${hash} failed or timed out`,
        'TRANSACTION_ERROR',
        error as Error
      );
    }
  }

  /**
   * Check if a transaction was successful
   * @param hash - Transaction hash
   * @returns True if successful, false otherwise
   */
  async isTransactionSuccessful(hash: Hash): Promise<boolean> {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch {
      return false;
    }
  }
}

// Re-export types
export { Address, Hash, type PublicClient, type WalletClient };

// Helper constant for max uint256 (use for withdrawing all)
import { maxUint256 } from 'viem';
export { maxUint256 };
