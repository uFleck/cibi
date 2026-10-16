// @vitest-environment node
// Port of the wiring part of internal/app/app_test.go (TestAppNewComposesMigratedGraphAndRoutes). The Go
// test opens a database file through New(cfg); here the app is built on createTestDb(). Not ported: the
// goose version check (the TS migrations are checked by migrate.test.ts) and
// TestAppNewReturnsStartupErrorForUnopenableDatabase (it tests the Go database opening only).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app'
import { setDb } from './db'
import { localFetch, resetRoutesForTests } from './http'
import { registerRoutes } from './routes'
import { createTestDb } from './testing/testDb'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
})

afterEach(() => {
  resetRoutesForTests()
  db.close()
})

describe('app wiring', () => {
  it('composes the core services on the one database, and serves the accounts routes', async () => {
    const app = buildApp(db)
    registerRoutes(app)

    expect(app.db).toBe(db)
    expect(app.accountsSvc).toBeDefined()
    expect(app.txnsSvc).toBeDefined()
    expect(app.engineSvc).toBeDefined()
    expect(app.goalsSvc).toBeDefined()

    const created = await localFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Checking', current_balance: 123.45, currency: 'USD' }),
    })
    expect(created.status).toBe(201)

    const listed = await localFetch('/api/accounts')
    expect(listed.status).toBe(200)
    const accounts = (await listed.json()) as {
      name: string
      current_balance: number
      currency: string
    }[]
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toEqual({
      id: expect.any(String),
      name: 'Checking',
      current_balance: 123.45,
      currency: 'USD',
      // The default buffer when none is given (Go service: 1000 cents).
      safety_buffer: 10,
    })
  })
})
