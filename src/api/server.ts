/**
 * LobsterSage API Server
 * 
 * HTTP API for OpenClaw skill integration
 * Exposes LobsterSage functionality as REST endpoints
 */

import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import { LobsterSage } from '../LobsterSage';

const app: Application = express();
app.use(cors());
app.use(express.json());

// Prevent crashes from background analytics errors (AgentKit)
process.on('unhandledRejection', (reason,) => {
  console.error('⚠️  Unhandled Rejection:', reason);
  // Do not exit process
});

process.on('uncaughtException', (error) => {
  console.error('⚠️  Uncaught Exception:', error);
  // Do not exit process
});

let sage: LobsterSage | null = null;
let isInitializing = false;

// Initialize LobsterSage
async function initSage(): Promise<void> {
  if (sage || isInitializing) return;
  
  isInitializing = true;
  console.log('🦞 Initializing LobsterSage API Server...');
  
  try {
    sage = new LobsterSage();
    await sage.initialize();
    console.log('✅ LobsterSage initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize LobsterSage:', error);
    sage = null;
  } finally {
    isInitializing = false;
  }
}

// Middleware to check initialization
const requireSage = (_req: Request, res: Response, next: NextFunction): void => {
  if (!sage) {
    res.status(503).json({ 
      error: 'LobsterSage not initialized',
      message: 'Please wait for initialization to complete'
    });
    return;
  }
  next();
};

// ============ Health & Status ============

app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    initialized: sage !== null,
    timestamp: new Date().toISOString()
  });
});

app.get('/status', requireSage, async (_req: Request, res: Response) => {
  try {
    const address = await sage!.getWalletAddress();
    const balance = await sage!.getBalance();
    
    res.json({
      status: 'running',
      wallet: address,
      balance: balance,
      network: process.env.NETWORK_ID || 'base-sepolia',
      contracts: {
        prophecyNFT: process.env.PROPHECY_NFT_CONTRACT,
        reputation: process.env.REPUTATION_CONTRACT
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Portfolio ============

app.get('/portfolio', requireSage, async (_req: Request, res: Response) => {
  try {
    const summary = await sage!.getPortfolioSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Predictions ============

app.post('/predict', requireSage, async (req: Request, res: Response) => {
  try {
    const { market, timeframe } = req.body;
    const targetMarket = market || 'ETH';
    const targetTimeframe = timeframe || '7d';
    
    const prediction = await sage!.makePrediction(targetMarket, targetTimeframe);
    res.json(prediction);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/predictions', requireSage, async (_req: Request, res: Response) => {
  try {
    const predictions = await sage!.getActivePredictions();
    res.json({ predictions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Market Analysis ============

app.get('/analysis', requireSage, async (_req: Request, res: Response) => {
  try {
    const analysis = await sage!.getMarketAnalysis();
    res.json(analysis);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/trends', requireSage, async (_req: Request, res: Response) => {
  try {
    const trends = await sage!.getEcosystemTrends();
    res.json({ trends });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Yields ============

app.get('/yields', requireSage, async (_req: Request, res: Response) => {
  try {
    const opportunities = await sage!.getYieldOpportunities();
    res.json({ opportunities });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/yields/optimize', requireSage, async (_req: Request, res: Response) => {
  try {
    const result = await sage!.optimizeYields();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/yields/positions', requireSage, async (_req: Request, res: Response) => {
  try {
    const positions = await sage!.getYieldPositions();
    res.json({ positions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Supply WETH to Aave - Direct, reliable yield farming
// POST /yields/supply-weth { "amount": "0.1" }
app.post('/yields/supply-weth', requireSage, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    
    if (!amount || parseFloat(amount) <= 0) {
      res.status(400).json({ error: 'amount is required (e.g., "0.1" for 0.1 ETH)' });
      return;
    }

    console.log(`🏦 API: Supply ${amount} ETH as WETH to Aave...`);
    const result = await sage!.supplyWethToAave(amount);
    
    if (result.success) {
      res.json({
        status: 'success',
        message: `Successfully supplied ${result.amountSupplied} WETH to Aave V3`,
        wrapTransaction: {
          hash: result.wrapTxHash,
          basescanUrl: `https://sepolia.basescan.org/tx/${result.wrapTxHash}`
        },
        supplyTransaction: {
          hash: result.supplyTxHash,
          basescanUrl: `https://sepolia.basescan.org/tx/${result.supplyTxHash}`
        }
      });
    } else {
      res.status(400).json({ 
        status: 'failed',
        error: result.error 
      });
    }
  } catch (error: any) {
    console.error('Supply WETH error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Full Trading Cycle Endpoints ============

// Universal Token Swap
// POST /swap { "tokenIn": "ETH", "tokenOut": "USDC", "amount": "0.1", "slippage": 1 }
app.post('/swap', requireSage, async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amount, slippage } = req.body;
    
    if (!tokenIn || !tokenOut || !amount) {
      res.status(400).json({ error: 'tokenIn, tokenOut, and amount are required' });
      return;
    }

    console.log(`💱 API: Swapping ${amount} ${tokenIn} → ${tokenOut}...`);
    const result = await sage!.swapTokens({ tokenIn, tokenOut, amount, slippage });
    
    if (result.success) {
      res.json({
        status: 'success',
        message: `Swapped ${result.amountIn} ${result.tokenIn} → ${result.amountOut} ${result.tokenOut}`,
        transaction: {
          hash: result.txHash,
          basescanUrl: `https://sepolia.basescan.org/tx/${result.txHash}`
        },
        amountIn: result.amountIn,
        amountOut: result.amountOut
      });
    } else {
      res.status(400).json({ status: 'failed', error: result.error });
    }
  } catch (error: any) {
    console.error('Swap error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Withdraw from Aave
// POST /yields/withdraw { "token": "WETH", "amount": "0.1" } or { "token": "WETH", "amount": "all" }
app.post('/yields/withdraw', requireSage, async (req: Request, res: Response) => {
  try {
    const { token, amount } = req.body;
    
    if (!token) {
      res.status(400).json({ error: 'token is required (e.g., "WETH" or "USDC")' });
      return;
    }

    console.log(`🏦 API: Withdrawing ${amount || 'all'} ${token} from Aave...`);
    const result = await sage!.withdrawFromAave(token, amount);
    
    if (result.success) {
      res.json({
        status: 'success',
        message: `Withdrew ${result.amountWithdrawn} ${result.tokenSymbol} from Aave V3`,
        transaction: {
          hash: result.txHash,
          basescanUrl: `https://sepolia.basescan.org/tx/${result.txHash}`
        }
      });
    } else {
      res.status(400).json({ status: 'failed', error: result.error });
    }
  } catch (error: any) {
    console.error('Withdraw error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unwrap WETH to ETH
// POST /unwrap-weth { "amount": "0.1" }
app.post('/unwrap-weth', requireSage, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    
    if (!amount || parseFloat(amount) <= 0) {
      res.status(400).json({ error: 'amount is required' });
      return;
    }

    console.log(`💱 API: Unwrapping ${amount} WETH to ETH...`);
    const result = await sage!.unwrapWeth(amount);
    
    res.json({
      status: 'success',
      message: `Unwrapped ${amount} WETH to ETH`,
      transaction: {
        hash: result.hash,
        basescanUrl: `https://sepolia.basescan.org/tx/${result.hash}`
      }
    });
  } catch (error: any) {
    console.error('Unwrap error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Supply any token to Aave
// POST /yields/supply { "token": "USDC", "amount": "100" }
app.post('/yields/supply', requireSage, async (req: Request, res: Response) => {
  try {
    const { token, amount } = req.body;
    
    if (!token || !amount) {
      res.status(400).json({ error: 'token and amount are required' });
      return;
    }

    console.log(`🏦 API: Supplying ${amount} ${token} to Aave...`);
    const result = await sage!.supplyToAave(token, amount);
    
    if (result.success) {
      res.json({
        status: 'success',
        message: `Supplied ${result.amountSupplied} ${result.tokenSymbol} to Aave V3`,
        transaction: {
          hash: result.txHash,
          basescanUrl: `https://sepolia.basescan.org/tx/${result.txHash}`
        },
        apy: result.apy
      });
    } else {
      res.status(400).json({ status: 'failed', error: result.error });
    }
  } catch (error: any) {
    console.error('Supply error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-enter best yield opportunity
// POST /yields/auto-enter { "amountEth": "0.1", "minApy": 2 }
app.post('/yields/auto-enter', requireSage, async (req: Request, res: Response) => {
  try {
    const { amountEth, minApy } = req.body;
    
    if (!amountEth || parseFloat(amountEth) <= 0) {
      res.status(400).json({ error: 'amountEth is required' });
      return;
    }

    console.log(`🤖 API: Auto-entering best opportunity with ${amountEth} ETH...`);
    const result = await sage!.findBestOpportunityAndEnter({ amountEth, minApy });
    
    if (result.success) {
      res.json({
        status: 'success',
        message: `Entered ${result.opportunity?.protocol} ${result.opportunity?.strategy}`,
        opportunity: result.opportunity,
        transactions: {
          swap: result.swapTx ? {
            hash: result.swapTx,
            basescanUrl: `https://sepolia.basescan.org/tx/${result.swapTx}`
          } : null,
          supply: {
            hash: result.supplyTx,
            basescanUrl: `https://sepolia.basescan.org/tx/${result.supplyTx}`
          }
        },
        tokenUsed: result.tokenUsed,
        amountSupplied: result.amountSupplied,
        expectedApy: result.expectedApy
      });
    } else {
      res.status(400).json({ status: 'failed', error: result.error });
    }
  } catch (error: any) {
    console.error('Auto-enter error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Autonomous Trading Cycle ============

// Get current trading strategy
app.get('/trading/strategy', requireSage, async (_req: Request, res: Response) => {
  try {
    const strategy = sage!.getTradingStrategy();
    res.json({ strategy });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update trading strategy
// POST /trading/strategy { "takeProfitPercent": 10, "stopLossPercent": 5, "enabled": true }
app.post('/trading/strategy', requireSage, async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const strategy = sage!.setTradingStrategy(updates);
    res.json({ 
      status: 'success',
      message: 'Trading strategy updated',
      strategy 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run a complete trading cycle
// Checks positions for P&L, executes take-profit/stop-loss, finds opportunities
app.post('/trading/run-cycle', requireSage, async (_req: Request, res: Response) => {
  try {
    console.log('🔄 API: Running trading cycle...');
    const result = await sage!.runTradingCycle();
    
    res.json({
      status: result.success ? 'success' : 'failed',
      message: `Trading cycle complete: ${result.actions.length} actions`,
      positionsChecked: result.positionsChecked,
      opportunitiesScanned: result.opportunitiesScanned,
      actions: result.actions,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Trading cycle error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trading action history
app.get('/trading/history', requireSage, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const history = sage!.getTradingHistory(limit);
    res.json({ history });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Enable/disable autonomous trading
app.post('/trading/enable', requireSage, async (_req: Request, res: Response) => {
  try {
    sage!.enableAutonomousTrading();
    res.json({ 
      status: 'success',
      message: 'Autonomous trading ENABLED',
      warning: 'The agent will now execute trades automatically on /trading/run-cycle'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/trading/disable', requireSage, async (_req: Request, res: Response) => {
  try {
    sage!.disableAutonomousTrading();
    res.json({ 
      status: 'success',
      message: 'Autonomous trading DISABLED'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Reputation ============

app.get('/reputation', requireSage, async (_req: Request, res: Response) => {
  try {
    const reputation = await sage!.getReputation();
    res.json(reputation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ OpenClaw Integration ============
// These endpoints are called by OpenClaw - it handles scheduling/orchestration

// ============ Resolution ============

// Resolve a prophecy (mark as correct/incorrect after timeframe)
app.post('/resolve', requireSage, async (req: Request, res: Response) => {
  try {
    const { tokenId, wasCorrect, accuracyScore } = req.body;
    
    if (tokenId === undefined) {
      res.status(400).json({ error: 'tokenId is required' });
      return;
    }

    const result = await sage!.resolveProphecy(
      parseInt(tokenId),
      wasCorrect ?? true,
      accuracyScore ?? 5000
    );

    res.json({
      status: 'resolved',
      tokenId,
      wasCorrect: result.successful,
      txHash: result.txHash,
      basescanUrl: `https://sepolia.basescan.org/tx/${result.txHash}`,
      message: result.successful 
        ? 'Prediction was CORRECT! Stake + reward returned.' 
        : 'Prediction was WRONG. Stake forfeited.'
    });
  } catch (error: any) {
    console.error('Resolution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get prophecies ready to resolve
app.get('/prophecies/pending', requireSage, async (_req: Request, res: Response) => {
  try {
    const ready = sage!.getPropheciesReadyToResolve();
    const active = sage!.getActivePropheciesFromAgent();
    
    res.json({
      readyToResolve: ready,
      active: active,
      message: `${ready.length} prophecies ready to resolve, ${active.length} still active`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Farcaster ============

// Test Farcaster posting
app.post('/farcaster/post', requireSage, async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const text = message || '🦞 LobsterSage is live on Base! Testing Farcaster integration...';
    
    const result = await sage!.postToFarcaster(text);
    res.json({
      status: 'posted',
      hash: result?.hash,
      message: text
    });
  } catch (error: any) {
    console.error('Farcaster post error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ NFT Operations ============

// Make prediction AND mint as NFT in one call - REAL ONCHAIN TX
app.post('/predict-and-mint', requireSage, async (req: Request, res: Response) => {
  try {
    const { market, timeframe } = req.body;
    const targetMarket = market || 'ETH';
    const targetTimeframe = timeframe || '7d';
    
    console.log(`🔮 Making prediction for ${targetMarket} and minting as NFT...`);
    
    // Make prediction
    const prediction = await sage!.makePrediction(targetMarket, targetTimeframe);
    
    if (!prediction) {
      res.json({ 
        status: 'no_prediction',
        message: 'No prediction generated - market conditions may not meet confidence threshold'
      });
      return;
    }

    // Mint as NFT (this calls the real contract!)
    const nft = await sage!.mintPredictionAsNFT(prediction);
    
    res.json({
      status: 'success',
      prediction: {
        market: prediction.market,
        direction: prediction.direction,
        confidence: prediction.confidence,
        targetPrice: prediction.targetPrice,
        timeframe: prediction.timeframe
      },
      nft: {
        tokenId: nft.tokenId,
        txHash: nft.txHash,
        basescanUrl: nft.txHash ? `https://sepolia.basescan.org/tx/${nft.txHash}` : null,
        stakeAmount: nft.stakeAmount
      },
      message: nft.txHash 
        ? `Prophecy NFT minted onchain! TX: ${nft.txHash}` 
        : 'Prophecy created (simulated mode)'
    });
  } catch (error: any) {
    console.error('Predict and mint error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/nft/mint', requireSage, async (req: Request, res: Response) => {
  try {
    const { market } = req.body;
    const targetMarket = market || 'ETH';
    
    // Make a quick prediction and mint it
    const prediction = await sage!.makePrediction(targetMarket, '7d');
    
    if (!prediction) {
      res.json({ 
        status: 'no_prediction',
        message: 'Could not generate prediction for minting'
      });
      return;
    }

    const nft = await sage!.mintPredictionAsNFT(prediction);
    
    res.json({ 
      status: 'minted',
      tokenId: nft.tokenId,
      txHash: nft.txHash,
      basescanUrl: nft.txHash ? `https://sepolia.basescan.org/tx/${nft.txHash}` : null,
      message: nft.txHash ? 'NFT minted onchain!' : 'NFT minted (simulated)'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Error Handling ============

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// ============ Start Server ============

const PORT = process.env.PORT || process.env.LOBSTER_SAGE_PORT || 3847;

initSage().then(() => {
  app.listen(PORT, () => {
    console.log(`
🦞 ═══════════════════════════════════════════════════════
   LobsterSage API Server Running
   
   URL: http://localhost:${PORT}
   
   Core Endpoints (for OpenClaw):
   GET  /health           - Health check
   GET  /status           - Agent status & wallet info
   POST /predict-and-mint - Make prediction + mint NFT (REAL TX!)
   GET  /portfolio        - Portfolio summary
   GET  /reputation       - Reputation score
   
   Analysis Endpoints:
   POST /predict          - Make prediction only
   GET  /analysis         - Market analysis
   GET  /trends           - Ecosystem trends
   GET  /yields           - Yield opportunities
   
   OpenClaw orchestrates scheduling - this API just executes!
═══════════════════════════════════════════════════════ 🦞
    `);
  });
});

export default app;
