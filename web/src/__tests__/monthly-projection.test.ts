import { describe, it, expect } from 'vitest'
import { computeMonthlyProjection } from '@/lib/monthly-projection'
import type { AccountResponse, TransactionResponse, PayScheduleResponse, FriendDebtBreakdownItem } from '@/lib/api'

function makeAccount(balance: number): AccountResponse {
  return { id: 'a1', name: 'Test', current_balance: balance, currency: 'BRL', is_default: true, safety_buffer: 0 }
}

function makeSchedule(anchorDate: string, amount: number, frequency: PayScheduleResponse['frequency'] = 'monthly'): PayScheduleResponse {
  return { id: 's1', account_id: 'a1', anchor_date: anchorDate, frequency, amount, next_payday: anchorDate, day_of_month_2: null, label: null }
}

function makeTxn(amount: number, next_occurrence: string | null, is_recurring = true, is_installment = false): TransactionResponse {
  return {
    id: 't1', account_id: 'a1', type: 'personal', description: 'Test', amount, category: '',
    timestamp: '', is_recurring, is_installment, next_occurrence,
    requires_confirmation: false, confirmed_at: null, frequency: null, anchor_date: null,
    total_installments: null, paid_installments: 0,
  }
}

function makeDebt(next_payment: number, next_payment_date: string | null): FriendDebtBreakdownItem {
  return {
    friend_name: 'Alice', total_amount: next_payment, next_payment, is_installment: false,
    per_install_amount: next_payment, total_installments: 1, paid_installments: 0, next_payment_date,
  }
}

// All tests run in Sep 2026 context
const SEP_9 = new Date('2026-09-09T12:00:00Z')

describe('computeMonthlyProjection - income', () => {
  it('includes pay schedule occurrence landing in current month', () => {
    const schedule = makeSchedule('2026-09-15', 5000)
    const { income } = computeMonthlyProjection(makeAccount(0), [], [schedule], [], SEP_9)
    expect(income).toBe(5000)
  })

  it('does not count occurrence landing on monthEnd (boundary exclusive)', () => {
    // monthly anchored Sep 30 → Sep 30 counted, Oct 30 excluded
    const schedule = makeSchedule('2026-09-30', 5000)
    const { income } = computeMonthlyProjection(makeAccount(0), [], [schedule], [], SEP_9)
    expect(income).toBe(5000) // only Sep 30, not Oct 30
  })

  it('counts multiple payday occurrences in same month (weekly schedule)', () => {
    // weekly schedule anchored Sep 1 → hits Sep 1, 8, 15, 22, 29 in Sep
    const schedule = makeSchedule('2026-09-01', 1000, 'weekly')
    const { income } = computeMonthlyProjection(makeAccount(0), [], [schedule], [], SEP_9)
    expect(income).toBe(5000) // 5 Tuesdays in Sep 2026
  })
})

describe('computeMonthlyProjection - obligations', () => {
  it('includes recurring obligation with next_occurrence in current month', () => {
    const txn = makeTxn(-800, '2026-09-20T00:00:00Z')
    const { recurringObligations } = computeMonthlyProjection(makeAccount(0), [txn], [], [], SEP_9)
    expect(recurringObligations).toBe(800)
  })

  it('excludes recurring obligation with next_occurrence outside current month', () => {
    const txn = makeTxn(-800, '2026-10-01T00:00:00Z')
    const { recurringObligations } = computeMonthlyProjection(makeAccount(0), [txn], [], [], SEP_9)
    expect(recurringObligations).toBe(0)
  })

  it('includes installment obligation with next_occurrence in current month', () => {
    const txn = makeTxn(-300, '2026-09-25T00:00:00Z', false, true)
    const { installmentObligations } = computeMonthlyProjection(makeAccount(0), [txn], [], [], SEP_9)
    expect(installmentObligations).toBe(300)
  })

  it('includes peer debt with next_payment_date in current month', () => {
    const debt = makeDebt(500, '2026-09-18')
    const { peerObligations } = computeMonthlyProjection(makeAccount(0), [], [], [debt], SEP_9)
    expect(peerObligations).toBe(500)
  })

  it('excludes peer debt with next_payment_date outside current month', () => {
    const debt = makeDebt(500, '2026-10-10')
    const { peerObligations } = computeMonthlyProjection(makeAccount(0), [], [], [debt], SEP_9)
    expect(peerObligations).toBe(0)
  })
})

describe('computeMonthlyProjection - projected balance', () => {
  it('projected end balance = current_balance + income - total obligations', () => {
    const schedule = makeSchedule('2026-09-15', 5000)
    const txn = makeTxn(-1200, '2026-09-20T00:00:00Z')
    const { projectedEndBalance } = computeMonthlyProjection(makeAccount(10000), [txn], [schedule], [], SEP_9)
    // income=5000, obligations=1200, net=3800
    expect(projectedEndBalance).toBe(13800)
  })

  it('returns correct month window boundaries', () => {
    const { monthStart, monthEnd } = computeMonthlyProjection(makeAccount(0), [], [], [], SEP_9)
    expect(monthStart.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(monthEnd.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })
})
