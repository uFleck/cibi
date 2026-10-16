// @vitest-environment node
// Port of internal/handler/routes_test.go (TestRoutesRegistersAPIEndpointsWithInjectedServices), made
// exact: the test asserts the COMPLETE route table of the desktop app, not a sample of it.
//
// The Go table (internal/handler/routes.go) had 55 API routes (two account routes, default and set-default, are gone, so 53 remain) (the Go test's sample checks only some).
// Not in the desktop table, on purpose: GET /api/docs (served the Go OpenAPI yaml, not ported),
// GET /api/config and the /public/* routes (retired). They must answer 404.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app'
import { setDb } from './db'
import { listRoutes, localFetch, resetRoutesForTests } from './http'
import { registerRoutes } from './routes'
import { createTestDb } from './testing/testDb'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
  registerRoutes(buildApp(db))
})

afterEach(() => {
  resetRoutesForTests()
  db.close()
})

/** The Go route table, method and pattern, in routes.go order (the test compares them sorted). */
const EXPECTED_ROUTES: string[] = [
  // accounts
  'GET /api/accounts',
  'POST /api/accounts',
  'GET /api/accounts/:id',
  'PATCH /api/accounts/:id',
  'DELETE /api/accounts/:id',
  // transactions
  'GET /api/transactions',
  'POST /api/transactions',
  'PATCH /api/transactions/:id',
  'DELETE /api/transactions/:id',
  'POST /api/transactions/:id/confirm',
  'POST /api/transactions/:id/confirm-installment',
  // goals
  'GET /api/goals',
  'GET /api/goals/tracking',
  'GET /api/goals/recurring',
  'POST /api/goals/recurring/:id/confirm',
  'POST /api/goals',
  'PATCH /api/goals/:id',
  'GET /api/goals/:id/ledger',
  'POST /api/goals/:id/ledger',
  'POST /api/goals/:id/ledger/:entryId/reverse',
  // check
  'POST /api/check',
  // pay schedule
  'GET /api/pay-schedule',
  'POST /api/pay-schedule',
  'PATCH /api/pay-schedule/:id',
  'DELETE /api/pay-schedule/:id',
  'POST /api/pay-schedule/:id/confirm',
  // friends
  'GET /api/friends',
  'POST /api/friends',
  'GET /api/friends/summary',
  'GET /api/friends/breakdown',
  'GET /api/friends/:id',
  'PATCH /api/friends/:id',
  'DELETE /api/friends/:id',
  // peer debts
  'GET /api/peer-debts',
  'POST /api/peer-debts',
  'PATCH /api/peer-debts/:id',
  'DELETE /api/peer-debts/:id',
  'POST /api/peer-debts/:id/confirm',
  'POST /api/peer-debts/:id/confirm-toggle',
  // group events
  'GET /api/group-events',
  'POST /api/group-events',
  'GET /api/group-events/:id',
  'PATCH /api/group-events/:id',
  'DELETE /api/group-events/:id',
  'PUT /api/group-events/:id/participants',
  'POST /api/group-events/:id/transactions',
  'DELETE /api/group-events/:id/transactions/:tid',
  'GET /api/group-events/:id/transactions',
  // ledger
  'GET /api/ledger',
  'DELETE /api/ledger/:id',
  'POST /api/ledger/income',
  // profile
  'GET /api/profile',
  'PATCH /api/profile',
]

// Desktop-only routes (no Go counterpart): app settings (migration 0002) and categories (migrations 0003 and 0007) and budget (migration 0004) and reserve (migration 0010).
const DESKTOP_ROUTES = [
  'GET /api/settings/:key',
  'PUT /api/settings/:key',
  'GET /api/categories',
  'GET /api/categories/details',
  'POST /api/categories',
  'PUT /api/categories/:id',
  'DELETE /api/categories/:id',
  'GET /api/categories/suggest',
  'POST /api/categories/backfill',
  'GET /api/budget',
  'PUT /api/budget/limits',
  'POST /api/budget/exclusions',
  'DELETE /api/budget/exclusions/:transactionId/:month',
  'GET /api/reserve',
  'PUT /api/reserve/config',
  'POST /api/reserve/withdraw',
  'POST /api/reserve/entries/:id/moved',
]

describe('route table', () => {
  it('registers exactly the Go API routes (53) plus the desktop-only routes, with no duplicates', () => {
    const registered = listRoutes().map((r) => `${r.method} ${r.pattern}`)
    expect(EXPECTED_ROUTES).toHaveLength(53)
    expect(new Set(registered).size).toBe(registered.length)
    expect([...registered].sort()).toEqual([...EXPECTED_ROUTES, ...DESKTOP_ROUTES].sort())
  })

  it.each(['/public/friend/x', '/public/group/x', '/api/config', '/api/docs'])(
    'GET %s is not a route (404)',
    async (path) => {
      const res = await localFetch(path)
      expect(res.status).toBe(404)
    },
  )
})
