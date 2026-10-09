import { apiFetch } from './client'

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
