/**
 * LobsterSage API Server
 *
 * HTTP API for OpenClaw skill integration
 * Exposes LobsterSage functionality as REST endpoints
 */

import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import { LobsterSage } from '../LobsterSage';
import {
  createTradingRoutes,
  createYieldRoutes,
  createPortfolioRoutes,
  createAnalysisRoutes,
  createSocialRoutes,
} from './routes';

const app: Application = express();
app.use(cors());
app.use(express.json());

// Prevent crashes from background analytics errors (AgentKit)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

let sage: LobsterSage | null = null;
let isInitializing = false;

async function initSage(): Promise<void> {
  if (sage || isInitializing) return;

  isInitializing = true;
  console.log('Initializing LobsterSage API Server...');

  try {
    sage = new LobsterSage();
    await sage.initialize();
    console.log('LobsterSage initialized successfully');
  } catch (error) {
    console.error('Failed to initialize LobsterSage:', error);
    sage = null;
  } finally {
    isInitializing = false;
  }
}

const requireSage = (_req: Request, res: Response, next: NextFunction): void => {
  if (!sage) {
    res.status(503).json({
      error: 'LobsterSage not initialized',
      message: 'Please wait for initialization to complete',
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
    timestamp: new Date().toISOString(),
  });
});

app.get('/status', requireSage, async (_req: Request, res: Response) => {
  try {
    const address = await sage!.getWalletAddress();
    const balance = await sage!.getBalance();
    res.json({
      status: 'running',
      wallet: address,
      balance,
      network: process.env.NETWORK_ID || 'base-sepolia',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Mount Route Modules ============

const getSage = () => sage;

app.use(requireSage, createTradingRoutes(getSage));
app.use(requireSage, createYieldRoutes(getSage));
app.use(requireSage, createPortfolioRoutes(getSage));
app.use(requireSage, createAnalysisRoutes(getSage));
app.use(requireSage, createSocialRoutes(getSage));

// ============ Error Handling ============

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ============ Start Server ============

const PORT = process.env.PORT || process.env.LOBSTER_SAGE_PORT || 3847;

initSage().then(() => {
  app.listen(PORT, () => {
    console.log(`
LobsterSage API Server Running on http://localhost:${PORT}

Trading:    POST /swap, /wrap-eth, /unwrap-weth, /aave/borrow, /aave/repay
            POST /trade/compound, /trade/swap-and-supply, /trade/leverage, /trade/deleverage
            GET  /swap/quote, /aave/account
Yields:     POST /yields/supply, /yields/supply-weth, /yields/withdraw, /yields/auto-enter
            GET  /yields, /yields/positions, /yields/aave/balance
Portfolio:  GET  /portfolio, /portfolio/balances, /positions/all, /positions/active
Analysis:   GET  /analysis, /analysis/asset, /analysis/tvl, /trends, /market/snapshot
Strategy:   GET  /trading/strategy, /trading/history, /trading/capitulation-check
            POST /trading/mode, /trading/run-cycle, /trading/pure-cycle, /trading/dry-run
Social:     POST /farcaster/post, /farcaster/thread
    `);
  });
});

export default app;
