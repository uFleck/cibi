import { afterEach, describe, expect, it } from 'vitest'
import type { LedgerEntryResponse, TransactionResponse } from '@/lib/api'
import { UNCATEGORIZED, monthKey, spendByCategory } from './spend'

const now = new Date(2026, 9, 15, 12)

function entry(overrides: Partial<LedgerEntryResponse>): LedgerEntryResponse {
  return {
    id: 'e',
    account_id: 'a1',
    transaction_id: null,
    pay_schedule_id: null,
    entry_type: 'payment',
    amount: -10,
    description: 'x',
    posted_at: '2026-10-03T10:00:00Z',
    ...overrides,
  }
}

function txn(overrides: Partial<TransactionResponse>): TransactionResponse {
  return {
    id: 't',
    account_id: 'a1',
    type: 'personal',
    amount: -10,
    description: 'x',
    category: null,
    timestamp: '2026-10-01T00:00:00Z',
    is_recurring: false,
    requires_confirmation: false,
    confirmed_at: null,
    frequency: null,
    anchor_date: null,
    next_occurrence: null,
    is_installment: false,
    total_installments: null,
    paid_installments: 0,
    ...overrides,
  }
}

const originalTz = process.env.TZ

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

describe('monthKey', () => {
  it('formats the local year and month', () => {
    expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01')
  })
})

describe('spendByCategory', () => {
  it('sums payments this month by the category of their transaction, largest first', () => {
    const transactions = [
      txn({ id: 'rent', category: 'Housing' }),
      txn({ id: 'food', category: 'Food' }),
    ]
    const entries = [
      entry({ id: '1', transaction_id: 'rent', amount: -900 }),
      entry({ id: '2', transaction_id: 'food', amount: -120 }),
      entry({ id: '3', transaction_id: 'food', amount: -30 }),
    ]
    expect(spendByCategory(entries, transactions, now)).toEqual({
      rows: [
        { category: 'Housing', amount: 900 },
        { category: 'Food', amount: 150 },
      ],
      total: 1050,
    })
  })

  it('ignores income, other months and manual adjustments', () => {
    const entries = [
      entry({ id: 'income', entry_type: 'income', amount: 3000 }),
      entry({ id: 'last-month', amount: -400, posted_at: '2026-09-30T10:00:00Z' }),
      entry({ id: 'adjust', entry_type: 'manual_adjustment', amount: -50 }),
      entry({ id: 'paid', amount: -25 }),
    ]
    expect(spendByCategory(entries, [], now)).toEqual({
      rows: [{ category: UNCATEGORIZED, amount: 25 }],
      total: 25,
    })
  })

  it('skips payments that came from a peer debt', () => {
    const transactions = [txn({ id: 'loan', type: 'peer', category: 'Loans' })]
    const entries = [entry({ transaction_id: 'loan', amount: -200 })]
    expect(spendByCategory(entries, transactions, now)).toEqual({ rows: [], total: 0 })
  })

  it('counts a payment with no known transaction, or no category, as Uncategorized', () => {
    const transactions = [txn({ id: 'blank', category: '  ' })]
    const entries = [
      entry({ id: 'orphan', transaction_id: 'gone', amount: -40 }),
      entry({ id: 'blank', transaction_id: 'blank', amount: -10 }),
    ]
    expect(spendByCategory(entries, transactions, now)).toEqual({
      rows: [{ category: UNCATEGORIZED, amount: 50 }],
      total: 50,
    })
  })

  it('counts by local month, not the UTC prefix: a local Oct 31 evening is October', () => {
    const entries = [
      entry({ id: 'oct', amount: -10, posted_at: new Date(2026, 9, 31, 23, 30).toISOString() }),
      entry({ id: 'nov', amount: -20, posted_at: new Date(2026, 10, 1, 0, 30).toISOString() }),
    ]
    expect(spendByCategory(entries, [], now).total).toBe(10)
  })

  it('a UTC 2026-11-01 01:00 payment is October in UTC-3 and November in UTC', () => {
    const payment = entry({ amount: -75, posted_at: '2026-11-01T01:00:00Z' })

    process.env.TZ = 'America/Sao_Paulo'
    expect(spendByCategory([payment], [], new Date(2026, 9, 15, 12)).total).toBe(75)

    process.env.TZ = 'UTC'
    expect(spendByCategory([payment], [], new Date(2026, 9, 15, 12)).total).toBe(0)
    expect(spendByCategory([payment], [], new Date(2026, 10, 15, 12)).total).toBe(75)
  })

  it('groups by the category column, and a transaction with no category is Uncategorized', () => {
    const transactions = [txn({ id: 'gym', category: 'Saúde' }), txn({ id: 'misc', category: null })]
    const entries = [
      entry({ id: '1', transaction_id: 'gym', amount: -80 }),
      entry({ id: '2', transaction_id: 'misc', amount: -20 }),
    ]
    expect(spendByCategory(entries, transactions, now)).toEqual({
      rows: [
        { category: 'Saúde', amount: 80 },
        { category: UNCATEGORIZED, amount: 20 },
      ],
      total: 100,
    })
  })

  it('skips a payment whose timestamp cannot be parsed', () => {
    const entries = [entry({ posted_at: 'not a date', amount: -30 }), entry({ amount: -5 })]
    expect(spendByCategory(entries, [], now).total).toBe(5)
  })
})
