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

/** Go's zero time.Time (0001-01-01T00:00:00Z) as an instant. */
export const GO_ZERO_TIME_MS = date(1, 1, 1).getTime()

/** Go's t.IsZero(): true only for the zero time (0001-01-01T00:00:00Z). */
export function isZeroTime(t: Date): boolean {
  return t.getTime() === GO_ZERO_TIME_MS
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

// Time columns. Go writes a time with t.UTC().Format(time.RFC3339) (whole seconds, "Z" suffix)
// and reads it back by trying, in order: RFC3339 (any fraction, any ±hh:mm offset), then
// "2006-01-02 15:04:05" (UTC), then "2006-01-02" (UTC midnight). The real database holds the
// first two forms (ledger.posted_at), e.g. "2026-09-12T02:26:36Z" and "2026-09-11 20:01:19".

const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const SPACE_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Go t.UTC().Format(time.RFC3339): whole seconds, always "Z". Fractions are truncated, as Go does. */
export function formatDbTime(t: Date): string {
  return `${t.toISOString().slice(0, 19)}Z`
}

/**
 * Go's time.Parse(time.RFC3339, s): a strict RFC3339 instant (an optional fraction and a "Z" or
 * ±hh:mm offset). Throws for anything else, including the other two forms parseDbTime accepts.
 */
export function parseRfc3339(s: string): Date {
  const rfc = RFC3339_RE.exec(s)
  if (!rfc) throw new Error(`parsing time "${s}" as "2006-01-02T15:04:05Z07:00": cannot parse`)
  const [, y, mo, d, h, mi, sec, frac, zone] = rfc
  const instant = build(y, mo, d, h, mi, sec, frac)
  if (zone === 'Z') return instant
  const sign = zone.startsWith('-') ? -1 : 1
  const offHours = Number(zone.slice(1, 3))
  const offMinutes = Number(zone.slice(4, 6))
  if (offHours > 23 || offMinutes > 59) throw new Error(`parsing time "${s}": invalid time zone offset`)
  return new Date(instant.getTime() - sign * (offHours * 60 + offMinutes) * 60_000)
}

/**
 * Go's parseLedgerTime: RFC3339, then "2006-01-02 15:04:05", then "2006-01-02".
 * Throws for anything else, and for out-of-range fields (Go rejects Feb 30, hour 24, etc.).
 */
export function parseDbTime(s: string): Date {
  if (RFC3339_RE.test(s)) return parseRfc3339(s)
  const space = SPACE_RE.exec(s)
  if (space) {
    const [, y, mo, d, h, mi, sec] = space
    return build(y, mo, d, h, mi, sec)
  }
  const day = DATE_RE.exec(s)
  if (day) {
    const [, y, mo, d] = day
    return build(y, mo, d, '0', '0', '0')
  }
  throw new Error(`parsing time "${s}" as "2006-01-02T15:04:05Z07:00": cannot parse`)
}

/**
 * Go's time.Parse("2006-01-02", s) (UTC): exactly YYYY-MM-DD, fixed widths, and an
 * out-of-range month or day (Feb 30, 2026-02-29) is an error. Throws otherwise.
 */
export function parseYmd(s: string): Date {
  const day = DATE_RE.exec(s)
  if (!day) throw new Error(`parsing time "${s}" as "2006-01-02": cannot parse`)
  const [, y, mo, d] = day
  return build(y, mo, d, '0', '0', '0')
}

function build(
  y: string,
  mo: string,
  d: string,
  h: string,
  mi: string,
  sec: string,
  frac?: string,
): Date {
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  const hour = Number(h)
  const minute = Number(mi)
  const second = Number(sec)
  if (month < 1 || month > 12) throw new Error('month out of range')
  if (day < 1 || day > daysInMonth(year, month)) throw new Error('day out of range')
  if (hour > 23) throw new Error('hour out of range')
  if (minute > 59) throw new Error('minute out of range')
  if (second > 59) throw new Error('second out of range')
  const t = date(year, month, day)
  // The first three fraction digits are the milliseconds; the rest are below what a Date holds.
  const millis = frac === undefined ? 0 : Number(`${frac.slice(1)}000`.slice(0, 3))
  t.setUTCHours(hour, minute, second, millis)
  return t
}

/**
 * Go's time.Time JSON form: RFC3339Nano with trailing zeros trimmed, e.g.
 * 2026-01-02T03:04:05.5Z (no fraction at all when the milliseconds are 0).
 * JS Dates carry milliseconds only, so the fraction has at most three digits.
 */
export function formatApiTime(t: Date): string {
  const iso = t.toISOString() // YYYY-MM-DDTHH:MM:SS.mmmZ
  const base = iso.slice(0, 19)
  const fraction = iso.slice(20, 23).replace(/0+$/, '')
  return fraction === '' ? `${base}Z` : `${base}.${fraction}Z`
}

/**
 * Go's time.Parse(time.RFC3339, s), then time.Parse("2006-01-02", s) when that fails. Both are UTC.
 * This is the date form of peer debts and group events (parsePeerDebtDate, parseGroupEventDate,
 * and the anchor/date fallback of buildFriendDebtItems). Throws when neither form parses.
 * The real rows hold both: timestamp is "2026-06-10" and anchor_date is "2026-10-10T00:00:00Z".
 */
export function parseRfc3339OrYmd(s: string): Date {
  try {
    return parseRfc3339(s)
  } catch {
    return parseYmd(s)
  }
}
