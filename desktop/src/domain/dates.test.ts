import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  daysInMonth,
  date,
  formatApiTime,
  formatDbTime,
  formatYmd,
  parseDbTime,
  parseRfc3339,
  parseYmd,
  sameDay,
  startOfDay,
  weekday,
} from './dates'

describe('addMonths (Go AddDate(0, n, 0) normalization)', () => {
  it.each([
    ['jan 31 + 1 in a non-leap year overflows to mar 3', date(2025, 1, 31), 1, date(2025, 3, 3)],
    ['jan 31 + 1 in a leap year overflows to mar 2', date(2024, 1, 31), 1, date(2024, 3, 2)],
    ['feb 29 + 12 overflows to mar 1', date(2024, 2, 29), 12, date(2025, 3, 1)],
    ['jan 31 - 1 goes to dec 31 of the previous year', date(2025, 1, 31), -1, date(2024, 12, 31)],
    ['dec 15 + 13 wraps the year', date(2025, 12, 15), 13, date(2027, 1, 15)],
    ['jan 31 + 2 lands on mar 31 without overflow', date(2025, 1, 31), 2, date(2025, 3, 31)],
  ])('%s', (_name, input, n, expected) => {
    expect(addMonths(input, n)).toEqual(expected)
  })

  it('keeps the time of day of the input', () => {
    const input = new Date('2025-01-15T10:30:00.000Z')
    expect(addMonths(input, 1)).toEqual(new Date('2025-02-15T10:30:00.000Z'))
  })
})

describe('daysInMonth', () => {
  it.each([
    [2024, 2, 29],
    [2025, 2, 28],
    [1900, 2, 28],
    [2000, 2, 29],
    [2025, 1, 31],
    [2025, 4, 30],
    [2025, 12, 31],
  ])('%i-%i has %i days', (year, month, expected) => {
    expect(daysInMonth(year, month)).toBe(expected)
  })
})

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays(date(2024, 2, 28), 1)).toEqual(date(2024, 2, 29))
    expect(addDays(date(2025, 12, 31), 1)).toEqual(date(2026, 1, 1))
    expect(addDays(date(2025, 1, 1), -1)).toEqual(date(2024, 12, 31))
  })
})

describe('weekday, sameDay, startOfDay, formatYmd', () => {
  it('uses the Go numbering (0 = Sunday)', () => {
    expect(weekday(date(2025, 2, 15))).toBe(6) // Saturday
    expect(weekday(date(2026, 11, 15))).toBe(0) // Sunday
  })

  it('compares UTC calendar days', () => {
    expect(sameDay(new Date('2025-03-10T00:00:00Z'), new Date('2025-03-10T23:59:59Z'))).toBe(true)
    expect(sameDay(new Date('2025-03-10T23:59:59Z'), new Date('2025-03-11T00:00:00Z'))).toBe(false)
  })

  it('startOfDay drops the time of day', () => {
    expect(startOfDay(new Date('2025-03-10T15:30:00Z'))).toEqual(date(2025, 3, 10))
  })

  it('formats YYYY-MM-DD with zero padding', () => {
    expect(formatYmd(date(2025, 2, 5))).toBe('2025-02-05')
    expect(formatYmd(date(999, 12, 1))).toBe('0999-12-01')
  })
})

// Sample values below are copied from the real database (ledger.posted_at, both shapes).
describe('parseRfc3339 (Go time.Parse(time.RFC3339))', () => {
  it.each([
    ['a Z instant', '2026-09-12T02:26:36Z', new Date('2026-09-12T02:26:36Z')],
    ['a fraction is kept to the millisecond', '2026-09-12T02:26:36.5Z', new Date('2026-09-12T02:26:36.500Z')],
    ['a +hh:mm offset is converted to UTC', '2026-09-12T02:26:36+02:00', new Date('2026-09-12T00:26:36Z')],
  ])('reads %s', (_name, input, expected) => {
    expect(parseRfc3339(input)).toEqual(expected)
  })

  it.each([
    ['the space-separated form parseDbTime accepts', '2026-09-11 20:01:19'],
    ['a calendar date', '2026-09-12'],
    ['a missing zone', '2026-09-11T20:01:19'],
    ['a zone offset hour over 23', '2026-09-11T20:01:19+24:00'],
    ['an empty string', ''],
  ])('rejects %s', (_name, input) => {
    expect(() => parseRfc3339(input)).toThrow()
  })
})

describe('parseDbTime (Go parseLedgerTime)', () => {
  it.each([
    ['the space-separated form the old rows use', '2026-09-11 20:01:19', new Date('2026-09-11T20:01:19Z')],
    ['the RFC3339 form written by the Go server', '2026-09-12T02:26:36Z', new Date('2026-09-12T02:26:36Z')],
    ['a fraction is kept to the millisecond', '2026-09-12T02:26:36.123Z', new Date('2026-09-12T02:26:36.123Z')],
    ['a fraction past the millisecond is cut', '2026-09-12T02:26:36.1239Z', new Date('2026-09-12T02:26:36.123Z')],
    ['a +hh:mm offset is converted to UTC', '2026-09-12T02:26:36+02:00', new Date('2026-09-12T00:26:36Z')],
    ['a -hh:mm offset is converted to UTC', '2026-09-12T02:26:36-03:30', new Date('2026-09-12T05:56:36Z')],
    ['a calendar date is midnight UTC', '2026-09-12', new Date('2026-09-12T00:00:00Z')],
    ['leap day is valid in a leap year', '2024-02-29 00:00:00', new Date('2024-02-29T00:00:00Z')],
  ])('reads %s', (_name, input, expected) => {
    expect(parseDbTime(input)).toEqual(expected)
  })

  it.each([
    ['a missing zone (not RFC3339, not the space form)', '2026-09-11T20:01:19'],
    ['a February 30', '2026-02-30 10:00:00'],
    ['a February 29 in a non-leap year', '2025-02-29'],
    ['month 13', '2026-13-01'],
    ['hour 24', '2026-09-11 24:00:00'],
    ['second 60', '2026-09-11T20:01:60Z'],
    ['a zone offset hour over 23', '2026-09-11T20:01:19+24:00'],
    ['text', 'yesterday'],
    ['an empty string', ''],
  ])('rejects %s', (_name, input) => {
    expect(() => parseDbTime(input)).toThrow()
  })
})

describe('formatDbTime (Go t.UTC().Format(time.RFC3339))', () => {
  it('writes whole seconds with a Z suffix', () => {
    expect(formatDbTime(new Date('2026-09-12T02:26:36Z'))).toBe('2026-09-12T02:26:36Z')
  })

  it('drops the milliseconds (Go truncates the fraction in RFC3339)', () => {
    expect(formatDbTime(new Date('2026-09-12T02:26:36.999Z'))).toBe('2026-09-12T02:26:36Z')
  })

  it('round-trips through parseDbTime', () => {
    const text = formatDbTime(new Date('2026-01-02T03:04:05Z'))
    expect(text).toBe('2026-01-02T03:04:05Z')
    expect(parseDbTime(text)).toEqual(new Date('2026-01-02T03:04:05Z'))
  })
})

describe('formatApiTime (Go time.Time JSON: RFC3339Nano, trailing zeros trimmed)', () => {
  it.each([
    ['whole seconds have no fraction', '2026-01-02T03:04:05.000Z', '2026-01-02T03:04:05Z'],
    ['trailing zeros are trimmed', '2026-01-02T03:04:05.500Z', '2026-01-02T03:04:05.5Z'],
    ['two digits keep both', '2026-01-02T03:04:05.120Z', '2026-01-02T03:04:05.12Z'],
    ['three digits are kept', '2026-01-02T03:04:05.123Z', '2026-01-02T03:04:05.123Z'],
  ])('%s', (_name, iso, expected) => {
    expect(formatApiTime(new Date(iso))).toBe(expected)
  })
})

describe('parseYmd (Go time.Parse("2006-01-02"))', () => {
  it.each([
    ['a plain day', '2026-04-10', new Date('2026-04-10T00:00:00Z')],
    ['the first of the year', '2026-01-01', new Date('2026-01-01T00:00:00Z')],
    ['leap day in a leap year', '2028-02-29', new Date('2028-02-29T00:00:00Z')],
    ['the last day of a month', '2026-01-31', new Date('2026-01-31T00:00:00Z')],
  ])('accepts %s', (_name, input, expected) => {
    expect(parseYmd(input)).toEqual(expected)
  })

  it.each([
    ['Feb 29 in a non-leap year', '2026-02-29'],
    ['Feb 30', '2026-02-30'],
    ['month 13', '2026-13-01'],
    ['month 00', '2026-00-10'],
    ['day 00', '2026-04-00'],
    ['single-digit month', '2026-4-10'],
    ['single-digit day', '2026-04-1'],
    ['an RFC3339 timestamp', '2026-04-10T00:00:00Z'],
    ['a trailing space', '2026-04-10 '],
    ['an empty string', ''],
  ])('rejects %s', (_name, input) => {
    expect(() => parseYmd(input)).toThrow()
  })
})
