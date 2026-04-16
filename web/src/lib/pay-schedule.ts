import type { PayScheduleResponse } from '@/lib/api'

function clampedDayInMonth(year: number, monthIndex0: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, lastDay)
  return new Date(Date.UTC(year, monthIndex0, clampedDay, 0, 0, 0, 0))
}

function nextFixedInterval(anchor: Date, from: Date, intervalDays: number): Date {
  let candidate = new Date(anchor)

  if (!(from.getTime() < anchor.getTime())) {
    const diffDays = Math.floor((from.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000))
    const elapsed = Math.floor(diffDays / intervalDays)
    candidate = new Date(anchor)
    candidate.setUTCDate(candidate.getUTCDate() + (elapsed + 1) * intervalDays)
  }

  while (!(candidate.getTime() > from.getTime())) {
    candidate = new Date(candidate)
    candidate.setUTCDate(candidate.getUTCDate() + intervalDays)
  }

  return candidate
}

function nextMonthly(anchor: Date, from: Date): Date {
  const anchorDay = anchor.getUTCDate()

  let year = from.getUTCFullYear()
  let month = from.getUTCMonth()
  let candidate = clampedDayInMonth(year, month, anchorDay)

  while (!(candidate.getTime() > from.getTime())) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    candidate = clampedDayInMonth(year, month, anchorDay)
  }

  return candidate
}

function nextDayOfMonth(dayNum: number, from: Date): Date {
  const thisMonth = clampedDayInMonth(from.getUTCFullYear(), from.getUTCMonth(), dayNum)
  if (thisMonth.getTime() > from.getTime()) return thisMonth

  let year = from.getUTCFullYear()
  let month = from.getUTCMonth() + 1
  if (month > 11) {
    month = 0
    year += 1
  }
  return clampedDayInMonth(year, month, dayNum)
}

function nextSemiMonthly(day1: number, day2: number, from: Date): Date {
  const next1 = nextDayOfMonth(day1, from)
  if (!day2 || day2 <= 0) return next1

  const next2 = nextDayOfMonth(day2, from)
  return next1.getTime() < next2.getTime() ? next1 : next2
}

export function parseDateOnlyUTC(date: string): Date {
  const day = date.slice(0, 10)
  return new Date(`${day}T00:00:00Z`)
}

export function nextPaydayAfter(schedule: PayScheduleResponse, from: Date): Date {
  const anchor = parseDateOnlyUTC(schedule.anchor_date)

  switch (schedule.frequency) {
    case 'weekly':
      return nextFixedInterval(anchor, from, 7)
    case 'bi-weekly':
      return nextFixedInterval(anchor, from, 14)
    case 'monthly':
      return nextMonthly(anchor, from)
    case 'semi-monthly':
      return nextSemiMonthly(anchor.getUTCDate(), schedule.day_of_month_2 ?? 0, from)
    default:
      return nextMonthly(anchor, from)
  }
}

export function earliestPaydayAfter(schedules: PayScheduleResponse[], from: Date): Date | null {
  if (schedules.length === 0) return null

  let earliest = nextPaydayAfter(schedules[0], from)
  for (let i = 1; i < schedules.length; i += 1) {
    const next = nextPaydayAfter(schedules[i], from)
    if (next.getTime() < earliest.getTime()) earliest = next
  }
  return earliest
}
