/**
 * LeverageManager - Handles leveraged position operations
 *
 * Manages:
 * - Swap-and-supply (swap then deposit to Aave)
 * - Opening leveraged positions (supply→borrow→swap loop)
 * - Closing leveraged positions (withdraw→swap→repay loop)
 */

type StepEntry = { action: string; status: string; txHash?: string; details?: any };

export interface SwapTokensFn {
  (params: { tokenIn: string; tokenOut: string; amount: string; slippage?: number }): Promise<any>;
}

export interface SupplyToAaveFn {
  (token: string, amount: string): Promise<any>;
}

export async function swapAndSupply(
  params: { tokenIn: string; tokenOut: string; amount: string; slippage?: number; supplyToAave?: boolean },
  swapTokens: SwapTokensFn,
  supplyToAave: SupplyToAaveFn
): Promise<any> {
  const steps: StepEntry[] = [];
  try {
    steps.push({ action: `Swap ${params.amount} ${params.tokenIn} -> ${params.tokenOut}`, status: 'pending' });
    const swapResult = await swapTokens({
      tokenIn: params.tokenIn, tokenOut: params.tokenOut,
      amount: params.amount, slippage: params.slippage,
    });
    if (!swapResult.success) {
      steps[0].status = 'failed';
      return { success: false, steps, error: swapResult.error };
    }
    steps[0].status = 'complete';
    steps[0].txHash = swapResult.txHash;
    steps[0].details = { amountOut: swapResult.amountOut };

    if (params.supplyToAave !== false) {
      steps.push({ action: `Supply ${swapResult.amountOut} ${params.tokenOut} to Aave`, status: 'pending' });
      const result = await supplyToAave(params.tokenOut, swapResult.amountOut);
      if (!result.success) {
        steps[1].status = 'failed';
        return { success: false, steps, error: result.error };
      }
      steps[1].status = 'complete';
      steps[1].txHash = result.txHash;
    }
    return { success: true, steps };
  } catch (error: any) {
    return { success: false, steps, error: error.message };
  }
}

export async function openLeveragedPosition(
  params: {
    supplyToken: string; borrowToken: string; initialAmount: string;
    loops?: number; minHealthFactor?: number;
    borrowFn: (token: string, amount: string, mode: 'variable') => Promise<any>;
    supplyFn: (token: string, amount: string) => Promise<any>;
    getAccountData: () => Promise<any>;
  },
  swapTokens: SwapTokensFn
): Promise<any> {
  const { supplyToken, borrowToken, initialAmount, loops = 2, minHealthFactor = 1.5 } = params;
  const steps: StepEntry[] = [];

  try {
    steps.push({ action: `Supply ${initialAmount} ${supplyToken} to Aave`, status: 'pending' });
    const initialSupply = await params.supplyFn(supplyToken, initialAmount);
    if (!initialSupply.success) {
      steps[0].status = 'failed';
      return { success: false, steps, error: initialSupply.error };
    }
    steps[0].status = 'complete';
    steps[0].txHash = initialSupply.txHash;

    for (let i = 0; i < loops; i++) {
      const accountData = await params.getAccountData();
      const healthFactor = parseFloat(accountData.healthFactor);

      if (healthFactor < minHealthFactor && i > 0) {
        steps.push({ action: `Loop ${i + 1} skipped`, status: 'skipped', details: { healthFactor, minHealthFactor, reason: 'Health factor too low' } });
        break;
      }

      const availableBorrows = parseFloat(accountData.availableBorrowsUsd);
      if (availableBorrows < 1) {
        steps.push({ action: `Loop ${i + 1} skipped`, status: 'skipped', details: { reason: 'No borrowing capacity' } });
        break;
      }

      const borrowAmount = (availableBorrows * 0.5).toFixed(6);
      steps.push({ action: `Borrow ~$${borrowAmount} of ${borrowToken}`, status: 'pending' });
      const borrowResult = await params.borrowFn(borrowToken, borrowAmount, 'variable');
      if (!borrowResult.success) {
        steps[steps.length - 1].status = 'failed';
        return { success: false, steps, error: borrowResult.error };
      }
      steps[steps.length - 1].status = 'complete';
      steps[steps.length - 1].txHash = borrowResult.txHash;

      steps.push({ action: `Swap ${borrowToken} -> ${supplyToken}`, status: 'pending' });
      const swapResult = await swapTokens({ tokenIn: borrowToken, tokenOut: supplyToken, amount: borrowAmount });
      if (!swapResult.success) {
        steps[steps.length - 1].status = 'failed';
        return { success: false, steps, error: swapResult.error };
      }
      steps[steps.length - 1].status = 'complete';
      steps[steps.length - 1].txHash = swapResult.txHash;

      steps.push({ action: `Supply ${swapResult.amountOut} ${supplyToken} to Aave`, status: 'pending' });
      const reSupply = await params.supplyFn(supplyToken, swapResult.amountOut);
      if (!reSupply.success) {
        steps[steps.length - 1].status = 'failed';
        return { success: false, steps, error: reSupply.error };
      }
      steps[steps.length - 1].status = 'complete';
      steps[steps.length - 1].txHash = reSupply.txHash;
    }

    const finalAccount = await params.getAccountData();
    return {
      success: true, steps,
      finalHealthFactor: finalAccount.healthFactor,
      totalCollateralUsd: finalAccount.totalCollateralUsd,
      totalDebtUsd: finalAccount.totalDebtUsd,
    };
  } catch (error: any) {
    return { success: false, steps, error: error.message };
  }
}

export async function closeLeveragedPosition(
  params: {
    supplyToken: string; debtToken: string;
    repayFn: (token: string, amount: string, mode: 'variable') => Promise<any>;
    withdrawFn: (token: string, amount?: string) => Promise<any>;
    getAccountData: () => Promise<any>;
  },
  swapTokens: SwapTokensFn
): Promise<any> {
  const { supplyToken, debtToken } = params;
  const steps: StepEntry[] = [];
  const MAX_ITERATIONS = 5;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const accountData = await params.getAccountData();
      const totalDebt = parseFloat(accountData.totalDebtUsd);

      if (totalDebt < 0.01) {
        steps.push({ action: 'Debt fully repaid', status: 'complete' });
        break;
      }

      const collateral = parseFloat(accountData.totalCollateralUsd);
      const withdrawAmount = ((collateral - totalDebt * 1.2) * 0.8).toFixed(6);

      if (parseFloat(withdrawAmount) <= 0) {
        steps.push({ action: `Iteration ${i + 1} skipped`, status: 'skipped', details: { reason: 'Not enough excess collateral' } });
        break;
      }

      steps.push({ action: `Withdraw ${supplyToken} from Aave`, status: 'pending' });
      const withdrawResult = await params.withdrawFn(supplyToken, withdrawAmount);
      if (!withdrawResult.success) {
        steps[steps.length - 1].status = 'failed';
        return { success: false, steps, error: withdrawResult.error };
      }
      steps[steps.length - 1].status = 'complete';
      steps[steps.length - 1].txHash = withdrawResult.txHash;

      steps.push({ action: `Swap ${supplyToken} -> ${debtToken}`, status: 'pending' });
      const swapResult = await swapTokens({
        tokenIn: supplyToken, tokenOut: debtToken,
        amount: withdrawResult.amountWithdrawn || withdrawAmount,
      });
      if (!swapResult.success) {
        steps[steps.length - 1].status = 'failed';
        return { success: false, steps, error: swapResult.error };
      }
      steps[steps.length - 1].status = 'complete';
      steps[steps.length - 1].txHash = swapResult.txHash;

      steps.push({ action: `Repay ${debtToken} debt`, status: 'pending' });
      const repayResult = await params.repayFn(debtToken, swapResult.amountOut, 'variable');
      if (!repayResult.success) {
        steps[steps.length - 1].status = 'failed';
        return { success: false, steps, error: repayResult.error };
      }
      steps[steps.length - 1].status = 'complete';
      steps[steps.length - 1].txHash = repayResult.txHash;
    }

    const finalAccount = await params.getAccountData();
    return {
      success: true, steps,
      finalHealthFactor: finalAccount.healthFactor,
      remainingDebtUsd: finalAccount.totalDebtUsd,
      remainingCollateralUsd: finalAccount.totalCollateralUsd,
    };
  } catch (error: any) {
    return { success: false, steps, error: error.message };
  }
}
