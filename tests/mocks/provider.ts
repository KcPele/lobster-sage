import { vi } from 'vitest';
import { parseEther, formatEther } from 'viem';
import { baseSepolia } from 'viem/chains';

/**
 * Mock Base Sepolia provider for testing
 */
export function createMockBaseSepoliaProvider(overrides: Record<string, any> = {}) {
  const mockProvider = {
    // Chain info
    chain: baseSepolia,
    chainId: baseSepolia.id,
    network: 'base-sepolia',
    rpcUrl: 'https://sepolia.base.org',
    
    // Connection state
    isConnected: true,
    isConnecting: false,
    
    // Mock methods
    connect: vi.fn().mockResolvedValue({
      address: '0x1234567890123456789012345678901234567890',
      chainId: baseSepolia.id,
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getNetwork: vi.fn().mockReturnValue({
      chainId: baseSepolia.id,
      name: 'Base Sepolia',
    }),
    
    // Block methods
    getBlockNumber: vi.fn().mockResolvedValue(1000n),
    getBlock: vi.fn().mockResolvedValue({
      number: 1000n,
      hash: '0xblockhash',
      timestamp: 1704067200n,
      gasLimit: parseEther('30'),
      gasUsed: parseEther('15'),
      transactions: [],
    }),
    
    // Transaction methods
    getTransaction: vi.fn().mockResolvedValue({
      hash: '0xtxhash',
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      value: parseEther('1'),
      gas: 21000n,
      gasPrice: parseEther('0.00000001'),
      nonce: 5,
    }),
    getTransactionReceipt: vi.fn().mockResolvedValue({
      status: 'success',
      transactionHash: '0xtxhash',
      blockNumber: 1000n,
      gasUsed: 21000n,
      effectiveGasPrice: parseEther('0.00000001'),
    }),
    
    // Balance methods
    getBalance: vi.fn().mockImplementation((address: string) => {
      // Return different balances based on address
      const balances: Record<string, bigint> = {
        '0x1234567890123456789012345678901234567890': parseEther('10'),
        '0x0987654321098765432109876543210987654321': parseEther('5'),
        '0x0000000000000000000000000000000000000000': parseEther('0'),
      };
      return Promise.resolve(balances[address] || parseEther('1'));
    }),
    
    // Gas methods
    getGasPrice: vi.fn().mockResolvedValue(parseEther('0.000000001')),
    estimateGas: vi.fn().mockResolvedValue(21000n),
    
    // Contract methods
    call: vi.fn().mockResolvedValue('0x00'),
    estimateContractGas: vi.fn().mockResolvedValue(100000n),
    
    // Event methods
    getLogs: vi.fn().mockResolvedValue([]),
    watchBlocks: vi.fn().mockReturnValue(vi.fn()),
    watchPendingTransactions: vi.fn().mockReturnValue(vi.fn()),
    
    // Error simulation
    simulateError: vi.fn().mockImplementation((errorType: string) => {
      const errors: Record<string, Error> = {
        network: new Error('Network error: Failed to connect to Base Sepolia'),
        timeout: new Error('Request timeout'),
        rateLimit: new Error('Rate limit exceeded'),
        invalidAddress: new Error('Invalid address format'),
        insufficientFunds: new Error('Insufficient funds for transaction'),
      };
      throw errors[errorType] || new Error('Unknown error');
    }),
    
    ...overrides,
  };

  return mockProvider;
}

/**
 * Mock for common Base Sepolia contract addresses
 */
export const BASE_SEPOLIA_CONTRACTS = {
  // Common DeFi contracts on Base Sepolia
  uniswapV2Router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  weth: '0x4200000000000000000000000000000000000006',
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  dai: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  
  // Mock prediction market contracts
  predictionMarket: '0xPredictionMarketAddress',
  reputationToken: '0xReputationTokenAddress',
  yieldStrategy: '0xYieldStrategyAddress',
};

/**
 * Mock block data for Base Sepolia
 */
export function createMockBlock(overrides: Record<string, any> = {}) {
  return {
    number: 1000n,
    hash: '0xblockhash1234567890abcdef1234567890abcdef',
    timestamp: 1704067200n,
    parentHash: '0xparentblockhash1234567890abcdef',
    nonce: '0x0',
    difficulty: 0n,
    gasLimit: 30000000n,
    gasUsed: 15000000n,
    miner: '0xmineraddress12345678901234567890',
    extraData: '0x',
    baseFeePerGas: parseEther('0.000000001'),
    transactions: [],
    logsBloom: '0x' + '0'.repeat(512),
    mixHash: '0x' + '0'.repeat(64),
    receiptsRoot: '0x' + '0'.repeat(64),
    sha3Uncles: '0x' + '0'.repeat(64),
    stateRoot: '0x' + '0'.repeat(64),
    transactionsRoot: '0x' + '0'.repeat(64),
    size: 1000n,
    totalDifficulty: 0n,
    uncles: [],
    ...overrides,
  };
}

/**
 * Mock transaction receipt with various states
 */
export function createMockTransactionReceipt(
  status: 'success' | 'reverted' = 'success',
  overrides: Record<string, any> = {}
) {
  return {
    status,
    transactionHash: '0xtxhash1234567890abcdef',
    transactionIndex: 0,
    blockHash: '0xblockhash1234567890abcdef',
    blockNumber: 1000n,
    from: '0x1234567890123456789012345678901234567890',
    to: '0x0987654321098765432109876543210987654321',
    gasUsed: 21000n,
    cumulativeGasUsed: 21000n,
    effectiveGasPrice: parseEther('0.000000001'),
    logs: [],
    logsBloom: '0x' + '0'.repeat(512),
    contractAddress: null,
    type: 'eip1559',
    ...overrides,
  };
}

/**
 * Helper to simulate network conditions
 */
export function simulateNetworkCondition(
  condition: 'fast' | 'slow' | 'error' | 'offline'
): Promise<void> {
  const delays = {
    fast: 50,
    slow: 2000,
    error: 0,
    offline: 5000,
  };

  if (condition === 'error' || condition === 'offline') {
    return Promise.reject(
      new Error(
        condition === 'error'
          ? 'Network request failed'
          : 'Network is offline'
      )
    );
  }

  return new Promise((resolve) => setTimeout(resolve, delays[condition]));
}
