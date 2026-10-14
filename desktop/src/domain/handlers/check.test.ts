// @vitest-environment node
// Ports of internal/handler/check_test.go (5 tests). The Go mockEngineService is a fake injected through
// registerCheckRoutes(app, fake). Requests go through localFetch, as the UI does.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import type { EngineResult } from '../service/engine'
import { createTestDb } from '../testing/testDb'
import { registerCheckRoutes, type CheckServiceIface } from './check'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb
let app: App

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
  app = buildApp(db)
})

afterEach(() => {
  resetRoutesForTests()
  db.close()
})

/** Go mockEngineService: an unset method rejects, so the test fails if it is called. */
function fakeEngineService(overrides: Partial<CheckServiceIface>): CheckServiceIface {
  const unset = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return { canIBuyIt: unset, canIBuyItDefault: unset, ...overrides }
}

function post(path: string, body: string) {
  return localFetch(path, { method: 'POST', body })
}

// TestCheck verifies POST /api/check with {"amount": 75.00} returns 200 +
// {"can_buy":true,"purchasing_power":50.00,"buffer_remaining":25.00,"risk_level":"LOW"}.
it('TestCheck', async () => {
  let gotItemPrice = 0
  registerCheckRoutes(
    app,
    fakeEngineService({
      canIBuyItDefault: async (itemPrice: number): Promise<EngineResult> => {
        gotItemPrice = itemPrice
        return {
          canBuy: true,
          purchasingPower: 5000,
          bufferRemaining: 2500,
          riskLevel: 'LOW',
          willAffordAfterPayday: false,
          waitUntil: null,
          goalImpacts: [],
          goalsCoveredThisWindow: [],
        }
      },
    }),
  )

  const res = await post('/api/check', '{"amount":75.00}')
  expect(res.status).toBe(200)
  const resp = (await res.json()) as Record<string, unknown>
  expect(gotItemPrice).toBe(7500)
  expect(resp.can_buy).toBe(true)
  expect(resp.purchasing_power).toBe(50.0)
  expect(resp.buffer_remaining).toBe(25.0)
  expect(resp.risk_level).toBe('LOW')
})

it('TestCheck_WAITWithGoalImpacts', async () => {
  const waitDate = '2026-05-01'
  const goalId = '3f4fc70a-7f88-4b2e-8d1a-c07f522f8e3d'
  registerCheckRoutes(
    app,
    fakeEngineService({
      canIBuyItDefault: async (itemPrice: number): Promise<EngineResult> => {
        expect(itemPrice).toBe(5000)
        return {
          canBuy: false,
          purchasingPower: -1200,
          bufferRemaining: -6200,
          riskLevel: 'WAIT',
          willAffordAfterPayday: true,
          waitUntil: new Date(`${waitDate}T00:00:00Z`),
          goalImpacts: [
            {
              goalId,
              goalName: 'Emergency Fund',
              remainingBefore: 1000,
              remainingAfter: 0,
              progressBeforePct: 96,
              progressAfterPct: 100,
              minContributionPerWindowCents: 0,
              severity: 'high',
            },
          ],
          goalsCoveredThisWindow: [],
        }
      },
    }),
  )

  const res = await post('/api/check', '{"amount":50.00}')
  expect(res.status).toBe(200)
  const resp = (await res.json()) as {
    risk_level: string
    will_afford_after_payday: boolean
    wait_until: string | null
    goal_impacts: { goal_id: string; severity: string }[]
  }
  expect(resp.risk_level).toBe('WAIT')
  expect(resp.will_afford_after_payday).toBe(true)
  expect(resp.wait_until).toBe(waitDate)
  expect(resp.goal_impacts).toHaveLength(1)
  expect(resp.goal_impacts[0]?.goal_id).toBe(goalId)
  expect(resp.goal_impacts[0]?.severity).toBe('high')
})

// TestCheck_NegativeAmount verifies POST /api/check with {"amount": -5.00} returns 400 with {"error":"..."}.
it('TestCheck_NegativeAmount', async () => {
  registerCheckRoutes(app, fakeEngineService({}))

  const res = await post('/api/check', '{"amount":-5.00}')
  expect(res.status).toBe(400)
  const resp = (await res.json()) as Record<string, unknown>
  expect(resp).toHaveProperty('error')
})

// TestCheck_MalformedBody verifies POST /api/check with malformed JSON returns 400 with {"error":"..."}.
it('TestCheck_MalformedBody', async () => {
  registerCheckRoutes(app, fakeEngineService({}))

  const res = await post('/api/check', '{bad')
  expect(res.status).toBe(400)
  const resp = (await res.json()) as Record<string, unknown>
  expect(resp).toHaveProperty('error')
})

it('TestCheck_WithAccountID', async () => {
  const accountId = '3f4fc70a-7f88-4b2e-8d1a-c07f522f8e3d'
  let usedCustomAccount = false
  registerCheckRoutes(
    app,
    fakeEngineService({
      canIBuyIt: async (id: string, itemPrice: number): Promise<EngineResult> => {
        if (id === accountId && itemPrice === 1234) {
          usedCustomAccount = true
        }
        return {
          canBuy: true,
          purchasingPower: 5000,
          bufferRemaining: 3766,
          riskLevel: 'LOW',
          willAffordAfterPayday: false,
          waitUntil: null,
          goalImpacts: [],
          goalsCoveredThisWindow: [],
        }
      },
    }),
  )

  const res = await post('/api/check', `{"amount":12.34,"account_id":"${accountId}"}`)
  expect(res.status).toBe(200)
  expect(usedCustomAccount).toBe(true)
})

// Not a Go test: a price beyond the int64 range reaches the engine as MinInt64, as Go's int64 conversion gives.
describe('check handler conversions', () => {
  it('an amount beyond the int64 range is passed as MinInt64 cents', async () => {
    let gotItemPrice = 0
    registerCheckRoutes(
      app,
      fakeEngineService({
        canIBuyItDefault: async (itemPrice: number): Promise<EngineResult> => {
          gotItemPrice = itemPrice
          return {
            canBuy: true,
            purchasingPower: 0,
            bufferRemaining: 0,
            riskLevel: 'LOW',
            willAffordAfterPayday: false,
            waitUntil: null,
            goalImpacts: [],
            goalsCoveredThisWindow: [],
          }
        },
      }),
    )

    const res = await post('/api/check', '{"amount":1e20}')
    expect(res.status).toBe(200)
    expect(gotItemPrice).toBe(-(2 ** 63))
  })
})
