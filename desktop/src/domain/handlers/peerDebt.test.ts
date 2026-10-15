// @vitest-environment node
// Handler tests for internal/handler/peer_debt.go (no Go handler test exists for it). They run the real
// services and repos on createTestDb(), through localFetch. Pinned: the request amount is CENTS on
// create and patch, the response is dollars; the error texts; the [] lists.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import { createTestDb } from '../testing/testDb'
import { registerRoutes } from '../routes'
import type { FriendResponse } from './friend'
import type { PeerDebtResponse } from './peerDebt'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb
let accountId: string
let friendId: string

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
  accountId = crypto.randomUUID()
  await db.query(`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, 'x', 0, 'BRL', 1)`, [
    accountId,
  ])
  registerRoutes(buildApp(db))
  friendId = (await json<FriendResponse>(await post('/api/friends', { name: 'Friend' }))).id
})

afterEach(() => {
  resetRoutesForTests()
  db.close()
})

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

function post(path: string, body: unknown): Promise<Response> {
  return localFetch(path, { method: 'POST', body: JSON.stringify(body) })
}

function patch(path: string, body: unknown): Promise<Response> {
  return localFetch(path, { method: 'PATCH', body: JSON.stringify(body) })
}

/** A valid create body; `cents` is the request amount (cents). */
function debtBody(cents: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: accountId,
    friend_id: friendId,
    amount: cents,
    description: 'lunch',
    date: '2026-06-10',
    ...extra,
  }
}

async function createDebt(cents: number, extra: Record<string, unknown> = {}): Promise<PeerDebtResponse> {
  const res = await post('/api/peer-debts', debtBody(cents, extra))
  expect(res.status).toBe(201)
  return json<PeerDebtResponse>(res)
}

async function listAll(): Promise<PeerDebtResponse[]> {
  return json<PeerDebtResponse[]>(await localFetch(`/api/peer-debts?account_id=${accountId}`))
}

it('GET /api/peer-debts: 400 for a missing, empty or bad account_id', async () => {
  const missing = await localFetch('/api/peer-debts')
  expect(missing.status).toBe(400)
  expect(await json(missing)).toEqual({ error: 'account_id query parameter is required' })

  const empty = await localFetch('/api/peer-debts?account_id=')
  expect(await json(empty)).toEqual({ error: 'account_id query parameter is required' })

  const bad = await localFetch('/api/peer-debts?account_id=nope')
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid account_id' })
})

it('GET /api/peer-debts: [] for an account with no debts (Go make)', async () => {
  const res = await localFetch(`/api/peer-debts?account_id=${accountId}`)
  expect(res.status).toBe(200)
  expect(await json(res)).toEqual([])
})

it('GET /api/peer-debts: 400 for a bad friend_id, an empty friend_id is no filter', async () => {
  const bad = await localFetch(`/api/peer-debts?account_id=${accountId}&friend_id=zz`)
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid friend_id' })

  await createDebt(1000)
  const noFilter = await localFetch(`/api/peer-debts?account_id=${accountId}&friend_id=`)
  expect(noFilter.status).toBe(200)
  expect(await json<PeerDebtResponse[]>(noFilter)).toHaveLength(1)
})

it('GET /api/peer-debts?friend_id=: only that friend, with the amount in dollars', async () => {
  const other = (await json<FriendResponse>(await post('/api/friends', { name: 'Other' }))).id
  await createDebt(-2050)
  await createDebt(300, { friend_id: other })
  const res = await localFetch(`/api/peer-debts?account_id=${accountId}&friend_id=${friendId}`)
  expect(res.status).toBe(200)
  const list = await json<PeerDebtResponse[]>(res)
  expect(list).toHaveLength(1)
  expect(list[0]?.amount).toBe(-20.5)
  expect(list[0]?.friend_id).toBe(friendId)
  expect(list[0]?.is_confirmed).toBe(false)
  expect(list[0]?.total_installments).toBeNull()
})

it('POST /api/peer-debts: 201, the request amount is cents, the response amount is dollars', async () => {
  const res = await post('/api/peer-debts', debtBody(2000, { description: 'pix', frequency: 'monthly' }))
  expect(res.status).toBe(201)
  const created = await json<PeerDebtResponse>(res)
  expect(created.amount).toBe(20)
  expect(created.description).toBe('pix')
  expect(created.date).toBe('2026-06-10')
  expect(created.paid_installments).toBe(0)
  expect(created.is_confirmed).toBe(false)
  expect(created.frequency).toBe('monthly')
  expect(created.anchor_date).toBeNull()
  const stored = await db.query<{ amount: number }>(`SELECT amount FROM "Transaction" WHERE id = ?`, [created.id])
  expect(stored[0]?.amount).toBe(2000)
})

it('POST /api/peer-debts: a fractional cents amount rounds half away from zero', async () => {
  const pos = await createDebt(12.5)
  const neg = await createDebt(-12.5)
  expect(pos.amount).toBe(0.13)
  expect(neg.amount).toBe(-0.13)
})

it('POST /api/peer-debts: a zero amount fails the required tag', async () => {
  const res = await post('/api/peer-debts', debtBody(0))
  expect(res.status).toBe(400)
  expect(await json(res)).toEqual({
    error: "Key: 'CreatePeerDebtRequest.Amount' Error:Field validation for 'Amount' failed on the 'required' tag",
  })
})

it('POST /api/peer-debts: an installment needs a positive total_installments', async () => {
  const message = 'total_installments must be a positive integer when is_installment is true'
  const none = await post('/api/peer-debts', debtBody(-1000, { is_installment: true }))
  expect(none.status).toBe(400)
  expect(await json(none)).toEqual({ error: message })

  const zero = await post('/api/peer-debts', debtBody(-1000, { is_installment: true, total_installments: 0 }))
  expect(await json(zero)).toEqual({ error: message })

  const ok = await post(
    '/api/peer-debts',
    debtBody(-1000, { is_installment: true, total_installments: 4, anchor_date: '2026-10-10T00:00:00Z' }),
  )
  expect(ok.status).toBe(201)
  const created = await json<PeerDebtResponse>(ok)
  expect(created.is_installment).toBe(true)
  expect(created.total_installments).toBe(4)
  expect(created.anchor_date).toBe('2026-10-10T00:00:00Z')
})

it('POST /api/peer-debts: a bad friend_id is checked before a bad account_id', async () => {
  const bothBad = await post('/api/peer-debts', debtBody(100, { friend_id: 'x', account_id: 'y' }))
  expect(bothBad.status).toBe(400)
  expect(await json(bothBad)).toEqual({ error: 'invalid friend_id' })

  const badAccount = await post('/api/peer-debts', debtBody(100, { account_id: 'y' }))
  expect(await json(badAccount)).toEqual({ error: 'invalid account_id' })
})

it('POST /api/peer-debts: an unknown friend_id is a 500 with the Go foreign key text', async () => {
  const res = await post('/api/peer-debts', debtBody(100, { friend_id: crypto.randomUUID() }))
  expect(res.status).toBe(500)
  expect(await json(res)).toEqual({
    error: 'service.CreateDebt: peer_debt.Insert: constraint failed: FOREIGN KEY constraint failed (787)',
  })
})

it('PATCH /api/peer-debts/:id: 204, the amount is cents and the description changes', async () => {
  const d = await createDebt(1000)
  const res = await patch(`/api/peer-debts/${d.id}`, { amount: 2550, description: 'edited' })
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
  const [updated] = await listAll()
  expect(updated?.amount).toBe(25.5)
  expect(updated?.description).toBe('edited')
})

it('PATCH /api/peer-debts/:id: an absent amount keeps the value; a fractional amount rounds', async () => {
  const d = await createDebt(1000)
  expect((await patch(`/api/peer-debts/${d.id}`, { description: 'only text' })).status).toBe(204)
  expect((await listAll())[0]?.amount).toBe(10)
  await patch(`/api/peer-debts/${d.id}`, { amount: 99.5 })
  expect((await listAll())[0]?.amount).toBe(1)
})

it('PATCH /api/peer-debts/:id: 400 for a bad id, 404 for an unknown id', async () => {
  const bad = await patch('/api/peer-debts/xyz', { amount: 1 })
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid peer debt id' })

  const missing = await patch(`/api/peer-debts/${crypto.randomUUID()}`, { amount: 1 })
  expect(missing.status).toBe(404)
  expect(await json(missing)).toEqual({ error: 'peer debt not found' })
})

it('PATCH /api/peer-debts/:id: no fields is a 500 with the Go text', async () => {
  const d = await createDebt(1000)
  const res = await patch(`/api/peer-debts/${d.id}`, {})
  expect(res.status).toBe(500)
  expect(await json(res)).toEqual({ error: 'service.UpdateDebt: peer_debt.Update: no fields provided' })
})

it('PATCH /api/peer-debts/:id: an unknown id with an empty body is a 404, not the no-fields 500', async () => {
  const missing = await localFetch(`/api/peer-debts/${crypto.randomUUID()}`, { method: 'PATCH', body: '{}' })
  expect(missing.status).toBe(404)
  expect(await json(missing)).toEqual({ error: 'peer debt not found' })
})

it('DELETE /api/peer-debts/:id: 204, the debt is gone, and a second delete is 404', async () => {
  const d = await createDebt(1000)
  const res = await localFetch(`/api/peer-debts/${d.id}`, { method: 'DELETE' })
  expect(res.status).toBe(204)
  expect(await listAll()).toEqual([])
  const again = await localFetch(`/api/peer-debts/${d.id}`, { method: 'DELETE' })
  expect(again.status).toBe(404)
  expect(await json(again)).toEqual({ error: 'peer debt not found' })
  const bad = await localFetch('/api/peer-debts/xyz', { method: 'DELETE' })
  expect(await json(bad)).toEqual({ error: 'invalid peer debt id' })
})

it('POST /api/peer-debts/:id/confirm: a lump sum is confirmed; an installment steps up to its total', async () => {
  const lump = await createDebt(1000)
  const confirm = await localFetch(`/api/peer-debts/${lump.id}/confirm`, { method: 'POST', body: '{}' })
  expect(confirm.status).toBe(204)
  expect((await listAll()).find((x) => x.id === lump.id)?.is_confirmed).toBe(true)

  const inst = await createDebt(-400, { is_installment: true, total_installments: 2, anchor_date: '2026-10-10' })
  for (let i = 0; i < 3; i++) {
    expect((await localFetch(`/api/peer-debts/${inst.id}/confirm`, { method: 'POST' })).status).toBe(204)
  }
  const paid = (await listAll()).find((x) => x.id === inst.id)?.paid_installments
  expect(paid).toBe(2)
})

it('POST /api/peer-debts/:id/confirm: 400 for a bad id, 404 for an unknown id', async () => {
  const bad = await localFetch('/api/peer-debts/xyz/confirm', { method: 'POST' })
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid peer debt id' })

  const missing = await localFetch(`/api/peer-debts/${crypto.randomUUID()}/confirm`, { method: 'POST' })
  expect(missing.status).toBe(404)
  expect(await json(missing)).toEqual({ error: 'peer debt not found' })
})

it('POST /api/peer-debts/:id/confirm-toggle: flips a lump sum back and forth; 404 for an unknown id', async () => {
  const d = await createDebt(1000)
  expect((await localFetch(`/api/peer-debts/${d.id}/confirm-toggle`, { method: 'POST' })).status).toBe(204)
  expect((await listAll())[0]?.is_confirmed).toBe(true)
  expect((await localFetch(`/api/peer-debts/${d.id}/confirm-toggle`, { method: 'POST' })).status).toBe(204)
  expect((await listAll())[0]?.is_confirmed).toBe(false)

  const missing = await localFetch(`/api/peer-debts/${crypto.randomUUID()}/confirm-toggle`, { method: 'POST' })
  expect(missing.status).toBe(404)
  expect(await json(missing)).toEqual({ error: 'peer debt not found' })
})
