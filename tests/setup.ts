// Test setup file - runs before all tests
import { vi } from 'vitest';

// Mock environment variables
process.env.CDP_API_KEY_NAME = 'test-api-key';
process.env.CDP_API_KEY_PRIVATE_KEY = 'test-private-key';
process.env.NETWORK_ID = 'base-sepolia';
process.env.PRIVATE_KEY = '0x' + '1'.repeat(64);
process.env.OPENAI_API_KEY = 'test-openai-key';

// Global test utilities
declare global {
  var TEST_MOCKS: {
    wallet: any;
    provider: any;
  };
}

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Clean up after all tests in a file
afterAll(() => {
  vi.restoreAllMocks();
});
