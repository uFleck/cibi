export interface AccountResponse {
  id: string
  name: string
  current_balance: number
  currency: string
  is_default: boolean
  safety_buffer: number
}

export interface TransactionResponse {
  id: string
  account_id: string
  amount: number
  description: string
  category: string
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
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) return undefined as T
  return res.json() as Promise<T>
}

export function fetchDefaultAccount(): Promise<AccountResponse> {
  return apiFetch<AccountResponse>('/api/accounts/default')
}

export function fetchTransactions(accountId: string): Promise<TransactionResponse[]> {
  return apiFetch<TransactionResponse[]>(`/api/transactions?account_id=${accountId}`)
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

export function postCheck(amount: number, accountId?: string): Promise<CheckResponse> {
  return apiFetch<CheckResponse>('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, ...(accountId ? { account_id: accountId } : {}) }),
  })
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

// Transactions CRUD
export function createTransaction(data: {
  account_id: string
  amount: number
  description: string
  category: string
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
    category: string
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

// ─── Friend Ledger Types ───────────────────────────────────────────────────

export interface FriendResponse {
  id: string
  name: string
  public_token: string
  notes: string | null
  pix_key?: string | null
}

export interface FriendSummaryResponse {
  total_owed_to_user: number
  total_user_owes: number
  net: number
  next_user_payment: number
}

export interface FriendDebtBreakdownItem {
  friend_name: string
  total_amount: number         // dollars
  next_payment: number         // dollars
  is_installment: boolean
  per_install_amount: number   // dollars
  total_installments: number
  paid_installments: number
  next_payment_date: string | null
}

export interface PeerDebtResponse {
  id: string
  account_id: string
  friend_id: string
  amount: number
  description: string
  date: string
  is_installment: boolean
  total_installments: number | null
  paid_installments: number
  frequency: string | null
  anchor_date: string | null
  is_confirmed: boolean
}

export interface ParticipantResponse {
  friend_id: string | null
  name?: string
  share_amount: number
  is_confirmed: boolean
}

export interface GroupEventResponse {
  id: string
  account_id: string
  title: string
  date: string
  total_amount: number
  public_token: string
  notes: string | null
  host_friend_id?: string | null
  participants?: ParticipantResponse[]
}

export interface PublicFriendGroupResponse {
  event_id: string
  title: string
  date: string
  share_amount: number
  is_confirmed: boolean
  host_name: string
  host_pix_key?: string | null
  viewer_is_host?: boolean
}

export interface PublicFriendResponse {
  name: string
  friend_pix_key?: string | null
  owner_pix_key?: string | null
  balance: { friend_owes_user: number; user_owes_friend: number; net: number }
  debts: PeerDebtResponse[]
  groups: PublicFriendGroupResponse[]
  hosted_groups?: Array<{
    event_id: string
    title: string
    date: string
    participants: Array<{ friend_id: string; friend_name: string; share_amount: number; is_confirmed: boolean }>
  }>
}

export interface PublicGroupResponse {
  title: string
  date: string
  total_amount: number
  notes: string | null
  host_name: string
  host_pix_key?: string | null
  participants: Array<ParticipantResponse & { is_host?: boolean }>
}

export interface CreateFriendRequest {
  name: string
  notes?: string
  pix_key?: string
}

export interface PatchFriendRequest {
  name?: string
  notes?: string
  pix_key?: string
}

export interface CreatePeerDebtRequest {
  account_id: string
  friend_id: string
  amount: number
  description: string
  date: string
  is_installment?: boolean
  total_installments?: number
  frequency?: string
}

export interface PatchPeerDebtRequest {
  amount?: number
  description?: string
  date?: string
  is_installment?: boolean
  total_installments?: number
  frequency?: string
  is_confirmed?: boolean
}

export interface CreateGroupEventRequest {
  account_id: string
  title: string
  date: string
  notes?: string
}

export interface PatchGroupEventRequest {
  title?: string
  date?: string
  total_amount?: number
  notes?: string
}

export interface GroupEventTransactionResponse {
  id: string
  event_id: string
  description: string
  amount: number
  created_at: string
}

export interface AddTransactionRequest {
  description: string
  amount: number
}

export interface SetParticipantsRequest {
  participants: Array<{ friend_id: string | null; share_amount: number; is_confirmed?: boolean }>
  host_friend_id?: string | null
}

// ─── Friend Ledger API Functions ──────────────────────────────────────────

// Friends
export function listFriends(): Promise<FriendResponse[]> {
  return apiFetch<FriendResponse[]>('/api/friends')
}

export function createFriend(data: CreateFriendRequest): Promise<FriendResponse> {
  return apiFetch<FriendResponse>('/api/friends', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateFriend(id: string, data: PatchFriendRequest): Promise<void> {
  return apiFetch<void>(`/api/friends/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteFriend(id: string): Promise<void> {
  return apiFetch<void>(`/api/friends/${id}`, {
    method: 'DELETE',
  })
}

export function fetchFriendSummary(accountId: string): Promise<FriendSummaryResponse> {
  return apiFetch<FriendSummaryResponse>(`/api/friends/summary?account_id=${accountId}`)
}

export function fetchFriendBreakdown(accountId: string): Promise<FriendDebtBreakdownItem[]> {
  return apiFetch<FriendDebtBreakdownItem[]>(`/api/friends/breakdown?account_id=${accountId}`)
}

// Peer Debts
export function listPeerDebts(accountId: string, friendId?: string): Promise<PeerDebtResponse[]> {
  const path = friendId
    ? `/api/peer-debts?account_id=${accountId}&friend_id=${friendId}`
    : `/api/peer-debts?account_id=${accountId}`
  return apiFetch<PeerDebtResponse[]>(path)
}

export function createPeerDebt(data: CreatePeerDebtRequest): Promise<PeerDebtResponse> {
  return apiFetch<PeerDebtResponse>('/api/peer-debts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updatePeerDebt(id: string, data: PatchPeerDebtRequest): Promise<void> {
  return apiFetch<void>(`/api/peer-debts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deletePeerDebt(id: string): Promise<void> {
  return apiFetch<void>(`/api/peer-debts/${id}`, {
    method: 'DELETE',
  })
}

export function confirmDebt(id: string): Promise<void> {
  return apiFetch<void>(`/api/peer-debts/${id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export function toggleDebtConfirm(id: string): Promise<void> {
  return apiFetch<void>(`/api/peer-debts/${id}/confirm-toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

// Group Events
export function listGroupEvents(accountId: string): Promise<GroupEventResponse[]> {
  return apiFetch<GroupEventResponse[]>(`/api/group-events?account_id=${accountId}`)
}

export function createGroupEvent(data: CreateGroupEventRequest): Promise<GroupEventResponse> {
  return apiFetch<GroupEventResponse>('/api/group-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getGroupEvent(id: string): Promise<GroupEventResponse> {
  return apiFetch<GroupEventResponse>(`/api/group-events/${id}`)
}

export function updateGroupEvent(id: string, data: PatchGroupEventRequest): Promise<void> {
  return apiFetch<void>(`/api/group-events/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteGroupEvent(id: string): Promise<void> {
  return apiFetch<void>(`/api/group-events/${id}`, {
    method: 'DELETE',
  })
}

export function setParticipants(eventId: string, data: SetParticipantsRequest): Promise<void> {
  return apiFetch<void>(`/api/group-events/${eventId}/participants`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function addGroupEventTransaction(eventId: string, data: AddTransactionRequest): Promise<GroupEventTransactionResponse> {
  return apiFetch<GroupEventTransactionResponse>(`/api/group-events/${eventId}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function removeGroupEventTransaction(eventId: string, transactionId: string): Promise<void> {
  return apiFetch<void>(`/api/group-events/${eventId}/transactions/${transactionId}`, {
    method: 'DELETE',
  })
}

export function listGroupEventTransactions(eventId: string): Promise<GroupEventTransactionResponse[]> {
  return apiFetch<GroupEventTransactionResponse[]>(`/api/group-events/${eventId}/transactions`)
}

export interface PublicConfigResponse {
  public_base_url: string
}

export function fetchPublicConfig(): Promise<PublicConfigResponse> {
  return apiFetch<PublicConfigResponse>('/api/config')
}

export interface ProfileResponse {
  display_name: string
  pix_key?: string | null
  theme: string
}

export type UpdateProfileRequest = {
  display_name: string
  pix_key?: string | null
  theme: string
}

export function fetchProfile(accountId: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>(`/api/profile?account_id=${accountId}`)
}

export function updateProfile(accountId: string, data: UpdateProfileRequest): Promise<void> {
  return apiFetch<void>(`/api/profile?account_id=${accountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// Public (no auth required)
export function fetchPublicFriend(token: string): Promise<PublicFriendResponse> {
  return apiFetch<PublicFriendResponse>(`/public/friend/${token}`, {
    headers: {
      'Accept': 'application/json'
    }
  })
}

export function confirmPublicFriendGroupPayment(token: string, eventId: string, friendId: string): Promise<void> {
  return apiFetch<void>(`/public/friend/${token}/groups/${eventId}/participants/${friendId}/confirm`, {
    method: 'POST',
  })
}

export function togglePublicFriendGroupPayment(token: string, eventId: string, friendId: string): Promise<void> {
  return apiFetch<void>(`/public/friend/${token}/groups/${eventId}/participants/${friendId}/confirm-toggle`, {
    method: 'POST',
  })
}

export function fetchPublicGroup(token: string): Promise<PublicGroupResponse> {
  return apiFetch<PublicGroupResponse>(`/public/group/${token}`, {
    headers: {
      'Accept': 'application/json'
    }
  })
}

export function updatePublicFriendPixKey(token: string, pixKey: string): Promise<void> {
  return apiFetch<void>(`/public/friend/${token}/pix-key`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pix_key: pixKey }),
  })
}

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
