import { describe, expect, it } from 'vitest'
import { computeBalanceSeries } from '@/lib/balance-series'
import { computeCustomProjection } from '@/lib/monthly-projection'
import { reserveAdjustment, type ReserveAdjustment } from '@/lib/reserve-adjustment'
import type { AccountResponse, PayScheduleResponse, ReserveResponse } from '@/lib/api'

const ACCOUNT: AccountResponse = { id: 'a1', name: 'Test', current_balance: 10000, currency: 'BRL', safety_buffer: 0 }

const SCHEDULE: PayScheduleResponse = {
  id: 's1', account_id: 'a1', anchor_date: '2026-10-20', frequency: 'monthly', amount: 5000,
  next_payday: '2026-10-20', day_of_month_2: null, label: null,
}

/** A reserve holding 400 that takes 250 from every paycheck. */
const RESERVE: ReserveAdjustment = { balance: 400, contributionAt: () => 250 }

function reserveResponse(over: Partial<ReserveResponse> = {}): ReserveResponse {
  return {
    enabled: true, target_months: 1, start_amount: 50, step_amount: 0, cap_percent: 5,
    balance: 400, target: 3000, monthly_obligations: 3000, months_covered: 0.1, progress: 0.1,
    next_contribution: null, eta: null, pending_transfers: [], entries: [],
    upcoming_contributions: [
      { schedule_id: 's1', payday: '2026-12-04', amount: 250 },
      { schedule_id: 's2', payday: '2026-12-04', amount: 80 },
    ],
    ...over,
  }
}

describe('reserveAdjustment', () => {
  it('is null while the reserve is off or not loaded', () => {
    expect(reserveAdjustment(undefined)).toBeNull()
    expect(reserveAdjustment(reserveResponse({ enabled: false }))).toBeNull()
  })

  it('finds the contribution of a schedule on a payday, even when the date was moved to a business day', () => {
    const adjustment = reserveAdjustment(reserveResponse())
    expect(adjustment?.balance).toBe(400)
    expect(adjustment?.contributionAt('s1', new Date('2026-12-04T00:00:00Z'))).toBe(250)
    expect(adjustment?.contributionAt('s1', new Date('2026-12-05T00:00:00Z'))).toBe(250)
    expect(adjustment?.contributionAt('s2', new Date('2026-12-04T00:00:00Z'))).toBe(80)
  })

  it('is zero for another schedule, another month or a payday past the listed ones', () => {
    const adjustment = reserveAdjustment(reserveResponse())
    expect(adjustment?.contributionAt('s3', new Date('2026-12-04T00:00:00Z'))).toBe(0)
    expect(adjustment?.contributionAt('s1', new Date('2027-01-05T00:00:00Z'))).toBe(0)
  })
})

describe('computeBalanceSeries with a reserve', () => {
  const input = {
    startBalance: 1000, transactions: [], paySchedules: [SCHEDULE], friendBreakdown: [],
    start: new Date('2026-10-10T00:00:00Z'), end: new Date('2026-10-31T00:00:00Z'), dailyBaseline: 0,
  }

  it('adds only what is left of a paycheck after the reserve takes its share', () => {
    const without = computeBalanceSeries(input)
    const withReserve = computeBalanceSeries({ ...input, reserve: RESERVE })
    expect(without.at(-1)?.balance).toBe(6000)
    expect(withReserve.at(-1)?.balance).toBe(5750)
  })

  it('is unchanged when the reserve is off', () => {
    expect(computeBalanceSeries({ ...input, reserve: null })).toEqual(computeBalanceSeries(input))
  })
})

describe('computeCustomProjection with a reserve', () => {
  const schedule = { ...SCHEDULE, anchor_date: '2027-01-20', next_payday: '2027-01-20' }
  const run = (reserve: ReserveAdjustment | null, excludeBalance = false) =>
    computeCustomProjection(
      ACCOUNT, [], [schedule], [], new Date('2027-01-01T00:00:00Z'), new Date('2027-03-31T00:00:00Z'), excludeBalance, reserve,
    )

  it('leaves the reserve out of the start and takes its share from every paycheck', () => {
    const plain = run(null)
    expect(plain.income).toBe(15000)
    expect(plain.reserveContribution).toBe(0)
    expect(plain.projectedEndBalance).toBe(25000)

    const withReserve = run(RESERVE)
    expect(withReserve.income).toBe(15000)
    expect(withReserve.reserveContribution).toBe(750)
    // 10000 balance - 400 reserve + 15000 income - 750 set aside
    expect(withReserve.projectedEndBalance).toBe(23850)
  })

  it('does not take the reserve off a start balance that is excluded', () => {
    expect(run(RESERVE, true).projectedEndBalance).toBe(14250)
  })
})
