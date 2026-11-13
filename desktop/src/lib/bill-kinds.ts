// Bill types for the list filters. One-off ("Única") bills start hidden: they are mostly noise.

export type BillKind = 'fixed' | 'installment' | 'budget' | 'one-off'

export const BILL_KINDS: readonly { kind: BillKind; label: string }[] = [
  { kind: 'fixed', label: 'Fixas' },
  { kind: 'installment', label: 'Parcelas' },
  { kind: 'budget', label: 'Orçamento' },
  { kind: 'one-off', label: 'Únicas' },
]

export const DEFAULT_KINDS: readonly BillKind[] = ['fixed', 'installment', 'budget']

interface BillShape {
  is_recurring: boolean
  is_installment: boolean
  is_as_needed?: boolean
}

export function billKind(bill: BillShape): BillKind {
  if (bill.is_as_needed) return 'budget'
  if (bill.is_installment) return 'installment'
  if (bill.is_recurring) return 'fixed'
  return 'one-off'
}

interface EntryShape {
  id: string
  transaction_id: string | null
  reverses_entry_id?: string | null
}

/**
 * The bill type behind a ledger entry, or null when no bill backs it (paydays, friend debts,
 * balance adjustments). A reversal takes the type of the entry it reverses.
 */
export function entryKind<E extends EntryShape>(
  entry: E,
  bills: ReadonlyMap<string, BillShape>,
  entries: ReadonlyMap<string, E>,
): BillKind | null {
  const bill = entry.transaction_id ? bills.get(entry.transaction_id) : undefined
  if (bill) return billKind(bill)
  const original = entry.reverses_entry_id ? entries.get(entry.reverses_entry_id) : undefined
  if (original && original.id !== entry.id) {
    const originalBill = original.transaction_id ? bills.get(original.transaction_id) : undefined
    if (originalBill) return billKind(originalBill)
  }
  return null
}

/** Rows without a type always show; the chips only sort bills. */
export function kindVisible(kind: BillKind | null, selected: ReadonlySet<BillKind>): boolean {
  return kind === null || selected.has(kind)
}

export function parseKinds(raw: string | null): BillKind[] {
  if (raw === null) return [...DEFAULT_KINDS]
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_KINDS]
    const valid = new Set(BILL_KINDS.map(item => item.kind))
    return parsed.filter((value): value is BillKind => valid.has(value as BillKind))
  } catch {
    return [...DEFAULT_KINDS]
  }
}

export function countKinds(kinds: readonly (BillKind | null)[]): Record<BillKind, number> {
  const counts: Record<BillKind, number> = { fixed: 0, installment: 0, budget: 0, 'one-off': 0 }
  for (const kind of kinds) if (kind) counts[kind]++
  return counts
}
