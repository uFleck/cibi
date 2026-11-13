// The payday plan: how much is free to spend in each pay period, and what a purchase would do to it.
//
// Money is integer cents and days are UTC, like the rest of the domain. The forecast is pure: it
// takes the rows the API already returns and never touches the database.
//
// A period starts on a payday (or today, for the period in progress) and ends on the next payday.
// Income for a period is the payday that starts it. Bills due in [start, end) belong to it; an
// overdue bill belongs to the first period. Free = opening + income - bills - floor.

import { nextFixedInterval, nextMonthly, nextSemiMonthly } from '@/domain/engine/engine'
import { adjustToBusinessDay } from '@/domain/holidays/brazil'

export interface ForecastSchedule {
  id: string
  frequency: string
  /** The next unconfirmed payday, RFC3339 or YYYY-MM-DD. */
  anchorDate: string
  /** Cents, positive. */
  amount: number
  dayOfMonth2?: number | null
  /**
   * False for the payday that is due now but not confirmed yet: the money is not in the balance,
   * so it must not make the current period look spendable.
   */
  includeIncome?: boolean
}

export interface ForecastBill {
  id: string
  title: string
  /** Cents, negative for an expense. */
  amount: number
  isRecurring: boolean
  frequency: string | null
  /** RFC3339 or YYYY-MM-DD; null when the bill has no due date. */
  nextOccurrence: string | null
  isInstallment: boolean
  totalInstallments: number | null
  paidInstallments: number
  /** A budget per month, with no due date: paying never advances it. */
  isAsNeeded: boolean
  /** Cents, negative; this month's budget. Only for an as-needed bill. */
  monthBudget: number | null
  /** Cents, negative or 0; what was paid this month. Only for an as-needed bill. */
  monthSpent: number | null
  requiresConfirmation: boolean
  confirmedAt: string | null
  /** For a one-off: the planned date. */
  anchorDate: string | null
  /** For a one-off: when it was created. */
  timestamp: string
}

export interface ForecastDebt {
  id: string
  name: string
  /** Cents, positive: what still has to leave the account. */
  amount: number
  /** RFC3339 or YYYY-MM-DD; null means it has no date and counts in the first period. */
  date: string | null
}

export interface ForecastExtra {
  /** Cents, negative: the amount that would leave the account. */
  amount: number
  /** RFC3339 or YYYY-MM-DD. */
  date: string
}

export interface ForecastInput {
  now: Date
  /** The local calendar day (YYYY-MM-DD). Defaults to the UTC day of `now`. */
  today?: string
  /** Cents. */
  balance: number
  /** Cents that must stay in the account. Defaults to 0. */
  floor?: number
  schedules: ForecastSchedule[]
  bills: ForecastBill[]
  debts?: ForecastDebt[]
  extra?: ForecastExtra | null
  /** How many periods to show, including the current one. Defaults to 6. */
  periodCount?: number
}

export type ForecastItemKind = 'bill' | 'installment' | 'one-off' | 'as-needed' | 'debt'

export interface ForecastItem {
  /** The bill or debt id. An as-needed budget reuses the bill id. */
  id: string
  title: string
  kind: ForecastItemKind
  /** Cents, negative. */
  amount: number
  /** The day the money leaves, YYYY-MM-DD. */
  date: string
  installmentNumber?: number
  installmentTotal?: number
}

export interface ForecastPeriod {
  /** YYYY-MM-DD, inclusive. */
  start: string
  /** YYYY-MM-DD, exclusive. */
  end: string
  /** Cents, positive; the income that starts the period. 0 when it starts today or the due payday is unconfirmed. */
  income: number
  /** Cents, negative. */
  bills: number
  /** Cents, negative. */
  debts: number
  /** Cents, negative; the sum of both. */
  obligations: number
  /** Cents. */
  opening: number
  /** Cents. */
  closing: number
  /** Cents. closing - floor; negative means the plan breaks. */
  free: number
  items: ForecastItem[]
}

export interface ForecastResult {
  periods: ForecastPeriod[]
  /** Cents. Free in the period in progress. */
  freeNow: number
  /** Cents. The lowest closing balance in the plan. */
  minClosing: number
  /** YYYY-MM-DD: the end of the period with the lowest closing balance. */
  minClosingDate: string
  /** True when every period ends at or above the floor. */
  safe: boolean
  /** YYYY-MM-DD of the next payday, null when there is no schedule. */
  nextPayday: string | null
}

export interface SpendSimulation {
  amount: number
  date: string
  safe: boolean
  /** Cents. The lowest closing balance after the purchase. */
  minClosing: number
  /** YYYY-MM-DD: the end of the period where the plan breaks first. */
  breaksAt: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_OCCURRENCES = 400

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  const parsed = new Date(dateOnly ? `${trimmed}T00:00:00Z` : trimmed)
  return Number.isNaN(parsed.getTime()) ? null : startOfUtcDay(parsed)
}

function ymd(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addMonthsClamped(value: Date, months: number): Date {
  const day = value.getUTCDate()
  const moved = new Date(value.getTime())
  moved.setUTCDate(1)
  moved.setUTCMonth(moved.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate()
  moved.setUTCDate(Math.min(day, lastDay))
  return moved
}

function advance(value: Date, frequency: string | null): Date | null {
  switch (frequency) {
    case 'weekly':
      return new Date(value.getTime() + 7 * DAY_MS)
    case 'bi-weekly':
    case 'biweekly':
      return new Date(value.getTime() + 14 * DAY_MS)
    case 'monthly':
      return addMonthsClamped(value, 1)
    case 'yearly':
      return addMonthsClamped(value, 12)
    default:
      return null
  }
}

function monthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
}

interface PaydayEvent {
  date: Date
  income: number
  scheduleId: string
}

/** The next occurrence after `from`, before the business-day adjustment. */
function nextRawOccurrence(schedule: ForecastSchedule, anchor: Date, from: Date): Date | null {
  const effective = anchor.getTime() > from.getTime() ? new Date(anchor.getTime() - 1) : from
  switch (schedule.frequency) {
    case 'weekly':
      return nextFixedInterval(anchor, from, 7)
    case 'bi-weekly':
    case 'biweekly':
      return nextFixedInterval(anchor, from, 14)
    case 'semi-monthly':
      return nextSemiMonthly(anchor.getUTCDate(), schedule.dayOfMonth2 ?? 0, effective)
    case 'monthly':
    case 'yearly':
    default:
      return nextMonthly(anchor, effective)
  }
}

/** The next occurrences of every schedule, merged by day. */
function paydayEvents(schedules: ForecastSchedule[], from: Date, count: number): PaydayEvent[] {
  const byDay = new Map<number, PaydayEvent>()
  for (const schedule of schedules) {
    const anchor = parseDateValue(schedule.anchorDate)
    if (anchor === null) continue
    // Start at the anchor when it is overdue: that payday still has to be confirmed.
    let cursor = anchor.getTime() < from.getTime()
      ? new Date(anchor.getTime() - 1)
      : new Date(from.getTime() - 1)
    for (let i = 0; i < count + 2; i++) {
      const raw = nextRawOccurrence(schedule, anchor, cursor)
      if (raw === null || raw.getTime() <= cursor.getTime()) break
      const occurrence = adjustToBusinessDay(raw)
      const income = i === 0 && schedule.includeIncome === false ? 0 : schedule.amount
      const key = startOfUtcDay(occurrence).getTime()
      const current = byDay.get(key)
      if (current) {
        current.income += income
      } else {
        byDay.set(key, { date: startOfUtcDay(occurrence), income, scheduleId: schedule.id })
      }
      // Advance from the raw date: the adjusted date can fall before the raw one on a holiday.
      cursor = raw
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

function billDueDate(bill: ForecastBill): Date | null {
  return parseDateValue(bill.nextOccurrence) ?? parseDateValue(bill.anchorDate) ?? parseDateValue(bill.timestamp)
}

/** The occurrences of one bill from the beginning of the plan to `until`. */
function billOccurrences(bill: ForecastBill, until: Date): Date[] {
  if (bill.amount >= 0) return []
  const first = billDueDate(bill)
  if (first === null) return []

  if (bill.isAsNeeded) return []

  if (bill.isInstallment) {
    const remaining = Math.max(0, (bill.totalInstallments ?? 0) - bill.paidInstallments)
    if (remaining === 0) return []
    const out: Date[] = []
    let cursor: Date | null = first
    for (let i = 0; i < remaining && cursor !== null && cursor.getTime() < until.getTime(); i++) {
      out.push(cursor)
      cursor = advance(cursor, bill.frequency ?? 'monthly')
    }
    return out
  }

  if (bill.isRecurring) {
    const out: Date[] = []
    let cursor: Date | null = first
    for (let i = 0; cursor !== null && i < MAX_OCCURRENCES; i++) {
      if (cursor.getTime() >= until.getTime()) break
      out.push(cursor)
      cursor = advance(cursor, bill.frequency)
    }
    return out
  }

  // A one-off appears only until it is paid.
  if (bill.requiresConfirmation && bill.confirmedAt === null) {
    return [first]
  }
  return []
}

interface RawItem extends ForecastItem {
  dateValue: Date
}

/** The forecast, in cents. */
export function buildForecast(input: ForecastInput): ForecastResult {
  const now = input.now
  const today = parseDateValue(input.today) ?? startOfUtcDay(now)
  const floor = input.floor ?? 0
  const periodCount = Math.max(1, input.periodCount ?? 6)

  const events = paydayEvents(input.schedules, today, periodCount + 1)
  const first = events[0]

  // The current period: from today to the next payday. When today is itself a payday, the income
  // that starts it is already expected today and is counted here.
  const currentStart = today
  const firstIsDue = first !== undefined && first.date.getTime() <= today.getTime()
  const futurePaydays = events.filter(event => event.date.getTime() > today.getTime())
  // An overdue payday is counted once in the current period; missed older ones wait for their own
  // confirmation instead of turning the plan into a run of past periods.
  const currentEnd = firstIsDue
    ? (futurePaydays[0]?.date ?? addMonthsClamped(today, 1))
    : (first?.date ?? addMonthsClamped(today, 1))
  const currentIncome = firstIsDue ? first.income : 0

  const starts: { start: Date; end: Date; income: number }[] = [
    { start: currentStart, end: currentEnd, income: currentIncome },
  ]
  const futureEvents = events.filter(event => event.date.getTime() >= currentEnd.getTime())
  for (const event of futureEvents) {
    if (starts.length >= periodCount) break
    const end = futureEvents.find(next => next.date.getTime() > event.date.getTime())?.date
      ?? addMonthsClamped(event.date, 1)
    starts.push({ start: event.date, end, income: event.income })
  }
  // Without a pay schedule, show a single 30-day window instead of an empty plan.
  if (input.schedules.length === 0) {
    starts.length = 0
    starts.push({ start: currentStart, end: new Date(today.getTime() + 30 * DAY_MS), income: 0 })
  }

  const horizonEnd = starts[starts.length - 1]?.end ?? addMonthsClamped(today, 1)
  const items: RawItem[] = []

  for (const bill of input.bills) {
    for (const date of billOccurrences(bill, horizonEnd)) {
      items.push({
        id: bill.id,
        title: bill.title,
        kind: bill.isInstallment ? 'installment' : bill.isRecurring ? 'bill' : 'one-off',
        amount: bill.amount,
        date: ymd(date),
        dateValue: date,
        installmentNumber: bill.isInstallment ? bill.paidInstallments + 1 : undefined,
        installmentTotal: bill.isInstallment ? (bill.totalInstallments ?? undefined) : undefined,
      })
    }
  }

  // As-needed bills: what is left of this month now, and one full budget on each future month.
  for (const bill of input.bills) {
    if (!bill.isAsNeeded || bill.amount >= 0) continue
    const budget = Math.abs(bill.monthBudget ?? bill.amount)
    const spent = Math.abs(bill.monthSpent ?? 0)
    const left = budget - spent
    if (left > 0) {
      items.push({
        id: bill.id,
        title: bill.title,
        kind: 'as-needed',
        amount: -left,
        date: ymd(today),
        dateValue: today,
      })
    }
    const thisMonth = monthStart(today)
    for (let month = 1; month < 60; month++) {
      const start = addMonthsClamped(thisMonth, month)
      if (start.getTime() >= horizonEnd.getTime()) break
      items.push({
        id: bill.id,
        title: bill.title,
        kind: 'as-needed',
        amount: -budget,
        date: ymd(start),
        dateValue: start,
      })
    }
  }

  for (const debt of input.debts ?? []) {
    const date = parseDateValue(debt.date) ?? today
    items.push({
      id: debt.id,
      title: debt.name,
      kind: 'debt',
      amount: -Math.abs(debt.amount),
      date: ymd(date),
      dateValue: date,
    })
  }

  if (input.extra) {
    const date = parseDateValue(input.extra.date) ?? today
    items.push({
      id: 'extra',
      title: 'Compra simulada',
      kind: 'one-off',
      amount: input.extra.amount,
      date: ymd(date),
      dateValue: date,
    })
  }

  const periods: ForecastPeriod[] = []
  let balance = input.balance
  for (let i = 0; i < starts.length; i++) {
    const { start, end, income } = starts[i]
    const billItems = items
      .filter(item => {
        if (item.kind === 'debt') return false
        // An overdue item belongs to the first period; everything else to the period that contains it.
        if (item.dateValue.getTime() < today.getTime()) return i === 0
        return item.dateValue.getTime() >= start.getTime() && item.dateValue.getTime() < end.getTime()
      })
      .sort((a, b) => a.dateValue.getTime() - b.dateValue.getTime())
    const debtItems = items
      .filter(item => {
        if (item.kind !== 'debt') return false
        if (item.dateValue.getTime() < today.getTime()) return i === 0
        return item.dateValue.getTime() >= start.getTime() && item.dateValue.getTime() < end.getTime()
      })
      .sort((a, b) => a.dateValue.getTime() - b.dateValue.getTime())
    const bills = billItems.reduce((sum, item) => sum + item.amount, 0)
    const debts = debtItems.reduce((sum, item) => sum + item.amount, 0)
    const opening = balance
    const closing = opening + income + bills + debts
    periods.push({
      start: ymd(start),
      end: ymd(end),
      income,
      bills,
      debts,
      obligations: bills + debts,
      opening,
      closing,
      free: closing - floor,
      items: [...billItems, ...debtItems],
    })
    balance = closing
  }

  const firstPeriod = periods[0]
  let minClosing = firstPeriod?.closing ?? input.balance
  let minClosingDate = firstPeriod?.end ?? ymd(today)
  for (const period of periods) {
    if (period.closing < minClosing) {
      minClosing = period.closing
      minClosingDate = period.end
    }
  }

  return {
    periods,
    freeNow: firstPeriod?.free ?? input.balance - floor,
    minClosing,
    minClosingDate,
    safe: periods.every(period => period.closing >= floor),
    nextPayday: first ? ymd(first.date) : null,
  }
}

/** What a purchase on `date` would do to the plan. The amount is positive cents. */
export function simulateSpend(input: ForecastInput, amountCents: number, date: string): SpendSimulation {
  const spend = Math.abs(amountCents)
  const day = parseDateValue(date) ?? parseDateValue(input.today) ?? startOfUtcDay(input.now)
  const forecast = buildForecast({
    ...input,
    extra: { amount: -spend, date: ymd(day) },
  })
  const floor = input.floor ?? 0
  const spendPeriod = forecast.periods.findIndex(period => {
    return ymd(day) >= period.start && ymd(day) < period.end
  })
  const from = spendPeriod < 0 ? 0 : spendPeriod
  let minClosing = forecast.periods[from]?.closing ?? input.balance
  let breaksAt: string | null = null
  for (let i = from; i < forecast.periods.length; i++) {
    const period = forecast.periods[i]
    if (period.closing < minClosing) minClosing = period.closing
    if (breaksAt === null && period.closing < floor) breaksAt = period.end
  }
  return {
    amount: spend,
    date: ymd(day),
    safe: minClosing >= floor,
    minClosing,
    breaksAt,
  }
}
