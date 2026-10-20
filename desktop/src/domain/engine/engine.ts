import { addDays, addMonths, DAY_MS, date, daysInMonth, startOfDay } from '../dates'
import { adjustToBusinessDay } from '../holidays/brazil'

// Frequency values match the TEXT enum values in the schema.
export const FREQ_WEEKLY = 'weekly'
export const FREQ_BI_WEEKLY = 'bi-weekly'
export const FREQ_SEMI_MONTHLY = 'semi-monthly'
export const FREQ_MONTHLY = 'monthly'
export const FREQ_YEARLY = 'yearly'

/** Mirrors the PaySchedule row (IDs omitted; pure logic). */
export interface PaySchedule {
  /** "weekly" | "bi-weekly" | "semi-monthly" | "monthly" (anything else is treated as monthly). */
  frequency: string
  /** UTC anchor for the interval calculation. */
  anchorDate: Date
  /** Only for semi-monthly: the second pay day of the month. Null or undefined means none. */
  dayOfMonth2?: number | null
}

function yearOf(t: Date): number {
  return t.getUTCFullYear()
}

/** Month as 1-12, like Go's time.Month. */
function monthOf(t: Date): number {
  return t.getUTCMonth() + 1
}

/**
 * Advances t by n months, clamping to the last valid day of the target month when the
 * day would overflow into the next month.
 *
 * Examples:
 *   - Jan 31 + 1 = Feb 28 (non-leap)  [not Mar 2]
 *   - Jan 31 + 1 = Feb 29 (leap year) [not Mar 1]
 *   - Mar 31 + 1 = Apr 30             [not May 1]
 *   - Dec 31 + 1 = Jan 31             [no overflow]
 */
export function addMonthClamped(t: Date, n: number): Date {
  let result = addMonths(t, n)
  // A changed day means AddDate overflowed into the next month. Step back by that many
  // days to land on the last day of the intended month.
  if (result.getUTCDate() !== t.getUTCDate()) {
    result = addDays(result, -result.getUTCDate())
  }
  return result
}

/**
 * The `from` to pass to nextPayday so a payday dated today still counts as upcoming: the
 * last millisecond before the UTC day containing `now` begins.
 */
export function upcomingPaydayFrom(now: Date): Date {
  return new Date(startOfDay(now).getTime() - 1)
}

/**
 * Returns the next pay date strictly after `from` for the given schedule.
 * All calculations are in UTC.
 */
export function nextPayday(schedule: PaySchedule, from: Date): Date {
  const anchor = schedule.anchorDate

  // The monthly and semi-monthly helpers only use the anchor's day of month. After an
  // anchor is advanced (e.g. Sep 20 -> Oct 20), a Sep query would still return Sep 20.
  // Clamp `from` to anchor-1 so occurrences before the anchor are skipped. JS Dates have
  // millisecond precision, so one millisecond stands in for Go's one nanosecond.
  const ef = anchor.getTime() > from.getTime() ? new Date(anchor.getTime() - 1) : from

  let raw: Date
  switch (schedule.frequency) {
    case FREQ_WEEKLY:
      raw = nextFixedInterval(anchor, from, 7)
      break
    case FREQ_BI_WEEKLY:
      raw = nextFixedInterval(anchor, from, 14)
      break
    case FREQ_MONTHLY:
      raw = nextMonthly(anchor, ef)
      break
    case FREQ_SEMI_MONTHLY: {
      const day2 = schedule.dayOfMonth2 ?? 0
      raw = nextSemiMonthly(anchor.getUTCDate(), day2, ef)
      break
    }
    default:
      // Fallback: treat as monthly.
      raw = nextMonthly(anchor, ef)
  }
  return adjustToBusinessDay(raw)
}

/**
 * Returns the next date strictly after `from` that is exactly intervalDays after the
 * anchor, or a multiple of it.
 */
export function nextFixedInterval(anchor: Date, from: Date, intervalDays: number): Date {
  let next = anchor
  // If from is before the anchor, the anchor itself is the next occurrence.
  if (from.getTime() >= anchor.getTime()) {
    // Whole days elapsed since the anchor (Go: int(Hours()/24), truncated).
    const diffDays = Math.trunc((from.getTime() - anchor.getTime()) / DAY_MS)
    const elapsed = Math.trunc(diffDays / intervalDays)
    // Start at elapsed+1 to get strictly after from.
    next = addDays(anchor, (elapsed + 1) * intervalDays)
  }
  // Safety: make sure the result is strictly after from (handles the boundary exactly).
  while (next.getTime() <= from.getTime()) {
    next = addDays(next, intervalDays)
  }
  return next
}

/**
 * Returns the next monthly pay date strictly after `from`, using the anchor's day of
 * month and clamping to month-end.
 */
export function nextMonthly(anchor: Date, from: Date): Date {
  const anchorDay = anchor.getUTCDate()
  let candidate = clampedDayInMonth(yearOf(from), monthOf(from), anchorDay)
  // Advance one month at a time until strictly after `from`.
  while (candidate.getTime() <= from.getTime()) {
    let nextYear = yearOf(candidate)
    let nextMonth = monthOf(candidate) + 1
    if (nextMonth > 12) {
      nextMonth = 1
      nextYear++
    }
    candidate = clampedDayInMonth(nextYear, nextMonth, anchorDay)
  }
  return candidate
}

/**
 * Returns the next semi-monthly pay date strictly after `from`: the earlier of the next
 * occurrence of day1 and of day2. A day2 <= 0 means there is no second day.
 */
export function nextSemiMonthly(day1: number, day2: number, from: Date): Date {
  const next1 = nextDayOfMonth(day1, from)
  if (day2 <= 0) {
    return next1
  }
  const next2 = nextDayOfMonth(day2, from)
  return next1.getTime() < next2.getTime() ? next1 : next2
}

/**
 * Returns the next occurrence of dayNum (1-31) strictly after `from`, clamped to the
 * last valid day of each candidate month.
 */
export function nextDayOfMonth(dayNum: number, from: Date): Date {
  // Try this month first.
  const candidate = clampedDayInMonth(yearOf(from), monthOf(from), dayNum)
  if (candidate.getTime() > from.getTime()) {
    return candidate
  }
  // Otherwise try next month.
  let nextMonth = monthOf(from) + 1
  let nextYear = yearOf(from)
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear++
  }
  return clampedDayInMonth(nextYear, nextMonth, dayNum)
}

/** UTC midnight of year/month/day, with day clamped to the last day of the month (month is 1-12). */
export function clampedDayInMonth(year: number, month: number, day: number): Date {
  const lastDay = daysInMonth(year, month)
  return date(year, month, day > lastDay ? lastDay : day)
}
