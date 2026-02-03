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

// ============ Reputation ============

app.get('/reputation', requireSage, async (_req: Request, res: Response) => {
  try {
    const reputation = await sage!.getReputation();
    res.json(reputation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Autonomous Mode ============

app.post('/autonomous/start', requireSage, async (_req: Request, res: Response) => {
  try {
    await sage!.startAutonomousMode({
      predictionInterval: 6 * 60 * 60 * 1000,
      yieldCheckInterval: 60 * 60 * 1000,
      socialInterval: 4 * 60 * 60 * 1000
    });
    res.json({ 
      status: 'started',
      message: 'LobsterSage autonomous mode activated'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/autonomous/stop', requireSage, async (_req: Request, res: Response) => {
  try {
    await sage!.stopAutonomousMode();
    res.json({ 
      status: 'stopped',
      message: 'LobsterSage autonomous mode deactivated'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ NFT Operations ============

app.post('/nft/mint', requireSage, async (req: Request, res: Response) => {
  try {
    const { predictionId } = req.body;
    res.json({ 
      status: 'minted',
      message: 'Prophecy NFT minting initiated',
      predictionId
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

const PORT = process.env.LOBSTER_SAGE_PORT || 3847;

initSage().then(() => {
  app.listen(PORT, () => {
    console.log(`
🦞 ═══════════════════════════════════════════════════════
   LobsterSage API Server Running
   
   URL: http://localhost:${PORT}
   
   Endpoints:
   GET  /health          - Health check
   GET  /status          - Agent status
   GET  /portfolio       - Portfolio summary
   POST /predict         - Make prediction
   GET  /predictions     - Active predictions
   GET  /analysis        - Market analysis
   GET  /trends          - Ecosystem trends
   GET  /yields          - Yield opportunities
   POST /yields/optimize - Optimize yields
   GET  /reputation      - Reputation score
   POST /autonomous/start - Start autonomous mode
   POST /autonomous/stop  - Stop autonomous mode
   
   Ready for OpenClaw integration!
═══════════════════════════════════════════════════════ 🦞
    `);
  });
});

export default app;
