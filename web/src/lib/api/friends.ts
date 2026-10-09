import { apiFetch } from './client'

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
