import { Router, Request, Response } from 'express';
import { LobsterSage } from '../../LobsterSage';

export function createTradingRoutes(getSage: () => LobsterSage | null): Router {
  const router = Router();

  // ============ Swap Endpoints ============

  router.get('/swap/quote', async (req: Request, res: Response) => {
    try {
      const tokenIn = req.query.tokenIn as string;
      const tokenOut = req.query.tokenOut as string;
      const amount = req.query.amount as string;
      const slippage = Number(req.query.slippage) || 0.5;

      if (!tokenIn || !tokenOut || !amount) {
        res.status(400).json({
          error: 'tokenIn, tokenOut, and amount query parameters are required',
          example: '/swap/quote?tokenIn=ETH&tokenOut=USDC&amount=1.0&slippage=0.5',
        });
        return;
      }

      const quote = await getSage()!.getSwapQuote({ tokenIn, tokenOut, amount, slippage });
      if (quote.error) {
        res.status(400).json({ error: quote.error, query: { tokenIn, tokenOut, amount, slippage } });
        return;
      }
      res.json({
        tokenIn, tokenOut,
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        priceImpact: quote.priceImpact,
        gasEstimate: quote.gasEstimate,
        route: quote.route,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/swap', async (req: Request, res: Response) => {
    try {
      const { tokenIn, tokenOut, amount, slippage } = req.body;
      if (!tokenIn || !tokenOut || !amount) {
        res.status(400).json({ error: 'tokenIn, tokenOut, and amount are required' });
        return;
      }
      const result = await getSage()!.swapTokens({ tokenIn, tokenOut, amount, slippage });
      if (result.success) {
        res.json({
          status: 'success',
          message: `Swapped ${result.amountIn} ${result.tokenIn} -> ${result.amountOut} ${result.tokenOut}`,
          transaction: { hash: result.txHash },
          amountIn: result.amountIn,
          amountOut: result.amountOut,
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/unwrap-weth', async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        res.status(400).json({ error: 'amount is required' });
        return;
      }
      const result = await getSage()!.unwrapWeth(amount);
      res.json({
        status: 'success',
        message: `Unwrapped ${amount} WETH to ETH`,
        transaction: { hash: result.hash },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/wrap-eth', async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        res.status(400).json({ error: 'amount is required (e.g., "0.01")' });
        return;
      }
      const result = await getSage()!.wrapEth(amount);
      res.json({
        status: 'success',
        message: `Wrapped ${amount} ETH to WETH`,
        transaction: { hash: result.hash },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Compound ============

  router.post('/trade/compound', async (req: Request, res: Response) => {
    try {
      const { amount, minApy } = req.body;
      const result = await getSage()!.compoundYield({ amount, minApy });
      if (result.success) {
        res.json({
          status: 'success',
          message: `Successfully compounded $${result.totalProfitUsd?.toFixed(2)} of yield`,
          totalProfitUsd: result.totalProfitUsd,
          steps: result.steps,
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error, steps: result.steps });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Aave Borrow/Repay/Account ============

  router.post('/aave/borrow', async (req: Request, res: Response) => {
    try {
      const { token, amount, interestRateMode } = req.body;
      if (!token || !amount) {
        res.status(400).json({ error: 'token and amount are required' });
        return;
      }
      const mode = interestRateMode === 'stable' ? 'stable' : 'variable';
      const result = await getSage()!.borrowFromAave(token, amount, mode);
      if (result.success) {
        res.json({
          status: 'success',
          message: `Borrowed ${amount} ${token} from Aave V3 (${mode})`,
          transaction: { hash: result.txHash },
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/aave/repay', async (req: Request, res: Response) => {
    try {
      const { token, amount, interestRateMode } = req.body;
      if (!token) {
        res.status(400).json({ error: 'token is required' });
        return;
      }
      const repayAmount = amount || 'all';
      const mode = interestRateMode === 'stable' ? 'stable' : 'variable';
      const result = await getSage()!.repayAave(token, repayAmount, mode);
      if (result.success) {
        res.json({
          status: 'success',
          message: `Repaid ${repayAmount} ${token} on Aave V3 (${mode})`,
          transaction: { hash: result.txHash },
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/aave/account', async (_req: Request, res: Response) => {
    try {
      const data = await getSage()!.getAaveAccountData();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Swap-and-Supply / Leverage ============

  router.post('/trade/swap-and-supply', async (req: Request, res: Response) => {
    try {
      const { tokenIn, tokenOut, amount, slippage, supplyToAave } = req.body;
      if (!tokenIn || !tokenOut || !amount) {
        res.status(400).json({ error: 'tokenIn, tokenOut, and amount are required' });
        return;
      }
      const result = await getSage()!.swapAndSupply({
        tokenIn, tokenOut, amount, slippage,
        supplyToAave: supplyToAave !== false,
      });
      if (result.success) {
        res.json({ status: 'success', steps: result.steps });
      } else {
        res.status(400).json({ status: 'failed', error: result.error, steps: result.steps });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trade/leverage', async (req: Request, res: Response) => {
    try {
      const { supplyToken, borrowToken, initialAmount, loops, minHealthFactor } = req.body;
      if (!supplyToken || !borrowToken || !initialAmount) {
        res.status(400).json({ error: 'supplyToken, borrowToken, and initialAmount are required' });
        return;
      }
      const result = await getSage()!.openLeveragedPosition({
        supplyToken, borrowToken, initialAmount,
        loops: loops || 2,
        minHealthFactor: minHealthFactor || 1.5,
      });
      if (result.success) {
        res.json({
          status: 'success',
          steps: result.steps,
          finalHealthFactor: result.finalHealthFactor,
          totalCollateralUsd: result.totalCollateralUsd,
          totalDebtUsd: result.totalDebtUsd,
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error, steps: result.steps });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trade/deleverage', async (req: Request, res: Response) => {
    try {
      const { supplyToken, debtToken } = req.body;
      if (!supplyToken || !debtToken) {
        res.status(400).json({ error: 'supplyToken and debtToken are required' });
        return;
      }
      const result = await getSage()!.closeLeveragedPosition({ supplyToken, debtToken });
      if (result.success) {
        res.json({
          status: 'success',
          steps: result.steps,
          finalHealthFactor: result.finalHealthFactor,
          remainingDebtUsd: result.remainingDebtUsd,
          remainingCollateralUsd: result.remainingCollateralUsd,
        });
      } else {
        res.status(400).json({ status: 'failed', error: result.error, steps: result.steps });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Trading Strategy & Cycles ============

  router.get('/trading/strategy', async (_req: Request, res: Response) => {
    try {
      const strategy = getSage()!.getTradingStrategy();
      res.json({ strategy });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trading/strategy', async (req: Request, res: Response) => {
    try {
      const strategy = getSage()!.setTradingStrategy(req.body);
      res.json({ status: 'success', message: 'Trading strategy updated', strategy });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trading/mode', async (req: Request, res: Response) => {
    try {
      const { mode } = req.body;
      if (!mode || !['conservative', 'aggressive', 'capitulation-fishing'].includes(mode)) {
        res.status(400).json({ error: 'Invalid mode. Valid: conservative, aggressive, capitulation-fishing' });
        return;
      }
      const strategy = getSage()!.setTradingMode(mode);
      res.json({ status: 'success', message: `Trading mode set to: ${mode}`, strategy });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/trading/capitulation-check', async (_req: Request, res: Response) => {
    try {
      const result = await getSage()!.detectCapitulation();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trading/run-cycle', async (_req: Request, res: Response) => {
    try {
      const result = await getSage()!.runTradingCycle();
      res.json({
        status: result.success ? 'success' : 'failed',
        message: `Trading cycle complete: ${result.actions.length} actions`,
        positionsChecked: result.positionsChecked,
        opportunitiesScanned: result.opportunitiesScanned,
        actions: result.actions,
        error: result.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trading/pure-cycle', async (_req: Request, res: Response) => {
    try {
      const result = await getSage()!.runPureTradingCycle();
      res.json({
        status: result.success ? 'success' : 'failed',
        message: `Pure trading cycle complete: ${result.actions.length} actions`,
        positionsChecked: result.positionsChecked,
        opportunitiesScanned: result.opportunitiesScanned,
        actions: result.actions,
        note: 'Pure DeFi trading only',
        error: result.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trading/dry-run', async (_req: Request, res: Response) => {
    try {
      const result = await getSage()!.runDryRunTradingCycle();
      res.json({
        status: 'success',
        message: 'Dry-run analysis complete - no trades executed',
        mode: result.mode,
        analysis: result.analysis,
        timestamp: result.timestamp,
        note: 'Analysis only - no on-chain transactions',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/trading/history', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const history = getSage()!.getTradingHistory(limit);
      res.json({ history });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trading/enable', async (_req: Request, res: Response) => {
    try {
      getSage()!.enableAutonomousTrading();
      res.json({
        status: 'success',
        message: 'Autonomous trading ENABLED',
        warning: 'The agent will now execute trades automatically on /trading/run-cycle',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/trading/disable', async (_req: Request, res: Response) => {
    try {
      getSage()!.disableAutonomousTrading();
      res.json({ status: 'success', message: 'Autonomous trading DISABLED' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
