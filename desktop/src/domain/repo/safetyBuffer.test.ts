// @vitest-environment node
// The Go SafetyBuffer repo is not wired anywhere, and migration 20260501000001 drops its table.
// These tests pin that state; there are no Go tests for this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testing/testDb'
import { SqliteSafetyBufferRepo } from './safetyBuffer'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

describe('SqliteSafetyBufferRepo on a migrated database', () => {
  it('get fails because the SafetyBuffer table was dropped by migration 20260501000001', async () => {
    const repo = new SqliteSafetyBufferRepo(db)
    await expect(repo.get()).rejects.toThrow('safety_buffer.Get: no such table: SafetyBuffer')
  })
})

describe('SqliteSafetyBufferRepo against a table that exists', () => {
  beforeEach(async () => {
    await db.query('CREATE TABLE SafetyBuffer (min_threshold INTEGER)')
  })

  it('get returns 0 when there is no row (Go default)', async () => {
    expect(await new SqliteSafetyBufferRepo(db).get()).toEqual({ minThreshold: 0 })
  })

  it('set replaces the single row', async () => {
    const repo = new SqliteSafetyBufferRepo(db)
    await repo.set(1000)
    await repo.set(250)
    expect(await repo.get()).toEqual({ minThreshold: 250 })
    expect(await db.query('SELECT count(*) AS n FROM SafetyBuffer')).toEqual([{ n: 1 }])
  })
})
