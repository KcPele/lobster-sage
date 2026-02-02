import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Configuration schema validation
const ConfigSchema = z.object({
  // Network
  network: z.enum(['base-sepolia', 'base-mainnet']).default('base-sepolia'),
  
  // CDP SDK
  cdpApiKeyName: z.string().optional(),
  cdpApiKeyPrivateKey: z.string().optional(),
  cdpWalletSecret: z.string().optional(),
  
  // RPC URLs
  baseSepoliaRpc: z.string().default('https://sepolia.base.org'),
  baseMainnetRpc: z.string().default('https://mainnet.base.org'),
  
  // Contract Addresses
  prophecyNftContract: z.string().default('0x0000000000000000000000000000000000000000'),
  reputationContract: z.string().default('0x0000000000000000000000000000000000000000'),
  
  // Agent Configuration
  agentMode: z.enum(['autonomous', 'manual']).default('manual'),
  predictionInterval: z.coerce.number().default(21600), // 6 hours in seconds
  yieldRebalanceInterval: z.coerce.number().default(3600), // 1 hour in seconds
  minConfidence: z.coerce.number().min(0).max(100).default(65),
  maxTransactionSizeUsd: z.coerce.number().default(1000),
  
  // Security
  emergencyPause: z.coerce.boolean().default(false),
  whitelistOnly: z.coerce.boolean().default(true),
  
  // Social
  twitterEnabled: z.coerce.boolean().default(false),
  farcasterEnabled: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const config = ConfigSchema.parse({
    network: process.env.NETWORK_ID,
    cdpApiKeyName: process.env.CDP_API_KEY_NAME,
    cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
    cdpWalletSecret: process.env.CDP_WALLET_SECRET,
    baseSepoliaRpc: process.env.BASE_SEPOLIA_RPC,
    baseMainnetRpc: process.env.BASE_MAINNET_RPC,
    prophecyNftContract: process.env.PROPHECY_NFT_CONTRACT,
    reputationContract: process.env.REPUTATION_CONTRACT,
    agentMode: process.env.AGENT_MODE,
    predictionInterval: process.env.PREDICTION_INTERVAL,
    yieldRebalanceInterval: process.env.YIELD_REBALANCE_INTERVAL,
    minConfidence: process.env.MIN_CONFIDENCE,
    maxTransactionSizeUsd: process.env.MAX_TRANSACTION_SIZE_USD,
    emergencyPause: process.env.EMERGENCY_PAUSE,
    whitelistOnly: process.env.WHITELIST_ONLY,
    twitterEnabled: process.env.TWITTER_API_KEY ? true : false,
    farcasterEnabled: process.env.FARCASTER_MNEMONIC ? true : false,
  });

  return config;
}

/**
 * Get current configuration
 */
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reload configuration
 */
export function reloadConfig(): Config {
  configInstance = loadConfig();
  return configInstance;
}

/**
 * Get RPC URL for current network
 */
export function getRpcUrl(network?: string): string {
  const cfg = getConfig();
  const net = network || cfg.network;
  return net === 'base-mainnet' ? cfg.baseMainnetRpc : cfg.baseSepoliaRpc;
}

/**
 * Get explorer URL for current network
 */
export function getExplorerUrl(network?: string): string {
  const cfg = getConfig();
  const net = network || cfg.network;
  return net === 'base-mainnet' ? 'https://basescan.org' : 'https://sepolia.basescan.org';
}

/**
 * Get chain ID for current network
 */
export function getChainId(network?: string): number {
  const net = network || getConfig().network;
  return net === 'base-mainnet' ? 8453 : 84532;
}
