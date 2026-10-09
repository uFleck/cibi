import { apiFetch } from './client'

export interface TransactionResponse {
  id: string
  account_id: string
  type: 'personal' | 'peer'
  friend_id?: string | null
  amount: number
  description: string
  category?: string
  timestamp: string
  is_recurring: boolean
  requires_confirmation: boolean
  confirmed_at: string | null
  frequency: string | null
  anchor_date: string | null
  next_occurrence: string | null
  is_installment: boolean
  total_installments: number | null
  paid_installments: number
}

export function fetchTransactions(accountId: string): Promise<TransactionResponse[]> {
  return apiFetch<TransactionResponse[]>(`/api/transactions?account_id=${accountId}`)
}

// Transactions CRUD
export function createTransaction(data: {
  account_id: string
  amount: number
  description: string
  is_recurring?: boolean
  requires_confirmation?: boolean
  frequency?: string
  anchor_date?: string
  is_installment?: boolean
  total_installments?: number
}): Promise<TransactionResponse> {
  return apiFetch<TransactionResponse>('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateTransaction(
  id: string,
  data: Partial<{
    amount: number
    description: string
    is_recurring: boolean
    requires_confirmation: boolean
    frequency: string
    anchor_date: string
    is_installment: boolean
    total_installments: number | null
  }>
): Promise<TransactionResponse> {
  return apiFetch<TransactionResponse>(`/api/transactions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteTransaction(id: string): Promise<void> {
  return apiFetch<void>(`/api/transactions/${id}`, {
    method: 'DELETE',
  })
}

export function confirmTransaction(id: string): Promise<TransactionResponse> {
  return apiFetch<TransactionResponse>(`/api/transactions/${id}/confirm`, {
    method: 'POST',
  })
}

export function confirmInstallmentTransaction(id: string): Promise<TransactionResponse> {
  return apiFetch<TransactionResponse>(`/api/transactions/${id}/confirm-installment`, {
    method: 'POST',
  })
}
