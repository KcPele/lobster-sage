import { describe, it, expect } from 'vitest';
import { getConfig, getRpcUrl, getExplorerUrl, getChainId } from '../src/config';

describe('Config', () => {
  it('should load configuration', () => {
    const config = getConfig();
    expect(config).toBeDefined();
    expect(config.network).toBeDefined();
  });

  it('should return correct RPC URLs', () => {
    const sepoliaRpc = getRpcUrl('base-sepolia');
    expect(sepoliaRpc).toContain('sepolia');

    const mainnetRpc = getRpcUrl('base-mainnet');
    expect(mainnetRpc).toContain('mainnet');
  });

  it('should return correct explorer URLs', () => {
    const sepoliaExplorer = getExplorerUrl('base-sepolia');
    expect(sepoliaExplorer).toContain('sepolia');

    const mainnetExplorer = getExplorerUrl('base-mainnet');
    expect(mainnetExplorer).not.toContain('sepolia');
  });

  it('should return correct chain IDs', () => {
    expect(getChainId('base-sepolia')).toBe(84532);
    expect(getChainId('base-mainnet')).toBe(8453);
  });
});
