import { describe, expect, it } from 'vitest'
import type { PayScheduleResponse, TransactionResponse } from '@/lib/api'
import { buildImpactSummary, matchesPresetFilter } from '@/lib/transactions-impact'

const paySchedules: PayScheduleResponse[] = [{
  id: 'ps-1',
  account_id: 'acc-1',
  frequency: 'monthly',
  anchor_date: '2026-04-01',
  next_payday: '2026-04-20',
  amount: 3000,
  day_of_month_2: null,
  label: null,
}]

const txn = (overrides: Partial<TransactionResponse>): TransactionResponse => ({
  id: 't-1',
  account_id: 'acc-1',
  amount: -100,
  description: 'Bill',
  category: 'General',
  timestamp: '2026-04-10T00:00:00Z',
  is_recurring: false,
  requires_confirmation: true,
  confirmed_at: null,
  frequency: null,
  anchor_date: null,
  next_occurrence: null,
  ...overrides,
})

describe('transactions impact', () => {
  it('counts negative pending payments as impact', () => {
    const summary = buildImpactSummary({
      transactions: [txn({ amount: -250 })],
      paySchedules,
      nextPayday: '2026-04-20',
      currentBalance: 1000,
      now: new Date('2026-04-15T12:00:00Z'),
    })

    expect(summary.currentCount).toBe(1)
    expect(summary.currentAmount).toBe(250)
    expect(summary.currentProjectedBalance).toBe(750)
  })

  it('includes overdue unpaid one-time pending payments in current window', () => {
    expect(matchesPresetFilter({
      txn: txn({ timestamp: '2026-01-10T00:00:00Z' }),
      preset: 'current-window',
      now: new Date('2026-04-15T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('splits current and next windows correctly (including future pending date)', () => {
    const summary = buildImpactSummary({
      transactions: [
        txn({ id: 'current', amount: -100, timestamp: '2026-04-10T00:00:00Z' }),
        txn({ id: 'next', amount: -75, timestamp: '2026-04-10T00:00:00Z', anchor_date: '2026-04-21T00:00:00Z' }),
        txn({
          id: 'recurring-current',
          is_recurring: true,
          requires_confirmation: false,
          amount: -60,
          next_occurrence: '2026-04-19T00:00:00Z',
        }),
      ],
      paySchedules,
      nextPayday: '2026-04-20',
      currentBalance: 1000,
      now: new Date('2026-04-15T12:00:00Z'),
    })

    expect(summary.currentAmount).toBe(100)
    expect(summary.nextAmount).toBe(75)
    expect(summary.currentCount).toBe(1)
    expect(summary.nextCount).toBe(1)
  })

  it('treats all due items as current when next payday is missing', () => {
    const summary = buildImpactSummary({
      transactions: [
        txn({ amount: -80, timestamp: '2026-06-01T00:00:00Z' }),
        txn({
          id: 'recurring',
          is_recurring: true,
          requires_confirmation: false,
          amount: -20,
          next_occurrence: '2026-06-10T00:00:00Z',
        }),
      ],
      paySchedules: [],
      nextPayday: null,
      currentBalance: 500,
      now: new Date('2026-04-15T12:00:00Z'),
    })

    expect(summary.currentAmount).toBe(80)
    expect(summary.nextAmount).toBe(0)
  })

  it('uses next-window projected balance as base when provided', () => {
    const summary = buildImpactSummary({
      transactions: [
        txn({ id: 'current', amount: -100, timestamp: '2026-04-10T00:00:00Z' }),
        txn({ id: 'next', amount: -75, timestamp: '2026-04-10T00:00:00Z', anchor_date: '2026-04-21T00:00:00Z' }),
      ],
      paySchedules,
      nextPayday: '2026-04-20',
      currentBalance: 1000,
      projectedBalanceAfterNextWindow: 1300,
      now: new Date('2026-04-15T12:00:00Z'),
    })

    expect(summary.currentProjectedBalance).toBe(900)
    expect(summary.nextProjectedBalance).toBe(1125)
  })

  it('ignores recurring transactions in payment impact', () => {
    const summary = buildImpactSummary({
      transactions: [
        txn({ id: 'due', amount: -100 }),
        txn({
          id: 'recurring-outflow',
          is_recurring: true,
          requires_confirmation: true,
          confirmed_at: null,
          amount: -200,
          next_occurrence: '2026-04-18T00:00:00Z',
        }),
        txn({
          id: 'recurring-inflow',
          is_recurring: true,
          requires_confirmation: true,
          confirmed_at: null,
          amount: 300,
          next_occurrence: '2026-04-18T00:00:00Z',
        }),
      ],
      paySchedules,
      nextPayday: '2026-04-20',
      currentBalance: 1000,
      now: new Date('2026-04-15T12:00:00Z'),
    })

    expect(summary.currentCount).toBe(1)
    expect(summary.currentAmount).toBe(100)
    expect(summary.currentProjectedBalance).toBe(900)
  })
})
