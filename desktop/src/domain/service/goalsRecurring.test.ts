// @vitest-environment node
// Ports of internal/service/goals_recurring_test.go (2 tests). The Go recurringRepo embeds the goals
// mock and overrides the recurring methods; here RecurringRepo subclasses MockGoalsRepo the same way.
// The tests after the Go ones cover the recurring quirks (one period per confirm, unknown frequency,
// the last recurring entry, the boundary at now).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addMonths } from '../dates'
import type { Goal, GoalLedgerEntry, GoalRecurringContribution, UpdateGoalRecurringContribution } from '../repo/goals'
import { createTestDb } from '../testing/testDb'
import { newTestLedgerSvc } from '../testing/fakes'
import { MockGoalsRepo, NIL_UUID, scopedAccountRepo, zeroGoal, zeroRecurring } from '../testing/fakesGoals'
import { GoalsService } from './goals'
import { advanceFrequency } from './goalsRecurring'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

/** Go recurringRepo: the recurring lookups return the test's rows, and updateRecurring records its argument. */
class RecurringRepo extends MockGoalsRepo {
  recurringByAccount: GoalRecurringContribution[] = []
  recurringByID: GoalRecurringContribution = zeroRecurring()
  updateRecurringArgs: UpdateGoalRecurringContribution = {}

  override async listRecurringByAccount(): Promise<GoalRecurringContribution[]> {
    return this.recurringByAccount
  }

  override async getRecurringById(): Promise<GoalRecurringContribution> {
    return this.recurringByID
  }

  override async insertRecurring(): Promise<void> {
    // The Go recurringRepo does nothing here.
  }

  override async updateRecurring(_id: string, upd: UpdateGoalRecurringContribution): Promise<void> {
    this.updateRecurringArgs = upd
  }
}

function goalRow(goalId: string, accountId: string, over: Partial<Goal> = {}): Goal {
  return {
    ...zeroGoal(),
    id: goalId,
    accountId,
    name: 'Trip',
    targetAmountCents: 100000,
    investedTotalCents: 1000,
    status: 'active',
    ...over,
  }
}

function recurringRow(over: Partial<GoalRecurringContribution>): GoalRecurringContribution {
  return { ...zeroRecurring(), id: crypto.randomUUID(), goalId: NIL_UUID, ...over }
}

function ledgerRow(over: Partial<GoalLedgerEntry>): GoalLedgerEntry {
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

// TestGoalsRecurring_ListDue_OverdueAndNoAutoPost
it('TestGoalsRecurring_ListDue_OverdueAndNoAutoPost: lists the due row as overdue and posts nothing', async () => {
  const accountId = crypto.randomUUID()
  const goalId = crypto.randomUUID()
  const now = new Date('2026-04-29T12:00:00Z')
  const repo = new RecurringRepo({
    goal: goalRow(goalId, accountId),
  })
  repo.recurringByAccount = [
    recurringRow({ goalId, amountCents: 1000, frequency: 'monthly', anchorDateUtc: addMonths(now, -2), nextDueUtc: new Date(now.getTime() - 3_600_000), active: true }),
    recurringRow({ goalId, amountCents: 1000, frequency: 'monthly', anchorDateUtc: now, nextDueUtc: new Date(now.getTime() + 3_600_000), active: true }),
  ]
  const accRepo = scopedAccountRepo(accountId, 100000)
  const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))

  const out = await svc.listRecurringDue(accountId, now)
  expect(out.length).toBe(1)
  expect(out[0]?.isOverdue).toBe(true)
  expect(repo.entry.id).toBe(NIL_UUID)
})

// TestGoalsRecurring_ConfirmDue_PostsRecurringAndAdvancesSinglePeriod
it('TestGoalsRecurring_ConfirmDue_PostsRecurringAndAdvancesSinglePeriod: posts a recurring contribution and moves next due one period', async () => {
  const accountId = crypto.randomUUID()
  const goalId = crypto.randomUUID()
  const itemId = crypto.randomUUID()
  const due = new Date('2026-04-01T00:00:00Z')
  const repo = new RecurringRepo({ goal: goalRow(goalId, accountId) })
  repo.recurringByID = recurringRow({ id: itemId, goalId, amountCents: 2000, frequency: 'monthly', nextDueUtc: due, active: true })
  const accRepo = scopedAccountRepo(accountId, 100000)
  const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, accountId, 100000))

  const confirmAt = new Date('2026-06-20T00:00:00Z')
  await svc.confirmRecurringDue(itemId, confirmAt)
  expect(repo.entry.source).toBe('recurring')
  const wantNext = addMonths(due, 1)
  expect(repo.updateRecurringArgs.nextDueUtc).toBeDefined()
  expect(repo.updateRecurringArgs.nextDueUtc?.getTime()).toBe(wantNext.getTime())
})

describe('recurring behavior beyond the Go tests', () => {
  it.each([
    ['weekly', '2026-01-31T00:00:00Z', '2026-02-07T00:00:00.000Z'],
    ['bi-weekly', '2026-01-31T00:00:00Z', '2026-02-14T00:00:00.000Z'],
    ['monthly', '2026-01-31T00:00:00Z', '2026-03-03T00:00:00.000Z'],
    ['yearly', '2028-02-29T00:00:00Z', '2029-03-01T00:00:00.000Z'],
    ['fortnightly', '2026-01-31T00:00:00Z', '2026-01-31T00:00:00.000Z'],
  ])('advanceFrequency(%s) from %s is %s (unknown frequencies do not advance)', (frequency, base, want) => {
    expect(advanceFrequency(new Date(base), frequency).toISOString()).toBe(want)
  })

  it('confirm posts one period only: a row two periods overdue is still due after one confirm', async () => {
    const accountId = crypto.randomUUID()
    const goalId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const due = new Date('2026-02-01T00:00:00Z')
    const repo = new RecurringRepo({ goal: goalRow(goalId, accountId) })
    repo.recurringByID = recurringRow({ id: itemId, goalId, amountCents: 1000, frequency: 'monthly', nextDueUtc: due, active: true })
    const accRepo = scopedAccountRepo(accountId, 100000)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, accountId, 100000))
    await svc.confirmRecurringDue(itemId, new Date('2026-04-15T00:00:00Z'))
    expect(repo.updateRecurringArgs.nextDueUtc?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('an unknown frequency leaves next due where it was', async () => {
    const accountId = crypto.randomUUID()
    const goalId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const due = new Date('2026-02-01T00:00:00Z')
    const repo = new RecurringRepo({ goal: goalRow(goalId, accountId) })
    repo.recurringByID = recurringRow({ id: itemId, goalId, amountCents: 1000, frequency: 'daily', nextDueUtc: due, active: true })
    const accRepo = scopedAccountRepo(accountId, 100000)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, accountId, 100000))
    await svc.confirmRecurringDue(itemId, new Date('2026-04-15T00:00:00Z'))
    expect(repo.updateRecurringArgs.nextDueUtc?.getTime()).toBe(due.getTime())
  })

  it('confirm rejects an inactive row and a row that is not due yet', async () => {
    const accountId = crypto.randomUUID()
    const goalId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const repo = new RecurringRepo({ goal: goalRow(goalId, accountId) })
    const accRepo = scopedAccountRepo(accountId, 100000)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, accountId, 100000))

    repo.recurringByID = recurringRow({ id: itemId, goalId, amountCents: 1000, frequency: 'monthly', nextDueUtc: new Date('2026-02-01T00:00:00Z'), active: false })
    await expect(svc.confirmRecurringDue(itemId, new Date('2026-04-15T00:00:00Z'))).rejects.toThrow(
      'recurring contribution is inactive',
    )

    repo.recurringByID = recurringRow({ id: itemId, goalId, amountCents: 1000, frequency: 'monthly', nextDueUtc: new Date('2026-05-01T00:00:00Z'), active: true })
    await expect(svc.confirmRecurringDue(itemId, new Date('2026-04-15T00:00:00Z'))).rejects.toThrow(
      'recurring contribution is not due yet',
    )
  })

  it('list reports the last recurring entry (not the last entry of any source) and a row due exactly at now is not overdue', async () => {
    const accountId = crypto.randomUUID()
    const goalId = crypto.randomUUID()
    const now = new Date('2026-04-29T12:00:00Z')
    const older = ledgerRow({ goalId, source: 'recurring', timestampUtc: new Date('2026-03-01T00:00:00Z') })
    const newerRecurring = ledgerRow({ goalId, source: 'recurring', timestampUtc: new Date('2026-04-01T00:00:00Z') })
    const newestManual = ledgerRow({ goalId, source: 'manual', timestampUtc: new Date('2026-04-10T00:00:00Z') })
    const repo = new RecurringRepo({ goal: goalRow(goalId, accountId, { name: 'Car' }) })
    repo.listLedgerByGoalFn = async () => [older, newerRecurring, newestManual]
    repo.recurringByAccount = [recurringRow({ goalId, amountCents: 500, frequency: 'weekly', anchorDateUtc: new Date('2026-01-05T06:00:00Z'), nextDueUtc: now, active: true })]
    const accRepo = scopedAccountRepo(accountId, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))

    const out = await svc.listRecurringDue(accountId, now)
    expect(out.length).toBe(1)
    expect(out[0]?.goalName).toBe('Car')
    expect(out[0]?.amount).toBe(5)
    expect(out[0]?.isOverdue).toBe(false)
    expect(out[0]?.lastEntryId).toBe(newerRecurring.id)
    expect(out[0]?.lastPostedAtUtc).toBe('2026-04-01T00:00:00Z')
    expect(out[0]?.anchorDateUtc).toBe('2026-01-05T06:00:00Z')
  })

  it('list gives null last-entry fields when no recurring entry exists', async () => {
    const accountId = crypto.randomUUID()
    const goalId = crypto.randomUUID()
    const now = new Date('2026-04-29T12:00:00Z')
    const repo = new RecurringRepo({ goal: goalRow(goalId, accountId) })
    repo.listLedgerByGoalFn = async () => [ledgerRow({ goalId, source: 'manual' })]
    repo.recurringByAccount = [recurringRow({ goalId, amountCents: 500, frequency: 'weekly', nextDueUtc: new Date('2026-04-01T00:00:00Z'), active: true })]
    const accRepo = scopedAccountRepo(accountId, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const out = await svc.listRecurringDue(accountId, now)
    expect(out[0]?.lastEntryId).toBeNull()
    expect(out[0]?.lastPostedAtUtc).toBeNull()
    expect(out[0]?.isOverdue).toBe(true)
  })

  it('list returns an empty array when nothing is due', async () => {
    const accountId = crypto.randomUUID()
    const repo = new RecurringRepo({ goal: zeroGoal() })
    const accRepo = scopedAccountRepo(accountId, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    expect(await svc.listRecurringDue(accountId, new Date('2026-04-29T12:00:00Z'))).toEqual([])
  })
})
