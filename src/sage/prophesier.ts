import { ethers } from 'ethers';
import { WalletManager } from '../wallet/manager';
import { Prediction } from './predictor';

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
 */
export class Prophesier {
  private contractAddress: string;
  private wallet: WalletManager;
  private prophecies: Map<string, ProphecyNFT> = new Map();
  private activePredictions: Set<string> = new Set();

  constructor(contractAddress: string, wallet: WalletManager) {
    this.contractAddress = contractAddress;
    this.wallet = wallet;
  }

  /**
   * Mint a Prophecy NFT for a prediction
   */
  async mintProphecy(prediction: Prediction): Promise<ProphecyNFT> {
    console.log(`🔮 Minting Prophecy NFT for ${prediction.market}...`);

    // Calculate mint cost (0.01 ETH)
    const mintCost = ethers.parseEther('0.01');
    
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
   */
  async stakeOnPrediction(prediction: Prediction): Promise<TradeResult> {
    console.log(`💰 Staking on prediction: ${prediction.direction} ${prediction.market}`);

    // Calculate stake amount (5% of wallet balance, max 0.1 ETH)
    const balance = await this.wallet.getBalance('ETH');
    const stakeAmount = Math.min(balance * 0.05, 0.1);
    
    // Determine trade direction
    const tradeDirection = prediction.direction === 'bullish' ? 'buy' : 'sell';
    const token = prediction.market === 'ETH' ? 'WETH' : prediction.market;

    // Execute trade (simplified - would use DEX in production)
    const tradeResult: TradeResult = {
      hash: `0x${Math.random().toString(16).substr(2, 64)}`,
      amount: stakeAmount,
      token,
      direction: tradeDirection
    };

    console.log(`✅ Trade executed: ${tradeDirection} ${stakeAmount} ${token}`);
    
    // Update prediction with stake
    prediction.stakeAmount = stakeAmount;

    return tradeResult;
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
