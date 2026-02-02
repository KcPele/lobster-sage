import { vi } from 'vitest';
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import type { WalletClient, PublicClient, Account, Chain, Transport } from 'viem';

// Test wallet configuration
export const TEST_WALLET_CONFIG = {
  privateKey: '0x' + '1'.repeat(64),
  address: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  mockBalance: parseEther('10'),
  chain: baseSepolia,
};

/**
 * Creates a mock wallet client for testing
 */
export function createMockWalletClient(
  overrides: Partial<WalletClient<Transport, Chain, Account>> = {}
): WalletClient<Transport, Chain, Account> {
  const mockAccount = privateKeyToAccount(TEST_WALLET_CONFIG.privateKey as `0x${string}`);

  return {
    account: mockAccount,
    chain: baseSepolia,
    transport: http('http://localhost:8545'),
    key: 'mock',
    name: 'Mock Wallet Client',
    type: 'walletClient',
    uid: 'mock-wallet-uid',
    
    // Mock methods
    request: vi.fn().mockResolvedValue({}),
    sendTransaction: vi.fn().mockResolvedValue('0xtxhash'),
    writeContract: vi.fn().mockResolvedValue('0xtxhash'),
    signMessage: vi.fn().mockResolvedValue('0xsignature'),
    signTypedData: vi.fn().mockResolvedValue('0xsignature'),
    deployContract: vi.fn().mockResolvedValue('0xcontractaddress'),
    getAddresses: vi.fn().mockResolvedValue([TEST_WALLET_CONFIG.address]),
    getChainId: vi.fn().mockResolvedValue(baseSepolia.id),
    prepareTransactionRequest: vi.fn().mockResolvedValue({}),
    signTransaction: vi.fn().mockResolvedValue('0xsignedtx'),
    addChain: vi.fn().mockResolvedValue(undefined),
    switchChain: vi.fn().mockResolvedValue(undefined),
    watchChainId: vi.fn().mockReturnValue(vi.fn()),
    getPermissions: vi.fn().mockResolvedValue([]),
    requestPermissions: vi.fn().mockResolvedValue([]),
    requestAddresses: vi.fn().mockResolvedValue([TEST_WALLET_CONFIG.address]),
    
    ...overrides,
  } as unknown as WalletClient<Transport, Chain, Account>;
}

/**
 * Creates a mock public client for testing
 */
export function createMockPublicClient(
  overrides: Partial<PublicClient<Transport, Chain>> = {}
): PublicClient<Transport, Chain> {
  return {
    chain: baseSepolia,
    transport: http('http://localhost:8545'),
    key: 'mock',
    name: 'Mock Public Client',
    type: 'publicClient',
    uid: 'mock-public-uid',
    
    // Mock methods
    getBalance: vi.fn().mockResolvedValue(TEST_WALLET_CONFIG.mockBalance),
    getBlock: vi.fn().mockResolvedValue({
      number: 1000n,
      timestamp: 1704067200n,
      hash: '0xblockhash',
    }),
    getBlockNumber: vi.fn().mockResolvedValue(1000n),
    getGasPrice: vi.fn().mockResolvedValue(parseEther('0.00000001')),
    estimateGas: vi.fn().mockResolvedValue(21000n),
    getTransaction: vi.fn().mockResolvedValue({
      hash: '0xtxhash',
      from: TEST_WALLET_CONFIG.address,
      to: '0xrecipient',
      value: parseEther('1'),
    }),
    getTransactionReceipt: vi.fn().mockResolvedValue({
      status: 'success',
      transactionHash: '0xtxhash',
      blockNumber: 1000n,
    }),
    getTransactionCount: vi.fn().mockResolvedValue(5),
    readContract: vi.fn().mockResolvedValue({}),
    simulateContract: vi.fn().mockResolvedValue({ result: {} }),
    multicall: vi.fn().mockResolvedValue([]),
    watchBlockNumber: vi.fn().mockReturnValue(vi.fn()),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      status: 'success',
      transactionHash: '0xtxhash',
    }),
    
    ...overrides,
  } as unknown as PublicClient<Transport, Chain>;
}

/**
 * Mock CDP Wallet for AgentKit testing
 */
export function createMockCDPWallet(overrides: Record<string, any> = {}) {
  return {
    id: 'test-wallet-id',
    networkId: 'base-sepolia',
    defaultAddress: {
      id: TEST_WALLET_CONFIG.address,
      networkId: 'base-sepolia',
      publicKey: '0xpubkey',
    },
    addresses: [
      {
        id: TEST_WALLET_CONFIG.address,
        networkId: 'base-sepolia',
        publicKey: '0xpubkey',
      },
    ],
    
    // Mock methods
    getBalance: vi.fn().mockResolvedValue(TEST_WALLET_CONFIG.mockBalance),
    transfer: vi.fn().mockResolvedValue({
      transactionHash: '0xtxhash',
      transactionLink: 'https://sepolia.basescan.org/tx/0xtxhash',
    }),
    invokeContract: vi.fn().mockResolvedValue({
      transactionHash: '0xtxhash',
      transactionLink: 'https://sepolia.basescan.org/tx/0xtxhash',
    }),
    deployToken: vi.fn().mockResolvedValue({
      contractAddress: '0xcontractaddress',
      transactionHash: '0xtxhash',
    }),
    deployNft: vi.fn().mockResolvedValue({
      contractAddress: '0xcontractaddress',
      transactionHash: '0xtxhash',
    }),
    trade: vi.fn().mockResolvedValue({
      transactionHash: '0xtxhash',
      transactionLink: 'https://sepolia.basescan.org/tx/0xtxhash',
    }),
    faucet: vi.fn().mockResolvedValue({
      transactionHash: '0xtxhash',
      transactionLink: 'https://sepolia.basescan.org/tx/0xtxhash',
    }),
    
    ...overrides,
  };
}

/**
 * Mock wallet data for testing
 */
export const mockWalletData = {
  address: TEST_WALLET_CONFIG.address,
  balance: TEST_WALLET_CONFIG.mockBalance,
  network: 'base-sepolia',
  chainId: baseSepolia.id,
};
