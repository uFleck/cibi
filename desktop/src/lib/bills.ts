// How recurring bills count in the forecasts. A bill marked uncertain counts nowhere until it is paid or
// the mark is cleared. An as-needed bill (diapers) has no due date: it counts what is left of this
// calendar month's budget, and in later months its budget spread over the days.

import type { TransactionResponse } from '@/lib/api'

type Bill = Pick<TransactionResponse, 'is_recurring' | 'is_uncertain' | 'is_as_needed' | 'amount' | 'month_budget' | 'month_spent'>

/** A recurring bill that counts by its due dates: neither uncertain nor bought as needed. */
export function isScheduledBill(t: Pick<Bill, 'is_recurring' | 'is_uncertain' | 'is_as_needed'>): boolean {
  return t.is_recurring && !t.is_uncertain && !t.is_as_needed
}

function isActiveAsNeeded(t: Bill): boolean {
  return t.is_as_needed === true && !t.is_uncertain
}

/** The month's budget of an as-needed bill, positive. */
export function asNeededBudget(t: Bill): number {
  return Math.abs(t.month_budget ?? t.amount)
}

/** What an as-needed bill was paid this month, positive. */
export function asNeededSpent(t: Bill): number {
  return Math.abs(t.month_spent ?? 0)
}

/** What is left to buy this month, positive; negative once the month is overspent. */
export function asNeededLeft(t: Bill): number {
  return asNeededBudget(t) - asNeededSpent(t)
}

/** What the as-needed bills still need this month. An overspent bill frees nothing: that money is gone. */
export function asNeededReserved(transactions: Bill[]): number {
  return transactions.filter(isActiveAsNeeded).reduce((sum, t) => sum + Math.max(0, asNeededLeft(t)), 0)
}

export function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

/**
 * What the as-needed bills need in [from, end): the rest of this month when the window touches it, plus
 * each later day's share of its month's budget. A window that follows one already holding the rest of
 * this month passes `includeThisMonth` false, so it is not counted twice.
 */
export function asNeededForWindow(
  transactions: Bill[],
  from: Date,
  end: Date,
  now: Date = new Date(),
  includeThisMonth = true,
): number {
  if (end.getTime() <= from.getTime()) return 0
  const bills = transactions.filter(isActiveAsNeeded)
  if (bills.length === 0) return 0
  const nextMonth = startOfNextMonth(now)
  let total = includeThisMonth && from.getTime() < nextMonth.getTime() ? asNeededReserved(bills) : 0
  const budget = bills.reduce((sum, t) => sum + asNeededBudget(t), 0)
  for (const [, share] of laterMonthShares(from, end, nextMonth)) total += budget * share
  return Math.round(total * 100) / 100
}

/**
 * For each day in [max(from, nextMonth), end), the day and its share of its month (1 / days in month).
 * Exported for the balance line, which places each share on its day.
 */
export function laterMonthShares(from: Date, end: Date, nextMonth: Date): [Date, number][] {
  const out: [Date, number][] = []
  const first = from.getTime() > nextMonth.getTime() ? from : nextMonth
  let day = new Date(first.getFullYear(), first.getMonth(), first.getDate())
  for (let i = 0; day.getTime() < end.getTime() && i < 800; i++) {
    const daysInMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
    out.push([day, 1 / daysInMonth])
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  }
  return out
}
