/**
 * Dune Analytics Integration
 * 
 * Uses Dune's TypeScript client to query blockchain data
 * for whale transactions and market signals.
 * 
 * API Docs: https://docs.dune.com/api-reference/overview
 */

import { DuneClient, QueryEngine } from '@duneanalytics/client-sdk';

// ============ Types ============

export interface WhaleTransaction {
  timestamp: string;
  sender: string;
  receiver: string;
  ethAmount: number;
  usdValue: number;
  direction: 'buy' | 'sell' | 'transfer';
  token: string;
}

export interface WhaleSignal {
  token: string;
  largeTransactions24h: number;
  netFlow: 'inflow' | 'outflow' | 'neutral';
  totalVolumeUsd: number;
  timestamp: number;
}

// ============ Dune Analytics Client ============

export class DuneAnalytics {
  private client: DuneClient | null = null;
  private apiKey: string | undefined;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes cache

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DUNE_API_KEY;
    
    if (this.apiKey) {
      this.client = new DuneClient(this.apiKey);
      console.log('🔍 Dune Analytics initialized');
    } else {
      console.warn('⚠️ Dune Analytics not configured (DUNE_API_KEY missing)');
    }
  }

  /**
   * Check if Dune is configured
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Get whale transactions on Base chain
   * Returns large transactions (> $50K by default) in last 24 hours
   */
  async getWhaleTransactions(minValueUsd: number = 50000): Promise<WhaleTransaction[]> {
    if (!this.client) {
      return this.getMockWhaleTransactions();
    }

    const cacheKey = `whale-txs-${minValueUsd}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const execution = await this.client.runSql({
        query_sql: `
          SELECT 
            block_time as timestamp,
            "from" as sender,
            "to" as receiver,
            value / 1e18 as eth_amount,
            value / 1e18 * 2500 as usd_value -- Approximate ETH price
          FROM base.transactions
          WHERE block_time > now() - interval '24' hour
          AND value / 1e18 > ${minValueUsd / 2500} -- Convert USD to ETH
          ORDER BY value DESC
          LIMIT 50
        `,
        performance: QueryEngine.Medium,
      });

      const transactions: WhaleTransaction[] = (execution.result?.rows || []).map((row: any) => ({
        timestamp: row.timestamp,
        sender: row.sender,
        receiver: row.receiver,
        ethAmount: Number(row.eth_amount),
        usdValue: Number(row.usd_value),
        direction: this.inferDirection(row.sender, row.receiver),
        token: 'ETH'
      }));

      this.cache.set(cacheKey, { data: transactions, timestamp: Date.now() });
      return transactions;
    } catch (error) {
      console.error('Dune API error:', error);
      return this.getMockWhaleTransactions();
    }
  }

  /**
   * Get whale signals for specific tokens
   * Analyzes large transaction patterns to detect accumulation/distribution
   */
  async getWhaleSignals(tokens: string[] = ['ETH', 'WETH', 'USDC']): Promise<WhaleSignal[]> {
    if (!this.client) {
      return this.getMockWhaleSignals(tokens);
    }

    const cacheKey = `whale-signals-${tokens.join(',')}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // For now, return aggregated signals based on transactions
      const transactions = await this.getWhaleTransactions();
      
      const signals: WhaleSignal[] = tokens.map(token => {
        const tokenTxs = transactions.filter(tx => tx.token === token);
        const buyVolume = tokenTxs
          .filter(tx => tx.direction === 'buy')
          .reduce((sum, tx) => sum + tx.usdValue, 0);
        const sellVolume = tokenTxs
          .filter(tx => tx.direction === 'sell')
          .reduce((sum, tx) => sum + tx.usdValue, 0);
        
        return {
          token,
          largeTransactions24h: tokenTxs.length,
          netFlow: buyVolume > sellVolume * 1.1 ? 'inflow' : 
                   sellVolume > buyVolume * 1.1 ? 'outflow' : 'neutral',
          totalVolumeUsd: buyVolume + sellVolume,
          timestamp: Date.now()
        };
      });

      this.cache.set(cacheKey, { data: signals, timestamp: Date.now() });
      return signals;
    } catch (error) {
      console.error('Dune signals error:', error);
      return this.getMockWhaleSignals(tokens);
    }
  }

  /**
   * Infer transaction direction based on known addresses
   */
  private inferDirection(from: string, to: string): 'buy' | 'sell' | 'transfer' {
    // Known DEX router addresses on Base
    const dexAddresses = [
      '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap V3
      '0xcF77a3Ba9A5CA399B7c97c74d54e5b1bEa2ec8a1', // Aerodrome
    ].map(a => a.toLowerCase());

    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();

    // If sending to DEX = sell, receiving from DEX = buy
    if (dexAddresses.includes(toLower)) return 'sell';
    if (dexAddresses.includes(fromLower)) return 'buy';
    
    return 'transfer';
  }

  /**
   * Mock data when Dune is not configured
   */
  private getMockWhaleTransactions(): WhaleTransaction[] {
    return [
      {
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        sender: '0x742d35Cc6634C0532925a3b844Bc9e7595f17c38',
        receiver: '0x2626664c2603336E57B271c5C0b26F421741e481',
        ethAmount: 50,
        usdValue: 125000,
        direction: 'sell',
        token: 'ETH'
      },
      {
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        sender: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1bEa2ec8a1',
        receiver: '0x8888888888888888888888888888888888888888',
        ethAmount: 30,
        usdValue: 75000,
        direction: 'buy',
        token: 'ETH'
      }
    ];
  }

  private getMockWhaleSignals(tokens: string[]): WhaleSignal[] {
    return tokens.map(token => ({
      token,
      largeTransactions24h: Math.floor(Math.random() * 10) + 1,
      netFlow: ['inflow', 'outflow', 'neutral'][Math.floor(Math.random() * 3)] as 'inflow' | 'outflow' | 'neutral',
      totalVolumeUsd: Math.floor(Math.random() * 1000000) + 100000,
      timestamp: Date.now()
    }));
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============ Singleton Export ============

let duneInstance: DuneAnalytics | null = null;

export function getDuneAnalytics(): DuneAnalytics {
  if (!duneInstance) {
    duneInstance = new DuneAnalytics();
  }
  return duneInstance;
}

export function resetDuneAnalytics(): void {
  duneInstance = null;
}
