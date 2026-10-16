import { describe, it, expect } from 'vitest'
import { averageDailySpend, computeBalanceSeries } from '@/lib/balance-series'
import type { FriendDebtBreakdownItem, PayScheduleResponse, TransactionResponse } from '@/lib/api'

function makeTxn(over: Partial<TransactionResponse>): TransactionResponse {
  return {
    id: 't1', account_id: 'a1', type: 'personal', title: 'Test', description: null, links: [], amount: -10, category: '',
    timestamp: '', is_recurring: false, is_installment: false, next_occurrence: null,
    requires_confirmation: false, confirmed_at: null, frequency: null, anchor_date: null,
    total_installments: null, paid_installments: 0, ...over,
  }
}

const SCHEDULE: PayScheduleResponse = {
  id: 's1', account_id: 'a1', anchor_date: '2026-10-20', frequency: 'monthly', amount: 5000,
  next_payday: '2026-10-20', day_of_month_2: null, label: null,
}

const DEBT: FriendDebtBreakdownItem = {
  friend_name: 'Alice', total_amount: 200, next_payment: 200, is_installment: false,
  per_install_amount: 200, total_installments: 1, paid_installments: 0, next_payment_date: '2026-10-12',
}

const START = new Date('2026-10-10T00:00:00Z')
const END = new Date('2026-10-20T00:00:00Z')

describe('computeBalanceSeries', () => {
  it('returns one point per day, start and end included', () => {
    const points = computeBalanceSeries({
      startBalance: 1000, transactions: [], paySchedules: [], friendBreakdown: [],
      start: START, end: END, dailyBaseline: 0,
    })
    expect(points).toHaveLength(11)
    expect(points[0].balance).toBe(1000)
    expect(points[10].date.toISOString().slice(0, 10)).toBe('2026-10-20')
  })

  it('steps down on bills, installments and peer payments', () => {
    const points = computeBalanceSeries({
      startBalance: 1000,
      transactions: [
        makeTxn({ amount: -100, is_recurring: true, next_occurrence: '2026-10-11T00:00:00Z' }),
        makeTxn({ amount: -50, is_installment: true, next_occurrence: '2026-10-15T00:00:00Z' }),
      ],
      paySchedules: [], friendBreakdown: [DEBT], start: START, end: END, dailyBaseline: 0,
    })
    expect(points[1].balance).toBe(900)
    expect(points[2].balance).toBe(700)
    expect(points[5].balance).toBe(650)
    expect(points[10].balance).toBe(650)
  })

  it('leaves out events outside the window, including a payday on the end date', () => {
    const points = computeBalanceSeries({
      startBalance: 1000,
      transactions: [makeTxn({ amount: -100, is_recurring: true, next_occurrence: '2026-10-25T00:00:00Z' })],
      paySchedules: [SCHEDULE], friendBreakdown: [], start: START, end: END, dailyBaseline: 0,
    })
    expect(points[10].balance).toBe(1000)
  })

  it('steps up on a payday inside the window', () => {
    const points = computeBalanceSeries({
      startBalance: 1000, transactions: [], paySchedules: [SCHEDULE], friendBreakdown: [],
      start: START, end: new Date('2026-10-25T00:00:00Z'), dailyBaseline: 0,
    })
    expect(points[9].balance).toBe(1000)
    expect(points[10].balance).toBe(6000)
  })

  it('wears the balance down by the baseline each day', () => {
    const points = computeBalanceSeries({
      startBalance: 1000, transactions: [], paySchedules: [], friendBreakdown: [],
      start: START, end: END, dailyBaseline: 10,
    })
    expect(points[0].balance).toBe(1000)
    expect(points[10].balance).toBe(900)
  })
})

describe('averageDailySpend', () => {
  const NOW = new Date('2026-10-16T12:00:00Z')

  it('averages one-off personal spending over the period', () => {
    const avg = averageDailySpend([
      makeTxn({ amount: -200, timestamp: '2026-10-10T12:00:00Z' }),
      makeTxn({ amount: -100, timestamp: '2026-10-01T12:00:00Z' }),
    ], NOW, 30)
    expect(avg).toBe(10)
  })

  it('ignores income, scheduled obligations, peer entries and anything older than the period', () => {
    const avg = averageDailySpend([
      makeTxn({ amount: 500, timestamp: '2026-10-10T12:00:00Z' }),
      makeTxn({ amount: -300, is_recurring: true, timestamp: '2026-10-10T12:00:00Z' }),
      makeTxn({ amount: -300, is_installment: true, timestamp: '2026-10-10T12:00:00Z' }),
      makeTxn({ amount: -300, type: 'peer', timestamp: '2026-10-10T12:00:00Z' }),
      makeTxn({ amount: -300, timestamp: '2026-08-01T12:00:00Z' }),
    ], NOW, 30)
    expect(avg).toBe(0)
  })
})
