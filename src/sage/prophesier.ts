import { WalletManager } from '../wallet/manager';
import { Prediction } from './predictor';
import { UniswapV3, BASE_TOKENS, type SwapResult } from '../defi/UniswapV3';
import { parseUnits } from 'viem';

export interface ProphecyNFT {
  tokenId: string;
  predictionId: string;
  market: string;
  direction: string;
  confidence: number;
  targetPrice: number;
  timeframe: string;
  mintedAt: number;
  stakeAmount: number;
  status: 'active' | 'resolved' | 'burned';
}

export interface TradeResult {
  hash: string;
  amount: number;
  token: string;
  direction: 'buy' | 'sell';
}

/**
 * Prophesier - Handles NFT minting and trading based on predictions
 * 
 * Supports real trading via Uniswap V3 when enabled
 */
export class Prophesier {
  private wallet: WalletManager;
  private prophecies: Map<string, ProphecyNFT> = new Map();
  private activePredictions: Set<string> = new Set();
  private uniswap: UniswapV3 | null = null;
  private enableRealTrading: boolean = false;

  constructor(_contractAddress: string, wallet: WalletManager) {
    this.wallet = wallet;
  }

  /**
   * Enable real trading via Uniswap V3
   * @param network 'base' or 'baseSepolia'
   */
  enableUniswapTrading(network: 'base' | 'baseSepolia' = 'baseSepolia'): void {
    this.uniswap = new UniswapV3(network);
    this.enableRealTrading = true;
    console.log(`🔄 Real Uniswap trading enabled on ${network}`);
  }

  /**
   * Disable real trading (use simulated)
   */
  disableRealTrading(): void {
    this.uniswap = null;
    this.enableRealTrading = false;
    console.log('⏸️ Real trading disabled, using simulated trades');
  }

  /**
   * Check if real trading is enabled
   */
  isRealTradingEnabled(): boolean {
    return this.enableRealTrading && this.uniswap !== null;
  }

  /**
   * Mint a Prophecy NFT for a prediction
   */
  async mintProphecy(prediction: Prediction): Promise<ProphecyNFT> {
    console.log(`🔮 Minting Prophecy NFT for ${prediction.market}...`);

    // Mint cost would be 0.01 ETH (in production, call contract)
    
    // Prepare NFT data
    const tokenId = `prophecy_${Date.now()}`;
    
    const prophecy: ProphecyNFT = {
      tokenId,
      predictionId: prediction.id,
      market: prediction.market,
      direction: prediction.direction,
      confidence: prediction.confidence,
      targetPrice: prediction.targetPrice,
      timeframe: prediction.timeframe,
      mintedAt: Date.now(),
      stakeAmount: prediction.stakeAmount || 0,
      status: 'active'
    };

    // Store locally (would call contract in production)
    this.prophecies.set(tokenId, prophecy);
    this.activePredictions.add(prediction.id);

    console.log(`✅ Minted Prophecy NFT #${tokenId}`);
    
    return prophecy;
  }

  /**
   * Stake on a prediction by trading
   * Uses Uniswap V3 for real trades if enabled, otherwise simulates
   */
  async stakeOnPrediction(prediction: Prediction): Promise<TradeResult> {
    console.log(`💰 Staking on prediction: ${prediction.direction} ${prediction.market}`);

    // Calculate stake amount (5% of wallet balance, max 0.1 ETH)
    const balanceStr = await this.wallet.getBalance();
    const balance = parseFloat(balanceStr) || 0;
    const stakeAmount = Math.min(balance * 0.05, 0.1);
    
    // Determine trade direction
    const tradeDirection = prediction.direction === 'bullish' ? 'buy' : 'sell';
    const token = prediction.market === 'ETH' ? 'WETH' : prediction.market;

    // Try to execute real trade if enabled
    if (this.enableRealTrading && this.uniswap) {
      try {
        const swapResult = await this.executeRealTrade(
          tradeDirection,
          stakeAmount.toString(),
          token
        );
        
        console.log(`✅ REAL trade executed: ${tradeDirection} ${stakeAmount} ${token}`);
        console.log(`   Tx Hash: ${swapResult.hash}`);
        
        prediction.stakeAmount = stakeAmount;
        
        return {
          hash: swapResult.hash,
          amount: stakeAmount,
          token,
          direction: tradeDirection
        };
      } catch (error) {
        console.error('Real trade failed, falling back to simulated:', error);
      }
    }

    // Simulated trade (fallback)
    const tradeResult: TradeResult = {
      hash: `0xsim_${Math.random().toString(16).substr(2, 60)}`,
      amount: stakeAmount,
      token,
      direction: tradeDirection
    };

    console.log(`✅ SIMULATED trade: ${tradeDirection} ${stakeAmount} ${token}`);
    
    // Update prediction with stake
    prediction.stakeAmount = stakeAmount;

    return tradeResult;
  }

  /**
   * Execute real trade via Uniswap V3
   */
  private async executeRealTrade(
    direction: 'buy' | 'sell',
    amountEth: string,
    token: string
  ): Promise<SwapResult> {
    if (!this.uniswap) {
      throw new Error('Uniswap not initialized');
    }

    const tokens = this.uniswap.getTokens();
    
    // Map token symbol to address
    const tokenAddress = this.getTokenAddress(token, tokens);
    
    if (direction === 'buy') {
      // Buy token with ETH
      return this.uniswap.swapEthToToken(tokenAddress, amountEth, 1.0); // 1% slippage
    } else {
      // Sell token for ETH - first need to have the token
      // For simplicity, convert to a smaller ETH sale
      const amountIn = parseUnits(amountEth, 18);
      return this.uniswap.swap({
        tokenIn: tokenAddress,
        tokenOut: tokens.WETH,
        amountIn,
        slippagePercent: 1.0,
      });
    }
  }

  /**
   * Get token address from symbol
   */
  private getTokenAddress(symbol: string, tokens: typeof BASE_TOKENS): `0x${string}` {
    const upperSymbol = symbol.toUpperCase();
    
    // Map common symbols to addresses
    const tokenMap: Record<string, keyof typeof BASE_TOKENS> = {
      'ETH': 'WETH',
      'WETH': 'WETH',
      'USDC': 'USDC',
      'DAI': 'DAI',
    };

    const tokenKey = tokenMap[upperSymbol];
    if (tokenKey && tokens[tokenKey]) {
      return tokens[tokenKey];
    }

    // Default to USDC for unknown tokens
    return tokens.USDC;
  }

  /**
   * Get all active predictions count
   */
  async getActivePredictionsCount(): Promise<number> {
    return this.activePredictions.size;
  }

  /**
   * Get prophecy by token ID
   */
  async getProphecy(tokenId: string): Promise<ProphecyNFT | null> {
    return this.prophecies.get(tokenId) || null;
  }

  /**
   * Get current value of a prophecy NFT
   */
  async getPredictionValue(tokenId: string): Promise<number> {
    const prophecy = this.prophecies.get(tokenId);
    if (!prophecy) return 0;

    // Value based on confidence and time remaining
    const timeElapsed = Date.now() - prophecy.mintedAt;
    const timeRemaining = this.parseTimeframe(prophecy.timeframe) - timeElapsed;
    const timeFactor = Math.max(0, timeRemaining / this.parseTimeframe(prophecy.timeframe));
    
    return prophecy.stakeAmount * (prophecy.confidence / 100) * (0.5 + timeFactor * 0.5);
  }

  /**
   * Burn a failed prediction for partial reputation recovery
   */
  async burnFailedPrediction(tokenId: string): Promise<boolean> {
    const prophecy = this.prophecies.get(tokenId);
    if (!prophecy) return false;

    if (prophecy.status !== 'active') {
      console.log('Prophecy already resolved or burned');
      return false;
    }

    prophecy.status = 'burned';
    this.prophecies.set(tokenId, prophecy);
    this.activePredictions.delete(prophecy.predictionId);

    console.log(`🔥 Burned Prophecy NFT #${tokenId}`);
    return true;
  }

  /**
   * Resolve a prophecy when prediction period ends
   */
  async resolveProphecy(
    tokenId: string, 
    success: boolean, 
    profitLoss: number
  ): Promise<void> {
    const prophecy = this.prophecies.get(tokenId);
    if (!prophecy) return;

    prophecy.status = 'resolved';
    this.prophecies.set(tokenId, prophecy);
    this.activePredictions.delete(prophecy.predictionId);

    console.log(`✅ Prophecy #${tokenId} resolved: ${success ? 'WIN' : 'LOSS'} (${profitLoss})`);
  }

  /**
   * Emergency exit - close all prediction positions
   */
  async emergencyExit(): Promise<void> {
    console.log('🚨 Emergency exit for predictions...');
    
    for (const [tokenId, prophecy] of this.prophecies) {
      if (prophecy.status === 'active') {
        // Close position (simplified)
        prophecy.status = 'resolved';
        this.prophecies.set(tokenId, prophecy);
        console.log(`Closed position: ${tokenId}`);
      }
    }
    
    this.activePredictions.clear();
    console.log('✅ All prediction positions closed');
  }

  /**
   * Parse timeframe string to milliseconds
   */
  private parseTimeframe(timeframe: string): number {
    const units: Record<string, number> = {
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    
    const match = timeframe.match(/(\d+)([mhd])/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days
    
    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }
}

export default Prophesier;
