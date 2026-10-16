// @vitest-environment node
// The Go friend repo has no test file; these cover its SQL on the real schema (Friend and Transaction).
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ErrNoRows, isErr } from '../errors'
import { createTestDb } from '../testing/testDb'
import { ErrFriendInUse, SqliteFriendRepo, type Friend } from './friend'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

function friend(over: Partial<Friend> = {}): Friend {
  const id = crypto.randomUUID()
  return { id, name: 'Ana', publicToken: `tok${id.replace(/-/g, '')}`, notes: null, pixKey: null, ...over }
}

it('insert, getById, getByToken and getAll read back the same friend (null notes and pix key stay null)', async () => {
  const repo = new SqliteFriendRepo(db)
  const a = friend({ pixKey: 'ana@example.com' })
  const b = friend({ name: 'Bia', notes: 'gym buddy' })
  await repo.insert(a)
  await repo.insert(b)
  expect(await repo.getById(a.id)).toEqual(a)
  expect(await repo.getByToken(b.publicToken)).toEqual(b)
  expect(await repo.getAll()).toHaveLength(2)
  expect(await repo.getAll()).toEqual(expect.arrayContaining([a, b]))
})

it('unknown id and token reject with ErrNoRows', async () => {
  const repo = new SqliteFriendRepo(db)
  await expect(repo.getById(crypto.randomUUID())).rejects.toThrow('friend.GetByID: sql: no rows in result set')
  let err: unknown
  try {
    await repo.getByToken('nope')
  } catch (e) {
    err = e
  }
  expect(isErr(err, ErrNoRows)).toBe(true)
})

it('update writes the given fields; a missing id is an error only when the name is set', async () => {
  const repo = new SqliteFriendRepo(db)
  const a = friend()
  await repo.insert(a)
  await repo.update(a.id, 'Aninha', '', 'pix-1')
  expect(await repo.getById(a.id)).toEqual({ ...a, name: 'Aninha', notes: '', pixKey: 'pix-1' })

  await expect(repo.update(crypto.randomUUID(), 'x')).rejects.toThrow('friend.Update: sql: no rows in result set')
  await expect(repo.update(crypto.randomUUID(), undefined, 'note')).resolves.toBeUndefined()
  await expect(repo.update(a.id)).resolves.toBeUndefined()
})

it('deleteById removes a friend that has no peer debts', async () => {
  const repo = new SqliteFriendRepo(db)
  const a = friend()
  await repo.insert(a)
  await repo.deleteById(a.id)
  await expect(repo.getById(a.id)).rejects.toThrow('sql: no rows in result set')
})

it('deleteById of a friend with a peer debt rejects with ErrFriendInUse (the foreign key failed)', async () => {
  const repo = new SqliteFriendRepo(db)
  const a = friend()
  const accountId = crypto.randomUUID()
  await repo.insert(a)
  await db.query(`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, 'x', 0, 'BRL', 0)`, [
    accountId,
  ])
  await db.query(
    `INSERT INTO "Transaction" (id, account_id, type, friend_id, amount, title, timestamp, is_recurring, is_installment, paid_installments, requires_confirmation)
		VALUES (?, ?, 'peer', ?, -500, 'x', '2026-06-10', 0, 0, 0, 1)`,
    [crypto.randomUUID(), accountId, a.id],
  )
  let err: unknown
  try {
    await repo.deleteById(a.id)
  } catch (e) {
    err = e
  }
  expect(isErr(err, ErrFriendInUse)).toBe(true)
  expect(await repo.getById(a.id)).toEqual(a)
})
