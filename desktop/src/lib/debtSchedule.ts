/**
 * The plan of a friend debt: every installment with its due date, amount and payment
 * history, derived from the debt row plus the ledger entries that settle it.
 *
 * The debt keeps a single counter (paid_installments) and an optional next due date
 * (next_occurrence). The ledger is the audit trail: each settlement writes one payment
 * entry with the due date it paid. A debt paid before the ledger existed has paid
 * installments without entries; those rows still show as paid, just without a payment date.
 */

import { formatYmd, parseRfc3339OrYmd } from '@/domain/dates'
import { nextInstallmentDue } from '@/domain/engine/installment'
import type { LedgerEntryResponse, PeerDebtResponse } from '@/lib/api'
import { parseDateValue } from '@/lib/forecast'
import { todayIso } from '@/lib/today'

export interface DebtInstallment {
  /** 1-based installment number. */
  number: number
  /** YYYY-MM-DD, or null when the stored dates do not parse. */
  dueDate: string | null
  /** Cents, always positive; the direction comes from the debt amount. */
  amount: number
  status: 'paid' | 'next' | 'upcoming'
  /** The next installment is past its due date. */
  overdue: boolean
  /** The posting instant of the ledger entry that paid it, when there is one. */
  paidAt: string | null
  /** The ledger entry that paid it, when there is one. */
  entryId: string | null
  /** Paid by the counter only: the payment happened before the ledger existed. */
  legacy: boolean
}

export interface DebtSummary {
  schedule: DebtInstallment[]
  /** Cents. */
  total: number
  /** Cents. */
  paid: number
  /** Cents. */
  remaining: number
  paidCount: number
  totalCount: number
  next: DebtInstallment | null
  isActive: boolean
}

export interface DebtHistoryRow {
  id: string
  /** Signed cents. */
  amount: number
  kind: 'payment' | 'reversal'
  description: string
  postedAt: string
  occurrenceDate: string | null
  reversed: boolean
}

export const DEBT_FREQUENCIES = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'bi-weekly', label: 'A cada 2 semanas' },
  { value: 'yearly', label: 'Anual' },
] as const

function cents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** 1 for a lump sum, the installment count otherwise (0 when it is not set). */
export function installmentCount(debt: PeerDebtResponse): number {
  if (!debt.is_installment) return 1
  return Math.max(0, debt.total_installments ?? 0)
}

/** Cents of a regular installment (the last one may be a few cents larger). */
export function installmentAmount(debt: PeerDebtResponse): number {
  const total = installmentCount(debt)
  const abs = Math.abs(cents(debt.amount))
  if (total <= 0) return abs
  return Math.trunc(abs / total)
}

/** Cents of one installment; the last one takes the remainder so the debt ends at zero. */
export function amountForInstallment(debt: PeerDebtResponse, number: number): number {
  const total = installmentCount(debt)
  const abs = Math.abs(cents(debt.amount))
  if (!debt.is_installment || total <= 1) return abs
  const per = Math.trunc(abs / total)
  return number >= total ? abs - per * (total - 1) : per
}

function dateKey(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)
  return match?.[1] ?? null
}

/** The anchor date: the first due date of an installment debt, or the debt date. */
export function debtAnchor(debt: PeerDebtResponse): Date | null {
  return parseDateValue(debt.anchor_date ?? debt.date)
}

/** The next due date computed from the anchor and the paid count, ignoring a manual cursor. */
export function dueFromAnchor(
  anchor: string,
  paidInstallments: number,
  frequency: string | null,
): string | null {
  const parsed = parseDateValue(anchor)
  if (!parsed) return null
  return formatYmd(nextInstallmentDue(parsed, paidInstallments, frequency ?? 'monthly'))
}

/** The date of the next unpaid installment, or null when nothing is left. */
export function nextDueDate(debt: PeerDebtResponse): string | null {
  if (!debt.is_installment) {
    return debt.is_confirmed ? null : dateKey(debt.date)
  }
  const total = installmentCount(debt)
  if (total <= 0 || debt.paid_installments >= total) return null
  const manual = parseDateValue(debt.next_occurrence)
  if (manual) return formatYmd(manual)
  const anchor = debtAnchor(debt)
  if (!anchor) return null
  return formatYmd(
    nextInstallmentDue(anchor, debt.paid_installments, debt.frequency ?? 'monthly'),
  )
}

/** The due date of an unpaid installment, counted from the next due date. */
function dueDateFor(debt: PeerDebtResponse, number: number): string | null {
  if (!debt.is_installment) return dateKey(debt.date)
  if (number <= debt.paid_installments) return null
  const next = parseDateValue(nextDueDate(debt))
  if (!next) return null
  return formatYmd(
    nextInstallmentDue(
      next,
      number - debt.paid_installments - 1,
      debt.frequency ?? 'monthly',
    ),
  )
}

/**
 * The payments still standing, oldest first. A debt paid before the ledger existed has
 * a prefix of paid installments without entries; the entries that do exist are the most
 * recent paid installments, in payment order.
 */
function activePayments(debt: PeerDebtResponse, ledger: LedgerEntryResponse[]): LedgerEntryResponse[] {
  return ledger
    .filter(
      entry =>
        entry.transaction_id === debt.id &&
        entry.entry_type === 'payment' &&
        !entry.reversed_by_id &&
        !entry.reverses_entry_id,
    )
    .sort((a, b) => Date.parse(a.posted_at) - Date.parse(b.posted_at))
}

/** Installment number -> the entry that paid it, for the entries that have one. */
function paymentsByNumber(
  debt: PeerDebtResponse,
  ledger: LedgerEntryResponse[],
  paidCount: number,
): { entries: Map<number, LedgerEntryResponse>; legacyPaid: number } {
  const all = activePayments(debt, ledger)
  // More entries than the counter means the counter was edited: keep the latest ones.
  const relevant = paidCount > 0 ? all.slice(Math.max(0, all.length - paidCount)) : []
  const legacyPaid = paidCount - relevant.length
  const entries = new Map<number, LedgerEntryResponse>()
  relevant.forEach((entry, index) => entries.set(legacyPaid + index + 1, entry))
  return { entries, legacyPaid }
}

export function buildDebtSchedule(
  debt: PeerDebtResponse,
  ledger: LedgerEntryResponse[] = [],
): DebtInstallment[] {
  const total = installmentCount(debt)
  if (total <= 0) return []
  if (!debt.is_installment) {
    const paid = debt.is_confirmed
    const entry = activePayments(debt, ledger).at(-1) ?? null
    return [
      {
        number: 1,
        dueDate: dateKey(debt.date),
        amount: Math.abs(cents(debt.amount)),
        status: paid ? 'paid' : 'next',
        overdue: !paid && (dateKey(debt.date) ?? '') < todayIso(),
        paidAt: entry?.posted_at ?? null,
        entryId: entry?.id ?? null,
        legacy: paid && entry === null,
      },
    ]
  }

  const paidCount = Math.min(Math.max(debt.paid_installments, 0), total)
  const { entries } = paymentsByNumber(debt, ledger, paidCount)
  const anchor = debtAnchor(debt)
  const today = todayIso()

  return Array.from({ length: total }, (_, index) => {
    const number = index + 1
    const paid = index < paidCount
    const entry = paid ? entries.get(number) ?? null : null
    // A paid installment with a ledger row uses the date it actually paid; the legacy
    // prefix and unpaid installments follow the anchor / next due date.
    const dueDate = paid
      ? dateKey(entry?.occurrence_date) ??
        (anchor
          ? formatYmd(nextInstallmentDue(anchor, index, debt.frequency ?? 'monthly'))
          : null)
      : dueDateFor(debt, number)
    return {
      number,
      dueDate,
      amount: amountForInstallment(debt, number),
      status: paid ? 'paid' : index === paidCount ? 'next' : 'upcoming',
      overdue: !paid && index === paidCount && dueDate !== null && dueDate < today,
      paidAt: entry?.posted_at ?? null,
      entryId: entry?.id ?? null,
      legacy: paid && entry === null,
    }
  })
}

export function summarizeDebt(
  debt: PeerDebtResponse,
  ledger: LedgerEntryResponse[] = [],
): DebtSummary {
  const schedule = buildDebtSchedule(debt, ledger)
  const total = schedule.reduce((sum, item) => sum + item.amount, 0)
  const paid = schedule
    .filter(item => item.status === 'paid')
    .reduce((sum, item) => sum + item.amount, 0)
  const next = schedule.find(item => item.status === 'next') ?? null
  const isActive = debt.is_installment
    ? debt.paid_installments < installmentCount(debt)
    : !debt.is_confirmed
  return {
    schedule,
    total,
    paid,
    remaining: Math.max(0, total - paid),
    paidCount: schedule.filter(item => item.status === 'paid').length,
    totalCount: schedule.length,
    next,
    isActive,
  }
}

/** Every ledger row of a debt, newest first: payments and their reversals. */
export function debtHistory(
  debtId: string,
  ledger: LedgerEntryResponse[],
): DebtHistoryRow[] {
  return ledger
    .filter(entry => entry.transaction_id === debtId)
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
    .map(entry => ({
      id: entry.id,
      amount: cents(entry.amount),
      kind: entry.reverses_entry_id ? 'reversal' : 'payment',
      description: entry.description,
      postedAt: entry.posted_at,
      occurrenceDate: dateKey(entry.occurrence_date),
      reversed: entry.reversed_by_id !== null && entry.reversed_by_id !== undefined,
    }))
}

/** Parse a stored date string into the YYYY-MM-DD a DateInput expects. */
export function datePart(value: string | null | undefined): string {
  if (!value) return ''
  const key = dateKey(value)
  if (key) return key
  try {
    return formatYmd(parseRfc3339OrYmd(value))
  } catch {
    return ''
  }
}
