import { addDays, date, startOfDay, weekday } from '../dates'

const SUNDAY = 0
const SATURDAY = 6

interface FixedHoliday {
  month: number
  day: number
  name: string
}

// Fixed-date national holidays (month is 1-12).
const FIXED_HOLIDAYS: readonly FixedHoliday[] = [
  { month: 1, day: 1, name: 'Confraternização Universal' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 9, day: 7, name: 'Independência do Brasil' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  { month: 11, day: 20, name: 'Consciência Negra (national since 2024)' },
  { month: 12, day: 25, name: 'Natal' },
]

// Offsets in days from Easter Sunday for the moveable holidays.
const EASTER_OFFSETS: readonly number[] = [
  -47, // Carnaval (terça-feira)
  -2, // Sexta-feira Santa
  60, // Corpus Christi
]

/**
 * Easter Sunday for the given year, using the Anonymous Gregorian algorithm.
 * Returns UTC midnight. Integer division is truncated like Go's int division.
 */
export function easterDate(year: number): Date {
  const a = year % 19
  const b = Math.trunc(year / 100)
  const c = year % 100
  const d = Math.trunc(b / 4)
  const e = b % 4
  const f = Math.trunc((b + 8) / 25)
  const g = Math.trunc((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.trunc(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.trunc((a + 11 * h + 22 * l) / 451)
  const month = Math.trunc((h + l - 7 * m + 114) / 31)
  const dayOfMonth = ((h + l - 7 * m + 114) % 31) + 1
  return date(year, month, dayOfMonth)
}

/** True when t falls on a Brazilian national holiday (fixed or Easter-derived). */
export function isHoliday(t: Date): boolean {
  const month = t.getUTCMonth() + 1
  const dayOfMonth = t.getUTCDate()
  if (FIXED_HOLIDAYS.some((h) => h.month === month && h.day === dayOfMonth)) {
    return true
  }

  const easter = easterDate(t.getUTCFullYear())
  const tDate = startOfDay(t)
  return EASTER_OFFSETS.some((offset) => addDays(easter, offset).getTime() === tDate.getTime())
}

/**
 * Shifts t backward to the nearest weekday that is not a national holiday.
 * Saturday moves to Friday, Sunday moves to Friday, and a holiday moves to the day
 * before, applied repeatedly until a business day is reached. The time of day is dropped.
 */
export function adjustToBusinessDay(t: Date): Date {
  let current = startOfDay(t)
  for (;;) {
    const wd = weekday(current)
    if (wd === SATURDAY) {
      current = addDays(current, -1)
      continue
    }
    if (wd === SUNDAY) {
      current = addDays(current, -2)
      continue
    }
    if (isHoliday(current)) {
      current = addDays(current, -1)
      continue
    }
    return current
  }
}
