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
}
