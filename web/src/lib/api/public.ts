import { apiFetch } from './client'

import type { PublicFriendResponse, PublicGroupResponse } from './friends'

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
