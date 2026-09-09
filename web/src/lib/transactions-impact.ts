import type { FriendDebtBreakdownItem, PayScheduleResponse, TransactionResponse } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import { earliestPaydayAfter, nextPaydayAfter, parseDateOnlyUTC } from '@/lib/pay-schedule'

export interface ImpactSummary {
  currentCount: number
  nextCount: number
  currentAmount: number
  nextAmount: number
  currentProjectedBalance: number
  nextProjectedBalance: number
}

const startOfUTCDate = (value: Date): number =>
  Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())

const parseDay = (value?: string | null): number | null => {
  if (!value) return null
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return startOfUTCDate(date)
}

const shiftWindow = (value: string, frequency?: string | null, dir: 1 | -1 = 1): number | null => {
  const base = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return null

  switch (frequency) {
    case 'weekly':
      base.setUTCDate(base.getUTCDate() + (7 * dir))
      break
    case 'bi-weekly':
      base.setUTCDate(base.getUTCDate() + (14 * dir))
      break
    case 'semi-monthly':
      base.setUTCDate(base.getUTCDate() + (15 * dir))
      break
    case 'monthly':
      base.setUTCMonth(base.getUTCMonth() + dir)
      break
    default:
      return null
  }

  return startOfUTCDate(base)
}

const getPrimarySchedule = (paySchedules: PayScheduleResponse[]): PayScheduleResponse | null => (
  paySchedules.length > 0
    ? paySchedules.reduce((earliest, ps) => (ps.next_payday < earliest.next_payday ? ps : earliest), paySchedules[0])
    : null
)

export const getWindowBounds = (paySchedules: PayScheduleResponse[], nextPayday: string | null) => {
  const primarySchedule = getPrimarySchedule(paySchedules)
  const nextPaydayDay = nextPayday ? parseDay(nextPayday) : null
  const followingPaydayDay = primarySchedule ? shiftWindow(primarySchedule.next_payday, primarySchedule.frequency, 1) : null
  return { nextPaydayDay, followingPaydayDay }
}

export interface WindowLabels {
  dueNowLabel: string
  currentWindowLabel: string
  nextWindowLabel: string
}

export function getWindowLabels(
  nextPayday: string | null,
  paySchedules: PayScheduleResponse[],
): WindowLabels {
  const { nextPaydayDay, followingPaydayDay } = getWindowBounds(paySchedules, nextPayday)

  const fmtDay = (ts: number | null): string => {
    if (!ts) return '?'
    return formatDate(new Date(ts).toISOString())
  }

  const nextPaydayStr = nextPaydayDay ? fmtDay(nextPaydayDay) : '?'

  return {
    dueNowLabel: `Due now (before ${nextPaydayStr})`,
    currentWindowLabel: `Current (until ${nextPaydayStr})`,
    nextWindowLabel: followingPaydayDay
      ? `Next (${nextPaydayStr} – ${fmtDay(followingPaydayDay)})`
      : `Next window`,
  }
}

export const isCurrentDue = (t: TransactionResponse, now: Date, nextPayday: string | null, nextPaydayDay: number | null) => {
  if (t.is_recurring) {
    const recurringDate = t.next_occurrence || t.anchor_date
    if (!recurringDate) return false
    return isInCurrentPayWindow(recurringDate, now, nextPayday)
  }

  if (t.is_installment) {
    if (!t.next_occurrence) return false
    return isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
  }

  if (!(t.requires_confirmation && !t.confirmed_at)) return false
  const oneTimeDay = parseDay(t.anchor_date || t.timestamp)
  if (oneTimeDay === null) return false
  return nextPaydayDay === null ? true : oneTimeDay < nextPaydayDay
}

export function isNextWindowDue(
  t: TransactionResponse,
  nextPaydayDay: number | null,
  followingPaydayDay: number | null,
): boolean {
  if (nextPaydayDay === null || followingPaydayDay === null) return false
  const targetDay = parseDay(t.is_recurring ? (t.next_occurrence || t.anchor_date) : (t.anchor_date || t.timestamp))
  if (targetDay === null) return false
  return targetDay >= nextPaydayDay && targetDay < followingPaydayDay
}

function isInWindow(occurrence: string, start: Date, end: Date): boolean {
  const date = new Date(occurrence)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime()
}

export function computeProjectedBalanceAfterNextWindow(params: {
  currentBalance: number
  transactions: TransactionResponse[]
  paySchedules: PayScheduleResponse[]
  friendBreakdown: FriendDebtBreakdownItem[]
  nextPayday: string | null
  now?: Date
}): number | null {
  const {
    currentBalance,
    transactions,
    paySchedules,
    friendBreakdown,
    nextPayday,
    now = new Date(),
  } = params

  if (!nextPayday || paySchedules.length === 0) return null

  const windowStart = parseDateOnlyUTC(nextPayday)
  const windowEnd = earliestPaydayAfter(paySchedules, windowStart)
  if (!windowEnd) return null

  const currentRecurringReserved = transactions
    .filter(
      t => t.is_recurring && t.next_occurrence !== null
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const currentInstallmentReserved = transactions
    .filter(
      t => t.is_installment && t.next_occurrence !== null
        && t.amount < 0
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const currentPeerReserved = friendBreakdown.reduce((sum, debt) => {
    if (!debt.next_payment_date) return sum + debt.next_payment
    if (isInCurrentPayWindow(debt.next_payment_date, now, nextPayday)) {
      return sum + debt.next_payment
    }
    return sum
  }, 0)

  const projectedStartBalance = currentBalance - currentRecurringReserved - currentInstallmentReserved - currentPeerReserved

  const nextRecurringObligations = transactions
    .filter(t => t.is_recurring && t.next_occurrence !== null && isInWindow(t.next_occurrence, windowStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const nextInstallmentObligations = transactions
    .filter(t => t.is_installment && t.next_occurrence !== null
      && t.amount < 0
      && isInWindow(t.next_occurrence, windowStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const nextPeerObligations = friendBreakdown
    .filter(d => d.next_payment_date !== null && isInWindow(d.next_payment_date, windowStart, windowEnd))
    .reduce((sum, d) => sum + d.next_payment, 0)

  const nextObligations = nextRecurringObligations + nextInstallmentObligations + nextPeerObligations

  let incoming = 0
  for (const schedule of paySchedules) {
    let occurrence = nextPaydayAfter(schedule, new Date(windowStart.getTime() - 1))
    let safety = 0
    while (occurrence.getTime() < windowEnd.getTime() && safety < 24) {
      if (occurrence.getTime() >= windowStart.getTime()) incoming += schedule.amount
      occurrence = nextPaydayAfter(schedule, occurrence)
      safety += 1
    }
  }

  return projectedStartBalance + incoming - nextObligations
}

export function buildImpactSummary(params: {
  transactions: TransactionResponse[]
  paySchedules: PayScheduleResponse[]
  nextPayday: string | null
  currentBalance: number
  projectedBalanceAfterNextWindow?: number | null
  now?: Date
}): ImpactSummary {
  const {
    transactions,
    paySchedules,
    nextPayday,
    currentBalance,
    projectedBalanceAfterNextWindow,
    now = new Date(),
  } = params

  const { nextPaydayDay, followingPaydayDay } = getWindowBounds(paySchedules, nextPayday)

  const confirmable = transactions.filter((t) => !t.is_recurring && t.requires_confirmation && !t.confirmed_at)
  const inCurrent = confirmable.filter((t) => isCurrentDue(t, now, nextPayday, nextPaydayDay))
  const inNext = confirmable.filter((t) => isNextWindowDue(t, nextPaydayDay, followingPaydayDay))

  const asObligation = (amount: number): number => (amount < 0 ? Math.abs(amount) : 0)

  const currentAmount = inCurrent.reduce((sum, t) => sum + asObligation(t.amount), 0)
  const nextAmount = inNext.reduce((sum, t) => sum + asObligation(t.amount), 0)

  const nextBalanceBase = projectedBalanceAfterNextWindow ?? currentBalance

  return {
    currentCount: inCurrent.length,
    nextCount: inNext.length,
    currentAmount,
    nextAmount,
    currentProjectedBalance: currentBalance - currentAmount,
    nextProjectedBalance: nextBalanceBase - currentAmount - nextAmount,
  }
}

export function matchesPresetFilter(params: {
  txn: TransactionResponse
  preset: 'current-window' | 'due-now' | 'next-window' | 'all-recurring' | 'one-time-only' | null
  now: Date
  nextPayday: string | null
  paySchedules: PayScheduleResponse[]
}): boolean {
  const { txn, preset, now, nextPayday, paySchedules } = params
  const { nextPaydayDay, followingPaydayDay } = getWindowBounds(paySchedules, nextPayday)

  const isPendingOneTime = !txn.is_recurring && !txn.is_installment && !!txn.requires_confirmation && !txn.confirmed_at

  // null = default: all recurring + all in-progress installments + pending one-time
  if (preset === null) return txn.is_recurring || (txn.is_installment && txn.next_occurrence !== null) || isPendingOneTime

  if (preset === 'all-recurring') return txn.is_recurring
  if (preset === 'one-time-only') return !txn.is_recurring && !txn.is_installment
  if (preset === 'next-window') {
    if (txn.is_installment) {
      if (!txn.next_occurrence || nextPaydayDay === null || followingPaydayDay === null) return false
      const occDay = parseDay(txn.next_occurrence)
      return occDay !== null && occDay >= nextPaydayDay && occDay < followingPaydayDay
    }
    if (!txn.is_recurring && !isPendingOneTime) return false
    return isNextWindowDue(txn, nextPaydayDay, followingPaydayDay)
  }

  // due-now
  if (preset === 'due-now') {
    if (txn.is_installment) {
      return txn.next_occurrence !== null && isInCurrentPayWindow(txn.next_occurrence, now, nextPayday)
    }
    if (txn.is_recurring) return false
    if (!txn.requires_confirmation || txn.confirmed_at) return false
    return isCurrentDue(txn, now, nextPayday, nextPaydayDay)
  }

  // current-window: recurring + installment + pending one-time
  return isCurrentDue(txn, now, nextPayday, nextPaydayDay)
}
