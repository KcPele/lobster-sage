import { Router, Request, Response } from 'express';
import { LobsterSage } from '../../LobsterSage';

export function createAnalysisRoutes(getSage: () => LobsterSage | null): Router {
  const router = Router();

  router.get('/analysis', async (_req: Request, res: Response) => {
    try {
      const analysis = await getSage()!.getMarketAnalysis();
      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/analysis/asset', async (req: Request, res: Response) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase();
      if (!symbol) {
        res.status(400).json({ error: 'symbol query parameter required (e.g., ?symbol=SOL)' });
        return;
      }
      const analysis = await getSage()!.getAssetAnalysis(symbol);
      if (!analysis) {
        res.status(404).json({ error: `Asset ${symbol} not found or not supported` });
        return;
      }
      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/analysis/tvl', async (_req: Request, res: Response) => {
    try {
      const tvl = await getSage()!.getTVLAnalysis();
      res.json(tvl);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/trends', async (_req: Request, res: Response) => {
    try {
      const trends = await getSage()!.getEcosystemTrends();
      res.json({ trends });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/market/snapshot', async (_req: Request, res: Response) => {
    try {
      const snapshot = await getSage()!.getMarketSnapshot();
      res.json(snapshot);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/signals/whales', async (req: Request, res: Response) => {
    try {
      const minValue = Number(req.query.minValue) || 50000;
      const signals = await getSage()!.getWhaleSignals(minValue);
      res.json({ count: signals.transactions.length, ...signals });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
