import { nextPaydayAfter } from '@/lib/pay-schedule'
import type { FriendDebtBreakdownItem, PayScheduleResponse, TransactionResponse } from '@/lib/api'

const DAY_MS = 24 * 60 * 60 * 1000

export interface BalancePoint {
  date: Date
  balance: number
}

export interface BalanceSeriesInput {
  startBalance: number
  transactions: TransactionResponse[]
  paySchedules: PayScheduleResponse[]
  friendBreakdown: FriendDebtBreakdownItem[]
  /** Inclusive start, exclusive end: the same window the summary rows use. */
  start: Date
  end: Date
  /** Everyday spending that is not a scheduled obligation, subtracted once per day. */
  dailyBaseline: number
}

function startOfUTCDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

function inRange(occurrence: string, start: Date, end: Date): Date | null {
  const date = new Date(occurrence)
  if (Number.isNaN(date.getTime())) return null
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime() ? date : null
}

/** Average spend per day over the last `days` days, ignoring scheduled obligations (they are modelled separately). */
export function averageDailySpend(transactions: TransactionResponse[], now: Date, days = 30): number {
  const cutoff = now.getTime() - days * DAY_MS
  let total = 0
  for (const t of transactions) {
    if (t.type !== 'personal' || t.is_recurring || t.is_installment || t.amount >= 0) continue
    const at = new Date(t.timestamp).getTime()
    if (Number.isNaN(at) || at < cutoff || at > now.getTime()) continue
    total += -t.amount
  }
  return total / days
}

/**
 * One balance point per day from `start` to `end`, both included. Paydays step the line up,
 * recurring bills, installments and peer payments step it down, and the baseline wears it
 * down a little every day.
 */
export function computeBalanceSeries(input: BalanceSeriesInput): BalancePoint[] {
  const { startBalance, transactions, paySchedules, friendBreakdown, start, end, dailyBaseline } = input
  const firstDay = startOfUTCDay(start)
  const dayCount = Math.max(1, Math.round((startOfUTCDay(end) - firstDay) / DAY_MS))
  const delta = new Array<number>(dayCount + 1).fill(0)

  const add = (date: Date, amount: number) => {
    const index = Math.max(0, Math.floor((startOfUTCDay(date) - firstDay) / DAY_MS))
    if (index <= dayCount) delta[index] += amount
  }

  for (const schedule of paySchedules) {
    let occurrence = nextPaydayAfter(schedule, new Date(start.getTime() - 1))
    let safety = 0
    while (occurrence.getTime() < end.getTime() && safety < 60) {
      add(occurrence, schedule.amount)
      occurrence = nextPaydayAfter(schedule, occurrence)
      safety += 1
    }
  }

  for (const t of transactions) {
    if (t.next_occurrence === null) continue
    const isBill = t.is_recurring && !t.is_installment
    const isInstallment = t.is_installment && t.amount < 0
    if (!isBill && !isInstallment) continue
    const date = inRange(t.next_occurrence, start, end)
    if (date) add(date, -Math.abs(t.amount))
  }

  for (const debt of friendBreakdown) {
    if (debt.next_payment_date === null) continue
    const date = inRange(debt.next_payment_date, start, end)
    if (date) add(date, -debt.next_payment)
  }

  const points: BalancePoint[] = []
  let balance = startBalance
  for (let day = 0; day <= dayCount; day += 1) {
    balance += delta[day]
    if (day > 0) balance -= dailyBaseline
    points.push({ date: new Date(firstDay + day * DAY_MS), balance })
  }
  return points
}
