// Port of internal/service/engine.go: the CanIBuyIt decision (ENGINE-03, ENGINE-04) and the per-goal
// impact projection. Reads only, so no transaction (as in Go).
//
// Money: integer cents, as in the repos. Times: Go's time.Now().UTC() is the `now` parameter here
// (default: the current time; the handler passes nothing, the tests pass a fixed instant).
// Ids: canonical strings (the handler parses the account id).
//
// Quirks kept from Go:
// - Go's price is an int64, so bufferRemaining and the goal deficit wrap around on overflow. Those two
//   subtractions are done with BigInt.asIntN(64, ...), so an absurd price (the handler's int64 conversion
//   gives MinInt64 beyond the int64 range) gives the same wrapped numbers.
// - classifyRisk uses Go's integer division (truncation toward zero), kept with Math.trunc.
// - A missing default account is an error (sql.ErrNoRows wrapped), not a verdict.

import { nextPayday, type PaySchedule as EnginePaySchedule } from '../engine/engine'
import { AppError, wrap, wrapping } from '../errors'
import type { AccountsRepo } from '../repo/accounts'
import type { GroupEventRepo } from '../repo/groupEvent'
import type { Goal, GoalsRepo } from '../repo/goals'
import type { PayScheduleRepo, PaySchedule } from '../repo/paySchedule'
import type { PeerDebtRepo } from '../repo/peerDebt'
import type { TransactionsRepo } from '../repo/transactions'
import type { EstimateService } from './estimate'
import { advanceOccurrence } from './transactions'

/** Go ErrPayScheduleRequired: the account has no pay schedule. The message is the code the UI reads. */
export const ErrPayScheduleRequired = new AppError('PAY_SCHEDULE_REQUIRED')

/** Projected per-goal impact of a purchase. Money in cents; the percentages are float64 as in Go. */
export interface GoalImpact {
  goalId: string
  goalName: string
  remainingBefore: number
  remainingAfter: number
  progressBeforePct: number
  progressAfterPct: number
  minContributionPerWindowCents: number
  /** "low" | "medium" | "high" */
  severity: string
}

/** A goal whose minimum contribution for the current window is already met. */
export interface GoalWindowCoverage {
  goalId: string
  goalName: string
  contributedThisWindowCents: number
  minContributionPerWindowCents: number
}

/** Go EngineResult. Money in cents. waitUntil is set only for the WAIT verdict. */
export interface EngineResult {
  canBuy: boolean
  /** balance - obligations - safety buffer. */
  purchasingPower: number
  /** purchasingPower - item price (may be negative). */
  bufferRemaining: number
  /** "LOW" | "MEDIUM" | "HIGH" | "BLOCKED" | "WAIT" */
  riskLevel: string
  willAffordAfterPayday: boolean
  waitUntil: Date | null
  goalImpacts: GoalImpact[]
  goalsCoveredThisWindow: GoalWindowCoverage[]
}

/** Go `int64` wrap-around for a difference of two int64 values. */
function wrapInt64(value: bigint): number {
  return Number(BigInt.asIntN(64, value))
}

/** The engine's view of a pay schedule row. */
function toEngineSchedule(ps: PaySchedule): EnginePaySchedule {
  return { frequency: ps.frequency, anchorDate: ps.anchorDate, dayOfMonth2: ps.dayOfMonth2 }
}

/** Go classifyRisk: tiers relative to the safety buffer (min threshold); integer division as in Go. */
export function classifyRisk(bufferRemaining: number, minThreshold: number): string {
  if (minThreshold === 0) return 'LOW'
  if (bufferRemaining < Math.trunc(minThreshold / 4)) return 'HIGH'
  if (bufferRemaining < Math.trunc(minThreshold / 2)) return 'MEDIUM'
  return 'LOW'
}

/**
 * Go previousPayday: the start of the pay window that contains `from` (the last payday on or
 * before it, found by walking the schedule from its anchor; at most 1000 steps, as in Go).
 */
export function previousPayday(ps: PaySchedule, from: Date): Date {
  const ep = toEngineSchedule(ps)
  let curr = nextPayday(ep, new Date(ps.anchorDate.getTime() - 1000))
  if (curr.getTime() >= from.getTime()) return curr
  for (let i = 0; i < 1000; i++) {
    const next = nextPayday(ep, curr)
    if (next.getTime() >= from.getTime()) return curr
    curr = next
  }
  return curr
}

/**
 * Go buildGoalImpacts. For each active or draft goal with a target and a minimum per window, the goal
 * is covered when its window contribution already meets the minimum; otherwise it is an impact when the
 * buffer after the purchase does not cover the minimum. Goals with nothing left to invest are skipped.
 */
export function buildGoalImpacts(
  goals: Goal[],
  purchasingPower: number,
  bufferRemaining: number,
  contributedThisWindow: Map<string, number>,
): { impacts: GoalImpact[]; covered: GoalWindowCoverage[] } {
  const impacts: GoalImpact[] = []
  const covered: GoalWindowCoverage[] = []
  for (const g of goals) {
    if (g.status !== 'active' && g.status !== 'draft') continue
    if (g.targetAmountCents <= 0 || g.minContributionPerWindowCents <= 0) continue
    const remaining = g.targetAmountCents - g.investedTotalCents
    if (remaining <= 0) continue
    const contributed = contributedThisWindow.get(g.id) ?? 0
    if (contributed >= g.minContributionPerWindowCents) {
      covered.push({
        goalId: g.id,
        goalName: g.name,
        contributedThisWindowCents: contributed,
        minContributionPerWindowCents: g.minContributionPerWindowCents,
      })
      continue
    }
    if (bufferRemaining >= g.minContributionPerWindowCents) continue

    const progress = (g.investedTotalCents / g.targetAmountCents) * 100
    const deficitAfter = wrapInt64(BigInt(g.minContributionPerWindowCents) - BigInt(bufferRemaining))
    let severity = 'low'
    if (deficitAfter >= Math.trunc(g.minContributionPerWindowCents / 2)) {
      severity = 'high'
    } else if (deficitAfter >= Math.trunc(g.minContributionPerWindowCents / 4)) {
      severity = 'medium'
    }
    if (purchasingPower < g.minContributionPerWindowCents) {
      severity = 'high'
    }

    impacts.push({
      goalId: g.id,
      goalName: g.name,
      remainingBefore: remaining,
      remainingAfter: remaining,
      progressBeforePct: progress,
      progressAfterPct: progress,
      minContributionPerWindowCents: g.minContributionPerWindowCents,
      severity,
    })
  }
  return { impacts, covered }
}

/** A guard against a runaway loop when a daily-ish frequency meets a far payday. */
const MAX_OCCURRENCES = 100

export class EngineService {
  private readonly accRepo: AccountsRepo
  private readonly txnsRepo: TransactionsRepo
  private readonly psRepo: PayScheduleRepo
  private readonly peerDebtRepo: PeerDebtRepo
  private readonly groupEventRepo: GroupEventRepo
  private readonly goalsRepo: GoalsRepo
  private readonly estimator: Pick<EstimateService, 'effectiveAmount'>

  constructor(
    accRepo: AccountsRepo,
    txnsRepo: TransactionsRepo,
    psRepo: PayScheduleRepo,
    peerDebtRepo: PeerDebtRepo,
    groupEventRepo: GroupEventRepo,
    goalsRepo: GoalsRepo,
    estimator: Pick<EstimateService, 'effectiveAmount'>,
  ) {
    this.accRepo = accRepo
    this.txnsRepo = txnsRepo
    this.psRepo = psRepo
    this.peerDebtRepo = peerDebtRepo
    this.groupEventRepo = groupEventRepo
    this.goalsRepo = goalsRepo
    this.estimator = estimator
  }

  /**
   * The estimated recurring expenses due before the payday: each one's estimate, once for every
   * occurrence that falls before it (a weekly market run counts twice in a bi-weekly window).
   */
  private async sumVariableObligations(accountId: string, payday: Date): Promise<number> {
    const due = await this.txnsRepo.listDueVariable(accountId, payday)
    let total = 0
    for (const t of due) {
      const amount = await this.estimator.effectiveAmount(t)
      let count = 0
      let next = t.nextOccurrence
      while (next !== null && next.getTime() < payday.getTime() && count < MAX_OCCURRENCES) {
        count++
        next = t.frequency === null ? null : advanceOccurrence(next, t.frequency)
      }
      total += amount * count
    }
    return total
  }

  /**
   * Go CanIBuyIt: can the account afford itemPrice (cents) at `now`, given its balance, the obligations
   * until the earliest next payday, and its safety buffer.
   *
   *   purchasing_power = balance - sum(upcoming obligations) - safety buffer
   *   can_buy          = purchasing_power >= item_price
   *
   * The obligations are the recurring transactions due before that payday (overdue ones stay counted
   * until confirmed), the peer debts and the admin obligations of group events. Peer and group amounts
   * are <= 0, so adding them reduces the purchasing power.
   * WAIT: the item is not affordable now but would be after the earliest payday (its balance is added).
   */
  async canIBuyIt(accountId: string, itemPrice: number, now: Date = new Date()): Promise<EngineResult> {
    const acc = await wrapping('engine.CanIBuyIt: get account', () => this.accRepo.getById(accountId))

    const schedules = await wrapping('engine.CanIBuyIt: list pay schedules', () =>
      this.psRepo.listByAccountId(accountId),
    )
    const first = schedules[0]
    if (first === undefined) {
      throw wrap('engine.CanIBuyIt', ErrPayScheduleRequired)
    }

    // The union window: the earliest next payday across all schedules (the first one wins a tie).
    let earliestSchedule: PaySchedule = first
    let earliestPayday = nextPayday(toEngineSchedule(first), now)
    for (const ps of schedules.slice(1)) {
      const np = nextPayday(toEngineSchedule(ps), now)
      if (np.getTime() < earliestPayday.getTime()) {
        earliestPayday = np
        earliestSchedule = ps
      }
    }

    const fixedObligations = await wrapping('engine.CanIBuyIt: sum obligations', () =>
      this.txnsRepo.sumUpcomingObligations(accountId, now, earliestPayday),
    )
    const variableObligations = await wrapping('engine.CanIBuyIt: sum variable obligations', () =>
      this.sumVariableObligations(accountId, earliestPayday),
    )
    const obligations = fixedObligations + variableObligations
    const peerObligations = await wrapping('engine.CanIBuyIt: sum peer obligations', () =>
      this.peerDebtRepo.sumUpcomingPeerObligations(accountId, now, earliestPayday),
    )
    const groupObligations = await wrapping('engine.CanIBuyIt: sum group obligations', () =>
      this.groupEventRepo.sumUpcomingAdminObligations(accountId, now, earliestPayday),
    )
    const goals = await wrapping('engine.CanIBuyIt: list goals', () => this.goalsRepo.getGoalsByAccount(accountId))

    const purchasingPower = acc.currentBalance + obligations + peerObligations + groupObligations - acc.safetyBuffer
    const canBuy = purchasingPower >= itemPrice
    const bufferRemaining = wrapInt64(BigInt(purchasingPower) - BigInt(itemPrice))

    const windowStart = previousPayday(earliestSchedule, now)
    const contributedThisWindow = await wrapping('engine.CanIBuyIt: load goal window contributions', () =>
      this.contributionsInWindow(goals, windowStart, earliestPayday),
    )
    const { impacts: goalImpacts, covered: coveredGoals } = buildGoalImpacts(
      goals,
      purchasingPower,
      bufferRemaining,
      contributedThisWindow,
    )

    if (canBuy) {
      return {
        canBuy: true,
        purchasingPower,
        bufferRemaining,
        riskLevel: classifyRisk(bufferRemaining, acc.safetyBuffer),
        willAffordAfterPayday: false,
        waitUntil: null,
        goalImpacts,
        goalsCoveredThisWindow: coveredGoals,
      }
    }

    // Cannot buy now: WAIT if the balance after the earliest payday would cover it.
    const projectedBalance = acc.currentBalance + earliestSchedule.amount
    const projectedPurchasingPower =
      projectedBalance + obligations + peerObligations + groupObligations - acc.safetyBuffer
    const willAfford = projectedPurchasingPower >= itemPrice

    return {
      canBuy: false,
      purchasingPower,
      bufferRemaining,
      riskLevel: willAfford ? 'WAIT' : 'BLOCKED',
      willAffordAfterPayday: willAfford,
      waitUntil: willAfford ? earliestPayday : null,
      goalImpacts,
      goalsCoveredThisWindow: coveredGoals,
    }
  }

  /**
   * Go goalContributionsInWindow: per goal, the net contributions (contribution and adjustment add,
   * withdrawal subtracts) with a timestamp in [windowStart, windowEnd). Only positive sums are kept.
   */
  private async contributionsInWindow(
    goals: Goal[],
    windowStart: Date,
    windowEnd: Date,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    for (const g of goals) {
      const entries = await this.goalsRepo.listLedgerByGoal(g.id)
      let sum = 0
      for (const e of entries) {
        const ts = e.timestampUtc.getTime()
        if (ts < windowStart.getTime() || ts >= windowEnd.getTime()) continue
        if (e.type === 'contribution' || e.type === 'adjustment') {
          sum += e.amountCents
        } else if (e.type === 'withdrawal') {
          sum -= e.amountCents
        }
      }
      if (sum > 0) out.set(g.id, sum)
    }
    return out
  }
}
