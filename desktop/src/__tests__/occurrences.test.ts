import { describe, expect, it } from 'vitest'
import { computeBalanceSeries } from '@/lib/balance-series'
import { computeMonthlyProjection } from '@/lib/monthly-projection'
import { countInCurrentPayWindow, countOccurrences, occurrenceDates } from '@/lib/occurrences'
import type { AccountResponse, TransactionResponse } from '@/lib/api'

const weekly = { next_occurrence: '2026-10-05T00:00:00Z', frequency: 'weekly' }

const day = (d: Date) => d.toISOString().slice(0, 10)

describe('occurrenceDates', () => {
  it('lists every occurrence before the end, from the next one on', () => {
    const dates = occurrenceDates(weekly, new Date('2026-10-20T00:00:00Z')).map(day)
    expect(dates).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
  })

  it('leaves out occurrences before the start, but keeps counting through them', () => {
    const dates = occurrenceDates(weekly, new Date('2026-10-27T00:00:00Z'), new Date('2026-10-13T00:00:00Z')).map(day)
    expect(dates).toEqual(['2026-10-19', '2026-10-26'])
  })

  it('does not include an occurrence on the end day', () => {
    expect(countOccurrences(weekly, new Date('2026-10-12T00:00:00Z'))).toBe(1)
  })

  it('advances by each frequency, clamping a monthly bill to the end of a short month', () => {
    const to = new Date('2027-03-01T00:00:00Z')
    expect(countOccurrences({ next_occurrence: '2026-10-01T00:00:00Z', frequency: 'bi-weekly' }, new Date('2026-11-01T00:00:00Z'))).toBe(3)
    expect(occurrenceDates({ next_occurrence: '2026-12-31T00:00:00Z', frequency: 'monthly' }, to).map(day)).toEqual([
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
    ])
    expect(occurrenceDates({ next_occurrence: '2026-03-01T00:00:00Z', frequency: 'yearly' }, new Date('2028-12-01T00:00:00Z')).map(day)).toEqual([
      '2026-03-01',
      '2027-03-01',
      '2028-03-01',
    ])
  })

  it('counts a bill that does not repeat once, and one with no date never', () => {
    expect(countOccurrences({ next_occurrence: '2026-10-05T00:00:00Z', frequency: null }, new Date('2026-12-01T00:00:00Z'))).toBe(1)
    expect(countOccurrences({ next_occurrence: null, frequency: 'weekly' }, new Date('2026-12-01T00:00:00Z'))).toBe(0)
  })
})

describe('countInCurrentPayWindow', () => {
  it('counts an overdue bill and every repeat before the payday', () => {
    // Due on Oct 5 and overdue, then Oct 12, Oct 19: payday is Oct 20.
    expect(countInCurrentPayWindow(weekly, '2026-10-20')).toBe(3)
    expect(countInCurrentPayWindow(weekly, '2026-10-05')).toBe(0)
  })

  it('counts a bill once when there is no payday to measure against', () => {
    expect(countInCurrentPayWindow(weekly, null)).toBe(1)
  })
})

describe('projections count a weekly bill for every occurrence', () => {
  const bill: TransactionResponse = {
    id: 't1', account_id: 'a1', type: 'personal', title: 'Market', description: null, links: [], amount: -100, category: '',
    timestamp: '', is_recurring: true, is_installment: false, next_occurrence: '2026-10-05T00:00:00Z',
    requires_confirmation: false, confirmed_at: null, frequency: 'weekly', anchor_date: null,
    total_installments: null, paid_installments: 0,
  }

  it('steps the balance line down on each weekly occurrence', () => {
    const points = computeBalanceSeries({
      startBalance: 1000, transactions: [bill], paySchedules: [], friendBreakdown: [],
      start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-20T00:00:00Z'), dailyBaseline: 0,
    })
    // Oct 5, 12 and 19
    expect(points.at(-1)?.balance).toBe(700)
  })

  it('counts the estimate, not the stored amount, of a variable bill', () => {
    const points = computeBalanceSeries({
      startBalance: 1000, transactions: [{ ...bill, estimated_amount: -250 }], paySchedules: [], friendBreakdown: [],
      start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-10T00:00:00Z'), dailyBaseline: 0,
    })
    expect(points.at(-1)?.balance).toBe(750)
  })

  it('counts every occurrence in the month', () => {
    const account: AccountResponse = { id: 'a1', name: 'Test', current_balance: 1000, currency: 'BRL', safety_buffer: 0 }
    const projection = computeMonthlyProjection(account, [bill], [], [], new Date('2026-10-09T12:00:00Z'))
    // Oct 5, 12, 19 and 26
    expect(projection.recurringObligations).toBe(400)
  })
})
