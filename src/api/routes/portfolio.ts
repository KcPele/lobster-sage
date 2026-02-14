import { Router, Request, Response } from 'express';
import { LobsterSage } from '../../LobsterSage';

export function createPortfolioRoutes(getSage: () => LobsterSage | null): Router {
  const router = Router();

  router.get('/portfolio', async (_req: Request, res: Response) => {
    try {
      const summary = await getSage()!.getPortfolioSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/portfolio/balances', async (_req: Request, res: Response) => {
    try {
      const balances = await getSage()!.getAllTokenBalances();
      res.json(balances);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/positions/active', async (_req: Request, res: Response) => {
    try {
      const positions = await getSage()!.getActivePositionsWithPnL();
      res.json({ count: positions.length, positions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/positions/all', async (_req: Request, res: Response) => {
    try {
      const positions = await getSage()!.getAllPositions();
      res.json(positions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
