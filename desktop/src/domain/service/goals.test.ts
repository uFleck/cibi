// @vitest-environment node
// Ports of internal/service/goals_test.go (5 tests). The Go mocks are fakes implementing the TS repo
// interfaces (testing/fakesGoals.ts); the LedgerService is the real one, over a fake ledger repo (as
// in Go). The Go "used tx" check (updateBalance must run in a transaction) is a TxState check.
// The tests after the Go ones cover the quirks of the service that the Go tests do not reach.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testing/testDb'
import { newTestLedgerSvc, trackingDb, type TxState } from '../testing/fakes'
import { MockGoalsRepo, scopedAccountRepo, zeroGoal } from '../testing/fakesGoals'
import { GoalsService } from './goals'
import type { Goal } from '../repo/goals'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

function goal(over: Partial<Goal>): Goal {
  return { ...zeroGoal(), id: crypto.randomUUID(), accountId: crypto.randomUUID(), status: 'active', ...over }
}

// TestGoals_AddLedgerEntry_ContributionDebitsBalanceAtomically
it('TestGoals_AddLedgerEntry_ContributionDebitsBalanceAtomically: a contribution debits the account balance', async () => {
  const state: TxState = { inTx: false }
  const tdb = trackingDb(db, state)
  const goalId = crypto.randomUUID()
  const accId = crypto.randomUUID()
  const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 10000, investedTotalCents: 0 }) })
  const record: { newBalance?: number } = {}
  const accRepo = scopedAccountRepo(accId, 5000, record, state)
  const svc = new GoalsService(tdb, repo, accRepo, newTestLedgerSvc(tdb, accRepo, accId, 5000))
  await svc.addLedgerEntry({ goalId, amount: 10, type: 'contribution', source: 'manual', timestampUtc: new Date() })
  expect(record.newBalance).toBe(4000)
})

// TestGoals_AddLedgerEntry_WithdrawalCreditsBalance
it('TestGoals_AddLedgerEntry_WithdrawalCreditsBalance: a withdrawal credits the account balance', async () => {
  const state: TxState = { inTx: false }
  const tdb = trackingDb(db, state)
  const goalId = crypto.randomUUID()
  const accId = crypto.randomUUID()
  const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 10000, investedTotalCents: 2000 }) })
  const record: { newBalance?: number } = {}
  const accRepo = scopedAccountRepo(accId, 1000, record, state)
  const svc = new GoalsService(tdb, repo, accRepo, newTestLedgerSvc(tdb, accRepo, accId, 1000))
  await svc.addLedgerEntry({ goalId, amount: 5, type: 'withdrawal', source: 'manual', timestampUtc: new Date() })
  expect(record.newBalance).toBe(1500)
})

// TestGoals_AddLedgerEntry_InsufficientFunds
it('TestGoals_AddLedgerEntry_InsufficientFunds: a contribution above the balance fails with insufficient funds', async () => {
  const goalId = crypto.randomUUID()
  const accId = crypto.randomUUID()
  const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 10000, investedTotalCents: 0 }) })
  const accRepo = scopedAccountRepo(accId, 300)
  const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
  await expect(
    svc.addLedgerEntry({ goalId, amount: 10, type: 'contribution', source: 'manual', timestampUtc: new Date() }),
  ).rejects.toThrow('insufficient')
})

// TestGoals_AddLedgerEntry_AutoCompletesOnTarget
it('TestGoals_AddLedgerEntry_AutoCompletesOnTarget: reaching the target completes the goal', async () => {
  const state: TxState = { inTx: false }
  const tdb = trackingDb(db, state)
  const goalId = crypto.randomUUID()
  const accId = crypto.randomUUID()
  const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 1000, investedTotalCents: 900 }) })
  const accRepo = scopedAccountRepo(accId, 5000, {}, state)
  const svc = new GoalsService(tdb, repo, accRepo, newTestLedgerSvc(tdb, accRepo, accId, 5000))
  await svc.addLedgerEntry({ goalId, amount: 1, type: 'contribution', source: 'manual', timestampUtc: new Date() })
  expect(repo.goal.status).toBe('completed')
})

// TestGoals_UpdateTarget_AuditsAndRecomputesStatus
it('TestGoals_UpdateTarget_AuditsAndRecomputesStatus: a lower target that the invested total reaches completes the goal', async () => {
  const goalId = crypto.randomUUID()
  const accId = crypto.randomUUID()
  const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 1000, investedTotalCents: 900 }) })
  const accRepo = scopedAccountRepo(accId, 5000)
  const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
  await svc.updateGoal(goalId, { targetAmount: 8 })
  expect(repo.goal.status).toBe('completed')
})

describe('goals service behavior beyond the Go tests', () => {
  it('createGoal rounds to cents, reads the currency from the account and returns the new goal', async () => {
    const accId = crypto.randomUUID()
    const repo = new MockGoalsRepo()
    const accRepo = scopedAccountRepo(accId, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const created = await svc.createGoal({
      accountId: accId,
      name: 'Trip',
      targetAmount: 123.45,
      minContributionPerWindow: 10.5,
      startDateUtc: new Date('2026-04-29T00:00:00Z'),
    })
    expect(created.status).toBe('active')
    expect(created.targetAmountCents).toBe(12345)
    expect(created.minContributionPerWindowCents).toBe(1050)
    expect(created.currency).toBe('BRL')
    expect(created.targetDateUtc).toBeNull()
    expect(created.notes).toBeNull()
    expect(repo.goal.id).toBe(created.id)
  })

  it('createGoal with a target that rounds to zero is a validation error', async () => {
    const accId = crypto.randomUUID()
    const accRepo = scopedAccountRepo(accId, 0)
    const svc = new GoalsService(db, new MockGoalsRepo(), accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    await expect(
      svc.createGoal({ accountId: accId, name: 'x', targetAmount: 0.001, minContributionPerWindow: 0, startDateUtc: new Date() }),
    ).rejects.toThrow('validation: target amount must be > 0')
  })

  it('createGoal with an unknown account fails before the target check, with the wrapped account error', async () => {
    const accRepo = scopedAccountRepo(crypto.randomUUID(), 0)
    const svc = new GoalsService(db, new MockGoalsRepo(), accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const other = crypto.randomUUID()
    await expect(
      svc.createGoal({ accountId: other, name: 'x', targetAmount: 0, minContributionPerWindow: 0, startDateUtc: new Date() }),
    ).rejects.toThrow('goals.CreateGoal: get account: ')
  })

  it('updateGoal with a negative minimum is a validation error and writes nothing', async () => {
    const goalId = crypto.randomUUID()
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, name: 'old' }) })
    const svc = new GoalsService(db, repo, scopedAccountRepo(crypto.randomUUID(), 0), newTestLedgerSvc(db, scopedAccountRepo(crypto.randomUUID(), 0), null, 0))
    await expect(svc.updateGoal(goalId, { name: 'new', minContributionPerWindow: -1 })).rejects.toThrow(
      'validation: min contribution per window must be >= 0',
    )
    expect(repo.goal.name).toBe('old')
  })

  it('updateGoal with a non-positive target is a validation error', async () => {
    const goalId = crypto.randomUUID()
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, targetAmountCents: 1000 }) })
    const svc = new GoalsService(db, repo, scopedAccountRepo(crypto.randomUUID(), 0), newTestLedgerSvc(db, scopedAccountRepo(crypto.randomUUID(), 0), null, 0))
    await expect(svc.updateGoal(goalId, { targetAmount: 0 })).rejects.toThrow('validation: target amount must be > 0')
  })

  it('a target change on an archived goal sets it to active (the status is recomputed for any status)', async () => {
    const goalId = crypto.randomUUID()
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, status: 'archived', targetAmountCents: 1000, investedTotalCents: 100 }) })
    const svc = new GoalsService(db, repo, scopedAccountRepo(crypto.randomUUID(), 0), newTestLedgerSvc(db, scopedAccountRepo(crypto.randomUUID(), 0), null, 0))
    await svc.updateGoal(goalId, { targetAmount: 50 })
    expect(repo.goal.status).toBe('active')
    expect(repo.goal.targetAmountCents).toBe(5000)
  })

  it('a contribution rejects a non-positive amount before the ledger is touched', async () => {
    const goalId = crypto.randomUUID()
    const accId = crypto.randomUUID()
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId }) })
    const accRepo = scopedAccountRepo(accId, 5000)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    await expect(
      svc.addLedgerEntry({ goalId, amount: 0, type: 'contribution', source: 'manual', timestampUtc: new Date() }),
    ).rejects.toThrow('validation: amount must be > 0')
    expect(repo.entry.id).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('an unknown type is a validation error (after the funds check, which only a contribution makes)', async () => {
    const goalId = crypto.randomUUID()
    const accId = crypto.randomUUID()
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId }) })
    const accRepo = scopedAccountRepo(accId, 5000)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    await expect(
      svc.addLedgerEntry({ goalId, amount: 1, type: 'bogus', source: 'manual', timestampUtc: new Date() }),
    ).rejects.toThrow('validation: invalid type')
  })

  it('an empty source is stored as manual, and a zero timestamp is replaced by now', async () => {
    const goalId = crypto.randomUUID()
    const accId = crypto.randomUUID()
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 100000 }) })
    const accRepo = scopedAccountRepo(accId, 5000)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const before = Date.now()
    const entry = await svc.addLedgerEntry({
      goalId,
      amount: 1,
      type: 'adjustment',
      source: '',
      timestampUtc: new Date('0001-01-01T00:00:00Z'),
    })
    expect(entry.source).toBe('manual')
    expect(entry.timestampUtc.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('a withdrawal can make the invested total negative (no check)', async () => {
    const goalId = crypto.randomUUID()
    const accId = crypto.randomUUID()
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 1000, investedTotalCents: 100 }) })
    const accRepo = scopedAccountRepo(accId, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    await svc.addLedgerEntry({ goalId, amount: 5, type: 'withdrawal', source: 'manual', timestampUtc: new Date() })
    expect(repo.goal.investedTotalCents).toBe(-400)
  })

  it('a completed goal drops back to active when the invested total falls below the target', async () => {
    const goalId = crypto.randomUUID()
    const accId = crypto.randomUUID()
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 1000, investedTotalCents: 1000, status: 'completed' }) })
    const accRepo = scopedAccountRepo(accId, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    await svc.addLedgerEntry({ goalId, amount: 1, type: 'withdrawal', source: 'manual', timestampUtc: new Date() })
    expect(repo.goal.status).toBe('active')
  })

  it('reversing a withdrawal posts a positive adjustment that gives the amount back to the invested total', async () => {
    const goalId = crypto.randomUUID()
    const accId = crypto.randomUUID()
    const original = {
      id: crypto.randomUUID(),
      goalId,
      amountCents: 1000,
      type: 'withdrawal',
      source: 'manual',
      note: null,
      reversesEntryId: null,
      timestampUtc: new Date('2026-04-01T00:00:00Z'),
      createdAtUtc: new Date('2026-04-01T00:00:00Z'),
    }
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 100000, investedTotalCents: 4000 }), entry: original })
    const accRepo = scopedAccountRepo(accId, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const reversal = await svc.reverseLedgerEntry(goalId, original.id)
    expect(reversal.type).toBe('adjustment')
    expect(reversal.amountCents).toBe(1000)
    expect(repo.goal.investedTotalCents).toBe(5000)
  })

  it('reversing an entry posts an adjustment of the negated amount that subtracts from the invested total', async () => {
    const goalId = crypto.randomUUID()
    const accId = crypto.randomUUID()
    const original = {
      id: crypto.randomUUID(),
      goalId,
      amountCents: 2500,
      type: 'contribution',
      source: 'manual',
      note: null,
      reversesEntryId: null,
      timestampUtc: new Date('2026-04-01T00:00:00Z'),
      createdAtUtc: new Date('2026-04-01T00:00:00Z'),
    }
    const repo = new MockGoalsRepo({ goal: goal({ id: goalId, accountId: accId, targetAmountCents: 100000, investedTotalCents: 2500 }), entry: original })
    const accRepo = scopedAccountRepo(accId, 0)
    const svc = new GoalsService(db, repo, accRepo, newTestLedgerSvc(db, accRepo, null, 0))
    const reversal = await svc.reverseLedgerEntry(goalId, original.id, 'oops')
    expect(reversal.type).toBe('adjustment')
    expect(reversal.source).toBe('system')
    expect(reversal.amountCents).toBe(-2500)
    expect(reversal.note).toBe('oops')
    expect(reversal.reversesEntryId).toBeNull()
    expect(repo.goal.investedTotalCents).toBe(0)
  })

  it('an unknown entry id to reverse is the ErrNoRows message', async () => {
    const repo = new MockGoalsRepo()
    repo.getLedgerEntryById = async () => {
      throw new Error('sql: no rows in result set')
    }
    const svc = new GoalsService(db, repo, scopedAccountRepo(crypto.randomUUID(), 0), newTestLedgerSvc(db, scopedAccountRepo(crypto.randomUUID(), 0), null, 0))
    await expect(svc.reverseLedgerEntry(crypto.randomUUID(), crypto.randomUUID())).rejects.toThrow(
      'sql: no rows in result set',
    )
  })
})
