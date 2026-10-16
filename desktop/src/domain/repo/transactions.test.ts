// @vitest-environment node
// Ports of internal/repo/sqlite/transactions_test.go. The Go tests create a schema of their own
// (txnSchema); here they run on createTestDb() with the real schema. The real schema has a foreign
// key from Transaction.account_id to Account, so the accounts the Go tests used are inserted first.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createTestDb } from '../testing/testDb'
import { SqliteTxnsRepo, type Transaction } from './transactions'

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

// TestSumUpcomingObligations_IncludesOverdueUntilConfirmed: overdue, due-today and upcoming-before-payday
// obligations count; the payday itself, later dates and other accounts do not.
it('TestSumUpcomingObligations_IncludesOverdueUntilConfirmed', async () => {
  const repo = new SqliteTxnsRepo(db)

  const accountId = crypto.randomUUID()
  const otherAccountId = crypto.randomUUID()
  await insertAccount(accountId)
  await insertAccount(otherAccountId)
  const now = new Date('2026-04-15T12:00:00Z')
  const nextPayday = new Date('2026-04-20T00:00:00Z')

  const insertRecurring = (accountId: string, amount: number, nextOccurrence: string): Promise<unknown> =>
    db.query(
      `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring, next_occurrence, requires_confirmation, confirmed_at)
			 VALUES (?, ?, ?, 'x', '2026-04-01T00:00:00Z', 1, ?, 0, NULL)`,
      [crypto.randomUUID(), accountId, amount, nextOccurrence],
    )
  const insertPending = (
    accountId: string,
    amount: number,
    timestamp: string,
    anchorDate: string | null,
  ): Promise<unknown> =>
    db.query(
      `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring, anchor_date, requires_confirmation, confirmed_at)
			 VALUES (?, ?, ?, 'x', ?, 0, ?, 1, NULL)`,
      [crypto.randomUUID(), accountId, amount, timestamp, anchorDate],
    )

  // Must count: overdue + due today + upcoming before payday.
  await insertRecurring(accountId, -1000, '2026-04-10T00:00:00Z')
  await insertRecurring(accountId, -2000, '2026-04-15T00:00:00Z')
  await insertRecurring(accountId, -3000, '2026-04-19T00:00:00Z')
  const futureBeforePayday = '2026-04-18T00:00:00Z'
  await insertPending(accountId, -2500, '2026-04-01T00:00:00Z', futureBeforePayday)
  await insertPending(accountId, -500, '2026-04-10T00:00:00Z', null)

  // Must NOT count.
  await insertRecurring(accountId, -4000, '2026-04-20T00:00:00Z') // payday day excluded
  await insertRecurring(accountId, -5000, '2026-04-25T00:00:00Z') // after payday
  const futureAfterPayday = '2026-04-25T00:00:00Z'
  await insertPending(accountId, -6000, '2026-04-01T00:00:00Z', futureAfterPayday) // pending date after payday
  await insertPending(otherAccountId, -7000, '2026-04-10T00:00:00Z', null) // other account

  const sum = await repo.sumUpcomingObligations(accountId, now, nextPayday)
  expect(sum).toBe(-9000)
})

// TestIncrementPaidInstallments: the paid count goes from 0 to 1.
it('TestIncrementPaidInstallments', async () => {
  const repo = new SqliteTxnsRepo(db)

  const accountId = crypto.randomUUID()
  await insertAccount(accountId)
  const id = crypto.randomUUID()
  const total = 6
  await db.query(
    `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring, requires_confirmation, is_installment, total_installments, paid_installments)
		 VALUES (?, ?, -5000, 'Phone', '2026-07-10T00:00:00Z', 0, 0, 1, ?, 0)`,
    [id, accountId, total],
  )

  await repo.incrementPaidInstallments(id)

  const rows = await db.query<{ paid_installments: number }>(
    `SELECT paid_installments FROM "Transaction" WHERE id = ?`,
    [id],
  )
  expect(rows[0]?.paid_installments).toBe(1)
})

// Not a Go test: the reads accept the date-only form the real rows hold for timestamp and
// confirmed_at, and a peer row keeps its friend_id.
it('reads the date-only time forms, and the friend of a peer row', async () => {
  const repo = new SqliteTxnsRepo(db)

  const accountId = crypto.randomUUID()
  await insertAccount(accountId)
  const friendId = crypto.randomUUID()
  await db.query(`INSERT INTO Friend (id, name, public_token) VALUES (?, 'Ana', ?)`, [friendId, crypto.randomUUID()])
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring, anchor_date, requires_confirmation, confirmed_at, type, friend_id)
		 VALUES (?, ?, 2000, 'PAYMENT', '2026-06-10', 0, NULL, 1, '2026-06-10', 'peer', ?)`,
    [id, accountId, friendId],
  )

  const t = await repo.getById(id)
  expect(t.timestamp).toEqual(new Date('2026-06-10T00:00:00Z'))
  expect(t.confirmedAt).toEqual(new Date('2026-06-10T00:00:00Z'))
  expect(t.friendId).toBe(friendId)
  expect(t.type).toBe('peer')
})

function sample(accountId: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    accountId,
    type: '',
    friendId: null,
    amount: -5000,
    title: 'DAS',
    description: null,
    links: [],
    category: null,
    timestamp: new Date('2026-10-01T00:00:00Z'),
    isRecurring: false,
    frequency: null,
    anchorDate: null,
    nextOccurrence: null,
    requiresConfirmation: false,
    confirmedAt: null,
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    ...over,
  }
}

it('stores the description and the links in order, and reads them back by id and by account', async () => {
  const repo = new SqliteTxnsRepo(db)
  const accountId = crypto.randomUUID()
  await insertAccount(accountId)
  const links = [
    { url: 'https://receita.example/pgdas', label: 'Pay here' },
    { url: 'https://example.com/boleto', label: null },
  ]
  const t = sample(accountId, { description: 'Simples Nacional, due on the 20th', links })
  await repo.insert(t)
  await repo.insert(sample(accountId, { title: 'No extras' }))

  const byId = await repo.getById(t.id)
  expect(byId.title).toBe('DAS')
  expect(byId.description).toBe('Simples Nacional, due on the 20th')
  expect(byId.links).toEqual(links)

  const all = await repo.getByAccount(accountId)
  expect(all.find((x) => x.id === t.id)?.links).toEqual(links)
  expect(all.find((x) => x.title === 'No extras')).toMatchObject({ description: null, links: [] })
})

it('treats a blank description as none and replaces or clears links on update', async () => {
  const repo = new SqliteTxnsRepo(db)
  const accountId = crypto.randomUUID()
  await insertAccount(accountId)
  const t = sample(accountId, { description: '   ', links: [{ url: 'https://a.example', label: '  ' }] })
  await repo.insert(t)
  expect(await repo.getById(t.id)).toMatchObject({ description: null, links: [{ url: 'https://a.example', label: null }] })

  await repo.update(t.id, { title: 'Renamed', description: 'More detail', links: [{ url: 'https://b.example', label: 'B' }] })
  expect(await repo.getById(t.id)).toMatchObject({
    title: 'Renamed',
    description: 'More detail',
    links: [{ url: 'https://b.example', label: 'B' }],
  })

  await repo.update(t.id, { description: '', links: [] })
  expect(await repo.getById(t.id)).toMatchObject({ title: 'Renamed', description: null, links: [] })
})

it('deletes the links with the transaction', async () => {
  const repo = new SqliteTxnsRepo(db)
  const accountId = crypto.randomUUID()
  await insertAccount(accountId)
  const t = sample(accountId, { links: [{ url: 'https://a.example', label: null }] })
  await repo.insert(t)
  await repo.deleteById(t.id)
  expect(await db.query('SELECT id FROM TransactionLink')).toEqual([])
})
