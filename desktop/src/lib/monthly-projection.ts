import { nextPaydayAfter } from '@/lib/pay-schedule'
import type { AccountResponse, FriendDebtBreakdownItem, PayScheduleResponse, TransactionResponse } from '@/lib/api'

export interface MonthlyProjection {
  monthStart: Date
  monthEnd: Date
  income: number
  recurringObligations: number
  installmentObligations: number
  peerObligations: number
  totalObligations: number
  net: number
  projectedEndBalance: number
}

function isInMonth(occurrence: string, monthStart: Date, monthEnd: Date): boolean {
  const date = new Date(occurrence)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() >= monthStart.getTime() && date.getTime() < monthEnd.getTime()
}

export function computeMonthlyProjection(
  account: AccountResponse,
  transactions: TransactionResponse[],
  paySchedules: PayScheduleResponse[],
  friendBreakdown: FriendDebtBreakdownItem[],
  now: Date,
): MonthlyProjection {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  let income = 0
  for (const schedule of paySchedules) {
    let occurrence = nextPaydayAfter(schedule, new Date(monthStart.getTime() - 1))
    let safety = 0
    while (occurrence.getTime() < monthEnd.getTime() && safety < 52) {
      if (occurrence.getTime() >= monthStart.getTime()) income += schedule.amount
      occurrence = nextPaydayAfter(schedule, occurrence)
      safety += 1
    }
  }

  const recurringObligations = transactions
    .filter(t => t.is_recurring && !t.is_installment && t.next_occurrence !== null
      && isInMonth(t.next_occurrence, monthStart, monthEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const installmentObligations = transactions
    .filter(t => t.is_installment && t.next_occurrence !== null && t.amount < 0
      && isInMonth(t.next_occurrence, monthStart, monthEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const peerObligations = friendBreakdown
    .filter(d => d.next_payment_date !== null && isInMonth(d.next_payment_date, monthStart, monthEnd))
    .reduce((sum, d) => sum + d.next_payment, 0)

  const totalObligations = recurringObligations + installmentObligations + peerObligations
  const net = income - totalObligations
  const projectedEndBalance = account.current_balance + net

  return { monthStart, monthEnd, income, recurringObligations, installmentObligations, peerObligations, totalObligations, net, projectedEndBalance }
}

export interface CustomProjection {
  windowStart: Date
  windowEnd: Date
  income: number
  obligations: number
  net: number
  projectedEndBalance: number
}

export function computeCustomProjection(
  account: AccountResponse,
  transactions: TransactionResponse[],
  paySchedules: PayScheduleResponse[],
  friendBreakdown: FriendDebtBreakdownItem[],
  windowStart: Date,
  windowEnd: Date,
  excludeBalance: boolean,
): CustomProjection {
  const now = new Date()

  const incomeStart = now > windowStart ? now : windowStart
  let income = 0
  for (const schedule of paySchedules) {
    let occurrence = nextPaydayAfter(schedule, new Date(incomeStart.getTime() - 1))
    let safety = 0
    while (occurrence.getTime() < windowEnd.getTime() && safety < 52) {
      if (occurrence.getTime() >= incomeStart.getTime()) income += schedule.amount
      occurrence = nextPaydayAfter(schedule, occurrence)
      safety++
    }
  }

  const obStart = now > windowStart ? now : windowStart
  const recurringObligations = transactions
    .filter(t => t.is_recurring && !t.is_installment && t.next_occurrence !== null
      && isInMonth(t.next_occurrence, obStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const installmentObligations = transactions
    .filter(t => t.is_installment && t.next_occurrence !== null && t.amount < 0
      && isInMonth(t.next_occurrence, obStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const peerObligations = friendBreakdown
    .filter(d => d.next_payment_date !== null && isInMonth(d.next_payment_date, obStart, windowEnd))
    .reduce((sum, d) => sum + d.next_payment, 0)

  const obligations = recurringObligations + installmentObligations + peerObligations
  const net = income - obligations
  const startBalance = excludeBalance ? 0 : account.current_balance
  const projectedEndBalance = startBalance + net

  return { windowStart, windowEnd, income, obligations, net, projectedEndBalance }
}
