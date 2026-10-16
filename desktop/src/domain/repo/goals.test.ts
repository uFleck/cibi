// @vitest-environment node
// Ports of internal/repo/sqlite/goals_test.go (3 tests). The Go tests create a schema of their own
// (goalsSchema); here they run on createTestDb() with the real schema. The real schema has foreign
// keys from Goal.account_id to Account and from GoalLedgerEntry.goal_id to Goal, so the account and
// the goal the Go tests use are inserted first. The tests after the Go ones cover the Go quirks of
// the repo that the Go tests do not reach.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ErrNoRows, isErr } from '../errors'
import { createTestDb } from '../testing/testDb'
import { SqliteGoalsRepo, type Goal, type GoalLedgerEntry } from './goals'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

async function insertAccount(id: string): Promise<void> {
  await db.query(`INSERT INTO Account (id, name, current_balance, currency) VALUES (?, 'x', 0, 'BRL')`, [
    id,
  ])
}

async function insertGoal(id: string, accountId: string): Promise<void> {
  await insertAccount(accountId)
  const now = '2026-04-29T00:00:00Z'
  await db.query(
    `INSERT INTO Goal (id, account_id, name, status, target_amount_cents, invested_total_cents, start_date_utc, currency, created_at_utc, updated_at_utc)
	VALUES (?, ?, 'seed', 'active', 1000, 0, ?, 'BRL', ?, ?)`,
    [id, accountId, now, now, now],
  )
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: crypto.randomUUID(),
    accountId: crypto.randomUUID(),
    name: 'New Car',
    status: 'active',
    targetAmountCents: 500000,
    investedTotalCents: 0,
    minContributionPerWindowCents: 0,
    startDateUtc: new Date(),
    targetDateUtc: null,
    notes: null,
    currency: 'BRL',
    createdAtUtc: new Date(),
    updatedAtUtc: new Date(),
    ...over,
  }
}

function ledgerEntry(goalId: string, over: Partial<GoalLedgerEntry> = {}): GoalLedgerEntry {
  return {
    id: crypto.randomUUID(),
    goalId,
    amountCents: 1000,
    type: 'contribution',
    source: 'manual',
    note: null,
    reversesEntryId: null,
    timestampUtc: new Date(),
    createdAtUtc: new Date(),
    ...over,
  }
}

// TestGoals_InsertGoalPersistsRequiredFields
it('insert goal persists the required fields', async () => {
  const repo = new SqliteGoalsRepo(db)
  const g = goal()
  await insertAccount(g.accountId)
  await repo.insertGoal(g)
  const got = await repo.getGoalById(g.id)
  expect(got.name).toBe('New Car')
  expect(got.targetAmountCents).toBe(500000)
  expect(got.status).toBe('active')
})

// TestGoals_InsertLedgerEntryEnforcesEnums
it('insert ledger entry enforces the type and source enums', async () => {
  const repo = new SqliteGoalsRepo(db)
  const goalId = crypto.randomUUID()
  await insertGoal(goalId, crypto.randomUUID())
  const entry = ledgerEntry(goalId)
  await repo.insertLedgerEntry(entry)

  await expect(repo.insertLedgerEntry({ ...entry, id: crypto.randomUUID(), type: 'invalid' })).rejects.toThrow(
    'goals.InsertLedgerEntry: invalid type',
  )
  await expect(repo.insertLedgerEntry({ ...entry, id: crypto.randomUUID(), source: 'robot' })).rejects.toThrow(
    'goals.InsertLedgerEntry: invalid source',
  )
})

// TestGoals_LedgerAppendOnlyByContract: the Go test is a compile-time check that GoalsRepo has no
// delete method for the ledger. Here the check is on the repo class: no method deletes a ledger entry.
it('the goals repo has no method that deletes a ledger entry (append-only ledger)', () => {
  const methods = Object.getOwnPropertyNames(SqliteGoalsRepo.prototype)
  expect(methods.filter((name) => /delete|remove/i.test(name))).toEqual([])
})

describe('goals repo behavior beyond the Go tests', () => {
  it('insert and get round-trip the optional fields; an empty target date reads as null', async () => {
    const repo = new SqliteGoalsRepo(db)
    const withTarget = goal({ targetDateUtc: new Date('2026-12-31T00:00:00Z'), notes: 'trip' })
    await insertAccount(withTarget.accountId)
    await repo.insertGoal(withTarget)
    const got = await repo.getGoalById(withTarget.id)
    expect(got.targetDateUtc?.toISOString()).toBe('2026-12-31T00:00:00.000Z')
    expect(got.notes).toBe('trip')
    expect(got.startDateUtc.getTime()).toBe(withTarget.startDateUtc.getTime() - (withTarget.startDateUtc.getTime() % 1000))

    await db.query(`UPDATE Goal SET target_date_utc = '' WHERE id = ?`, [withTarget.id])
    expect((await repo.getGoalById(withTarget.id)).targetDateUtc).toBeNull()
  })

  it('an unknown goal id rejects with ErrNoRows, unwrapped', async () => {
    const repo = new SqliteGoalsRepo(db)
    const err = await repo.getGoalById(crypto.randomUUID()).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(isErr(err, ErrNoRows)).toBe(true)
    expect(err).toBe(ErrNoRows)
  })

  it('a goal whose created_at_utc does not parse keeps the zero time (Go ignores the error)', async () => {
    const repo = new SqliteGoalsRepo(db)
    const goalId = crypto.randomUUID()
    await insertGoal(goalId, crypto.randomUUID())
    await db.query(`UPDATE Goal SET created_at_utc = '2026-04-29 10:00:00' WHERE id = ?`, [goalId])
    const got = await repo.getGoalById(goalId)
    expect(got.createdAtUtc.toISOString()).toBe('0001-01-01T00:00:00.000Z')
    expect(got.updatedAtUtc.toISOString()).toBe('2026-04-29T00:00:00.000Z')
  })

  it('a goal whose start_date_utc does not parse is an error (not ignored)', async () => {
    const repo = new SqliteGoalsRepo(db)
    const goalId = crypto.randomUUID()
    await insertGoal(goalId, crypto.randomUUID())
    await db.query(`UPDATE Goal SET start_date_utc = '2026-04-29 10:00:00' WHERE id = ?`, [goalId])
    await expect(repo.getGoalById(goalId)).rejects.toThrow('parsing time')
  })

  it('updateGoal writes only the fields that are set', async () => {
    const repo = new SqliteGoalsRepo(db)
    const goalId = crypto.randomUUID()
    await insertGoal(goalId, crypto.randomUUID())
    await repo.updateGoal(goalId, { name: 'Renamed', investedTotalCents: 250, targetDateUtc: new Date('2027-01-02T03:04:05Z') })
    const got = await repo.getGoalById(goalId)
    expect(got.name).toBe('Renamed')
    expect(got.investedTotalCents).toBe(250)
    expect(got.targetDateUtc?.toISOString()).toBe('2027-01-02T03:04:05.000Z')
    expect(got.status).toBe('active')
    expect(got.targetAmountCents).toBe(1000)
  })

  it('listLedgerByGoal orders by timestamp ascending and reads reverses_entry_id and note', async () => {
    const repo = new SqliteGoalsRepo(db)
    const goalId = crypto.randomUUID()
    await insertGoal(goalId, crypto.randomUUID())
    const first = ledgerEntry(goalId, { timestampUtc: new Date('2026-04-02T00:00:00Z'), note: 'second' })
    const second = ledgerEntry(goalId, { timestampUtc: new Date('2026-04-01T00:00:00Z') })
    const reversal = ledgerEntry(goalId, {
      type: 'adjustment',
      source: 'system',
      timestampUtc: new Date('2026-04-03T00:00:00Z'),
      reversesEntryId: second.id,
    })
    await repo.insertLedgerEntry(first)
    await repo.insertLedgerEntry(second)
    await repo.insertLedgerEntry(reversal)
    const list = await repo.listLedgerByGoal(goalId)
    expect(list.map((e) => e.id)).toEqual([second.id, first.id, reversal.id])
    expect(list[1]?.note).toBe('second')
    expect(list[2]?.reversesEntryId).toBe(second.id)
    expect(list[0]?.reversesEntryId).toBeNull()
  })

  it('recurring rows: only active rows of the account are listed, ordered by next due', async () => {
    const repo = new SqliteGoalsRepo(db)
    const accountId = crypto.randomUUID()
    const goalId = crypto.randomUUID()
    await insertGoal(goalId, accountId)
    const base = {
      goalId,
      amountCents: 1000,
      frequency: 'monthly',
      anchorDateUtc: new Date('2026-01-01T00:00:00Z'),
      createdAtUtc: new Date('2026-01-01T00:00:00Z'),
      updatedAtUtc: new Date('2026-01-01T00:00:00Z'),
    }
    const later = { ...base, id: crypto.randomUUID(), nextDueUtc: new Date('2026-06-10T00:00:00Z'), active: true }
    const sooner = { ...base, id: crypto.randomUUID(), nextDueUtc: new Date('2026-05-10T00:00:00Z'), active: true }
    const inactive = { ...base, id: crypto.randomUUID(), nextDueUtc: new Date('2026-04-10T00:00:00Z'), active: false }
    await repo.insertRecurring(later)
    await repo.insertRecurring(sooner)
    await repo.insertRecurring(inactive)
    const listed = await repo.listRecurringByAccount(accountId)
    expect(listed.map((r) => r.id)).toEqual([sooner.id, later.id])
    expect(listed[0]?.active).toBe(true)

    await repo.updateRecurring(sooner.id, { active: false })
    expect((await repo.getRecurringById(sooner.id)).active).toBe(false)
    expect((await repo.listRecurringByAccount(accountId)).map((r) => r.id)).toEqual([later.id])
  })
})
