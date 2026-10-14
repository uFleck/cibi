// @vitest-environment node
// Tests for the startup guard in index.ts. The database is injected (createTestDb), so initDb (which needs Tauri) is never called.
import { describe, expect, it } from 'vitest'
import { getDb } from './db'
import { localFetch } from './http'
import { startDomain } from './index'
import { createTestDb } from './testing/testDb'

describe('startDomain', () => {
  it('opens the app once: concurrent and later calls get the same app, and the routes are registered', async () => {
    const db = await createTestDb()
    const other = await createTestDb()

    const [first, second] = await Promise.all([startDomain(db), startDomain(other)])
    const third = await startDomain()

    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(first.db).toBe(db)
    expect(getDb()).toBe(db)

    const res = await localFetch('/api/accounts')
    expect(res.status).toBe(200)
  })
})
