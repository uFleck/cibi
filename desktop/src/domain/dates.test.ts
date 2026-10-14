import { describe, expect, it } from 'vitest'
import { addDays, addMonths, daysInMonth, date, formatYmd, sameDay, startOfDay, weekday } from './dates'

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
