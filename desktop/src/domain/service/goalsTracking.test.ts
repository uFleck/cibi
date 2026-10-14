// @vitest-environment node
// Ports of internal/service/goals_tracking_test.go (2 tests). The Go mocks are the goals repo fake
// (testing/fakesGoals.ts). Go's time.Now() is the real clock here too. The tests after the Go ones
// cover the tracking rules: summary sums, progress cap, the 10-entry activity list and the sort ties.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import type { Goal, GoalLedgerEntry } from '../repo/goals'
import { createTestDb } from '../testing/testDb'
import { newTestLedgerSvc } from '../testing/fakes'
import { MockGoalsRepo, NIL_UUID, scopedAccountRepo, zeroGoal } from '../testing/fakesGoals'
import { GoalsService } from './goals'
import { urgencyScore } from './goalsTracking'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

function goal(over: Partial<Goal>): Goal {
  return { ...zeroGoal(), id: crypto.randomUUID(), status: 'active', ...over }
}

function entry(over: Partial<GoalLedgerEntry>): GoalLedgerEntry {
  return {
    id: crypto.randomUUID(),
    goalId: NIL_UUID,
    amountCents: 1000,
    type: 'contribution',
    source: 'manual',
    note: null,
    reversesEntryId: null,
    timestampUtc: new Date('2026-01-01T00:00:00Z'),
    createdAtUtc: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

/** Whole seconds of the current time, as the Go test's time.Now().UTC().Truncate(time.Second). */
function nowTruncated(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000)
}

// TestGoalsTracking_DeterministicUrgencyOrdering
it('TestGoalsTracking_DeterministicUrgencyOrdering: ranks by nearer date, then larger remaining, then creation order', async () => {
  const accID = crypto.randomUUID()
  const now = nowTruncated()

  const targetSoon = addDays(now, 5)
  const targetSoon2 = addDays(now, 5)
  const targetLater = addDays(now, 10)

  const g1 = goal({ id: crypto.randomUUID(), accountId: accID, name: 'same-day-bigger-gap', status: 'active', targetAmountCents: 100000, investedTotalCents: 10000, targetDateUtc: targetSoon, createdAtUtc: new Date(now.getTime() + 2 * 3_600_000) })
  const g2 = goal({ id: crypto.randomUUID(), accountId: accID, name: 'same-day-smaller-gap', status: 'active', targetAmountCents: 50000, investedTotalCents: 45000, targetDateUtc: targetSoon2, createdAtUtc: new Date(now.getTime() + 1 * 3_600_000) })
  const g3 = goal({ id: crypto.randomUUID(), accountId: accID, name: 'later-date', status: 'active', targetAmountCents: 200000, investedTotalCents: 1000, targetDateUtc: targetLater, createdAtUtc: now })

  const repo = new MockGoalsRepo({ goal: g1 })
  repo.getGoalsByAccountFn = async () => [g3, g2, g1]
  repo.listLedgerByGoalFn = async () => []
  const accRepo = scopedAccountRepo(accID, 0)
  const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))

  const out = await svc.buildTracking(accID)
  expect(out.topGoals.length).toBe(3)
  expect(out.topGoals[0]?.name).toBe('same-day-bigger-gap')
  expect(out.topGoals[1]?.name).toBe('same-day-smaller-gap')
  expect(out.topGoals[2]?.name).toBe('later-date')
})

// TestGoalsTracking_TopGoalsCappedAtFive
it('TestGoalsTracking_TopGoalsCappedAtFive: at most five top goals, and updated_at_utc is set', async () => {
  const accID = crypto.randomUUID()
  const now = new Date()

  const goals: Goal[] = []
  for (let i = 0; i < 6; i++) {
    goals.push(
      goal({
        id: crypto.randomUUID(),
        accountId: accID,
        name: 'goal',
        status: 'active',
        targetAmountCents: 10000,
        investedTotalCents: i * 100,
        targetDateUtc: addDays(now, i + 1),
        createdAtUtc: new Date(now.getTime() + i * 60_000),
      }),
    )
  }

  const repo = new MockGoalsRepo({ goal: goals[0] })
  repo.getGoalsByAccountFn = async () => goals
  repo.listLedgerByGoalFn = async () => []
  const accRepo = scopedAccountRepo(accID, 0)
  const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))

  const out = await svc.buildTracking(accID)
  expect(out.topGoals.length).toBe(5)
  expect(out.updatedAtUtc).not.toBe('')
})

describe('tracking behavior beyond the Go tests', () => {
  it('summary sums dollars, counts completed goals, and remaining is never negative', async () => {
    const accID = crypto.randomUUID()
    const goals = [
      goal({ accountId: accID, name: 'a', status: 'completed', targetAmountCents: 1000, investedTotalCents: 1500 }),
      goal({ accountId: accID, name: 'b', status: 'active', targetAmountCents: 2050, investedTotalCents: 100 }),
    ]
    const repo = new MockGoalsRepo({ goal: goals[0] })
    repo.getGoalsByAccountFn = async () => goals
    repo.listLedgerByGoalFn = async () => []
    const accRepo = scopedAccountRepo(accID, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const out = await svc.buildTracking(accID)
    expect(out.summary).toEqual({
      goalsCount: 2,
      completedCount: 1,
      totalTarget: 30.5,
      totalInvested: 16,
      totalRemaining: 19.5,
    })
  })

  it('progress is invested / target as a percentage, capped at 100; target date and created_at are RFC3339 strings', async () => {
    const accID = crypto.randomUUID()
    const created = new Date('2026-04-01T10:00:00Z')
    const over = goal({ accountId: accID, name: 'over', targetAmountCents: 1000, investedTotalCents: 1500, createdAtUtc: created })
    const part = goal({ accountId: accID, name: 'part', targetAmountCents: 3000, investedTotalCents: 1000, createdAtUtc: created, targetDateUtc: new Date('2026-12-31T00:00:00Z'), minContributionPerWindowCents: 250 })
    const repo = new MockGoalsRepo({ goal: over })
    repo.getGoalsByAccountFn = async () => [over, part]
    repo.listLedgerByGoalFn = async () => []
    const accRepo = scopedAccountRepo(accID, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const out = await svc.buildTracking(accID)
    const byName = new Map(out.topGoals.map((g) => [g.name, g]))
    expect(byName.get('over')?.progressPct).toBe(100)
    expect(byName.get('over')?.remainingAmount).toBe(0)
    expect(byName.get('over')?.targetDateUtc).toBeNull()
    expect(byName.get('over')?.createdAtUtc).toBe('2026-04-01T10:00:00Z')
    expect(byName.get('part')?.progressPct).toBeCloseTo((1000 / 3000) * 100, 10)
    expect(byName.get('part')?.targetDateUtc).toBe('2026-12-31T00:00:00Z')
    expect(byName.get('part')?.minContributionPerWindow).toBe(2.5)
  })

  it('recent activity is every entry newest first, capped at ten', async () => {
    const accID = crypto.randomUUID()
    const g = goal({ accountId: accID, name: 'busy', targetAmountCents: 100000 })
    const entries = Array.from({ length: 12 }, (_, i) =>
      entry({ goalId: g.id, timestampUtc: new Date(Date.UTC(2026, 0, 1 + i)), amountCents: (i + 1) * 100 }),
    )
    const repo = new MockGoalsRepo({ goal: g })
    repo.getGoalsByAccountFn = async () => [g]
    repo.listLedgerByGoalFn = async () => entries
    const accRepo = scopedAccountRepo(accID, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const out = await svc.buildTracking(accID)
    expect(out.recentActivity.length).toBe(10)
    expect(out.recentActivity[0]?.timestampUtc).toBe('2026-01-12T00:00:00Z')
    expect(out.recentActivity[0]?.amount).toBe(12)
    expect(out.recentActivity[0]?.goalName).toBe('busy')
    expect(out.recentActivity[9]?.timestampUtc).toBe('2026-01-03T00:00:00Z')
  })

  it('goals with the same score, date and creation time keep the repo order (stable)', async () => {
    const accID = crypto.randomUUID()
    const created = new Date('2026-04-01T00:00:00Z')
    const first = goal({ accountId: accID, name: 'first', targetAmountCents: 1000, investedTotalCents: 0, createdAtUtc: created })
    const second = goal({ accountId: accID, name: 'second', targetAmountCents: 1000, investedTotalCents: 0, createdAtUtc: created })
    const repo = new MockGoalsRepo({ goal: first })
    repo.getGoalsByAccountFn = async () => [first, second]
    repo.listLedgerByGoalFn = async () => []
    const accRepo = scopedAccountRepo(accID, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const out = await svc.buildTracking(accID)
    expect(out.topGoals.map((g) => g.name)).toEqual(['first', 'second'])
  })

  it('urgencyScore counts whole days to the target (0 when past) and uses 36500 days when undated', () => {
    const now = new Date('2026-04-29T12:00:00Z')
    const undated = goal({ targetAmountCents: 1000, investedTotalCents: 0 })
    expect(urgencyScore(now, undated, 1000)).toBe((36500 - 36500) * 1_000_000 + 1000)
    const soon = goal({ targetAmountCents: 1000, targetDateUtc: new Date('2026-05-01T00:00:00Z') })
    // 1 day 12 hours away: 1 whole day.
    expect(urgencyScore(now, soon, 1000)).toBe((36500 - 1) * 1_000_000 + 1000)
    // A past date counts as 0 days.
    const past = goal({ targetAmountCents: 1000, targetDateUtc: new Date('2026-01-01T00:00:00Z') })
    expect(urgencyScore(now, past, 1000)).toBe(36500 * 1_000_000 + 1000)
  })
})
