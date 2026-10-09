import { apiFetch } from './client'

export interface PayScheduleResponse {
  id: string
  account_id: string
  frequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'
  anchor_date: string
  next_payday: string
  amount: number       // dollars
  day_of_month_2: number | null
  label: string | null
}

export interface CreatePayScheduleRequest {
  account_id: string
  frequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'
  anchor_date: string
  amount: number
  day_of_month_2?: number
  label?: string
}

export function listPaySchedules(accountId: string): Promise<PayScheduleResponse[]> {
  return apiFetch<PayScheduleResponse[]>(`/api/pay-schedule?account_id=${accountId}`)
}

export function createPaySchedule(data: CreatePayScheduleRequest): Promise<PayScheduleResponse> {
  return apiFetch<PayScheduleResponse>('/api/pay-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updatePaySchedule(id: string, data: Partial<CreatePayScheduleRequest>): Promise<void> {
  return apiFetch<void>(`/api/pay-schedule/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deletePaySchedule(id: string): Promise<void> {
  return apiFetch<void>(`/api/pay-schedule/${id}`, {
    method: 'DELETE',
  })
}

export function confirmPaySchedule(id: string): Promise<PayScheduleResponse> {
  return apiFetch<PayScheduleResponse>(`/api/pay-schedule/${id}/confirm`, {
    method: 'POST',
  })
}
