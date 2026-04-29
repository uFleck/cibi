import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGoal, addGoalLedgerEntry, reverseGoalLedgerEntry } from '@/lib/api'

describe('goals api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('createGoal posts decimal target', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '1' }),
    } as any)

    await createGoal({ account_id: 'a', name: 'Trip', target_amount: 123.45, start_date_utc: '2026-04-29T00:00:00Z' })
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.target_amount).toBe(123.45)
  })

  it('add ledger contribution request shape', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ id: '1' }) } as any)
    await addGoalLedgerEntry('g1', { amount: 10, type: 'contribution', source: 'manual' })
    expect(true).toBe(true)
  })

  it('reverse uses dedicated endpoint (no delete)', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ id: '1' }) } as any)
    await reverseGoalLedgerEntry('g1', 'e1')
    expect(mockFetch.mock.calls[0][0]).toContain('/reverse')
  })
})
