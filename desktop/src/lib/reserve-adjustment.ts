import type { ReserveResponse } from '@/lib/api'

const DAY_MS = 24 * 60 * 60 * 1000

/** Paydays are at least a week apart, and the server moves one to a business day by up to 3 days, so 4 days matches one and only one. */
const MATCH_DAYS = 4

/**
 * What the reserve takes out of the money a projection treats as spendable: what it holds now, and
 * what it will take from each coming paycheck. Null while the reserve is off.
 */
export interface ReserveAdjustment {
  /** Dollars the reserve holds now. */
  balance: number
  /** Dollars the reserve takes from the paycheck of `scheduleId` paid on `payday`. */
  contributionAt(scheduleId: string, payday: Date): number
}

export function reserveAdjustment(reserve: ReserveResponse | undefined): ReserveAdjustment | null {
  if (!reserve?.enabled) return null
  const contributions = reserve.upcoming_contributions.map(c => ({
    scheduleId: c.schedule_id,
    time: Date.parse(`${c.payday}T00:00:00Z`),
    amount: c.amount,
  }))
  return {
    balance: reserve.balance,
    contributionAt(scheduleId, payday) {
      const match = contributions.find(
        c => c.scheduleId === scheduleId && Math.abs(c.time - payday.getTime()) <= MATCH_DAYS * DAY_MS,
      )
      return match?.amount ?? 0
    },
  }
}
