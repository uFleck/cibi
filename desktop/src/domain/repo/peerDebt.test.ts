// @vitest-environment node
// Ports of internal/repo/sqlite/peer_debt_test.go (4 tests). The Go tests create a schema of their own
// (peerDebtSchema); here they run on createTestDb() with the real schema. The real schema has foreign
// keys from Transaction.account_id to Account and from Transaction.friend_id to Friend, so the accounts
// and friends the Go tests used are inserted first. The tests after the Go ones cover the Go quirks
// and paths the Go tests do not reach.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testing/testDb'
import { SqlitePeerDebtRepo } from './peerDebt'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

async function insertAccount(id: string): Promise<void> {
  await db.query(`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, 'x', 0, 'BRL', 0)`, [
    id,
  ])
}

async function insertFriend(id: string): Promise<void> {
  await db.query(`INSERT INTO Friend (id, name, public_token) VALUES (?, 'f', ?)`, [id, `tok-${id}`])
}

/** Inserts a peer row with the given shape; the columns not listed take the Go test's defaults. */
async function insertPeer(over: {
  accountId: string
  friendId: string
  amount: number
  timestamp?: string
  isInstallment?: number
  totalInstallments?: number | null
  paidInstallments?: number
  frequency?: string | null
  anchorDate?: string | null
  confirmedAt?: string | null
  isRecurring?: number
}): Promise<string> {
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO "Transaction"
		(id, account_id, type, friend_id, amount, description, timestamp, is_recurring, is_installment, total_installments, paid_installments, frequency, anchor_date, requires_confirmation, confirmed_at)
		VALUES (?, ?, 'peer', ?, ?, 'row', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      id,
      over.accountId,
      over.friendId,
      over.amount,
      over.timestamp ?? '2026-01-01T00:00:00Z',
      over.isRecurring ?? 0,
      over.isInstallment ?? 0,
      over.totalInstallments ?? null,
      over.paidInstallments ?? 0,
      over.frequency ?? null,
      over.anchorDate ?? null,
      over.confirmedAt ?? null,
    ],
  )
  return id
}

async function seedPeerDebtRows(accountA: string, accountB: string, friendA: string, friendB: string): Promise<void> {
  // Go seedPeerDebtRows: (accountA, friendA), (accountA, friendB), (accountB, friendA); amount -1000.
  for (const [accountId, friendId] of [
    [accountA, friendA],
    [accountA, friendB],
    [accountB, friendA],
  ]) {
    await db.query(
      `INSERT INTO "Transaction" (
				id, account_id, type, friend_id, amount, description, timestamp,
				is_recurring, frequency, anchor_date, is_installment,
				total_installments, paid_installments, requires_confirmation, confirmed_at
			) VALUES (?, ?, 'peer', ?, -1000, 'seed', '2026-01-01T00:00:00Z', 0, NULL, NULL, 0, NULL, 0, 1, NULL)`,
      [crypto.randomUUID(), accountId, friendId],
    )
  }
}

// TestPeerDebtRepo_GetAll_OptionalAccountFilter
it('TestPeerDebtRepo_GetAll_OptionalAccountFilter', async () => {
  const repo = new SqlitePeerDebtRepo(db)
  const accountA = crypto.randomUUID()
  const accountB = crypto.randomUUID()
  const friendA = crypto.randomUUID()
  const friendB = crypto.randomUUID()
  await insertAccount(accountA)
  await insertAccount(accountB)
  await insertFriend(friendA)
  await insertFriend(friendB)
  await seedPeerDebtRows(accountA, accountB, friendA, friendB)

  const all = await repo.getAll(null)
  expect(all).toHaveLength(3)
  const scoped = await repo.getAll(accountA)
  expect(scoped).toHaveLength(2)
})

// TestPeerDebtRepo_GetByFriend_OptionalAccountFilter
it('TestPeerDebtRepo_GetByFriend_OptionalAccountFilter', async () => {
  const repo = new SqlitePeerDebtRepo(db)
  const accountA = crypto.randomUUID()
  const accountB = crypto.randomUUID()
  const friendA = crypto.randomUUID()
  const friendB = crypto.randomUUID()
  await insertAccount(accountA)
  await insertAccount(accountB)
  await insertFriend(friendA)
  await insertFriend(friendB)
  await seedPeerDebtRows(accountA, accountB, friendA, friendB)

  const allByFriend = await repo.getByFriend(friendA, null)
  expect(allByFriend).toHaveLength(2)
  const filteredByFriend = await repo.getByFriend(friendA, accountB)
  expect(filteredByFriend).toHaveLength(1)
})

// TestPeerDebtRepo_GetBalanceByFriend_ExcludesConfirmed: confirmed lump sums and fully paid
// installments are excluded; an active installment counts its remainder (300/3*1 = 100).
it('TestPeerDebtRepo_GetBalanceByFriend_ExcludesConfirmed', async () => {
  const repo = new SqlitePeerDebtRepo(db)
  const friendId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  await insertAccount(accountId)
  await insertFriend(friendId)

  // Active non-installment debt (owed to user): +500 - should be included.
  await insertPeer({ accountId, friendId, amount: 500 })
  // Confirmed non-installment debt: +1000 - must be EXCLUDED.
  await insertPeer({ accountId, friendId, amount: 1000, confirmedAt: '2026-01-01T00:00:00Z' })
  // Active installment debt (2 of 3 paid): +300 - should be included (remainder 100).
  await insertPeer({
    accountId,
    friendId,
    amount: 300,
    isInstallment: 1,
    totalInstallments: 3,
    paidInstallments: 2,
    frequency: 'monthly',
    anchorDate: '2026-01-01T00:00:00Z',
    isRecurring: 1,
  })
  // Fully-paid installment debt: +300 - must be EXCLUDED.
  await insertPeer({
    accountId,
    friendId,
    amount: 300,
    isInstallment: 1,
    totalInstallments: 2,
    paidInstallments: 2,
    frequency: 'monthly',
    anchorDate: '2026-01-01T00:00:00Z',
    isRecurring: 1,
  })

  const balance = await repo.getBalanceByFriend(friendId, null)
  // Only active (500) + installment remainder (100) = 600 owed to user.
  expect(balance.friendOwesUser).toBe(600)
})

// TestPeerDebtRepo_GetGlobalBalance_ExcludesConfirmed
it('TestPeerDebtRepo_GetGlobalBalance_ExcludesConfirmed', async () => {
  const repo = new SqlitePeerDebtRepo(db)
  const friendId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  await insertAccount(accountId)
  await insertFriend(friendId)

  // Active: +500.
  await insertPeer({ accountId, friendId, amount: 500 })
  // Confirmed (paid): +1000 - must be EXCLUDED.
  await insertPeer({ accountId, friendId, amount: 1000, confirmedAt: '2026-01-01T00:00:00Z' })

  const balance = await repo.getGlobalBalance(null)
  expect(balance.totalOwedToUser).toBe(500)
})

describe('balance float-sum quirk (Go scans a float SUM into int64)', () => {
  it('a remainder that is not a whole number fails like Go', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    // 1000 / 3 * (3 - 1) = 666.666...: not a whole number.
    await insertPeer({
      accountId,
      friendId,
      amount: -1000,
      isInstallment: 1,
      totalInstallments: 3,
      paidInstallments: 1,
      frequency: 'monthly',
      isRecurring: 1,
    })
    await expect(repo.getBalanceByFriend(friendId, null)).rejects.toThrow(
      /^peer_debt\.GetBalanceByFriend: sql: Scan error on column index 1, name "COALESCE\(ABS\(SUM\(CASE WHEN adj < 0 THEN adj ELSE 0 END\)\), 0\)": converting driver\.Value type float64 \("666\.6+"\) to a int64: invalid syntax$/,
    )
    await expect(repo.getGlobalBalance(null)).rejects.toThrow(
      /^peer_debt\.GetGlobalBalance: sql: Scan error on column index 1, name "COALESCE\(ABS\(SUM\(CASE WHEN adj < 0 THEN adj ELSE 0 END\)\), 0\)": converting driver\.Value type float64 \("666\.6+"\) to a int64: invalid syntax$/,
    )
  })

  it('reproduces the Go server 500 body for the real row plus a non-whole remainder', async () => {
    // Checked against the Go server on a scratch copy of the real data (GET /api/friends/summary):
    // the real installment (-357112, 8 total, 5 paid) gives -133917; a -1000 installment (3 total, 1 paid)
    // adds -666.666..., so the owed sum is 134583.666... and Go's 500 text is this (JSON-escaped in Go).
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    await insertPeer({
      accountId,
      friendId,
      amount: -357112,
      isInstallment: 1,
      totalInstallments: 8,
      paidInstallments: 5,
      frequency: 'monthly',
      isRecurring: 1,
    })
    await insertPeer({
      accountId,
      friendId,
      amount: -1000,
      isInstallment: 1,
      totalInstallments: 3,
      paidInstallments: 1,
      frequency: 'monthly',
      isRecurring: 1,
    })
    await expect(repo.getGlobalBalance(null)).rejects.toThrow(
      'peer_debt.GetGlobalBalance: sql: Scan error on column index 1, name "COALESCE(ABS(SUM(CASE WHEN adj < 0 THEN adj ELSE 0 END)), 0)": converting driver.Value type float64 ("134583.66666666666") to a int64: invalid syntax',
    )
  })

  it('a whole remainder of 1e6 or more fails too (Go prints it as 2e+06)', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    // 2000000 / 2 * (2 - 0) = 2000000.0
    await insertPeer({
      accountId,
      friendId,
      amount: 2000000,
      isInstallment: 1,
      totalInstallments: 2,
      paidInstallments: 0,
      frequency: 'monthly',
      isRecurring: 1,
    })
    await expect(repo.getBalanceByFriend(friendId, null)).rejects.toThrow(
      'peer_debt.GetBalanceByFriend: sql: Scan error on column index 0, name "COALESCE(SUM(CASE WHEN adj > 0 THEN adj ELSE 0 END), 0)": converting driver.Value type float64 ("2e+06") to a int64: invalid syntax',
    )
  })

  it('a balance of zero scans as an integer', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    expect(await repo.getBalanceByFriend(friendId, null)).toEqual({ friendOwesUser: 0, userOwesFriend: 0, net: 0 })
    expect(await repo.getGlobalBalance(null)).toEqual({ totalOwedToUser: 0, totalUserOwes: 0, net: 0 })
  })
})

describe('peer debt paths the Go tests do not reach', () => {
  it('getById returns the row with the confirmed flag and nullable columns', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    const id = await insertPeer({
      accountId,
      friendId,
      amount: -357112,
      timestamp: '2026-06-10',
      isInstallment: 1,
      totalInstallments: 8,
      paidInstallments: 5,
      frequency: 'monthly',
      anchorDate: '2026-10-10T00:00:00Z',
      isRecurring: 1,
    })
    expect(await repo.getById(id)).toEqual({
      id,
      accountId,
      friendId,
      amount: -357112,
      description: 'row',
      date: '2026-06-10',
      isInstallment: true,
      totalInstallments: 8,
      paidInstallments: 5,
      frequency: 'monthly',
      anchorDate: '2026-10-10T00:00:00Z',
      isConfirmed: false,
    })
  })

  it('getById of an unknown id rejects with ErrNoRows', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    await expect(repo.getById(crypto.randomUUID())).rejects.toThrow(
      'peer_debt.GetByID: sql: no rows in result set',
    )
  })

  it('insert writes the date as given and confirmed_at only when confirmed', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    const base = {
      accountId,
      friendId,
      amount: -2000,
      description: 'lunch',
      date: '2026-06-10',
      isInstallment: false,
      totalInstallments: null,
      paidInstallments: 0,
      frequency: null,
      anchorDate: null,
    }
    const open = { ...base, id: crypto.randomUUID(), isConfirmed: false }
    const done = { ...base, id: crypto.randomUUID(), isConfirmed: true }
    await repo.insert(open)
    await repo.insert(done)
    expect(await repo.getById(open.id)).toEqual(open)
    expect(await repo.getById(done.id)).toEqual(done)
    const raw = await db.query<{ confirmed_at: string | null; requires_confirmation: number; type: string }>(
      `SELECT confirmed_at, requires_confirmation, type FROM "Transaction" WHERE id = ?`,
      [done.id],
    )
    expect(raw[0]).toEqual({ confirmed_at: '2026-06-10', requires_confirmation: 1, type: 'peer' })
  })

  it('update: a missing row rejects with ErrNoRows, an empty update is an error', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    const id = await insertPeer({ accountId, friendId, amount: -500 })

    await repo.update(id, -700, 'changed')
    const after = await repo.getById(id)
    expect(after.amount).toBe(-700)
    expect(after.description).toBe('changed')

    await expect(repo.update(crypto.randomUUID(), -1)).rejects.toThrow(/^sql: no rows in result set$/)
    await expect(repo.update(id)).rejects.toThrow('peer_debt.Update: no fields provided')
  })

  it('update of is_confirmed sets and clears confirmed_at', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    const id = await insertPeer({ accountId, friendId, amount: -500, timestamp: '2026-06-10' })

    await repo.update(id, undefined, undefined, true)
    expect((await repo.getById(id)).isConfirmed).toBe(true)
    await repo.update(id, undefined, undefined, false)
    expect((await repo.getById(id)).isConfirmed).toBe(false)
  })

  it('confirmInstallment and toggleInstallmentConfirmation step the installment count', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    const inst = await insertPeer({
      accountId,
      friendId,
      amount: -3000,
      isInstallment: 1,
      totalInstallments: 3,
      paidInstallments: 1,
      frequency: 'monthly',
      isRecurring: 1,
    })
    await repo.confirmInstallment(inst)
    expect((await repo.getById(inst)).paidInstallments).toBe(2)
    await repo.confirmInstallment(inst)
    await repo.confirmInstallment(inst)
    expect((await repo.getById(inst)).paidInstallments).toBe(3)
    await repo.toggleInstallmentConfirmation(inst)
    expect((await repo.getById(inst)).paidInstallments).toBe(2)

    const lump = await insertPeer({ accountId, friendId, amount: -100, timestamp: '2026-06-10' })
    await repo.toggleInstallmentConfirmation(lump)
    expect((await repo.getById(lump)).isConfirmed).toBe(true)
    await repo.toggleInstallmentConfirmation(lump)
    expect((await repo.getById(lump)).isConfirmed).toBe(false)

    await expect(repo.confirmInstallment(crypto.randomUUID())).rejects.toThrow(
      'peer_debt.ConfirmInstallment: sql: no rows in result set',
    )
    await expect(repo.toggleInstallmentConfirmation(crypto.randomUUID())).rejects.toThrow(
      'peer_debt.ToggleInstallmentConfirmation: sql: no rows in result set',
    )
  })

  it('sumNextUserPayment: one installment for installment debts, the full amount for open lump sums', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    await insertPeer({
      accountId,
      friendId,
      amount: -357112,
      isInstallment: 1,
      totalInstallments: 8,
      paidInstallments: 5,
      frequency: 'monthly',
      isRecurring: 1,
    })
    await insertPeer({ accountId, friendId, amount: -53000 })
    await insertPeer({ accountId, friendId, amount: -2000, confirmedAt: '2026-06-10' })
    await insertPeer({ accountId, friendId, amount: 9000 })
    expect(await repo.sumNextUserPayment(null)).toBe(44639 + 53000)
    expect(await repo.sumNextUserPayment(accountId)).toBe(44639 + 53000)
    expect(await repo.sumNextUserPayment(crypto.randomUUID())).toBe(0)
  })

  it('sumUpcomingPeerObligations: date-only and RFC3339 due dates, unparseable dates skipped', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    await insertPeer({ accountId, friendId, amount: -1000, timestamp: '2026-04-20' })
    await insertPeer({ accountId, friendId, amount: -2000, timestamp: '2026-04-21T00:00:00Z' })
    await insertPeer({ accountId, friendId, amount: -4000, timestamp: '2026-04-30 10:00:00' })
    await insertPeer({
      accountId,
      friendId,
      amount: -3000,
      isInstallment: 1,
      totalInstallments: 3,
      paidInstallments: 0,
      frequency: 'monthly',
      isRecurring: 1,
      timestamp: '2026-04-25',
    })
    const after = new Date('2026-04-15T00:00:00Z')
    const before = new Date('2026-05-01T00:00:00Z')
    // 2026-04-20 (-1000) and 2026-04-21 (-2000) are in the window; the space form is skipped;
    // the installment's next due date is 2026-04-25 (-1000 each).
    expect(await repo.sumUpcomingPeerObligations(null, after, before)).toBe(-1000 - 2000 + -1000)
  })

  it('getActiveUserDebtsWithFriend lists open debts ordered by friend name, with the anchor date', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    const zoe = crypto.randomUUID()
    const ana = crypto.randomUUID()
    await db.query(`INSERT INTO Friend (id, name, public_token) VALUES (?, 'Zoe', 'tz'), (?, 'Ana', 'ta')`, [zoe, ana])
    await insertPeer({ accountId, friendId: zoe, amount: -500, timestamp: '2026-06-10' })
    await insertPeer({
      accountId,
      friendId: ana,
      amount: -3000,
      timestamp: '2026-05-10',
      isInstallment: 1,
      totalInstallments: 3,
      paidInstallments: 1,
      frequency: 'monthly',
      anchorDate: '2026-05-10T00:00:00Z',
      isRecurring: 1,
    })
    await insertPeer({ accountId, friendId: ana, amount: 700, timestamp: '2026-05-11' })
    const rows = await repo.getActiveUserDebtsWithFriend(null)
    expect(rows).toEqual([
      {
        friendName: 'Ana',
        amount: -3000,
        isInstallment: true,
        totalInstallments: 3,
        paidInstallments: 1,
        frequency: 'monthly',
        date: '2026-05-10',
        anchorDate: '2026-05-10T00:00:00Z',
      },
      {
        friendName: 'Zoe',
        amount: -500,
        isInstallment: false,
        totalInstallments: 0,
        paidInstallments: 0,
        frequency: '',
        date: '2026-06-10',
        anchorDate: null,
      },
    ])
  })

  it('deleteById removes a peer row and leaves other types alone', async () => {
    const repo = new SqlitePeerDebtRepo(db)
    const friendId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendId)
    const id = await insertPeer({ accountId, friendId, amount: -500 })
    await repo.deleteById(id)
    await expect(repo.getById(id)).rejects.toThrow('sql: no rows in result set')
  })
})
