export interface AccountResponse {
  id: string
  name: string
  current_balance: number
  currency: string
  is_default: boolean
}

export interface TransactionResponse {
  id: string
  account_id: string
  amount: number
  description: string
  category: string
  timestamp: string
  is_recurring: boolean
  frequency: string | null
  anchor_date: string | null
  next_occurrence: string | null
}

export interface CheckResponse {
  can_buy: boolean
  purchasing_power: number
  buffer_remaining: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED'
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function fetchDefaultAccount(): Promise<AccountResponse> {
  return apiFetch<AccountResponse>('/api/accounts/default')
}

export function fetchTransactions(accountId: string): Promise<TransactionResponse[]> {
  return apiFetch<TransactionResponse[]>(`/api/transactions?account_id=${accountId}`)
}

export function postCheck(amount: number): Promise<CheckResponse> {
  return apiFetch<CheckResponse>('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  })
}
