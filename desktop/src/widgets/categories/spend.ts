import { parseDbTime } from '@/domain/dates'
import type { LedgerEntryResponse, TransactionResponse } from '@/lib/api'

export const UNCATEGORIZED = 'Uncategorized'

export interface CategorySpend {
  category: string
  /** Positive amount spent in the category this month. */
  amount: number
}

/** Local calendar month, YYYY-MM. */
export function monthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

function postedMonth(posted: string): string | null {
  try {
    return monthKey(parseDbTime(posted))
  } catch {
    return null
  }
}

/**
 * Money paid out in the local calendar month of `now`, grouped by the category of the transaction
 * each payment came from. Income and peer-debt payments are skipped; a payment with no known
 * transaction is Uncategorized. Largest category first.
 */
export function spendByCategory(
  entries: LedgerEntryResponse[],
  transactions: TransactionResponse[],
  now: Date,
): { rows: CategorySpend[]; total: number } {
  const month = monthKey(now)
  const byId = new Map(transactions.map(t => [t.id, t]))
  const totals = new Map<string, number>()

  for (const entry of entries) {
    if (entry.entry_type !== 'payment' || entry.amount >= 0) continue
    if (postedMonth(entry.posted_at) !== month) continue
    const source = entry.transaction_id ? byId.get(entry.transaction_id) : undefined
    if (source?.type === 'peer') continue
    const category = source?.category?.trim() || UNCATEGORIZED
    totals.set(category, (totals.get(category) ?? 0) + -entry.amount)
  }

  const rows = [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return { rows, total }
}
