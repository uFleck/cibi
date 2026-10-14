// @vitest-environment node
// Handler tests for internal/handler/group_event.go (no Go handler test exists for it). They run the
// real services and repos on createTestDb(), through localFetch. Pinned: dollars for the event total and
// the participant shares, raw cents for an event transaction amount, the participants key that is
// omitted when there are none, the [] lists, and the error texts.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import { createTestDb } from '../testing/testDb'
import { registerRoutes } from '../routes'
import type { FriendResponse } from './friend'
import type { GroupEventResponse, GroupEventTransactionResponse } from './groupEvent'

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

function put(path: string, body: unknown): Promise<Response> {
  return localFetch(path, { method: 'PUT', body: JSON.stringify(body) })
}

function eventBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { account_id: accountId, title: 'Pizza', date: '2026-07-01', total_amount: 30, ...extra }
}

async function createEvent(extra: Record<string, unknown> = {}): Promise<GroupEventResponse> {
  const res = await post('/api/group-events', eventBody(extra))
  expect(res.status).toBe(201)
  return json<GroupEventResponse>(res)
}

it('GET /api/group-events: 400 for a missing or bad account_id, [] when empty', async () => {
  const missing = await localFetch('/api/group-events')
  expect(missing.status).toBe(400)
  expect(await json(missing)).toEqual({ error: 'account_id query parameter is required' })

  const bad = await localFetch('/api/group-events?account_id=zz')
  expect(await json(bad)).toEqual({ error: 'invalid account_id' })

  const empty = await localFetch(`/api/group-events?account_id=${accountId}`)
  expect(empty.status).toBe(200)
  expect(await json(empty)).toEqual([])
})

it('GET /api/group-events: lists events in dollars and never includes the participants key', async () => {
  const e = await createEvent({ notes: 'n' })
  await put(`/api/group-events/${e.id}/participants`, {
    participants: [{ friend_id: null, share_amount: 30, is_confirmed: false }],
  })
  const list = await json<Array<Record<string, unknown>>>(
    await localFetch(`/api/group-events?account_id=${accountId}`),
  )
  expect(list).toHaveLength(1)
  expect(list[0]?.total_amount).toBe(30)
  expect(list[0]?.notes).toBe('n')
  expect('participants' in (list[0] ?? {})).toBe(false)
})

it('POST /api/group-events: 201, the total is dollars converted to cents, no participants key', async () => {
  const res = await post('/api/group-events', eventBody({ total_amount: 12.345, notes: null }))
  expect(res.status).toBe(201)
  const created = await json<Record<string, unknown>>(res)
  expect(created.total_amount).toBe(12.35)
  expect(created.host_friend_id).toBeNull()
  expect(created.notes).toBeNull()
  expect(created.public_token).toMatch(/^[0-9a-f]{32}$/)
  expect('participants' in created).toBe(false)
  const stored = await db.query<{ total_amount: number }>(`SELECT total_amount FROM GroupEvent WHERE id = ?`, [
    created.id as string,
  ])
  expect(stored[0]?.total_amount).toBe(1235)
})

it('POST /api/group-events: a zero total fails the required tag; a missing title too', async () => {
  const zero = await post('/api/group-events', eventBody({ total_amount: 0 }))
  expect(zero.status).toBe(400)
  expect(await json(zero)).toEqual({
    error: "Key: 'CreateGroupEventRequest.TotalAmount' Error:Field validation for 'TotalAmount' failed on the 'required' tag",
  })

  const noTitle = await post('/api/group-events', eventBody({ title: '' }))
  expect(await json(noTitle)).toEqual({
    error: "Key: 'CreateGroupEventRequest.Title' Error:Field validation for 'Title' failed on the 'required' tag",
  })
})

it('POST /api/group-events: a bad account_id is a 400', async () => {
  const res = await post('/api/group-events', eventBody({ account_id: 'nope' }))
  expect(res.status).toBe(400)
  expect(await json(res)).toEqual({ error: 'invalid account_id' })
})

it('GET /api/group-events/:id: 200 without participants, with them when there are some', async () => {
  const e = await createEvent()
  const bare = await json<Record<string, unknown>>(await localFetch(`/api/group-events/${e.id}`))
  expect('participants' in bare).toBe(false)

  await put(`/api/group-events/${e.id}/participants`, {
    participants: [
      { friend_id: null, share_amount: 10.5, is_confirmed: true },
      { friend_id: friendId, share_amount: 19.5, is_confirmed: false },
    ],
  })
  const res = await localFetch(`/api/group-events/${e.id}`)
  expect(res.status).toBe(200)
  const full = await json<GroupEventResponse>(res)
  expect(full.participants).toEqual([
    { friend_id: null, share_amount: 10.5, is_confirmed: true },
    { friend_id: friendId, share_amount: 19.5, is_confirmed: false },
  ])
})

it('GET /api/group-events/:id: 400 for a bad id, 404 for an unknown id', async () => {
  const bad = await localFetch('/api/group-events/xyz')
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid group event id' })

  const missing = await localFetch(`/api/group-events/${crypto.randomUUID()}`)
  expect(missing.status).toBe(404)
  expect(await json(missing)).toEqual({ error: 'group event not found' })
})

it('PATCH /api/group-events/:id: the total is dollars; the response has no participants key', async () => {
  const e = await createEvent()
  const res = await localFetch(`/api/group-events/${e.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Lunch', total_amount: 45.67 }),
  })
  expect(res.status).toBe(200)
  const updated = await json<Record<string, unknown>>(res)
  expect(updated.title).toBe('Lunch')
  expect(updated.total_amount).toBe(45.67)
  expect(updated.date).toBe('2026-07-01')
  expect('participants' in updated).toBe(false)
})

it('PATCH /api/group-events/:id: 400 for a bad id, 404 for an unknown id', async () => {
  const bad = await localFetch('/api/group-events/xyz', { method: 'PATCH', body: '{}' })
  expect(await json(bad)).toEqual({ error: 'invalid group event id' })

  const missing = await localFetch(`/api/group-events/${crypto.randomUUID()}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'x' }),
  })
  expect(missing.status).toBe(404)
  expect(await json(missing)).toEqual({ error: 'group event not found' })
})

it('DELETE /api/group-events/:id: 204, and the event is gone', async () => {
  const e = await createEvent()
  const res = await localFetch(`/api/group-events/${e.id}`, { method: 'DELETE' })
  expect(res.status).toBe(204)
  expect((await localFetch(`/api/group-events/${e.id}`)).status).toBe(404)
  const bad = await localFetch('/api/group-events/xyz', { method: 'DELETE' })
  expect(await json(bad)).toEqual({ error: 'invalid group event id' })
})

it('PUT /api/group-events/:id/participants: 204; an empty list is accepted when the owner is not required', async () => {
  const e = await createEvent()
  const owner = await put(`/api/group-events/${e.id}/participants`, {
    participants: [{ friend_id: null, share_amount: 30, is_confirmed: false }],
  })
  expect(owner.status).toBe(204)
  expect(await owner.text()).toBe('')

  // Go accepts [] (a non-nil empty slice) and the repo then rejects it: the owner must be a participant.
  const empty = await put(`/api/group-events/${e.id}/participants`, { participants: [] })
  expect(empty.status).toBe(500)
  expect(await json(empty)).toEqual({
    error: 'service.SetParticipants: group_event.SetParticipants: owner/admin must always be a participant',
  })
})

it('PUT /api/group-events/:id/participants: a missing or null list fails the required tag', async () => {
  const e = await createEvent()
  const text =
    "Key: 'SetParticipantsRequest.Participants' Error:Field validation for 'Participants' failed on the 'required' tag"
  expect(await json(await put(`/api/group-events/${e.id}/participants`, {}))).toEqual({ error: text })
  expect(await json(await put(`/api/group-events/${e.id}/participants`, { participants: null }))).toEqual({
    error: text,
  })
})

it('PUT /api/group-events/:id/participants: 400 for a bad id, a bad friend or host id, a wrong element type', async () => {
  const e = await createEvent()
  const bad = await put('/api/group-events/xyz/participants', { participants: [] })
  expect(await json(bad)).toEqual({ error: 'invalid group event id' })

  const badFriend = await put(`/api/group-events/${e.id}/participants`, {
    participants: [{ friend_id: 'nope', share_amount: 1, is_confirmed: false }],
  })
  expect(badFriend.status).toBe(400)
  expect(await json(badFriend)).toEqual({ error: 'invalid friend_id in participants' })

  const badHost = await put(`/api/group-events/${e.id}/participants`, {
    participants: [{ friend_id: null, share_amount: 30, is_confirmed: false }],
    host_friend_id: 'nope',
  })
  expect(await json(badHost)).toEqual({ error: 'invalid host_friend_id' })

  const wrongType = await put(`/api/group-events/${e.id}/participants`, { participants: 'x' })
  expect(wrongType.status).toBe(400)
  expect(await json(wrongType)).toEqual({ error: 'invalid request body' })
})

it('PUT /api/group-events/:id/participants: an empty host_friend_id means no host; a host must be a participant', async () => {
  const e = await createEvent()
  const ok = await put(`/api/group-events/${e.id}/participants`, {
    participants: [{ friend_id: null, share_amount: 30, is_confirmed: false }],
    host_friend_id: '',
  })
  expect(ok.status).toBe(204)
  expect((await json<GroupEventResponse>(await localFetch(`/api/group-events/${e.id}`))).host_friend_id).toBeNull()

  const hostMissing = await put(`/api/group-events/${e.id}/participants`, {
    participants: [{ friend_id: null, share_amount: 30, is_confirmed: false }],
    host_friend_id: friendId,
  })
  expect(hostMissing.status).toBe(500)
  expect(await json(hostMissing)).toEqual({
    error: 'service.SetParticipants: group_event.SetParticipants: host friend must be a participant',
  })
})

it('PUT /api/group-events/:id/participants: an unknown event is a 404', async () => {
  const res = await put(`/api/group-events/${crypto.randomUUID()}/participants`, {
    participants: [{ friend_id: null, share_amount: 1, is_confirmed: false }],
  })
  expect(res.status).toBe(404)
  expect(await json(res)).toEqual({ error: 'group event not found' })
})

it('POST /api/group-events/:id/transactions: 201, the amount is raw cents, created_at is whole seconds UTC', async () => {
  const e = await createEvent()
  const res = await post(`/api/group-events/${e.id}/transactions`, { description: 'drinks', amount: 1234 })
  expect(res.status).toBe(201)
  const t = await json<GroupEventTransactionResponse>(res)
  expect(t.amount).toBe(1234)
  expect(t.description).toBe('drinks')
  expect(t.event_id).toBe(e.id)
  expect(t.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  expect(Object.keys(t)).toEqual(['id', 'event_id', 'description', 'amount', 'created_at'])
})

it('POST /api/group-events/:id/transactions: validation and binding errors', async () => {
  const e = await createEvent()
  const path = `/api/group-events/${e.id}/transactions`
  const noDesc = await post(path, { description: '', amount: 5 })
  expect(noDesc.status).toBe(400)
  expect(await json(noDesc)).toEqual({
    error: "Key: 'AddTransactionRequest.Description' Error:Field validation for 'Description' failed on the 'required' tag",
  })

  const zero = await post(path, { description: 'x', amount: 0 })
  expect(await json(zero)).toEqual({
    error: "Key: 'AddTransactionRequest.Amount' Error:Field validation for 'Amount' failed on the 'required' tag",
  })

  const fraction = await post(path, { description: 'x', amount: 1.5 })
  expect(fraction.status).toBe(400)
  expect(await json(fraction)).toEqual({ error: 'invalid request body' })

  const badEvent = await post('/api/group-events/xyz/transactions', { description: 'x', amount: 5 })
  expect(await json(badEvent)).toEqual({ error: 'invalid event id' })
})

it('GET /api/group-events/:id/transactions: [] when there are none, then the transactions', async () => {
  const e = await createEvent()
  const empty = await localFetch(`/api/group-events/${e.id}/transactions`)
  expect(empty.status).toBe(200)
  expect(await json(empty)).toEqual([])

  await post(`/api/group-events/${e.id}/transactions`, { description: 'a', amount: 100 })
  const list = await json<GroupEventTransactionResponse[]>(
    await localFetch(`/api/group-events/${e.id}/transactions`),
  )
  expect(list.map((t) => t.description)).toEqual(['a'])

  const bad = await localFetch('/api/group-events/xyz/transactions')
  expect(await json(bad)).toEqual({ error: 'invalid event id' })
})

it('DELETE /api/group-events/:id/transactions/:tid: 204; a bad transaction id is a 400', async () => {
  const e = await createEvent()
  const t = await json<GroupEventTransactionResponse>(
    await post(`/api/group-events/${e.id}/transactions`, { description: 'a', amount: 100 }),
  )
  const res = await localFetch(`/api/group-events/${e.id}/transactions/${t.id}`, { method: 'DELETE' })
  expect(res.status).toBe(204)
  const list = await json<unknown[]>(await localFetch(`/api/group-events/${e.id}/transactions`))
  expect(list).toEqual([])

  const bad = await localFetch(`/api/group-events/${e.id}/transactions/xyz`, { method: 'DELETE' })
  expect(bad.status).toBe(400)
  expect(await json(bad)).toEqual({ error: 'invalid transaction id' })
})

it('POST /api/group-events/:id/transactions: an unknown event is a 500 with the Go foreign key text', async () => {
  const res = await post(`/api/group-events/${crypto.randomUUID()}/transactions`, { description: 'a', amount: 1 })
  expect(res.status).toBe(500)
  expect(await json(res)).toEqual({
    error: 'service.AddEventTransaction: group_event.InsertTransaction: constraint failed: FOREIGN KEY constraint failed (787)',
  })
})
