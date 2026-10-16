// @vitest-environment node
// accounts.deleteById removes an account and every row that belongs to it. Setup uses raw SQL inserts on
// createTestDb() (real schema, foreign keys on), since building each row through its repo is heavy.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createTestDb } from '../testing/testDb'
import { SqliteAccountsRepo } from './accounts'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

const ts = '2026-01-05T00:00:00Z'

// Every table that holds rows for an account, counted by the account's id.
const ownedCountSql: Record<string, string> = {
  Account: `SELECT COUNT(*) AS n FROM Account WHERE id = ?`,
  ledger: `SELECT COUNT(*) AS n FROM ledger WHERE account_id = ?`,
  Transaction: `SELECT COUNT(*) AS n FROM "Transaction" WHERE account_id = ?`,
  PaySchedule: `SELECT COUNT(*) AS n FROM PaySchedule WHERE account_id = ?`,
  Goal: `SELECT COUNT(*) AS n FROM Goal WHERE account_id = ?`,
  GoalLedgerEntry: `SELECT COUNT(*) AS n FROM GoalLedgerEntry WHERE goal_id IN (SELECT id FROM Goal WHERE account_id = ?)`,
  GoalRecurringContribution: `SELECT COUNT(*) AS n FROM GoalRecurringContribution WHERE goal_id IN (SELECT id FROM Goal WHERE account_id = ?)`,
  GoalTargetAudit: `SELECT COUNT(*) AS n FROM GoalTargetAudit WHERE goal_id IN (SELECT id FROM Goal WHERE account_id = ?)`,
  GroupEvent: `SELECT COUNT(*) AS n FROM GroupEvent WHERE account_id = ?`,
  GroupEventParticipant: `SELECT COUNT(*) AS n FROM GroupEventParticipant WHERE event_id IN (SELECT id FROM GroupEvent WHERE account_id = ?)`,
  PeerDebt: `SELECT COUNT(*) AS n FROM PeerDebt WHERE account_id = ?`,
}

async function ownedCounts(accountId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const [table, sql] of Object.entries(ownedCountSql)) {
    const rows = await db.query<{ n: number }>(sql, [accountId])
    counts[table] = Number(rows[0]?.n)
  }
  return counts
}

async function friendCount(): Promise<number> {
  const rows = await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM Friend`, [])
  return Number(rows[0]?.n)
}

// Inserts one account with a row in every owned table. The goal entry reverses the first entry so the
// GoalLedgerEntry self-reference is exercised too.
async function seedAccount(accountId: string): Promise<void> {
  const friendId = crypto.randomUUID()
  const transactionId = crypto.randomUUID()
  const scheduleId = crypto.randomUUID()
  const goalId = crypto.randomUUID()
  const entryId = crypto.randomUUID()
  const reversalId = crypto.randomUUID()
  const eventId = crypto.randomUUID()

  await db.query(`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, 'x', 0, 'BRL', 0)`, [
    accountId,
  ])
  await db.query(`INSERT INTO Friend (id, name, public_token) VALUES (?, 'friend', ?)`, [friendId, `tok-${friendId}`])
  await db.query(
    `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp) VALUES (?, ?, -1000, 'rent', ?)`,
    [transactionId, accountId, ts],
  )
  await db.query(
    `INSERT INTO PaySchedule (id, account_id, frequency, anchor_date, label, amount) VALUES (?, ?, 'monthly', '2026-01-05', 'salary', 5000)`,
    [scheduleId, accountId],
  )
  await db.query(
    `INSERT INTO ledger (id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at)
		VALUES (?, ?, ?, ?, 'payment', -1000, 'rent', ?)`,
    [crypto.randomUUID(), accountId, transactionId, scheduleId, ts],
  )
  await db.query(
    `INSERT INTO Goal (id, account_id, name, status, target_amount_cents, start_date_utc, currency, created_at_utc, updated_at_utc)
		VALUES (?, ?, 'trip', 'active', 100000, ?, 'BRL', ?, ?)`,
    [goalId, accountId, ts, ts, ts],
  )
  await db.query(
    `INSERT INTO GoalLedgerEntry (id, goal_id, amount_cents, type, source, timestamp_utc, created_at_utc, reverses_entry_id)
		VALUES (?, ?, 1000, 'contribution', 'manual', ?, ?, NULL), (?, ?, -1000, 'adjustment', 'manual', ?, ?, ?)`,
    [entryId, goalId, ts, ts, reversalId, goalId, ts, ts, entryId],
  )
  await db.query(
    `INSERT INTO GoalRecurringContribution (id, goal_id, amount_cents, frequency, anchor_date_utc, next_due_utc, active, created_at_utc, updated_at_utc)
		VALUES (?, ?, 500, 'monthly', ?, ?, 1, ?, ?)`,
    [crypto.randomUUID(), goalId, ts, ts, ts, ts],
  )
  await db.query(
    `INSERT INTO GoalTargetAudit (id, goal_id, previous_target_amount_cents, new_target_amount_cents, changed_at_utc)
		VALUES (?, ?, 90000, 100000, ?)`,
    [crypto.randomUUID(), goalId, ts],
  )
  await db.query(
    `INSERT INTO GroupEvent (id, title, date, total_amount, public_token, account_id) VALUES (?, 'pizza', ?, 1000, ?, ?)`,
    [eventId, ts, crypto.randomUUID(), accountId],
  )
  await db.query(`INSERT INTO GroupEventParticipant (event_id, friend_id, share_amount, is_confirmed) VALUES (?, ?, 1000, 0)`, [
    eventId,
    friendId,
  ])
  await db.query(
    `INSERT INTO PeerDebt (id, friend_id, amount, description, date, account_id) VALUES (?, ?, 500, 'lunch', ?, ?)`,
    [crypto.randomUUID(), friendId, ts, accountId],
  )
}

it('deleteById removes the account and every row that belongs to it, and leaves other accounts alone', async () => {
  const repo = new SqliteAccountsRepo(db)
  const accountA = crypto.randomUUID()
  const accountB = crypto.randomUUID()
  await seedAccount(accountA)
  await seedAccount(accountB)

  const beforeA = await ownedCounts(accountA)
  for (const [table, n] of Object.entries(beforeA)) {
    expect(n, table).toBeGreaterThan(0)
  }
  const beforeB = await ownedCounts(accountB)
  const friendsBefore = await friendCount()

  await repo.deleteById(accountA)

  const zeros = Object.fromEntries(Object.keys(beforeA).map((table) => [table, 0]))
  expect(await ownedCounts(accountA)).toEqual(zeros)
  expect(await ownedCounts(accountB)).toEqual(beforeB)
  expect(await friendCount()).toBe(friendsBefore)
})

it('deleteById rejects an unknown id with ErrNoRows and changes nothing', async () => {
  const repo = new SqliteAccountsRepo(db)
  const accountB = crypto.randomUUID()
  await seedAccount(accountB)
  const before = await ownedCounts(accountB)

  await expect(repo.deleteById(crypto.randomUUID())).rejects.toThrow('accounts.DeleteByID: sql: no rows in result set')
  expect(await ownedCounts(accountB)).toEqual(before)
})
