import { WalletManager } from '../wallet/manager';
import { Prediction } from './predictor';
import { UniswapV3, BASE_TOKENS, type SwapResult } from '../defi/UniswapV3';
import { parseUnits, parseEther, encodeFunctionData, type Address } from 'viem';

// ProphecyNFT Contract ABI (for minting and resolving)
const PROPHECY_NFT_ABI = [
  {
    name: 'mintProphecy',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'target', type: 'string' },
      { name: 'predictionType', type: 'uint256' },
      { name: 'prediction', type: 'string' },
      { name: 'confidence', type: 'uint256' },
      { name: 'resolvesAt', type: 'uint256' },
      { name: 'uri', type: 'string' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'resolveProphecy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'successful', type: 'bool' },
      { name: 'accuracyScore', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'getProphecy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'prophet', type: 'address' },
          { name: 'target', type: 'string' },
          { name: 'predictionType', type: 'uint256' },
          { name: 'prediction', type: 'string' },
          { name: 'confidence', type: 'uint256' },
          { name: 'stakeAmount', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'resolvesAt', type: 'uint256' },
          { name: 'resolved', type: 'bool' },
          { name: 'successful', type: 'bool' },
          { name: 'accuracyScore', type: 'uint256' }
        ]
      }
    ]
  },
  {
    name: 'mintFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'minStake',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'getCurrentTokenId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

export interface ProphecyNFT {
  tokenId: string;
  txHash?: string;
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
 * Now makes REAL onchain transactions!
 */
export class Prophesier {
  private wallet: WalletManager;
  private contractAddress: Address;
  private prophecies: Map<string, ProphecyNFT> = new Map();
  private activePredictions: Set<string> = new Set();
  private uniswap: UniswapV3 | null = null;
  private enableRealTrading: boolean = true; // Enable real Uniswap trading by default
  private enableRealMinting: boolean = true; // Enable real NFT minting by default


  constructor(contractAddress: string, wallet: WalletManager, network: 'base' | 'baseSepolia' = 'baseSepolia') {
    this.wallet = wallet;
    this.contractAddress = contractAddress as Address;
    
    // Initialize Uniswap V3 by default for real trading
    this.uniswap = new UniswapV3(network);
    console.log(`🔄 UniswapV3 initialized on ${network} (real trading enabled)`);
  }

  /**
   * Enable/disable real NFT minting
   */
  setRealMinting(enabled: boolean): void {
    this.enableRealMinting = enabled;
    console.log(`🔮 Real NFT minting ${enabled ? 'enabled' : 'disabled'}`);
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
   * Mint a Prophecy NFT for a prediction - REAL ONCHAIN TRANSACTION
   */
  async mintProphecy(prediction: Prediction): Promise<ProphecyNFT> {
    console.log(`🔮 Minting Prophecy NFT for ${prediction.market}...`);

    // Check if real minting is enabled and we have a valid contract
    if (this.enableRealMinting && this.contractAddress && this.contractAddress !== '0x0000000000000000000000000000000000000000') {
      try {
        return await this.mintProphecyOnchain(prediction);
      } catch (error: any) {
        console.error('❌ Real minting failed:', error.message);
        console.log('⚠️ Falling back to simulated minting...');
      }
    }

    // Fallback: simulated minting
    return this.mintProphecySimulated(prediction);
  }

  /**
   * Mint Prophecy NFT on the actual blockchain
   */
  private async mintProphecyOnchain(prediction: Prediction): Promise<ProphecyNFT> {
    console.log(`🔷 Executing REAL onchain mint on ${this.contractAddress}...`);

    const walletProvider = this.wallet.getWalletProvider();
    if (!walletProvider) {
      throw new Error('Wallet provider not initialized');
    }

    // Prepare prediction data for contract
    const target = prediction.market; // e.g., "ETH"
    const predictionType = 0n; // 0 = Price prediction
    const predictionText = `${prediction.direction.toUpperCase()}: ${prediction.market} to $${prediction.targetPrice} (${prediction.confidence}% confidence)`;
    const confidence = BigInt(prediction.confidence);
    
    // Resolution time: parse timeframe (e.g., "7d" -> 7 days from now)
    const timeframeDays = parseInt(prediction.timeframe) || 7;
    const resolvesAt = BigInt(Math.floor(Date.now() / 1000) + (timeframeDays * 24 * 60 * 60));
    
    // Metadata URI (could point to IPFS in production)
    const uri = `data:application/json,{"name":"Prophecy: ${prediction.market}","description":"${predictionText}","attributes":[{"trait_type":"Market","value":"${prediction.market}"},{"trait_type":"Direction","value":"${prediction.direction}"},{"trait_type":"Confidence","value":${prediction.confidence}}]}`;

    // Calculate payment: mintFee (0.001 ETH) + minStake (0.01 ETH) = 0.011 ETH minimum
    const mintFee = parseEther('0.001');
    const stakeAmount = parseEther('0.01'); // Minimum stake
    const totalValue = mintFee + stakeAmount;

    console.log(`   Target: ${target}`);
    console.log(`   Prediction: ${predictionText}`);
    console.log(`   Confidence: ${confidence}%`);
    console.log(`   Resolves: ${new Date(Number(resolvesAt) * 1000).toISOString()}`);
    console.log(`   Payment: ${Number(totalValue) / 1e18} ETH`);

    // Encode the function call
    const data = encodeFunctionData({
      abi: PROPHECY_NFT_ABI,
      functionName: 'mintProphecy',
      args: [target, predictionType, predictionText, confidence, resolvesAt, uri]
    });

    // Send transaction
    const txHash = await walletProvider.sendTransaction({
      to: this.contractAddress,
      data: data,
      value: totalValue,
    });

    console.log(`✅ Transaction sent: ${txHash}`);
    console.log(`🔗 View on Basescan: https://sepolia.basescan.org/tx/${txHash}`);

    // Create prophecy record
    const tokenId = `prophecy_${Date.now()}_${txHash.slice(0, 10)}`;
    
    const prophecy: ProphecyNFT = {
      tokenId,
      txHash,
      predictionId: prediction.id,
      market: prediction.market,
      direction: prediction.direction,
      confidence: prediction.confidence,
      targetPrice: prediction.targetPrice,
      timeframe: prediction.timeframe,
      mintedAt: Date.now(),
      stakeAmount: Number(stakeAmount) / 1e18,
      status: 'active'
    };

    this.prophecies.set(tokenId, prophecy);
    this.activePredictions.add(prediction.id);

    console.log(`🎉 Prophecy NFT minted onchain! Token ID: ${tokenId}`);
    
    return prophecy;
  }

  /**
   * Simulated minting (for testing or when contract not available)
   */
  private mintProphecySimulated(prediction: Prediction): ProphecyNFT {
    console.log(`📝 Simulated mint (no real transaction)`);

    const tokenId = `prophecy_sim_${Date.now()}`;
    
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

    this.prophecies.set(tokenId, prophecy);
    this.activePredictions.add(prediction.id);

    console.log(`✅ Simulated Prophecy NFT #${tokenId}`);
    
    return prophecy;
  }

  /**
   * Resolve a prophecy - called by agent after timeframe ends
   * Checks if prediction was correct and updates onchain
   */
  async resolveProphecy(
    onchainTokenId: number,
    wasCorrect: boolean,
    accuracyScore: number = 5000 // 0-10000, default 50%
  ): Promise<{ txHash: string; successful: boolean }> {
    console.log(`⚖️ Resolving prophecy #${onchainTokenId}...`);
    console.log(`   Was correct: ${wasCorrect}`);
    console.log(`   Accuracy score: ${accuracyScore / 100}%`);

    if (!this.contractAddress || this.contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract address not configured');
    }

    const walletProvider = this.wallet.getWalletProvider();
    if (!walletProvider) {
      throw new Error('Wallet provider not initialized');
    }

    // Encode the resolve function call
    const data = encodeFunctionData({
      abi: PROPHECY_NFT_ABI,
      functionName: 'resolveProphecy',
      args: [BigInt(onchainTokenId), wasCorrect, BigInt(accuracyScore)]
    });

    // Send transaction
    const txHash = await walletProvider.sendTransaction({
      to: this.contractAddress,
      data: data,
    });

    console.log(`✅ Prophecy resolved! TX: ${txHash}`);
    console.log(`🔗 View on Basescan: https://sepolia.basescan.org/tx/${txHash}`);

    if (wasCorrect) {
      console.log(`🎉 Prediction was CORRECT! Stake + reward returned.`);
    } else {
      console.log(`❌ Prediction was WRONG. Stake forfeited.`);
    }

    return { txHash, successful: wasCorrect };
  }

  /**
   * Get all active (unresolved) prophecies
   */
  getActiveProphecies(): ProphecyNFT[] {
    return Array.from(this.prophecies.values()).filter(p => p.status === 'active');
  }

  /**
   * Check which prophecies are ready to resolve (timeframe passed)
   */
  getPropheciesReadyToResolve(): ProphecyNFT[] {
    const now = Date.now();
    return this.getActiveProphecies().filter(p => {
      const timeframeDays = parseInt(p.timeframe) || 7;
      const resolveTime = p.mintedAt + (timeframeDays * 24 * 60 * 60 * 1000);
      return now >= resolveTime;
    });
  }

  /**
   * Stake on a prediction by trading
   * Uses Uniswap V3 for real trades if enabled, otherwise simulates
   * Supports any token via prediction.tokenAddress or symbol lookup
   */
  async stakeOnPrediction(prediction: Prediction): Promise<TradeResult> {
    console.log(`💰 Staking on prediction: ${prediction.direction} ${prediction.market}`);

    // Calculate stake amount (5% of wallet balance, max 0.1 ETH)
    const balanceStr = await this.wallet.getBalance();
    const balance = parseFloat(balanceStr) || 0;
    const stakeAmount = Math.min(balance * 0.05, 0.1);
    
    // Determine trade direction
    const tradeDirection = prediction.direction === 'bullish' ? 'buy' : 'sell';
    
    // Use tokenAddress if provided, otherwise fall back to market symbol
    const tokenIdentifier = prediction.tokenAddress || prediction.market;
    const token = prediction.market === 'ETH' ? 'WETH' : tokenIdentifier;

    // Try to execute real trade if enabled
    if (this.enableRealTrading && this.uniswap) {
      try {
        const swapResult = await this.executeRealTrade(
          tradeDirection,
          stakeAmount.toString(),
          token
        );
        
        console.log(`✅ REAL trade executed: ${tradeDirection} ${stakeAmount} ETH → ${prediction.market}`);
        console.log(`   Tx Hash: ${swapResult.hash}`);
        
        prediction.stakeAmount = stakeAmount;
        
        return {
          hash: swapResult.hash,
          amount: stakeAmount,
          token: prediction.market,
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
      token: prediction.market,
      direction: tradeDirection
    };

    console.log(`✅ SIMULATED trade: ${tradeDirection} ${stakeAmount} ETH → ${prediction.market}`);
    
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
   * Get token address from symbol or return direct address
   * Supports both symbols (e.g., "ETH") and direct addresses (e.g., "0x...")
   */
  private getTokenAddress(symbolOrAddress: string, tokens: typeof BASE_TOKENS): `0x${string}` {
    // If it's already a valid address, use it directly
    if (symbolOrAddress.startsWith('0x') && symbolOrAddress.length === 42) {
      console.log(`🔗 Using direct token address: ${symbolOrAddress}`);
      return symbolOrAddress as `0x${string}`;
    }

    const upperSymbol = symbolOrAddress.toUpperCase();
    
    // Extended token map with popular Base ecosystem tokens
    const tokenMap: Record<string, `0x${string}`> = {
      // Core tokens (from BASE_TOKENS)
      'ETH': tokens.WETH,
      'WETH': tokens.WETH,
      'USDC': tokens.USDC,
      'DAI': tokens.DAI,
      // Popular Base ecosystem tokens (mainnet addresses)
      'AERO': '0x940181a94A35A4569E4529A3CDfB74e38FD98631' as `0x${string}`,
      'BRETT': '0x532f27101965dd16442E59d40670FaF5eBB142E4' as `0x${string}`,
      'TOSHI': '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4' as `0x${string}`,
      'DEGEN': '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed' as `0x${string}`,
      'CBETH': '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22' as `0x${string}`,
      'USDBC': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as `0x${string}`,
    };

    const address = tokenMap[upperSymbol];
    if (address) {
      console.log(`🪙 Resolved ${upperSymbol} to ${address}`);
      return address;
    }

    // Default to USDC if unknown symbol
    console.log(`⚠️ Unknown token symbol "${symbolOrAddress}", defaulting to USDC`);
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
   * Mark a local prophecy record as resolved
   */
  markProphecyResolved(tokenId: string, success: boolean): void {
    const prophecy = this.prophecies.get(tokenId);
    if (!prophecy) return;

    prophecy.status = 'resolved';
    this.prophecies.set(tokenId, prophecy);
    this.activePredictions.delete(prophecy.predictionId);

    console.log(`📝 Local prophecy #${tokenId} marked as ${success ? 'WIN' : 'LOSS'}`);
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
