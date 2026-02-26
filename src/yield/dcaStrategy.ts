/**
 * DCA (Dollar Cost Averaging) Strategy Manager
 * Manages scheduled partial entries into DeFi positions.
 */
import { saveJson, loadJson } from '../utils/persistence';

export interface DcaExecution {
  sliceNumber: number;
  amountEth: string;
  txHash?: string;
  success: boolean;
  executedAt: number;
  error?: string;
}

export interface DcaPlan {
  id: string;
  token: string;
  totalAmountEth: number;
  numSlices: number;
  intervalMs: number;
  slicesExecuted: number;
  amountPerSlice: number;
  protocol: string;
  strategy: string;
  createdAt: number;
  nextExecutionAt: number;
  status: 'active' | 'completed' | 'cancelled';
  executionHistory: DcaExecution[];
}

const PERSISTENCE_FILE = 'dca-plans.json';

export class DcaStrategyManager {
  private plans: DcaPlan[] = [];

  constructor() {
    this.plans = loadJson<DcaPlan[]>(PERSISTENCE_FILE, []);
  }

  createPlan(params: {
    token: string;
    totalAmountEth: number;
    numSlices: number;
    intervalMs: number;
    protocol?: string;
    strategy?: string;
  }): DcaPlan {
    const plan: DcaPlan = {
      id: `dca-${Date.now()}`,
      token: params.token,
      totalAmountEth: params.totalAmountEth,
      numSlices: params.numSlices,
      intervalMs: params.intervalMs,
      slicesExecuted: 0,
      amountPerSlice: params.totalAmountEth / params.numSlices,
      protocol: params.protocol ?? 'Aave V3',
      strategy: params.strategy ?? 'Auto-enter best',
      createdAt: Date.now(),
      nextExecutionAt: Date.now(),
      status: 'active',
      executionHistory: [],
    };
    this.plans.push(plan);
    this.save();
    return plan;
  }

  getDuePlans(): DcaPlan[] {
    const now = Date.now();
    return this.plans.filter(
      (p) => p.status === 'active' && p.nextExecutionAt <= now
    );
  }

  recordExecution(
    planId: string,
    result: { success: boolean; txHash?: string; error?: string }
  ): void {
    const plan = this.plans.find((p) => p.id === planId);
    if (!plan) return;

    plan.executionHistory.push({
      sliceNumber: plan.slicesExecuted + 1,
      amountEth: plan.amountPerSlice.toString(),
      txHash: result.txHash,
      success: result.success,
      executedAt: Date.now(),
      error: result.error,
    });

    if (result.success) {
      plan.slicesExecuted++;
      plan.nextExecutionAt = Date.now() + plan.intervalMs;
    }

    if (plan.slicesExecuted >= plan.numSlices) {
      plan.status = 'completed';
    }
    this.save();
  }

  cancelPlan(planId: string): boolean {
    const plan = this.plans.find((p) => p.id === planId);
    if (!plan || plan.status !== 'active') return false;
    plan.status = 'cancelled';
    this.save();
    return true;
  }

  getActivePlans(): DcaPlan[] {
    return this.plans.filter((p) => p.status === 'active');
  }

  getAllPlans(): DcaPlan[] {
    return [...this.plans];
  }

  getPlan(planId: string): DcaPlan | undefined {
    return this.plans.find((p) => p.id === planId);
  }

  private save(): void {
    saveJson(PERSISTENCE_FILE, this.plans);
  }
}

let dcaInstance: DcaStrategyManager | null = null;
export function getDcaManager(): DcaStrategyManager {
  if (!dcaInstance) dcaInstance = new DcaStrategyManager();
  return dcaInstance;
}
