import { apiFetch } from './client'

export interface CheckGoalImpactResponse {
  goal_id: string
  goal_name: string
  remaining_before: number
  remaining_after: number
  progress_before_pct: number
  progress_after_pct: number
  min_contribution_per_window: number
  severity: 'low' | 'medium' | 'high'
}

export interface CheckGoalWindowCoverageResponse {
  goal_id: string
  goal_name: string
  contributed_this_window: number
  min_contribution_per_window: number
}

export interface CheckResponse {
  can_buy: boolean
  purchasing_power: number
  buffer_remaining: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED' | 'WAIT'
  will_afford_after_payday: boolean
  wait_until: string | null
  goal_impacts: CheckGoalImpactResponse[]
  goals_covered_this_window: CheckGoalWindowCoverageResponse[]
}

export function postCheck(amount: number, accountId?: string): Promise<CheckResponse> {
  return apiFetch<CheckResponse>('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, ...(accountId ? { account_id: accountId } : {}) }),
  })
}
