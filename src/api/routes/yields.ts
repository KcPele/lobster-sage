import { Router, Request, Response } from 'express';
import { LobsterSage } from '../../LobsterSage';
import { getDcaManager } from '../../yield/dcaStrategy';
import { getTradingConstants, updateTradingConstants } from '../../config/trading';
import { getPerformanceTracker } from '../../yield/performanceTracker';

export function createYieldRoutes(getSage: () => LobsterSage | null): Router {
  const router = Router();

  router.get('/yields', async (_req: Request, res: Response) => {
    try {
      const opportunities = await getSage()!.getYieldOpportunities();
      res.json({ opportunities });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/yields/supply-weth', async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        res.status(400).json({ error: 'amount is required (e.g., "0.1" for 0.1 ETH)' });
        return;
      }
      const result = await getSage()!.supplyWethToAave(amount);
      if (result.success) {
        res.json({
          status: 'success',
          message: `Successfully supplied ${result.amountSupplied} WETH to Aave V3`,
          wrapTransaction: { hash: result.wrapTxHash },
          supplyTransaction: { hash: result.supplyTxHash },
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/yields/supply', async (req: Request, res: Response) => {
    try {
      const { token, amount } = req.body;
      if (!token || !amount) {
        res.status(400).json({ error: 'token and amount are required' });
        return;
      }
      const result = await getSage()!.supplyToAave(token, amount);
      if (result.success) {
        res.json({
          status: 'success',
          message: `Supplied ${result.amountSupplied} ${result.tokenSymbol} to Aave V3`,
          transaction: { hash: result.txHash },
          apy: result.apy,
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/yields/withdraw', async (req: Request, res: Response) => {
    try {
      const { token, amount } = req.body;
      if (!token) {
        res.status(400).json({ error: 'token is required (e.g., "WETH" or "USDC")' });
        return;
      }
      const result = await getSage()!.withdrawFromAave(token, amount);
      if (result.success) {
        res.json({
          status: 'success',
          message: `Withdrew ${result.amountWithdrawn} ${result.tokenSymbol} from Aave V3`,
          transaction: { hash: result.txHash },
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/yields/optimize', async (_req: Request, res: Response) => {
    try {
      const result = await getSage()!.optimizeYields();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/yields/positions', async (_req: Request, res: Response) => {
    try {
      const positions = await getSage()!.getYieldPositions();
      res.json({ positions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/yields/aave/balance', async (req: Request, res: Response) => {
    try {
      const asset = (req.query.asset as string) || 'WETH';
      const balance = await getSage()!.getAaveAssetBalance(asset);
      res.json({
        asset: asset.toUpperCase(),
        ...balance,
        netBalance: (parseFloat(balance.supplied) - parseFloat(balance.stableDebt) - parseFloat(balance.variableDebt)).toString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/yields/auto-enter', async (req: Request, res: Response) => {
    try {
      const { amountEth, minApy } = req.body;
      if (!amountEth || parseFloat(amountEth) <= 0) {
        res.status(400).json({ error: 'amountEth is required' });
        return;
      }
      const result = await getSage()!.findBestOpportunityAndEnter({ amountEth, minApy });
      if (result.success) {
        res.json({
          status: 'success',
          message: `Entered ${result.opportunity?.protocol} ${result.opportunity?.strategy}`,
          opportunity: result.opportunity,
          transactions: {
            swap: result.swapTx ? { hash: result.swapTx } : null,
            supply: { hash: result.supplyTx },
          },
          tokenUsed: result.tokenUsed,
          amountSupplied: result.amountSupplied,
          expectedApy: result.expectedApy,
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DCA Routes ====================

  router.post('/yields/dca', async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, totalAmountEth, numSlices, intervalMs, protocol, strategy } = req.body;
      if (!totalAmountEth || !numSlices || !intervalMs) {
        res.status(400).json({ error: 'Required: totalAmountEth, numSlices, intervalMs' });
        return;
      }
      const plan = getDcaManager().createPlan({
        token: token || 'WETH',
        totalAmountEth: parseFloat(totalAmountEth),
        numSlices: parseInt(numSlices),
        intervalMs: parseInt(intervalMs),
        protocol,
        strategy,
      });
      res.json({ status: 'created', plan });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/yields/dca', async (_req: Request, res: Response) => {
    try {
      const plans = getDcaManager().getAllPlans();
      const active = getDcaManager().getActivePlans();
      res.json({ total: plans.length, active: active.length, plans });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/yields/dca/:planId', async (req: Request, res: Response) => {
    try {
      const cancelled = getDcaManager().cancelPlan(req.params.planId);
      if (cancelled) {
        res.json({ status: 'cancelled', planId: req.params.planId });
      } else {
        res.status(404).json({ error: 'Plan not found or not active' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Performance Routes ====================

  router.get('/performance', async (_req: Request, res: Response) => {
    try {
      res.json(getPerformanceTracker().getMetrics());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Config Routes ====================

  router.get('/config/trading', async (_req: Request, res: Response) => {
    try {
      res.json(getTradingConstants());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/config/trading', async (req: Request, res: Response) => {
    try {
      const updated = updateTradingConstants(req.body);
      res.json({ status: 'updated', config: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
