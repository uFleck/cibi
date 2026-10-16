import { describe, expect, it } from 'vitest'
import type { PayScheduleResponse, TransactionResponse } from '@/lib/api'
import { matchesPresetFilter } from '@/lib/transactions-impact'

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
  type: 'personal',
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
  is_installment: false,
  total_installments: null,
  paid_installments: 0,
  ...overrides,
})

describe('transactions impact', () => {
  it('includes overdue unpaid one-time pending payments in current window', () => {
    expect(matchesPresetFilter({
      txn: txn({ timestamp: '2026-01-10T00:00:00Z' }),
      preset: 'current-window',
      now: new Date('2026-04-15T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('installment with next_occurrence in current window matches current-window preset', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-15T00:00:00Z',
        anchor_date: '2026-03-15T00:00:00Z',
        frequency: 'monthly',
      }),
      preset: 'current-window',
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('installment with next_occurrence in current window matches due-now preset', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-15T00:00:00Z',
        anchor_date: '2026-03-15T00:00:00Z',
        frequency: 'monthly',
      }),
      preset: 'due-now',
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('installment is excluded from one-time-only preset', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-15T00:00:00Z',
      }),
      preset: 'one-time-only',
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(false)
  })

  it('installment with next_occurrence in next window matches next-window preset', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-22T00:00:00Z',
        anchor_date: '2026-03-22T00:00:00Z',
        frequency: 'monthly',
      }),
      preset: 'next-window',
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('null preset returns recurring transactions', () => {
    expect(matchesPresetFilter({
      txn: txn({ is_recurring: true, requires_confirmation: false }),
      preset: null,
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('null preset returns in-progress installment transactions', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-22T00:00:00Z',
      }),
      preset: null,
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('null preset includes pending one-time transactions', () => {
    expect(matchesPresetFilter({
      txn: txn({ is_recurring: false, is_installment: false, requires_confirmation: true, confirmed_at: null }),
      preset: null,
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('null preset excludes confirmed one-time transactions', () => {
    expect(matchesPresetFilter({
      txn: txn({ is_recurring: false, is_installment: false, requires_confirmation: true, confirmed_at: '2026-04-09T00:00:00Z' }),
      preset: null,
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(false)
  })

  it('null preset excludes non-pending one-time transactions', () => {
    expect(matchesPresetFilter({
      txn: txn({ is_recurring: false, is_installment: false, requires_confirmation: false }),
      preset: null,
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(false)
  })
})
