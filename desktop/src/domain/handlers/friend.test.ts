// @vitest-environment node
// Handler tests for internal/handler/friend.go (no Go handler test exists for it). They run the real
// services and repos on createTestDb(), through localFetch, and pin the behaviors checked in the
// real-data comparison against the Go server: the error texts, the null and [] lists, the dollars.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import { createTestDb } from '../testing/testDb'
import type { FriendResponse, FriendSummaryResponse } from './friend'
import type { PeerDebtResponse } from './peerDebt'
import type { GroupEventResponse } from './groupEvent'
import { registerRoutes } from '../routes'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb
let accountId: string

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
  accountId = crypto.randomUUID()
  await db.query(`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, 'x', 0, 'BRL', 1)`, [
    accountId,
  ])
  registerRoutes(buildApp(db))
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

async function createFriend(name: string, extra: Record<string, unknown> = {}): Promise<FriendResponse> {
  const res = await post('/api/friends', { name, ...extra })
  expect(res.status).toBe(201)
  return json<FriendResponse>(res)
}

/** A peer debt of `cents` (the request amount is cents) for the friend, on the test account. */
async function createDebt(friendId: string, cents: number, extra: Record<string, unknown> = {}): Promise<PeerDebtResponse> {
  const res = await post('/api/peer-debts', {
    account_id: accountId,
    friend_id: friendId,
    amount: cents,
    description: 'd',
    date: '2026-06-10',
    ...extra,
  })
  expect(res.status).toBe(201)
  return json<PeerDebtResponse>(res)
}

it('GET /api/friends: an empty table is [] (Go make)', async () => {
  const res = await localFetch('/api/friends')
  expect(res.status).toBe(200)
  expect(await json<unknown[]>(res)).toEqual([])
})

it('POST /api/friends: 201 with every field, the public token is 32 hex chars', async () => {
  const f = await createFriend('Ana', { notes: 'n', pix_key: 'ana@pix' })
  expect(f.name).toBe('Ana')
  expect(f.notes).toBe('n')
  expect(f.pix_key).toBe('ana@pix')
  expect(f.public_token).toMatch(/^[0-9a-f]{32}$/)
  expect(Object.keys(f)).toEqual(['id', 'name', 'public_token', 'notes', 'pix_key'])
})

it('POST /api/friends: absent optional fields are null, not omitted', async () => {
  const f = await createFriend('Bia')
  expect(f.notes).toBeNull()
  expect(f.pix_key).toBeNull()
})

it('POST /api/friends: a missing name is a 400 with the validator text', async () => {
  const res = await post('/api/friends', { notes: 'x' })
  expect(res.status).toBe(400)
  expect(await json(res)).toEqual({
    error: "Key: 'CreateFriendRequest.Name' Error:Field validation for 'Name' failed on the 'required' tag",
  })
})

it('POST /api/friends: a malformed body is a 400', async () => {
  const res = await localFetch('/api/friends', { method: 'POST', body: '{"name":' })
  expect(res.status).toBe(400)
  expect(await json(res)).toEqual({ error: 'invalid request body' })
})

it('GET /api/friends: lists every friend', async () => {
  await createFriend('A')
  await createFriend('B')
  const list = await json<FriendResponse[]>(await localFetch('/api/friends'))
  expect(list.map((f) => f.name)).toEqual(['A', 'B'])
})

it('GET /api/friends/:id: 200, 400 for a bad id, 404 for an unknown id', async () => {
  const f = await createFriend('C')
  const ok = await localFetch(`/api/friends/${f.id}`)
  expect(ok.status).toBe(200)
  expect(await json<FriendResponse>(ok)).toEqual(f)

  const bad = await localFetch('/api/friends/not-a-uuid')
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid friend id' })

  const missing = await localFetch(`/api/friends/${crypto.randomUUID()}`)
  expect(missing.status).toBe(404)
  expect(await json(missing)).toEqual({ error: 'friend not found' })
})

it('PATCH /api/friends/:id: null and absent fields keep their value, "" clears a text field', async () => {
  const f = await createFriend('D', { notes: 'keep', pix_key: 'pk' })
  const res = await patch(`/api/friends/${f.id}`, { name: 'D2', notes: null, pix_key: '' })
  expect(res.status).toBe(200)
  const updated = await json<FriendResponse>(res)
  expect(updated.name).toBe('D2')
  expect(updated.notes).toBe('keep')
  expect(updated.pix_key).toBe('')
})

it('PATCH /api/friends/:id: 400 for a bad id, 404 for an unknown id, 404 for an unknown id even with no fields', async () => {
  const bad = await patch('/api/friends/xyz', { name: 'x' })
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid friend id' })

  const missing = await patch(`/api/friends/${crypto.randomUUID()}`, { name: 'x' })
  expect(missing.status).toBe(404)
  expect(await json(missing)).toEqual({ error: 'friend not found' })

  const noFields = await patch(`/api/friends/${crypto.randomUUID()}`, {})
  expect(noFields.status).toBe(404)
  expect(await json(noFields)).toEqual({ error: 'friend not found' })
})

it('DELETE /api/friends/:id: 204, and 204 again for the same id (Go does not check rows affected)', async () => {
  const f = await createFriend('E')
  const res = await localFetch(`/api/friends/${f.id}`, { method: 'DELETE' })
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
  const again = await localFetch(`/api/friends/${f.id}`, { method: 'DELETE' })
  expect(again.status).toBe(204)
  const bad = await localFetch('/api/friends/xyz', { method: 'DELETE' })
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid friend id' })
})

const FRIEND_IN_USE = 'friend still has peer debts or group events; remove them before deleting the friend'

async function expectFriendKept(id: string): Promise<void> {
  const res = await localFetch(`/api/friends/${id}`)
  expect(res.status).toBe(200)
}

it('DELETE /api/friends/:id with peer debts: 409 with a clear message, nothing is deleted', async () => {
  const f = await createFriend('F')
  const debt = await createDebt(f.id, 1000)
  const res = await localFetch(`/api/friends/${f.id}`, { method: 'DELETE' })
  expect(res.status).toBe(409)
  expect(await json(res)).toEqual({ error: FRIEND_IN_USE })
  await expectFriendKept(f.id)
  const debts = await db.query(`SELECT id FROM "Transaction" WHERE id = ?`, [debt.id])
  expect(debts).toHaveLength(1)
})

async function createEventWith(participants: unknown[], hostFriendId: string | null): Promise<GroupEventResponse> {
  const ev = await post('/api/group-events', { account_id: accountId, title: 'Pizza', date: '2026-07-01', total_amount: 30 })
  expect(ev.status).toBe(201)
  const event = await json<GroupEventResponse>(ev)
  const set = await localFetch(`/api/group-events/${event.id}/participants`, {
    method: 'PUT',
    body: JSON.stringify({ participants, host_friend_id: hostFriendId }),
  })
  expect(set.status).toBe(204)
  return event
}

it('DELETE /api/friends/:id as a group event participant: 409, nothing is deleted', async () => {
  const host = await createFriend('Host')
  const guest = await createFriend('Guest')
  const event = await createEventWith(
    [
      { friend_id: null, share_amount: 10, is_confirmed: false },
      { friend_id: host.id, share_amount: 10, is_confirmed: false },
      { friend_id: guest.id, share_amount: 10, is_confirmed: false },
    ],
    host.id,
  )
  const res = await localFetch(`/api/friends/${guest.id}`, { method: 'DELETE' })
  expect(res.status).toBe(409)
  expect(await json(res)).toEqual({ error: FRIEND_IN_USE })
  await expectFriendKept(guest.id)
  const rows = await db.query(`SELECT friend_id FROM GroupEventParticipant WHERE event_id = ?`, [event.id])
  expect(rows).toHaveLength(3)
})

it('DELETE /api/friends/:id as a group event host: 409, nothing is deleted', async () => {
  const host = await createFriend('Host')
  await createEventWith(
    [
      { friend_id: null, share_amount: 15, is_confirmed: false },
      { friend_id: host.id, share_amount: 15, is_confirmed: false },
    ],
    host.id,
  )
  // Drop the host from the participants so only GroupEvent.host_friend_id still references the friend.
  await db.query(`DELETE FROM GroupEventParticipant WHERE friend_id = ?`, [host.id])
  const res = await localFetch(`/api/friends/${host.id}`, { method: 'DELETE' })
  expect(res.status).toBe(409)
  expect(await json(res)).toEqual({ error: FRIEND_IN_USE })
  await expectFriendKept(host.id)
})

it('GET /api/friends/summary: 400 when account_id is missing, empty or bad', async () => {
  const missing = await localFetch('/api/friends/summary')
  expect(missing.status).toBe(400)
  expect(await json(missing)).toEqual({ error: 'account_id query parameter is required' })

  const empty = await localFetch('/api/friends/summary?account_id=')
  expect(await json(empty)).toEqual({ error: 'account_id query parameter is required' })

  const bad = await localFetch('/api/friends/summary?account_id=zz')
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid account_id' })
})

it('GET /api/friends/summary: zeros for an account with no debts; amounts are dollars', async () => {
  const empty = await localFetch(`/api/friends/summary?account_id=${accountId}`)
  expect(empty.status).toBe(200)
  expect(await json<FriendSummaryResponse>(empty)).toEqual({
    total_owed_to_user: 0,
    total_user_owes: 0,
    net: 0,
    next_user_payment: 0,
  })

  const f = await createFriend('G')
  // Owed to the user: 1000 cents; the user owes 250 cents (a whole-number installment remainder is avoided).
  await createDebt(f.id, 1000)
  await createDebt(f.id, -250)
  const res = await localFetch(`/api/friends/summary?account_id=${accountId}`)
  expect(res.status).toBe(200)
  const s = await json<FriendSummaryResponse>(res)
  expect(s.total_owed_to_user).toBe(10)
  expect(s.total_user_owes).toBe(2.5)
  expect(s.net).toBe(7.5)
})

it('GET /api/friends/summary: an installment remainder with fractional cents is rounded to the nearest cent', async () => {
  const f = await createFriend('I')
  // The user owes 1000 cents in 3 installments; after one is paid the remainder is 666.666... cents.
  const debt = await createDebt(f.id, -1000, { is_installment: true, total_installments: 3, frequency: 'monthly' })
  expect((await post(`/api/peer-debts/${debt.id}/confirm`, {})).status).toBe(204)

  const res = await localFetch(`/api/friends/summary?account_id=${accountId}`)
  expect(res.status).toBe(200)
  const s = await json<FriendSummaryResponse>(res)
  // 666.67 cents rounds to 667 cents (nearest, not truncated to 666).
  expect(s.total_owed_to_user).toBe(0)
  expect(s.total_user_owes).toBe(6.67)
  expect(s.net).toBe(-6.67)
})

it('GET /api/friends/summary: a balance of 1,000,000 cents or more is 200 (no exponent-format failure)', async () => {
  const f = await createFriend('J')
  // Owed to the user: 2,000,000 cents in a lump sum and 4,500,000 in an installment debt (none paid).
  await createDebt(f.id, 2000000)
  await createDebt(f.id, 4500000, { is_installment: true, total_installments: 3, frequency: 'monthly' })
  // The user owes 1,500,000 cents in a lump sum.
  await createDebt(f.id, -1500000)

  const res = await localFetch(`/api/friends/summary?account_id=${accountId}`)
  expect(res.status).toBe(200)
  const s = await json<FriendSummaryResponse>(res)
  expect(s.total_owed_to_user).toBe(65000)
  expect(s.total_user_owes).toBe(15000)
  expect(s.net).toBe(50000)
})

it('GET /api/friends/:id: 200 for a friend with a fractional-cents installment remainder', async () => {
  const f = await createFriend('K')
  const debt = await createDebt(f.id, -1000, { is_installment: true, total_installments: 3, frequency: 'monthly' })
  expect((await post(`/api/peer-debts/${debt.id}/confirm`, {})).status).toBe(204)

  const res = await localFetch(`/api/friends/${f.id}`)
  expect(res.status).toBe(200)
  expect(await json<FriendResponse>(res)).toEqual(f)
})

it('GET /api/friends/breakdown: 400 when account_id is missing or bad', async () => {
  const missing = await localFetch('/api/friends/breakdown')
  expect(missing.status).toBe(400)
  expect(await json(missing)).toEqual({ error: 'account_id query parameter is required' })

  const bad = await localFetch('/api/friends/breakdown?account_id=zz')
  expect(await json(bad)).toEqual({ error: 'invalid account_id' })
})

it('GET /api/friends/breakdown: [] with no debts (Go make), a lump sum is one item in dollars', async () => {
  const empty = await localFetch(`/api/friends/breakdown?account_id=${accountId}`)
  expect(empty.status).toBe(200)
  expect(await json(empty)).toEqual([])

  const f = await createFriend('H')
  await createDebt(f.id, -4500, { date: '2026-06-10' })
  const res = await localFetch(`/api/friends/breakdown?account_id=${accountId}`)
  expect(res.status).toBe(200)
  const items = await json<Array<Record<string, unknown>>>(res)
  expect(items).toEqual([
    {
      friend_name: 'H',
      total_amount: 45,
      next_payment: 45,
      is_installment: false,
      per_install_amount: 45,
      total_installments: 0,
      paid_installments: 0,
      next_payment_date: '2026-06-10',
    },
  ])
})

it('GET /api/friends/breakdown: the group expenses the admin owes come after the debts, with the stored date', async () => {
  const host = await createFriend('Host')
  const ev = await post('/api/group-events', {
    account_id: accountId,
    title: 'Pizza',
    date: '2026-07-01',
    total_amount: 30,
  })
  expect(ev.status).toBe(201)
  const event = await json<GroupEventResponse>(ev)
  const set = await localFetch(`/api/group-events/${event.id}/participants`, {
    method: 'PUT',
    body: JSON.stringify({
      participants: [
        { friend_id: null, share_amount: 10, is_confirmed: false },
        { friend_id: host.id, share_amount: 20, is_confirmed: false },
      ],
      host_friend_id: host.id,
    }),
  })
  expect(set.status).toBe(204)

  const res = await localFetch(`/api/friends/breakdown?account_id=${accountId}`)
  const items = await json<Array<Record<string, unknown>>>(res)
  expect(items).toEqual([
    {
      friend_name: 'Host',
      total_amount: 10,
      next_payment: 10,
      is_installment: false,
      per_install_amount: 10,
      total_installments: 1,
      paid_installments: 0,
      next_payment_date: '2026-07-01',
    },
  ])
})
