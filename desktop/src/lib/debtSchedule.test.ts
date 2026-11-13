import { describe, expect, it } from 'vitest'
import type { LedgerEntryResponse, PeerDebtResponse } from '@/lib/api'
import {
  buildDebtSchedule,
  debtHistory,
  nextDueDate,
  summarizeDebt,
} from './debtSchedule'

function debt(overrides: Partial<PeerDebtResponse> = {}): PeerDebtResponse {
  return {
    id: 'debt-1',
    account_id: 'account',
    friend_id: 'friend',
    amount: -10,
    title: 'Lava e Seca',
    date: '2020-01-10',
    is_installment: true,
    total_installments: 4,
    paid_installments: 0,
    frequency: 'monthly',
    anchor_date: '2020-01-10T00:00:00Z',
    next_occurrence: null,
    is_confirmed: false,
    ...overrides,
  }
}

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: crypto.randomUUID(),
    account_id: 'account',
    transaction_id: 'debt-1',
    pay_schedule_id: null,
    entry_type: 'payment',
    amount: -2.5,
    description: 'Lava e Seca',
    posted_at: '2020-01-10T12:00:00Z',
    occurrence_date: '2020-01-10T00:00:00Z',
    reverses_entry_id: null,
    reversed_by_id: null,
    ...overrides,
  }
}

describe('buildDebtSchedule', () => {
  it('lays the paid installments on the anchor and the next ones after the paid count', () => {
    const schedule = buildDebtSchedule(debt({ paid_installments: 2 }))
    expect(schedule.map(item => item.dueDate)).toEqual([
      '2020-01-10',
      '2020-02-10',
      '2020-03-10',
      '2020-04-10',
    ])
    expect(schedule.map(item => item.status)).toEqual(['paid', 'paid', 'next', 'upcoming'])
    expect(schedule.every(item => item.amount === 250)).toBe(true)
  })

  it('puts the cents left over on the last installment', () => {
    const schedule = buildDebtSchedule(debt({ amount: -0.1, total_installments: 3 }))
    expect(schedule.map(item => item.amount)).toEqual([3, 3, 4])
  })

  it('uses a hand-edited next date and moves the later ones from it', () => {
    const schedule = buildDebtSchedule(
      debt({ paid_installments: 1, next_occurrence: '2020-03-20T00:00:00Z' }),
    )
    expect(schedule.map(item => item.dueDate)).toEqual([
      '2020-01-10',
      '2020-03-20',
      '2020-04-20',
      '2020-05-20',
    ])
    expect(nextDueDate(debt({ paid_installments: 1, next_occurrence: '2020-03-20T00:00:00Z' }))).toBe('2020-03-20')
  })

  it('gives a paid installment the date and time of its ledger row, ignoring reversed rows', () => {
    const paidEntry = entry({ occurrence_date: '2020-01-10T00:00:00Z' })
    const reversed = entry({
      occurrence_date: '2020-02-10T00:00:00Z',
      reversed_by_id: 'reversal',
    })
    const schedule = buildDebtSchedule(
      debt({ paid_installments: 1 }),
      [paidEntry, reversed],
    )
    expect(schedule[0]?.paidAt).toBe('2020-01-10T12:00:00Z')
    expect(schedule[0]?.entryId).toBe(paidEntry.id)
    expect(schedule[0]?.legacy).toBe(false)
    expect(schedule[1]?.status).toBe('next')
  })

  it('keeps the real due date of a payment made after the next date was moved', () => {
    const first = entry({ id: 'first', occurrence_date: '2020-01-10T00:00:00Z' })
    const moved = entry({
      id: 'moved',
      occurrence_date: '2020-03-20T00:00:00Z',
      posted_at: '2020-03-20T12:00:00Z',
    })
    const schedule = buildDebtSchedule(
      debt({
        paid_installments: 2,
        next_occurrence: '2020-04-20T00:00:00Z',
      }),
      [moved, first],
    )
    expect(schedule[1]?.dueDate).toBe('2020-03-20')
    expect(schedule[1]?.paidAt).toBe('2020-03-20T12:00:00Z')
    expect(schedule[2]?.dueDate).toBe('2020-04-20')
  })

  it('handles a lump sum as one installment', () => {
    const open = summarizeDebt(debt({ is_installment: false, total_installments: null, anchor_date: null }))
    expect(open.schedule).toHaveLength(1)
    expect(open.next?.amount).toBe(1000)
    expect(open.remaining).toBe(1000)

    const paid = summarizeDebt(
      debt({ is_installment: false, total_installments: null, anchor_date: null, is_confirmed: true }),
    )
    expect(paid.next).toBeNull()
    expect(paid.remaining).toBe(0)
    expect(paid.isActive).toBe(false)
  })

  it('summarizes the paid and remaining amounts', () => {
    const summary = summarizeDebt(debt({ paid_installments: 1 }))
    expect(summary.paid).toBe(250)
    expect(summary.remaining).toBe(750)
    expect(summary.paidCount).toBe(1)
    expect(summary.totalCount).toBe(4)
    expect(summary.next?.number).toBe(2)
  })
})

describe('debtHistory', () => {
  it('keeps payments and reversals, newest first', () => {
    const payment = entry({ id: 'payment', posted_at: '2020-01-10T12:00:00Z' })
    const reversal = entry({
      id: 'reversal',
      entry_type: 'manual_adjustment',
      amount: 2.5,
      posted_at: '2020-01-11T12:00:00Z',
      reverses_entry_id: 'payment',
      occurrence_date: null,
    })
    const rows = debtHistory('debt-1', [payment, reversal])
    expect(rows.map(row => row.id)).toEqual(['reversal', 'payment'])
    expect(rows[0]?.kind).toBe('reversal')
    expect(rows[1]?.kind).toBe('payment')
  })
})
