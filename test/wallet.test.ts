import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { WalletManager } from '../src/wallet/manager';

describe('WalletManager', () => {
  let walletManager: WalletManager;

  beforeEach(() => {
    walletManager = new WalletManager({
      networkId: 'base-sepolia',
    });
  });

  it('should create wallet manager instance', () => {
    expect(walletManager).toBeDefined();
    expect(walletManager.getIsInitialized()).toBe(false);
  });

  it('should return correct network id', () => {
    expect(walletManager.getNativeSymbol()).toBe('ETH');
  });

  // Note: CDP integration tests require valid credentials
  // These would be run with actual credentials in CI/CD
  describe.skip('with CDP credentials', () => {
    it('should initialize with valid credentials', async () => {
      await walletManager.initialize();
      expect(walletManager.getIsInitialized()).toBe(true);
    });

    it('should get wallet address', async () => {
      await walletManager.initialize();
      const address = await walletManager.getAddress();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should get ETH balance', async () => {
      await walletManager.initialize();
      const balance = await walletManager.getBalance();
      expect(typeof balance).toBe('string');
      expect(parseFloat(balance)).toBeGreaterThanOrEqual(0);
    });
  });
});
