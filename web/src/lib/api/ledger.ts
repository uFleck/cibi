import { apiFetch } from './client'

export interface LedgerEntryResponse {
  id: string
  account_id: string
  transaction_id: string | null
  pay_schedule_id: string | null
  entry_type: 'payment' | 'income' | 'opening_balance' | 'manual_adjustment'
  amount: number
  description: string
  posted_at: string
}

export function fetchLedger(accountId: string): Promise<LedgerEntryResponse[]> {
  return apiFetch<LedgerEntryResponse[]>(`/api/ledger?account_id=${accountId}`)
}

export function deleteLedgerEntry(id: string): Promise<void> {
  return apiFetch<void>(`/api/ledger/${id}`, { method: 'DELETE' })
}

export function recordIncome(payload: {
  account_id: string
  pay_schedule_id: string
  amount: number
  description: string
}): Promise<void> {
  return apiFetch<void>('/api/ledger/income', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
