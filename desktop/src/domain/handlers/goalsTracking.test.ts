// @vitest-environment node
// Ports of internal/handler/goals_tracking_test.go (2 tests). The Go mockGoalsService is a fake injected
// through registerGoalsRoutes(app, fake). The block after the Go tests checks the tracking JSON shape
// from the real service on createTestDb().
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import { createTestDb } from '../testing/testDb'
import type { GoalsTrackingResponse } from '../service/goalsTracking'
import { registerGoalsRoutes, type GoalsServiceIface } from './goals'

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

function fakeGoalsService(overrides: Partial<GoalsServiceIface>): GoalsServiceIface {
  const unset = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return {
    createGoal: unset,
    listGoals: unset,
    updateGoal: unset,
    addLedgerEntry: unset,
    reverseLedgerEntry: unset,
    listLedger: unset,
    buildTracking: unset,
    listRecurringDue: async () => [],
    confirmRecurringDue: async () => undefined,
    ...overrides,
  }
}

const ACC_ID = '55555555-5555-4555-8555-555555555555'

// TestGoalsTrackingHandler_OK
it('TestGoalsTrackingHandler_OK: the account id reaches the service and the response is 200', async () => {
  const app = buildApp(db)
  registerGoalsRoutes(
    app,
    fakeGoalsService({
      buildTracking: async (accountId) => {
        if (accountId !== ACC_ID) {
          throw new Error('account id mismatch')
        }
        return {
          summary: { goalsCount: 0, completedCount: 0, totalTarget: 0, totalInvested: 0, totalRemaining: 0 },
          topGoals: [],
          recentActivity: [],
          updatedAtUtc: '2026-04-29T00:00:00Z',
        }
      },
    }),
  )
  const res = await localFetch(`/api/goals/tracking?account_id=${ACC_ID}`)
  expect(res.status).toBe(200)
})

// TestGoalsTrackingHandler_InvalidAccountID
it('TestGoalsTrackingHandler_InvalidAccountID: a malformed account id is a 400', async () => {
  const app = buildApp(db)
  registerGoalsRoutes(app, fakeGoalsService({ buildTracking: async () => ({}) as GoalsTrackingResponse }))
  const res = await localFetch('/api/goals/tracking?account_id=bad-uuid')
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'invalid account_id' })
})

describe('tracking JSON beyond the Go tests', () => {
  it('an empty account has the summary, empty lists and the updated_at_utc time in the wire names', async () => {
    const app = buildApp(db)
    registerGoalsRoutes(app)
    const res = await localFetch(`/api/goals/tracking?account_id=${ACC_ID}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const { updated_at_utc: updatedAt, ...rest } = body
    expect(rest).toEqual({
      summary: { goals_count: 0, completed_count: 0, total_target: 0, total_invested: 0, total_remaining: 0 },
      top_goals: [],
      recent_activity: [],
    })
    expect(String(updatedAt)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })

  it('a missing account_id is the same 400 as a malformed one (Go parses the empty string)', async () => {
    const app = buildApp(db)
    registerGoalsRoutes(app)
    const res = await localFetch('/api/goals/tracking')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid account_id' })
  })
})
