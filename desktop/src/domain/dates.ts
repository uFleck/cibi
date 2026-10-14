// Calendar helpers for the domain layer.
//
// Instants are JS Dates. All arithmetic is done in UTC (getUTC*, setUTC*) because
// the Go server ran in a UTC container. UTC like the Go server: users outside UTC
// get the same calendar boundaries the Go server gave, which is a known limitation.

export const DAY_MS = 86_400_000

/** Like Go's time.Date(y, m, d, 0, 0, 0, 0, UTC): m is 1-12, out-of-range values normalize. */
export function date(year: number, month: number, day: number): Date {
  // new Date(0) is midnight UTC; setUTCFullYear (unlike Date.UTC) does not map years 0-99 to 1900+.
  const t = new Date(0)
  t.setUTCFullYear(year, month - 1, day)
  return t
}

/** Like Go's t.AddDate(0, 0, days). */
export function addDays(t: Date, days: number): Date {
  const result = new Date(t.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

/**
 * Like Go's t.AddDate(0, months, 0): the month is advanced first and an overflowing
 * day rolls into the next month (Jan 31 + 1 = Mar 3, or Mar 2 in a leap year).
 */
export function addMonths(t: Date, months: number): Date {
  const result = new Date(t.getTime())
  result.setUTCMonth(result.getUTCMonth() + months)
  return result
}

/** True when a and b fall on the same UTC calendar day. */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/** 0 = Sunday ... 6 = Saturday, like Go's time.Weekday. */
export function weekday(t: Date): number {
  return t.getUTCDay()
}

/** Number of days in the month; month is 1-12. */
export function daysInMonth(year: number, month: number): number {
  const t = new Date(0)
  // Day 0 of the following month (its 0-based index equals the 1-based `month`) is the last day of `month`.
  t.setUTCFullYear(year, month, 0)
  return t.getUTCDate()
}

/** UTC midnight of the UTC calendar day containing t. */
export function startOfDay(t: Date): Date {
  return date(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** Formats the UTC calendar day as YYYY-MM-DD. */
export function formatYmd(t: Date): string {
  const y = String(t.getUTCFullYear()).padStart(4, '0')
  const m = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d = String(t.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
