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

export interface PayScheduleRequest {
  account_id?: string
  frequency: 'weekly' | 'biweekly' | 'monthly'
  anchor_date: string
  day_of_month?: number
  day_of_month_2?: number
  label?: string
}

export interface PayScheduleResponse {
  id: string
  account_id: string
  frequency: string
  anchor_date: string
  day_of_month: number | null
  day_of_month_2: number | null
  label: string | null
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    const error = body.error ?? `HTTP ${res.status}`
    const code = body.code // May be present for specific errors like PAY_SCHEDULE_REQUIRED
    const apiError = new Error(error) as Error & { code?: string }
    apiError.code = code
    throw apiError
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

export function setPaySchedule(schedule: PayScheduleRequest): Promise<PayScheduleResponse> {
  return apiFetch<PayScheduleResponse>('/api/pay-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schedule),
  })
}

// Accounts CRUD
export function fetchAccounts(): Promise<AccountResponse[]> {
  return apiFetch<AccountResponse[]>('/api/accounts')
}

export function createAccount(data: {
  name: string
  current_balance: number
  currency: string
}): Promise<AccountResponse> {
  return apiFetch<AccountResponse>('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateAccount(
  id: string,
  data: Partial<{ name: string; current_balance: number; currency: string }>
): Promise<AccountResponse> {
  return apiFetch<AccountResponse>(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteAccount(id: string): Promise<void> {
  return apiFetch<void>(`/api/accounts/${id}`, {
    method: 'DELETE',
  })
}

export function setDefaultAccount(id: string): Promise<void> {
  return apiFetch<void>(`/api/accounts/${id}/set-default`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

// Transactions CRUD
export function createTransaction(data: {
  account_id: string
  amount: number
  description: string
  category: string
  is_recurring?: boolean
  frequency?: string
  anchor_date?: string
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
    category: string
    is_recurring: boolean
    frequency: string
    anchor_date: string
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
