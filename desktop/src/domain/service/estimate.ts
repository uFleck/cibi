// The amount a variable recurring expense is expected to cost: the median of its latest matching
// payments, or the stored amount while there is no history.

import { ESTIMATE_WINDOW, isEstimateSource, medianCents } from '../estimate'
import { wrapping } from '../errors'
import type { EstimateRepo } from '../repo/estimate'

/** The fields of a transaction the estimate reads. */
export interface EstimateInput {
  /** Cents, the fallback. */
  amount: number
  estimateSource: string | null
  estimateKey: string | null
}

export interface Estimate {
  /** Cents. */
  amount: number
  /** How many payments the amount comes from; 0 means the stored amount was used. */
  samples: number
}

/** An as-needed bill's month: what it is expected to cost and what was paid for it so far. */
export interface MonthBudget {
  /** Cents, negative: the median of past monthly totals, or the stored amount while there is no history. */
  budget: number
  /** Cents, negative or 0: the payments posted this calendar month. */
  spent: number
  /** How many past months the budget comes from; 0 means the stored amount was used. */
  samples: number
}

/** How many past calendar months with payments the as-needed budget looks at. */
const BUDGET_MONTHS = 6

/** Calendar months are local time: a payment late on the last day belongs to that month. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`
}

export function isVariable(t: Pick<EstimateInput, 'estimateSource' | 'estimateKey'>): boolean {
  return isEstimateSource(t.estimateSource) && (t.estimateKey ?? '').trim() !== ''
}

export class EstimateService {
  private readonly repo: EstimateRepo

  constructor(repo: EstimateRepo) {
    this.repo = repo
  }

  /** The estimate for a variable transaction, or null for a fixed one. */
  async estimate(t: EstimateInput): Promise<Estimate | null> {
    if (!isEstimateSource(t.estimateSource) || !isVariable(t)) return null
    const source = t.estimateSource
    const key = (t.estimateKey ?? '').trim()
    const history = await wrapping('service.Estimate: history', () =>
      this.repo.recentPaymentAmounts(source, key, ESTIMATE_WINDOW),
    )
    const median = medianCents(history)
    return median === null ? { amount: t.amount, samples: 0 } : { amount: median, samples: history.length }
  }

  /** The cents to count for the transaction: its estimate when variable, else its stored amount. */
  async effectiveAmount(t: EstimateInput): Promise<number> {
    return (await this.estimate(t))?.amount ?? t.amount
  }

  /**
   * The current month of an as-needed bill. Months with no payment are skipped (nothing was recorded),
   * so the budget is the median over the last months that have some.
   */
  async monthBudget(t: { id: string; amount: number }, now: Date = new Date()): Promise<MonthBudget> {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const historyStart = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    const payments = await wrapping('service.MonthBudget: payments', () =>
      this.repo.paymentsForTransaction(t.id, historyStart),
    )
    let spent = 0
    const totals = new Map<string, number>()
    for (const p of payments) {
      if (p.postedAt.getTime() >= monthStart.getTime()) {
        spent += p.amount
      } else {
        const key = monthKey(p.postedAt)
        totals.set(key, (totals.get(key) ?? 0) + p.amount)
      }
    }
    // Map order is oldest first (payments are sorted), so the latest months are at the end.
    const recent = [...totals.values()].slice(-BUDGET_MONTHS)
    const median = medianCents(recent)
    return { budget: median ?? t.amount, spent, samples: recent.length }
  }
}
