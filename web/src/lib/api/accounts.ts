import { apiFetch } from './client'

export interface AccountResponse {
  id: string
  name: string
  current_balance: number
  currency: string
  is_default: boolean
  safety_buffer: number
}

export function fetchDefaultAccount(): Promise<AccountResponse> {
  return apiFetch<AccountResponse>('/api/accounts/default')
}

// Accounts CRUD
export function fetchAccounts(): Promise<AccountResponse[]> {
  return apiFetch<AccountResponse[]>('/api/accounts')
}

export function createAccount(data: {
  name: string
  current_balance: number
  currency: string
  safety_buffer?: number
}): Promise<AccountResponse> {
  return apiFetch<AccountResponse>('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateAccount(
  id: string,
  data: Partial<{ name: string; current_balance: number; currency: string; safety_buffer: number }>
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
