// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteAppSettingRepo } from './appSetting'
import { createTestDb } from '../testing/testDb'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

describe('SqliteAppSettingRepo', () => {
  it('returns null for a key that was never set', async () => {
    expect(await new SqliteAppSettingRepo(db).get('layout.v1')).toBeNull()
  })

  it('stores a value and reads it back', async () => {
    const repo = new SqliteAppSettingRepo(db)
    await repo.upsert('layout.v1', '{"pos":"right"}')
    expect(await repo.get('layout.v1')).toBe('{"pos":"right"}')
  })

  it('replaces the value of an existing key without adding a row', async () => {
    const repo = new SqliteAppSettingRepo(db)
    await repo.upsert('layout.v1', '1')
    await repo.upsert('layout.v1', '2')
    expect(await repo.get('layout.v1')).toBe('2')
    expect(await db.query('SELECT count(*) AS n FROM AppSetting')).toEqual([{ n: 1 }])
  })

  it('keeps keys apart', async () => {
    const repo = new SqliteAppSettingRepo(db)
    await repo.upsert('a', '"x"')
    await repo.upsert('b', '"y"')
    expect(await repo.get('a')).toBe('"x"')
    expect(await repo.get('b')).toBe('"y"')
  })
})
