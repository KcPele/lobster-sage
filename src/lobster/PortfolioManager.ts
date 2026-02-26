/**
 * PortfolioManager - Manages portfolio operations and balances
 *
 * Handles:
 * - Portfolio summary calculations
 * - Token balances across wallet and protocols
 * - Active positions tracking
 * - Aave asset balances
 */

import { WalletManager } from '../wallet/manager';
import { UniswapV3, BASE_TOKENS, SEPOLIA_TOKENS } from '../defi/UniswapV3';
import { AaveV3 } from '../defi/AaveV3';
import { Prophesier } from '../sage/prophesier';
import { OnchainReputationSystem } from '../sage/reputation';
import { YieldOptimizer } from '../yield/optimizer';
import { getCoinGecko } from '../data/coingecko';
import { getTokenDecimals, isStablecoin } from '../defi/token-registry';
import { PortfolioSummary } from '../types';

export interface TokenBalance {
  balance: string;
  usdValue: number;
}

export interface AllTokenBalances {
  tokens: Record<string, TokenBalance>;
  totalUsd: number;
}

export interface AavePosition {
  token: string;
  supplied: string;
  apy: number;
  valueUsd: number;
}

export interface PositionWithPnL {
  tokenId: string;
  market: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  pnlPercent: number;
  pnlUsd: number;
  stakeAmount: number;
  remainingTimeMs: number;
  status: string;
}

export interface AllPositions {
  predictions: PositionWithPnL[];
  aave: AavePosition[];
  wallet: Record<string, TokenBalance>;
}

/**
 * PortfolioManager class for handling all portfolio-related operations
 */
export class PortfolioManager {
  private wallet: WalletManager;
  private uniswap: UniswapV3;
  private aave: AaveV3;
  private prophesier: Prophesier;
  private reputation: OnchainReputationSystem;
  private yieldOptimizer: YieldOptimizer;

  constructor(
    wallet: WalletManager,
    uniswap: UniswapV3,
    aave: AaveV3,
    prophesier: Prophesier,
    reputation: OnchainReputationSystem,
    yieldOptimizer: YieldOptimizer
  ) {
    this.wallet = wallet;
    this.uniswap = uniswap;
    this.aave = aave;
    this.prophesier = prophesier;
    this.reputation = reputation;
    this.yieldOptimizer = yieldOptimizer;
  }

  /**
   * Get portfolio summary
   * Returns total value, active predictions, reputation score, and yield positions
   */
  async getPortfolioSummary(): Promise<PortfolioSummary> {
    const ethBalance = parseFloat(await this.wallet.getBalance());

    // Approximate ETH price (will be improved with real price data)
    const coinGecko = getCoinGecko();
    const ethPrice = await coinGecko.getEthPrice();
    const totalValue = ethBalance * ethPrice;

    const activePredictions = await this.prophesier.getActivePredictionsCount();
    const reputationData = await this.reputation.getReputation(await this.wallet.getAddress());
    const reputationScore = reputationData ? reputationData.totalScore / 100 : 0;
    const yieldPositions = await this.yieldOptimizer.getPositions();

    return {
      totalValue,
      totalValueChange24h: 0, // Calculate from history
      activePredictions,
      reputationScore,
      yieldPositions: yieldPositions.length,
      lastUpdate: Date.now()
    };
  }

  /**
   * Get all token balances with USD values
   * Returns wallet balances for ETH and all ERC20 tokens
   */
  async getAllTokenBalances(): Promise<AllTokenBalances> {
    const coinGecko = getCoinGecko();
    const networkId = await this.wallet.getNetworkId();
    const TOKENS: any = networkId === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;

    const tokens: Record<string, TokenBalance> = {};
    let totalUsd = 0;

    // Get ETH balance
    const ethBalance = parseFloat(await this.wallet.getBalance());
    const ethPrice = await coinGecko.getEthPrice();
    const ethUsdValue = ethBalance * ethPrice;
    tokens['ETH'] = {
      balance: ethBalance.toFixed(6),
      usdValue: Number(ethUsdValue.toFixed(2))
    };
    totalUsd += ethUsdValue;

    // Get WETH balance (if different from ETH on this network)
    try {
      const wethBalance = await this.uniswap.getTokenBalance(TOKENS.WETH);
      if (wethBalance > 0n) {
        const wethBalanceFormatted = Number(wethBalance) / 1e18;
        const wethUsdValue = wethBalanceFormatted * ethPrice;
        tokens['WETH'] = {
          balance: wethBalanceFormatted.toFixed(6),
          usdValue: Number(wethUsdValue.toFixed(2))
        };
        totalUsd += wethUsdValue;
      }
    } catch (error) {
      console.warn('Could not fetch WETH balance:', error);
    }

    // Get USDC balance
    try {
      const usdcBalance = await this.uniswap.getTokenBalance(TOKENS.USDC);
      if (usdcBalance > 0n) {
        const usdcBalanceFormatted = Number(usdcBalance) / 1e6;
        tokens['USDC'] = {
          balance: usdcBalanceFormatted.toFixed(2),
          usdValue: Number(usdcBalanceFormatted.toFixed(2))
        };
        totalUsd += usdcBalanceFormatted;
      }
    } catch (error) {
      console.warn('Could not fetch USDC balance:', error);
    }

    // Get other common tokens if they exist
    const otherTokens = ['USDbC', 'DAI', 'cbETH'];
    for (const tokenSymbol of otherTokens) {
      const tokenAddress = (TOKENS as any)[tokenSymbol];
      if (!tokenAddress) continue;

      try {
        const balance = await this.uniswap.getTokenBalance(tokenAddress);
        if (balance > 0n) {
          const decimals = getTokenDecimals(tokenSymbol);
          const balanceFormatted = Number(balance) / (10 ** decimals);

          // Get price (stablecoins are pegged to USD)
          const usdValue = isStablecoin(tokenSymbol)
            ? balanceFormatted
            : balanceFormatted * ethPrice;

          tokens[tokenSymbol] = {
            balance: balanceFormatted.toFixed(decimals <= 6 ? 2 : 6),
            usdValue: Number(usdValue.toFixed(2))
          };
          totalUsd += usdValue;
        }
      } catch (error) {
        console.warn(`Could not fetch ${tokenSymbol} balance:`, error);
      }
    }

    return {
      tokens,
      totalUsd: Number(totalUsd.toFixed(2))
    };
  }

  /**
   * Get Aave asset balance for the agent wallet
   * @param assetSymbol - Symbol of the asset (e.g., 'WETH', 'USDC')
   */
  async getAaveAssetBalance(assetSymbol: string): Promise<{
    supplied: string;
    stableDebt: string;
    variableDebt: string;
  }> {
    const symbol = assetSymbol.toUpperCase();
    const networkId = await this.wallet.getNetworkId();
    const TOKENS: any = networkId === 'base-mainnet' ? BASE_TOKENS : SEPOLIA_TOKENS;

    let tokenAddress: string;

    if (symbol === 'WETH') tokenAddress = TOKENS.WETH;
    else if (symbol === 'USDC') tokenAddress = TOKENS.USDC;
    else if (symbol === 'USDBC') tokenAddress = TOKENS.USDbC;
    else if (symbol === 'CBETH') tokenAddress = TOKENS.cbETH;
    else if (symbol === 'DAI') tokenAddress = TOKENS.DAI;
    else {
      // Try to see if it's an address
      if (symbol.startsWith('0x')) tokenAddress = symbol;
      else throw new Error(`Unknown asset symbol: ${symbol}`);
    }

    const walletAddress = await this.wallet.getAddress();
    const balance = await this.aave.getAssetBalance(
      tokenAddress as `0x${string}`,
      walletAddress as `0x${string}`
    );

    const decimals = getTokenDecimals(symbol);

    return {
      supplied: (Number(balance.supplied) / (10 ** decimals)).toString(),
      stableDebt: (Number(balance.stableDebt) / (10 ** decimals)).toString(),
      variableDebt: (Number(balance.variableDebt) / (10 ** decimals)).toString()
    };
  }

  /**
   * Get active positions with real-time P&L
   * Returns active prophecies with current price, unrealized P&L, and remaining time
   */
  async getActivePositionsWithPnL(): Promise<PositionWithPnL[]> {
    const prophecies = this.prophesier.getActiveProphecies();

    if (prophecies.length === 0) {
      return [];
    }

    // Import BASE_TOKEN_IDS for price lookups
    const { BASE_TOKEN_IDS } = await import('../data/coingecko');

    // Get unique markets to fetch prices
    const markets = [...new Set(prophecies.map(p => p.market))];
    const coinGecko = getCoinGecko();

    // Fetch current prices for all markets
    const coinIds = markets
      .map(m => BASE_TOKEN_IDS[m.toUpperCase()])
      .filter(Boolean);

    const prices = coinIds.length > 0
      ? await coinGecko.getSimplePrices(coinIds)
      : {};

    return prophecies.map(p => {
      const coinId = BASE_TOKEN_IDS[p.market.toUpperCase()];
      const currentPrice = coinId ? (prices[coinId]?.usd || p.targetPrice) : p.targetPrice;
      const entryPrice = p.targetPrice / (p.direction === 'bullish' ? 1.1 : 0.9); // Reverse calculate

      // Calculate P&L based on direction
      let pnlPercent = 0;
      if (p.direction === 'bullish') {
        pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else if (p.direction === 'bearish') {
        pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
      }

      const stakeAmount = p.stakeAmount || 0.01;
      const pnlUsd = (pnlPercent / 100) * stakeAmount * currentPrice;

      // Calculate remaining time
      const endTimeMs = p.mintedAt + this.parseTimeframe(p.timeframe);
      const remainingTimeMs = Math.max(0, endTimeMs - Date.now());

      return {
        tokenId: p.tokenId,
        market: p.market,
        direction: p.direction,
        entryPrice,
        currentPrice,
        pnlPercent: Number(pnlPercent.toFixed(2)),
        pnlUsd: Number(pnlUsd.toFixed(4)),
        stakeAmount,
        remainingTimeMs,
        status: p.status
      };
    });
  }

  /**
   * Get all positions across protocols
   * Returns active predictions, Aave positions, and wallet holdings
   */
  async getAllPositions(): Promise<AllPositions> {
    // Get active predictions with P&L
    const predictions = await this.getActivePositionsWithPnL();

    // Get Aave positions
    const coinGecko = getCoinGecko();
    const ethPrice = await coinGecko.getEthPrice();

    const aavePositions: AavePosition[] = [];

    // Check WETH position on Aave
    try {
      const wethBalance = await this.getAaveAssetBalance('WETH');
      if (parseFloat(wethBalance.supplied) > 0) {
        const supplied = parseFloat(wethBalance.supplied);
        aavePositions.push({
          token: 'WETH',
          supplied: supplied.toFixed(6),
          apy: 2.5, // Aave WETH supply APY (approximate)
          valueUsd: Number((supplied * ethPrice).toFixed(2))
        });
      }
    } catch (error) {
      console.warn('Could not fetch Aave WETH position:', error);
    }

    // Check USDC position on Aave
    try {
      const usdcBalance = await this.getAaveAssetBalance('USDC');
      if (parseFloat(usdcBalance.supplied) > 0) {
        const supplied = parseFloat(usdcBalance.supplied);
        aavePositions.push({
          token: 'USDC',
          supplied: supplied.toFixed(2),
          apy: 5.0, // Aave USDC supply APY (approximate)
          valueUsd: Number(supplied.toFixed(2))
        });
      }
    } catch (error) {
      console.warn('Could not fetch Aave USDC position:', error);
    }

    // Get wallet balances
    const { tokens: walletBalances } = await this.getAllTokenBalances();

    return {
      predictions,
      aave: aavePositions,
      wallet: walletBalances
    };
  }

  /**
   * Get wallet address
   */
  async getWalletAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<string> {
    return this.wallet.getBalance();
  }

  /**
   * Get active predictions count
   */
  async getActivePredictions(): Promise<any[]> {
    const count = await this.prophesier.getActivePredictionsCount();
    return Array(count).fill({ status: 'active' });
  }

  /**
   * Parse timeframe string to milliseconds
   * @private
   */
  private parseTimeframe(timeframe: string): number {
    const match = timeframe.match(/^(\d+)([hdw])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }
}
