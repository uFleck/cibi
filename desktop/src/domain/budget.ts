// Monthly budget: the response shapes and the pure rules. Money is integer cents; every amount in
// a budget response is a positive magnitude (an outflow), never a signed ledger value.
//
// Month: 'YYYY-MM'. Spend is grouped by the local calendar month of the payment instant. A scheduled
// bill is grouped by the calendar day its next_occurrence was entered as (UTC), because due dates are
// stored as UTC midnight (see dates.ts). Pace is the day of the month over the days in the month.

import type { CategoryOption } from './categories'
import { daysInMonth } from './dates'

/** Shown for spend and bills with no category. */
export const UNCATEGORIZED = 'Uncategorized'

/** A category is "ahead" when spent / limit is more than pace plus this margin (non-fixed only). */
export const AHEAD_MARGIN = 0.12

export type BudgetStatus = 'ok' | 'ahead' | 'over'

/** One row of the budget_limits set: the limit for a category (all accounts, one per category). */
export interface BudgetLimit {
  category: string
  /** Cents, integer, >= 0. */
  monthlyLimit: number
  /** Fixed bills warn only when over the limit, never for pace. */
  isFixed: boolean
}

export interface BudgetRow {
  category: string
  /** Null when the category has no limit. */
  limit: number | null
  isFixed: boolean
  /** Cents, positive: paid out this month. */
  spent: number
  /** Cents, positive: scheduled and not excluded this month. */
  scheduled: number
  /** Null when there is no limit. */
  status: BudgetStatus | null
}

export interface ScheduledBill {
  transactionId: string
  description: string
  /** The normalized category, or null when none. */
  category: string | null
  /** Cents, positive. */
  amount: number
  /** YYYY-MM-DD, the calendar day of the next occurrence. */
  dueDate: string
  /** Excluded for this month only. Excluded bills are not in scheduled totals. */
  excluded: boolean
}

export interface BudgetPace {
  day: number
  daysInMonth: number
  /** day / daysInMonth for the current month; 1 for a past month; 0 for a future month. */
  ratio: number
}

export interface BudgetTotals {
  /** Sum of the limits. */
  limit: number
  spent: number
  /** Sum of the scheduled bills that are not excluded. */
  scheduled: number
  /** limit - spent - scheduled (may be negative). */
  left: number
}

export interface BudgetResponse {
  /** YYYY-MM */
  month: string
  totals: BudgetTotals
  pace: BudgetPace
  rows: BudgetRow[]
  bills: ScheduledBill[]
  /** Editor options: the defaults, then the custom categories in use or budgeted. */
  categories: CategoryOption[]
}

/** True for a 'YYYY-MM' month with a month of 01-12. */
export function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** The 'YYYY-MM' month of an instant, in local time. */
export function localMonth(date: Date): string {
  return monthKey(date.getFullYear(), date.getMonth() + 1)
}

/** The 'YYYY-MM' month of an instant, in UTC. Due dates are grouped by this (see the header). */
export function utcMonth(date: Date): string {
  return monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1)
}

function monthKey(year: number, month1: number): string {
  return `${String(year).padStart(4, '0')}-${String(month1).padStart(2, '0')}`
}

/** Where a month sits against the current local month: the pace of the month, see BudgetPace. */
export function paceFor(month: string, now: Date): BudgetPace {
  const current = localMonth(now)
  const year = Number(month.slice(0, 4))
  const month1 = Number(month.slice(5, 7))
  const total = daysInMonth(year, month1)
  if (month < current) return { day: total, daysInMonth: total, ratio: 1 }
  if (month > current) return { day: 0, daysInMonth: total, ratio: 0 }
  const day = now.getDate()
  return { day, daysInMonth: total, ratio: day / total }
}

/**
 * The status of a row. Null without a limit. A zero limit is over as soon as anything is spent or
 * scheduled. "ahead" is for non-fixed categories only: fixed bills warn only when over the limit.
 */
export function statusFor(input: {
  limit: number | null
  isFixed: boolean
  spent: number
  scheduled: number
  ratio: number
}): BudgetStatus | null {
  const { limit, isFixed, spent, scheduled, ratio } = input
  if (limit === null) return null
  const outflow = spent + scheduled
  if (limit === 0) return outflow > 0 ? 'over' : 'ok'
  if (outflow > limit) return 'over'
  if (!isFixed && spent / limit > ratio + AHEAD_MARGIN) return 'ahead'
  return 'ok'
}

/** The first problem with a set of limits, as the message to show; null when they are all valid. */
export function validateLimits(limits: BudgetLimit[]): string | null {
  const seen = new Set<string>()
  for (const limit of limits) {
    const category = limit.category.trim()
    if (category === '') return 'category is required'
    if (!Number.isSafeInteger(limit.monthlyLimit) || limit.monthlyLimit < 0) {
      return 'monthlyLimit must be a non-negative integer (cents)'
    }
    if (typeof limit.isFixed !== 'boolean') return 'isFixed must be a boolean'
    if (seen.has(category)) return `duplicate category: ${category}`
    seen.add(category)
  }
  return null
}
