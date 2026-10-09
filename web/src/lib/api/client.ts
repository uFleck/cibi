export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
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
