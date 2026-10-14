// Port of internal/service/goals_tracking.go. GoalsService.buildTracking delegates here.
//
// Money: dollars (cents / 100). Times: formatDbTime (RFC3339, UTC, whole seconds).
// Order: the top goals are ranked by urgency (see urgencyScore, then the due date, then the creation
// time); the recent activity is every ledger entry of every goal, newest first, at most 10. Both
// sorts are stable, so ties keep the repo's order (the goals in GetGoalsByAccount order, the entries
// in timestamp order).
// Go's `now` is time.Now(); here it is a parameter defaulting to the current time.

import { formatDbTime } from '../dates'
import type { Goal, GoalsRepo } from '../repo/goals'

export interface GoalsTrackingSummary {
  goalsCount: number
  completedCount: number
  totalTarget: number
  totalInvested: number
  totalRemaining: number
}

export interface GoalsTrackingGoal {
  id: string
  name: string
  status: string
  targetAmount: number
  investedTotal: number
  remainingAmount: number
  /** 0 to 100, capped at 100. */
  progressPct: number
  minContributionPerWindow: number
  /** null when the goal has no target date. */
  targetDateUtc: string | null
  createdAtUtc: string
}

export interface GoalsTrackingActivity {
  goalId: string
  goalName: string
  entryId: string
  amount: number
  type: string
  source: string
  timestampUtc: string
}

export interface GoalsTrackingResponse {
  summary: GoalsTrackingSummary
  topGoals: GoalsTrackingGoal[]
  recentActivity: GoalsTrackingActivity[]
  updatedAtUtc: string
}

interface UrgencyRankedGoal {
  goal: Goal
  remainingCents: number
  score: number
}

const TOP_GOALS_LIMIT = 5
const RECENT_ACTIVITY_LIMIT = 10

/** Go BuildTracking. `now` is the reference time for the urgency and the response timestamp. */
export async function buildTracking(goals: GoalsRepo, accountId: string, now: Date = new Date()): Promise<GoalsTrackingResponse> {
  const list = await goals.getGoalsByAccount(accountId)
  const summary: GoalsTrackingSummary = {
    goalsCount: 0,
    completedCount: 0,
    totalTarget: 0,
    totalInvested: 0,
    totalRemaining: 0,
  }
  const ranked: UrgencyRankedGoal[] = []
  const activities: GoalsTrackingActivity[] = []
  for (const g of list) {
    const remaining = Math.max(g.targetAmountCents - g.investedTotalCents, 0)
    summary.goalsCount++
    if (g.status === 'completed') summary.completedCount++
    summary.totalTarget += g.targetAmountCents / 100
    summary.totalInvested += g.investedTotalCents / 100
    summary.totalRemaining += remaining / 100

    ranked.push({ goal: g, remainingCents: remaining, score: urgencyScore(now, g, remaining) })

    const entries = await goals.listLedgerByGoal(g.id)
    for (const e of entries) {
      activities.push({
        goalId: g.id,
        goalName: g.name,
        entryId: e.id,
        amount: e.amountCents / 100,
        type: e.type,
        source: e.source,
        timestampUtc: formatDbTime(e.timestampUtc),
      })
    }
  }

  ranked.sort(compareRanked)
  const topGoals: GoalsTrackingGoal[] = ranked.slice(0, TOP_GOALS_LIMIT).map((rg) => {
    let progress = 0
    if (rg.goal.targetAmountCents > 0) {
      progress = (rg.goal.investedTotalCents / rg.goal.targetAmountCents) * 100
      if (progress > 100) progress = 100
    }
    return {
      id: rg.goal.id,
      name: rg.goal.name,
      status: rg.goal.status,
      targetAmount: rg.goal.targetAmountCents / 100,
      investedTotal: rg.goal.investedTotalCents / 100,
      remainingAmount: rg.remainingCents / 100,
      progressPct: progress,
      minContributionPerWindow: rg.goal.minContributionPerWindowCents / 100,
      targetDateUtc: rg.goal.targetDateUtc === null ? null : formatDbTime(rg.goal.targetDateUtc),
      createdAtUtc: formatDbTime(rg.goal.createdAtUtc),
    }
  })

  // Newest first; ties keep their order.
  activities.sort((a, b) => (a.timestampUtc > b.timestampUtc ? -1 : a.timestampUtc < b.timestampUtc ? 1 : 0))

  return {
    summary,
    topGoals,
    recentActivity: activities.slice(0, RECENT_ACTIVITY_LIMIT),
    updatedAtUtc: formatDbTime(now),
  }
}

/** The ranking of Go's sort.SliceStable less function: higher score first, then the earlier due date (a dated goal before an undated one), then the earlier creation time. */
function compareRanked(a: UrgencyRankedGoal, b: UrgencyRankedGoal): number {
  if (a.score !== b.score) return a.score > b.score ? -1 : 1
  const at = a.goal.targetDateUtc
  const bt = b.goal.targetDateUtc
  if (at !== null && bt === null) return -1
  if (at === null && bt !== null) return 1
  if (at !== null && bt !== null && at.getTime() !== bt.getTime()) return at.getTime() < bt.getTime() ? -1 : 1
  const ac = a.goal.createdAtUtc.getTime()
  const bc = b.goal.createdAtUtc.getTime()
  if (ac === bc) return 0
  return ac < bc ? -1 : 1
}

/**
 * Go urgencyScore: the whole days from now to the target date (truncated toward zero, 0 when past,
 * 36500 with no target date) make the score: nearer date -> higher; larger remaining -> higher.
 */
export function urgencyScore(now: Date, g: Goal, remainingCents: number): number {
  let days = 36500
  if (g.targetDateUtc !== null) {
    const hours = (g.targetDateUtc.getTime() - now.getTime()) / 3_600_000
    const d = Math.trunc(hours / 24)
    days = d < 0 ? 0 : d
  }
  return (36500 - days) * 1_000_000 + remainingCents
}
