import { describe, expect, it } from 'vitest'
import { date, weekday } from '../dates'
import { adjustToBusinessDay, easterDate, isHoliday } from './brazil'

// Expected values are either the published dates (noted) or derived by hand from the
// Go code, as marked in each comment. The Go code has no tests for this package.

describe('easterDate', () => {
  it.each([
    [2024, date(2024, 3, 31)],
    [2025, date(2025, 4, 20)],
    [2026, date(2026, 4, 5)],
  ])('Easter Sunday for %i is %s (published date)', (year, expected) => {
    expect(easterDate(year)).toEqual(expected)
    expect(weekday(easterDate(year))).toBe(0)
  })
})

describe('moveable holidays', () => {
  it('Good Friday 2025 is 2025-04-18 (Easter minus 2 days)', () => {
    expect(isHoliday(date(2025, 4, 18))).toBe(true)
  })

  it('Carnaval Tuesday 2026 is 2026-02-17 (Easter minus 47 days, derived)', () => {
    expect(isHoliday(date(2026, 2, 17))).toBe(true)
  })

  it('Corpus Christi 2026 is 2026-06-04 (Easter plus 60 days, derived)', () => {
    expect(isHoliday(date(2026, 6, 4))).toBe(true)
  })

  it('an ordinary day near the moveable holidays is not a holiday', () => {
    expect(isHoliday(date(2026, 2, 16))).toBe(false)
    expect(isHoliday(date(2026, 3, 10))).toBe(false)
  })
})

describe('fixed national holidays, 2026', () => {
  it.each([
    ['Confraternização Universal', date(2026, 1, 1)],
    ['Tiradentes', date(2026, 4, 21)],
    ['Dia do Trabalho', date(2026, 5, 1)],
    ['Independência do Brasil', date(2026, 9, 7)],
    ['Nossa Senhora Aparecida', date(2026, 10, 12)],
    ['Finados', date(2026, 11, 2)],
    ['Proclamação da República', date(2026, 11, 15)],
    ['Consciência Negra', date(2026, 11, 20)],
    ['Natal', date(2026, 12, 25)],
  ])('%s is a holiday', (_name, day) => {
    expect(isHoliday(day)).toBe(true)
  })

  it('isHoliday ignores the time of day', () => {
    expect(isHoliday(new Date('2026-12-25T23:59:59Z'))).toBe(true)
  })
})

describe('adjustToBusinessDay', () => {
  it('leaves a plain business day unchanged', () => {
    expect(adjustToBusinessDay(date(2026, 3, 10))).toEqual(date(2026, 3, 10))
  })

  it('drops the time of day', () => {
    expect(adjustToBusinessDay(new Date('2026-03-10T15:30:00Z'))).toEqual(date(2026, 3, 10))
  })

  it('moves a Saturday back to Friday (2025-02-15 is a Saturday, result 2025-02-14)', () => {
    expect(adjustToBusinessDay(date(2025, 2, 15))).toEqual(date(2025, 2, 14))
  })

  it('moves a Sunday back to Friday (2026-11-15 is a Sunday, result 2026-11-13)', () => {
    expect(adjustToBusinessDay(date(2026, 11, 15))).toEqual(date(2026, 11, 13))
  })

  it('moves a weekday holiday back one day (Tiradentes 2026 is a Tuesday, result Monday 2026-04-20)', () => {
    expect(adjustToBusinessDay(date(2026, 4, 21))).toEqual(date(2026, 4, 20))
  })

  it('moves Jan 1 2026 (Thursday) back to Wednesday 2025-12-31', () => {
    expect(adjustToBusinessDay(date(2026, 1, 1))).toEqual(date(2025, 12, 31))
  })

  it('moves a Friday holiday back to Thursday (Dia do Trabalho 2026, result 2026-04-30)', () => {
    expect(adjustToBusinessDay(date(2026, 5, 1))).toEqual(date(2026, 4, 30))
  })

  it('chains holiday and weekend steps (Finados 2026 is a Monday after a Sunday, result Friday 2026-10-30)', () => {
    expect(adjustToBusinessDay(date(2026, 11, 2))).toEqual(date(2026, 10, 30))
  })

  it('moves Corpus Christi 2026 (Thursday) back to Wednesday 2026-06-03', () => {
    expect(adjustToBusinessDay(date(2026, 6, 4))).toEqual(date(2026, 6, 3))
  })
})
