// @vitest-environment node
// Ports of internal/repo/sqlite/group_event_test.go (2 tests). The Go tests create a schema of their own
// (groupEventSchema); here they run on createTestDb() with the real schema, which has foreign keys from
// GroupEvent.account_id to Account and from GroupEvent.host_friend_id to Friend, so those rows are
// inserted first. The tests after the Go ones cover the paths the Go tests do not reach.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testing/testDb'
import { SqliteGroupEventRepo, type GroupEvent } from './groupEvent'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

async function insertAccount(id: string): Promise<void> {
  await db.query(`INSERT INTO Account (id, name, current_balance, currency) VALUES (?, 'x', 0, 'BRL')`, [
    id,
  ])
}

async function insertFriend(id: string, name: string): Promise<void> {
  await db.query(`INSERT INTO Friend (id, name, public_token) VALUES (?, ?, ?)`, [id, name, `tok-${id}`])
}

function event(over: Partial<GroupEvent> & Pick<GroupEvent, 'accountId'>): GroupEvent {
  return {
    id: crypto.randomUUID(),
    title: 'pizza',
    date: '2026-01-10T00:00:00Z',
    totalAmount: 1000,
    publicToken: crypto.randomUUID().replace(/-/g, ''),
    notes: null,
    hostFriendId: null,
    ...over,
  }
}

// TestGroupEventRepo_GetAll_OptionalAccountFilter
it('TestGroupEventRepo_GetAll_OptionalAccountFilter', async () => {
  const repo = new SqliteGroupEventRepo(db)
  const accountA = crypto.randomUUID()
  const accountB = crypto.randomUUID()
  await insertAccount(accountA)
  await insertAccount(accountB)

  await db.query(
    `INSERT INTO GroupEvent (id, account_id, title, date, total_amount, public_token, notes, host_friend_id)
		VALUES
		  (?, ?, 'a1', '2026-01-01T00:00:00Z', 1000, 't1', NULL, NULL),
		  (?, ?, 'a2', '2026-01-02T00:00:00Z', 2000, 't2', NULL, NULL),
		  (?, ?, 'b1', '2026-01-03T00:00:00Z', 3000, 't3', NULL, NULL)`,
    [
      crypto.randomUUID(),
      accountA,
      crypto.randomUUID(),
      accountA,
      crypto.randomUUID(),
      accountB,
    ],
  )

  const all = await repo.getAll(null)
  expect(all).toHaveLength(3)
  const scoped = await repo.getAll(accountA)
  expect(scoped).toHaveLength(2)
})

// TestGroupEventRepo_SumUpcomingAdminObligations_OptionalAccountFilter
it('TestGroupEventRepo_SumUpcomingAdminObligations_OptionalAccountFilter', async () => {
  const repo = new SqliteGroupEventRepo(db)
  const accountA = crypto.randomUUID()
  const accountB = crypto.randomUUID()
  const host = crypto.randomUUID()
  const eventA = crypto.randomUUID()
  const eventB = crypto.randomUUID()
  await insertAccount(accountA)
  await insertAccount(accountB)
  await insertFriend(host, 'host')

  await db.query(
    `INSERT INTO GroupEvent (id, account_id, title, date, total_amount, public_token, notes, host_friend_id)
		VALUES
		  (?, ?, 'ea', '2026-01-10T00:00:00Z', 1000, 'ta', NULL, ?),
		  (?, ?, 'eb', '2026-01-11T00:00:00Z', 1000, 'tb', NULL, ?)`,
    [eventA, accountA, host, eventB, accountB, host],
  )
  await db.query(
    `INSERT INTO GroupEventParticipant (event_id, friend_id, share_amount, is_confirmed)
		VALUES (?, NULL, 100, 0), (?, NULL, 200, 0)`,
    [eventA, eventB],
  )

  const after = new Date('2026-01-01T00:00:00Z')
  const onOrBefore = new Date('2026-02-01T00:00:00Z')

  expect(await repo.sumUpcomingAdminObligations(null, after, onOrBefore)).toBe(-300)
  expect(await repo.sumUpcomingAdminObligations(accountA, after, onOrBefore)).toBe(-100)
})

describe('group event paths the Go tests do not reach', () => {
  async function seedEvent(): Promise<{ accountId: string; friendA: string; friendB: string; eventId: string }> {
    const accountId = crypto.randomUUID()
    const friendA = crypto.randomUUID()
    const friendB = crypto.randomUUID()
    await insertAccount(accountId)
    await insertFriend(friendA, 'Ana')
    await insertFriend(friendB, 'Bia')
    const e = event({ accountId, hostFriendId: friendA })
    const repo = new SqliteGroupEventRepo(db)
    await repo.insert(e)
    await repo.setParticipants(
      e.id,
      [
        { eventId: e.id, friendId: null, shareAmount: 400, isConfirmed: false },
        { eventId: e.id, friendId: friendA, shareAmount: 300, isConfirmed: true },
        { eventId: e.id, friendId: friendB, shareAmount: 300, isConfirmed: false },
      ],
      friendA,
    )
    return { accountId, friendA, friendB, eventId: e.id }
  }

  it('insert and getById round-trip; getById of an unknown id rejects with ErrNoRows', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    const e = event({ accountId, notes: 'bring drinks' })
    await repo.insert(e)
    expect(await repo.getById(e.id)).toEqual(e)
    expect(await repo.getByToken(e.publicToken)).toEqual(e)
    await expect(repo.getById(crypto.randomUUID())).rejects.toThrow('group_event.GetByID: sql: no rows in result set')
    await expect(repo.getByToken('missing')).rejects.toThrow('group_event.GetByToken: sql: no rows in result set')
  })

  it('setParticipants replaces the rows and getParticipants reads them back', async () => {
    const { friendA, friendB, eventId } = await seedEvent()
    const repo = new SqliteGroupEventRepo(db)
    const parts = await repo.getParticipants(eventId)
    expect(parts).toHaveLength(3)
    expect(parts).toEqual(
      expect.arrayContaining([
        { eventId, friendId: null, shareAmount: 400, isConfirmed: false },
        { eventId, friendId: friendA, shareAmount: 300, isConfirmed: true },
        { eventId, friendId: friendB, shareAmount: 300, isConfirmed: false },
      ]),
    )
  })

  it('setParticipants rejects an unknown event, a missing owner row and a host who is not a participant', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const { accountId, friendA } = await seedEvent()
    const unknown = crypto.randomUUID()
    await expect(repo.setParticipants(unknown, [], null)).rejects.toThrow(
      'group_event.SetParticipants: sql: no rows in result set',
    )
    const e = event({ accountId })
    await repo.insert(e)
    await expect(
      repo.setParticipants(e.id, [{ eventId: e.id, friendId: friendA, shareAmount: 1, isConfirmed: false }], null),
    ).rejects.toThrow('group_event.SetParticipants: owner/admin must always be a participant')
    await expect(
      repo.setParticipants(e.id, [{ eventId: e.id, friendId: null, shareAmount: 1, isConfirmed: false }], friendA),
    ).rejects.toThrow('group_event.SetParticipants: host friend must be a participant')
    // The rejected calls changed nothing (the transaction rolled back).
    expect(await repo.getParticipants(e.id)).toEqual([])
  })

  it('setParticipantConfirmed and toggleParticipantConfirmed flip one friend row', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const { friendB, eventId } = await seedEvent()
    await repo.setParticipantConfirmed(eventId, friendB, true)
    const confirmed = (await repo.getParticipants(eventId)).find((p) => p.friendId === friendB)
    expect(confirmed?.isConfirmed).toBe(true)
    await repo.toggleParticipantConfirmed(eventId, friendB)
    const toggled = (await repo.getParticipants(eventId)).find((p) => p.friendId === friendB)
    expect(toggled?.isConfirmed).toBe(false)
    await expect(repo.setParticipantConfirmed(eventId, crypto.randomUUID(), true)).rejects.toThrow(
      'group_event.SetParticipantConfirmed: sql: no rows in result set',
    )
    await expect(repo.toggleParticipantConfirmed(eventId, crypto.randomUUID())).rejects.toThrow(
      'group_event.ToggleParticipantConfirmed: sql: no rows in result set',
    )
  })

  it('getByFriend lists events the friend joined or hosts', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const { friendA, friendB, eventId } = await seedEvent()
    expect((await repo.getByFriend(friendA)).map((e) => e.id)).toEqual([eventId])
    expect((await repo.getByFriend(friendB)).map((e) => e.id)).toEqual([eventId])
    expect(await repo.getByFriend(crypto.randomUUID())).toEqual([])
  })

  it('getPendingBalanceForAdmin and getAdminPendingExpenses report unconfirmed shares', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const { accountId, friendB } = await seedEvent()
    // Friend-hosted event: the admin's unconfirmed share (400) is owed to the host.
    expect(await repo.getPendingBalanceForAdmin(accountId)).toEqual({ theyOweAdmin: 0, adminOwesHost: 400 })
    expect(await repo.getAdminPendingExpenses(accountId)).toEqual([
      { hostName: 'Ana', shareAmount: 400, date: '2026-01-10T00:00:00Z' },
    ])
    // Admin-hosted event: the unconfirmed friend share (Bia, 300) is owed to the admin.
    const adminEvent = event({ accountId, date: '2026-02-01' })
    await repo.insert(adminEvent)
    await repo.setParticipants(
      adminEvent.id,
      [
        { eventId: adminEvent.id, friendId: null, shareAmount: 100, isConfirmed: false },
        { eventId: adminEvent.id, friendId: friendB, shareAmount: 300, isConfirmed: false },
      ],
      null,
    )
    expect(await repo.getPendingBalanceForAdmin(accountId)).toEqual({ theyOweAdmin: 300, adminOwesHost: 400 })
    expect(await repo.getPendingBalanceForAdmin(null)).toEqual({ theyOweAdmin: 300, adminOwesHost: 400 })
    expect(await repo.getAdminPendingExpenses(crypto.randomUUID())).toEqual([])
  })

  it('update writes only the given fields; no fields and a missing row are errors', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    const e = event({ accountId })
    await repo.insert(e)
    await repo.update(e.id, 'sushi', '2026-03-01', 5000, 'late')
    expect(await repo.getById(e.id)).toEqual({
      ...e,
      title: 'sushi',
      date: '2026-03-01',
      totalAmount: 5000,
      notes: 'late',
    })
    await expect(repo.update(e.id)).rejects.toThrow('group_event.Update: no fields provided')
    await expect(repo.update(crypto.randomUUID(), 'x')).rejects.toThrow('group_event.Update: sql: no rows in result set')
  })

  it('insertTransaction writes created_at as RFC3339 and getTransactionsByEvent reads it newest first', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    const e = event({ accountId })
    await repo.insert(e)
    const older = { id: crypto.randomUUID(), eventId: e.id, description: 'beer', amount: 500, createdAt: new Date('2026-01-10T10:00:00Z') }
    const newer = { id: crypto.randomUUID(), eventId: e.id, description: 'pizza', amount: 1500, createdAt: new Date('2026-01-10T11:30:45.678Z') }
    await repo.insertTransaction(older)
    await repo.insertTransaction(newer)
    const raw = await db.query<{ created_at: string }>(`SELECT created_at FROM GroupEventTransaction WHERE id = ?`, [newer.id])
    expect(raw[0]?.created_at).toBe('2026-01-10T11:30:45Z')
    expect(await repo.getTransactionsByEvent(e.id)).toEqual([
      { ...newer, createdAt: new Date('2026-01-10T11:30:45.000Z') },
      { ...older, createdAt: new Date('2026-01-10T10:00:00.000Z') },
    ])
    await repo.deleteTransactionById(older.id)
    expect((await repo.getTransactionsByEvent(e.id)).map((t) => t.id)).toEqual([newer.id])
  })

  it('getTransactionsByEvent rejects a created_at that is not RFC3339 (Go time.Parse)', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const accountId = crypto.randomUUID()
    await insertAccount(accountId)
    const e = event({ accountId })
    await repo.insert(e)
    await db.query(
      `INSERT INTO GroupEventTransaction (id, event_id, description, amount, created_at) VALUES (?, ?, 'x', 1, '2026-01-10 11:00:00')`,
      [crypto.randomUUID(), e.id],
    )
    await expect(repo.getTransactionsByEvent(e.id)).rejects.toThrow(
      'group_event.GetTransactionsByEvent: parse created_at',
    )
  })

  it('deleteById removes the event and its participants (cascade)', async () => {
    const repo = new SqliteGroupEventRepo(db)
    const { eventId } = await seedEvent()
    await repo.deleteById(eventId)
    expect(await repo.getParticipants(eventId)).toEqual([])
    await expect(repo.getById(eventId)).rejects.toThrow('sql: no rows in result set')
  })
})
