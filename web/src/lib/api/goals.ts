import { apiFetch } from './client'

export interface GoalResponse {
  id: string
  account_id: string
  name: string
  status: 'draft' | 'active' | 'completed' | 'archived'
  target_amount: number
  invested_total: number
  min_contribution_per_window?: number
  start_date_utc: string
  target_date_utc: string | null
  notes: string | null
  currency: string
}

export interface GoalLedgerEntryResponse {
  id: string
  goal_id: string
  amount: number
  type: 'contribution' | 'withdrawal' | 'adjustment'
  source: 'manual' | 'system' | 'recurring'
  note: string | null
  reverses_entry_id: string | null
  timestamp_utc: string
}

export interface GoalsTrackingSummaryResponse {
  goals_count: number
  completed_count: number
  total_target: number
  total_invested: number
  total_remaining: number
}

export interface GoalsTrackingGoalResponse {
  id: string
  name: string
  status: 'draft' | 'active' | 'completed' | 'archived'
  target_amount: number
  invested_total: number
  remaining_amount: number
  progress_pct: number
  min_contribution_per_window?: number
  target_date_utc: string | null
  created_at_utc: string
}

export interface GoalsTrackingActivityResponse {
  goal_id: string
  goal_name: string
  entry_id: string
  amount: number
  type: 'contribution' | 'withdrawal' | 'adjustment'
  source: 'manual' | 'system' | 'recurring'
  timestamp_utc: string
}

export interface GoalsTrackingResponse {
  summary: GoalsTrackingSummaryResponse
  top_goals: GoalsTrackingGoalResponse[]
  recent_activity: GoalsTrackingActivityResponse[]
  updated_at_utc: string
}

export interface GoalRecurringDueItemResponse {
  id: string
  goal_id: string
  goal_name: string
  amount: number
  frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'
  anchor_date_utc: string
  next_due_utc: string
  is_overdue: boolean
  last_entry_id: string | null
  last_posted_at_utc: string | null
}

export function listGoals(accountId: string): Promise<GoalResponse[]> {
  return apiFetch<GoalResponse[]>(`/api/goals?account_id=${accountId}`)
}

export function fetchGoalsTracking(accountId: string): Promise<GoalsTrackingResponse> {
  return apiFetch<GoalsTrackingResponse>(`/api/goals/tracking?account_id=${accountId}`)
}

export function createGoal(data: {
  account_id: string
  name: string
  target_amount: number
  min_contribution_per_window?: number
  start_date_utc: string
  target_date_utc?: string
  notes?: string
}): Promise<GoalResponse> {
  return apiFetch<GoalResponse>('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateGoal(id: string, data: Partial<{ name: string; target_amount: number; target_date_utc: string; notes: string; min_contribution_per_window: number }>): Promise<void> {
  return apiFetch<void>(`/api/goals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function listGoalLedger(goalId: string): Promise<GoalLedgerEntryResponse[]> {
  return apiFetch<GoalLedgerEntryResponse[]>(`/api/goals/${goalId}/ledger`)
}

export function addGoalLedgerEntry(goalId: string, data: {
  amount: number
  type: 'contribution' | 'withdrawal' | 'adjustment'
  source?: 'manual' | 'system'
  note?: string
}): Promise<GoalLedgerEntryResponse> {
  return apiFetch<GoalLedgerEntryResponse>(`/api/goals/${goalId}/ledger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function reverseGoalLedgerEntry(goalId: string, entryId: string): Promise<GoalLedgerEntryResponse> {
  return apiFetch<GoalLedgerEntryResponse>(`/api/goals/${goalId}/ledger/${entryId}/reverse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export function listGoalRecurring(accountId: string): Promise<GoalRecurringDueItemResponse[]> {
  return apiFetch<GoalRecurringDueItemResponse[]>(`/api/goals/recurring?account_id=${accountId}`)
}

export function confirmGoalRecurring(id: string): Promise<void> {
  return apiFetch<void>(`/api/goals/recurring/${id}/confirm`, {
    method: 'POST',
  })
}
