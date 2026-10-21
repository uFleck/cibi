import type { PayScheduleResponse, TransactionResponse } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { isInCurrentPayWindow } from '@/lib/financial-window'

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
    dueNowLabel: `Vence agora (antes de ${nextPaydayStr})`,
    currentWindowLabel: `Atual (até ${nextPaydayStr})`,
    nextWindowLabel: followingPaydayDay
      ? `Próximo (${nextPaydayStr} – ${fmtDay(followingPaydayDay)})`
      : `Próximo período`,
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
