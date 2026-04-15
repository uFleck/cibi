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
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED' | 'WAIT'
  will_afford_after_payday: boolean
  wait_until: string | null
}

export interface PayScheduleResponse {
  id: string
  account_id: string
  frequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'
  anchor_date: string
  next_payday: string
  amount: number       // dollars
  day_of_month: number | null
  day_of_month_2: number | null
  label: string | null
}

export interface CreatePayScheduleRequest {
  account_id: string
  frequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'
  anchor_date: string
  amount: number
  day_of_month?: number
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

export function postCheck(amount: number): Promise<CheckResponse> {
  return apiFetch<CheckResponse>('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
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

export function confirmTransaction(id: string): Promise<TransactionResponse> {
  return apiFetch<TransactionResponse>(`/api/transactions/${id}/confirm`, {
    method: 'POST',
  })
}

// ─── Friend Ledger Types ───────────────────────────────────────────────────

export interface FriendResponse {
  id: string
  name: string
  public_token: string
  notes: string | null
}

export interface FriendSummaryResponse {
  total_owed_to_user: number
  total_user_owes: number
  net: number
}

export interface PeerDebtResponse {
  id: string
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
  share_amount: number
  is_confirmed: boolean
}

export interface GroupEventResponse {
  id: string
  title: string
  date: string
  total_amount: number
  public_token: string
  notes: string | null
  participants?: ParticipantResponse[]
}

export interface PublicFriendResponse {
  name: string
  balance: { friend_owes_user: number; user_owes_friend: number; net: number }
  debts: PeerDebtResponse[]
}

export interface PublicGroupResponse {
  title: string
  date: string
  total_amount: number
  notes: string | null
  participants: ParticipantResponse[]
}

export interface CreateFriendRequest {
  name: string
  notes?: string
}

export interface PatchFriendRequest {
  name?: string
  notes?: string
}

export interface CreatePeerDebtRequest {
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
  title: string
  date: string
  total_amount: number
  notes?: string
}

export interface PatchGroupEventRequest {
  title?: string
  date?: string
  total_amount?: number
  notes?: string
}

export interface SetParticipantsRequest {
  participants: Array<{ friend_id: string | null; share_amount: number; is_confirmed?: boolean }>
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

export function fetchFriendSummary(): Promise<FriendSummaryResponse> {
  return apiFetch<FriendSummaryResponse>('/api/friends/summary')
}

// Peer Debts
export function listPeerDebts(friendId?: string): Promise<PeerDebtResponse[]> {
  const path = friendId ? `/api/peer-debts?friend_id=${friendId}` : '/api/peer-debts'
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

// Group Events
export function listGroupEvents(): Promise<GroupEventResponse[]> {
  return apiFetch<GroupEventResponse[]>('/api/group-events')
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

// Public (no auth required)
export function fetchPublicFriend(token: string): Promise<PublicFriendResponse> {
  return apiFetch<PublicFriendResponse>(`/public/friend/${token}`)
}

export function fetchPublicGroup(token: string): Promise<PublicGroupResponse> {
  return apiFetch<PublicGroupResponse>(`/public/group/${token}`)
}
