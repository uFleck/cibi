// How many times a recurring bill falls inside a window. A bill is stored with its next occurrence and a
// frequency, so a weekly bill due twice before the next payday has to be counted twice.

/** A guard against a runaway loop. */
const MAX_OCCURRENCES = 100

const DAY_MS = 24 * 60 * 60 * 1000

function startOfUTCDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate()
  const moved = new Date(date.getTime())
  moved.setUTCDate(1)
  moved.setUTCMonth(moved.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate()
  moved.setUTCDate(Math.min(day, lastDay))
  return moved
}

/** The occurrence after `date`, as the backend advances it; null for a frequency that does not repeat. */
function advance(date: Date, frequency: string | null): Date | null {
  switch (frequency) {
    case 'weekly':
      return new Date(date.getTime() + 7 * DAY_MS)
    case 'bi-weekly':
    case 'biweekly':
      return new Date(date.getTime() + 14 * DAY_MS)
    case 'monthly':
      return addMonthsClamped(date, 1)
    case 'yearly':
      return addMonthsClamped(date, 12)
    default:
      return null
  }
}

interface Recurrence {
  next_occurrence: string | null
  frequency: string | null
}

/**
 * The occurrences from the next one on whose day is on or after `from` and before `to`
 * (an overdue first occurrence counts when `from` is left out). Days are compared in UTC.
 */
export function occurrenceDates(t: Recurrence, to: Date, from?: Date): Date[] {
  if (t.next_occurrence === null) return []
  let date: Date | null = new Date(t.next_occurrence)
  if (Number.isNaN(date.getTime())) return []
  const end = startOfUTCDay(to)
  const start = from === undefined ? -Infinity : startOfUTCDay(from)
  const dates: Date[] = []
  for (let i = 0; date !== null && i < MAX_OCCURRENCES; i++) {
    const day = startOfUTCDay(date)
    if (day >= end) break
    if (day >= start) dates.push(date)
    date = advance(date, t.frequency)
  }
  return dates
}

export function countOccurrences(t: Recurrence, to: Date, from?: Date): number {
  return occurrenceDates(t, to, from).length
}

/**
 * How many times a bill is due before the next payday, an overdue one included. Without a payday
 * every bill counts once, as the payday window does.
 */
export function countInCurrentPayWindow(t: Recurrence, nextPayday: string | null): number {
  if (t.next_occurrence === null) return 0
  if (nextPayday === null) return 1
  const payday = new Date(`${nextPayday}T00:00:00Z`)
  if (Number.isNaN(payday.getTime())) return 1
  return countOccurrences(t, payday)
}
