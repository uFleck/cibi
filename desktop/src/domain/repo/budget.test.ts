// @vitest-environment node
// Runs on createTestDb() with the real schema. Fixtures use UTC instants only (Date.UTC through utc()),
// so the results do not depend on the machine's timezone.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatDbTime } from '../dates'
import { createTestDb } from '../testing/testDb'
import { SqliteBudgetRepo } from './budget'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

const ACCOUNT_ID = 'acc-1'
const FRIEND_ID = 'friend-1'

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
  await db.query(`INSERT INTO Account (id, name, current_balance, currency) VALUES (?, 'x', 0, 'BRL')`, [
    ACCOUNT_ID,
  ])
  await db.query(`INSERT INTO Friend (id, name, public_token) VALUES (?, 'Ana', 'token-ana')`, [FRIEND_ID])
})

afterEach(() => {
  db.close()
})

/** A UTC instant; month is 1-based. */
function utc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute))
}

interface TxnFixture {
  id: string
  amount?: number
  title?: string
  category?: string | null
  isRecurring?: boolean
  /** Stored text: RFC3339 or date-only. */
  nextOccurrence?: string | null
  type?: 'personal' | 'peer'
  friendId?: string | null
}

async function insertTxn(f: TxnFixture): Promise<void> {
  await db.query(
    `INSERT INTO "Transaction" (id, account_id, amount, title, category, timestamp, is_recurring, next_occurrence, requires_confirmation, type, friend_id)
     VALUES (?, ?, ?, ?, ?, '2026-10-01T00:00:00Z', ?, ?, 0, ?, ?)`,
    [
      f.id,
      ACCOUNT_ID,
      f.amount ?? -1000,
      f.title ?? 'x',
      f.category ?? null,
      f.isRecurring ? 1 : 0,
      f.nextOccurrence ?? null,
      f.type ?? 'personal',
      f.friendId ?? null,
    ],
  )
}

async function insertLedger(
  id: string,
  entryType: 'payment' | 'income' | 'opening_balance' | 'manual_adjustment',
  amount: number,
  postedAt: string,
  transactionId: string | null = null,
): Promise<void> {
  await db.query(
    `INSERT INTO ledger (id, account_id, transaction_id, entry_type, amount, description, posted_at)
     VALUES (?, ?, ?, ?, ?, 'x', ?)`,
    [id, ACCOUNT_ID, transactionId, entryType, amount, postedAt],
  )
}

describe('SqliteBudgetRepo', () => {
  describe('limits', () => {
    it('replaceLimits replaces the whole set, keeps is_fixed and lists by category', async () => {
      const repo = new SqliteBudgetRepo(db)
      await repo.replaceLimits([{ category: 'Mercado', monthlyLimit: 80000, isFixed: false }])
      await repo.replaceLimits([
        { category: 'Moradia', monthlyLimit: 150000, isFixed: true },
        { category: 'Lazer', monthlyLimit: 20000, isFixed: false },
        { category: 'Assinaturas', monthlyLimit: 5000, isFixed: true },
      ])

      expect(await repo.listLimits()).toEqual([
        { category: 'Assinaturas', monthlyLimit: 5000, isFixed: true },
        { category: 'Lazer', monthlyLimit: 20000, isFixed: false },
        { category: 'Moradia', monthlyLimit: 150000, isFixed: true },
      ])
    })
  })

  describe('exclusions', () => {
    it('addExclusion is idempotent and removeExclusion removes only that row', async () => {
      const repo = new SqliteBudgetRepo(db)
      await insertTxn({ id: 'bill-1' })
      await insertTxn({ id: 'bill-2' })

      await repo.addExclusion('bill-1', '2026-10')
      await repo.addExclusion('bill-1', '2026-10')
      await repo.addExclusion('bill-2', '2026-10')
      expect((await repo.listExclusionIds('2026-10')).sort()).toEqual(['bill-1', 'bill-2'])

      await repo.removeExclusion('bill-1', '2026-10')
      expect(await repo.listExclusionIds('2026-10')).toEqual(['bill-2'])
      await repo.removeExclusion('bill-1', '2026-10')
      expect(await repo.listExclusionIds('2026-10')).toEqual(['bill-2'])
    })

    it('exclusions are scoped by month', async () => {
      const repo = new SqliteBudgetRepo(db)
      await insertTxn({ id: 'bill-1' })

      await repo.addExclusion('bill-1', '2026-10')
      expect(await repo.listExclusionIds('2026-10')).toEqual(['bill-1'])
      expect(await repo.listExclusionIds('2026-11')).toEqual([])

      await repo.addExclusion('bill-1', '2026-11')
      await repo.removeExclusion('bill-1', '2026-10')
      expect(await repo.listExclusionIds('2026-10')).toEqual([])
      expect(await repo.listExclusionIds('2026-11')).toEqual(['bill-1'])
    })

    it('deleting the transaction cascades to its exclusions', async () => {
      const repo = new SqliteBudgetRepo(db)
      await insertTxn({ id: 'bill-1' })
      await repo.addExclusion('bill-1', '2026-10')

      await db.query(`DELETE FROM "Transaction" WHERE id = ?`, ['bill-1'])
      expect(await repo.listExclusionIds('2026-10')).toEqual([])
    })
  })

  describe('listPaymentsBetween', () => {
    it('returns only negative payments inside [from, to), with the source transaction type and category', async () => {
      const repo = new SqliteBudgetRepo(db)
      await insertTxn({ id: 'txn-mercado', category: 'Mercado' })
      await insertTxn({ id: 'txn-peer', type: 'peer', friendId: FRIEND_ID, category: 'Amigos' })

      // In the window.
      await insertLedger('l-mercado', 'payment', -1500, formatDbTime(utc(2026, 10, 5, 12)), 'txn-mercado')
      await insertLedger('l-no-source', 'payment', -2000, formatDbTime(utc(2026, 10, 10)))
      await insertLedger('l-peer', 'payment', -900, formatDbTime(utc(2026, 10, 12)), 'txn-peer')
      await insertLedger('l-lower', 'payment', -300, formatDbTime(utc(2026, 10, 1)), 'txn-mercado')
      await insertLedger('l-space-form', 'payment', -250, '2026-10-15 09:30:00')

      // Outside the window: at the exclusive upper bound, and before the lower bound.
      await insertLedger('l-upper', 'payment', -400, formatDbTime(utc(2026, 11, 1)), 'txn-mercado')
      await insertLedger('l-before', 'payment', -500, formatDbTime(utc(2026, 9, 30, 23)), 'txn-mercado')

      // Not payments of an outflow.
      await insertLedger('l-income', 'income', 5000, formatDbTime(utc(2026, 10, 5)))
      await insertLedger('l-opening', 'opening_balance', 100000, formatDbTime(utc(2026, 10, 2)))
      await insertLedger('l-positive-payment', 'payment', 1000, formatDbTime(utc(2026, 10, 6)), 'txn-mercado')

      const rows = await repo.listPaymentsBetween(utc(2026, 10, 1), utc(2026, 11, 1))
      expect(rows.sort((a, b) => a.amount - b.amount)).toEqual([
        { amount: -2000, postedAt: utc(2026, 10, 10), category: null, transactionType: null },
        { amount: -1500, postedAt: utc(2026, 10, 5, 12), category: 'Mercado', transactionType: 'personal' },
        { amount: -900, postedAt: utc(2026, 10, 12), category: 'Amigos', transactionType: 'peer' },
        { amount: -300, postedAt: utc(2026, 10, 1), category: 'Mercado', transactionType: 'personal' },
        { amount: -250, postedAt: utc(2026, 10, 15, 9, 30), category: null, transactionType: null },
      ])
    })
  })

  describe('listRecurringBetween', () => {
    it('returns only recurring personal expenses with next_occurrence in [from, to)', async () => {
      const repo = new SqliteBudgetRepo(db)
      await insertTxn({
        id: 'rec-internet',
        title: 'Internet',
        category: 'Moradia',
        amount: -12000,
        isRecurring: true,
        nextOccurrence: formatDbTime(utc(2026, 11, 15)),
      })
      await insertTxn({
        id: 'rec-seguro',
        title: 'Seguro',
        amount: -3000,
        isRecurring: true,
        nextOccurrence: formatDbTime(utc(2026, 11, 1)),
      })

      // Outside the window: at the exclusive upper bound, and before the lower bound.
      await insertTxn({ id: 'rec-dec', amount: -5000, isRecurring: true, nextOccurrence: formatDbTime(utc(2026, 12, 1)) })
      await insertTxn({ id: 'rec-oct', amount: -4000, isRecurring: true, nextOccurrence: formatDbTime(utc(2026, 10, 31)) })

      // Excluded kinds: a peer row, a non-recurring row, and a recurring income.
      await insertTxn({
        id: 'rec-peer',
        type: 'peer',
        friendId: FRIEND_ID,
        amount: -7000,
        isRecurring: true,
        nextOccurrence: formatDbTime(utc(2026, 11, 10)),
      })
      await insertTxn({ id: 'one-off', amount: -6000, isRecurring: false, nextOccurrence: formatDbTime(utc(2026, 11, 12)) })
      await insertTxn({ id: 'rec-refund', amount: 2000, isRecurring: true, nextOccurrence: formatDbTime(utc(2026, 11, 13)) })

      const rows = await repo.listRecurringBetween(utc(2026, 11, 1), utc(2026, 12, 1))
      expect(rows.sort((a, b) => a.amount - b.amount)).toEqual([
        {
          transactionId: 'rec-internet',
          title: 'Internet',
          category: 'Moradia',
          amount: -12000,
          nextOccurrence: utc(2026, 11, 15),
          estimateSource: null,
          estimateKey: null,
        },
        {
          transactionId: 'rec-seguro',
          title: 'Seguro',
          category: null,
          amount: -3000,
          nextOccurrence: utc(2026, 11, 1),
          estimateSource: null,
          estimateKey: null,
        },
      ])
    })

    it('parses a date-only next_occurrence', async () => {
      const repo = new SqliteBudgetRepo(db)
      await insertTxn({
        id: 'rec-academia',
        title: 'Academia',
        amount: -9900,
        isRecurring: true,
        nextOccurrence: '2026-11-01',
      })

      // Date-only text compares below the RFC3339 lower bound, so the window is padded a day,
      // as the BudgetRepo doc asks of callers; the JS side filters exactly.
      const rows = await repo.listRecurringBetween(utc(2026, 10, 31), utc(2026, 12, 1))
      expect(rows).toEqual([
        {
          transactionId: 'rec-academia',
          title: 'Academia',
          category: null,
          amount: -9900,
          nextOccurrence: utc(2026, 11, 1),
          estimateSource: null,
          estimateKey: null,
        },
      ])
    })
  })
})
