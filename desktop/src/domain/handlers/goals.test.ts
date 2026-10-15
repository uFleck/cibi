// @vitest-environment node
// Ports of internal/handler/goals_test.go (4 tests). The Go mockGoalsService is a fake injected through
// registerGoalsRoutes(app, fake). The Go TestGoalsRoutes_NoDeleteReverseExists reads routes.go as text;
// here the same two facts are checked through the route table: there is no DELETE /api/goals/:id and
// the reverse route exists. The block after the Go tests runs the real service and repos on createTestDb().
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import type { Goal, GoalLedgerEntry } from '../repo/goals'
import type { GoalRecurringDueItem } from '../service/goalsRecurring'
import { createTestDb } from '../testing/testDb'
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

/** Go mockGoalsService: unset methods panic in Go; here they reject, so the test fails. The recurring methods default to empty results in Go (nil). */
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
    listRecurringDue: async (): Promise<GoalRecurringDueItem[]> => [],
    confirmRecurringDue: async (): Promise<void> => undefined,
    ...overrides,
  }
}

const ACC_ID = '22222222-2222-4222-8222-222222222222'
const GOAL_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'

function goal(over: Partial<Goal>): Goal {
  return {
    id: GOAL_ID,
    accountId: ACC_ID,
    name: 'Trip',
    status: 'active',
    targetAmountCents: 12345,
    investedTotalCents: 0,
    minContributionPerWindowCents: 0,
    startDateUtc: new Date('2026-04-29T00:00:00Z'),
    targetDateUtc: null,
    notes: null,
    currency: 'BRL',
    createdAtUtc: new Date('2026-04-29T00:00:00Z'),
    updatedAtUtc: new Date('2026-04-29T00:00:00Z'),
    ...over,
  }
}

function entry(over: Partial<GoalLedgerEntry>): GoalLedgerEntry {
  return {
    id: ENTRY_ID,
    goalId: GOAL_ID,
    amountCents: 1000,
    type: 'contribution',
    source: 'manual',
    note: null,
    reversesEntryId: null,
    timestampUtc: new Date('2026-04-29T00:00:00Z'),
    createdAtUtc: new Date('2026-04-29T00:00:00Z'),
    ...over,
  }
}

function newApp(svc: GoalsServiceIface): App {
  const app = buildApp(db)
  registerGoalsRoutes(app, svc)
  return app
}

// TestGoalsCreate_ConvertsDecimalsToServiceBoundary
it('TestGoalsCreate_ConvertsDecimalsToServiceBoundary: the target reaches the service as 123.45 and the create is 201', async () => {
  let called = false
  newApp(
    fakeGoalsService({
      createGoal: async (input) => {
        called = true
        if (input.targetAmount !== 123.45) {
          throw new Error(`target amount mismatch: ${input.targetAmount}`)
        }
        return goal({ accountId: input.accountId, name: input.name, targetAmountCents: 12345, startDateUtc: input.startDateUtc })
      },
    }),
  )
  const body = `{"account_id":"${ACC_ID}","name":"Trip","target_amount":123.45,"start_date_utc":"2026-04-29T00:00:00Z"}`
  const res = await localFetch('/api/goals', { method: 'POST', body })
  expect(called).toBe(true)
  expect(res.status).toBe(201)
})

// TestGoalsAddLedger_ValidationAndErrorShape
it('TestGoalsAddLedger_ValidationAndErrorShape: an unknown ledger type is a 400 with an error body', async () => {
  newApp(fakeGoalsService({ addLedgerEntry: async () => entry({}) }))
  const res = await localFetch(`/api/goals/${GOAL_ID}/ledger`, {
    method: 'POST',
    body: '{"amount":10,"type":"bad","source":"manual"}',
  })
  expect(res.status).toBe(400)
  const text = await res.text()
  expect(text).toContain('error')
})

// TestGoalsRoutes_NoDeleteReverseExists
it('TestGoalsRoutes_NoDeleteReverseExists: there is no DELETE on a goal, and the reverse route exists', async () => {
  newApp(fakeGoalsService({ reverseLedgerEntry: async () => entry({ type: 'adjustment', source: 'system' }) }))
  const del = await localFetch(`/api/goals/${GOAL_ID}`, { method: 'DELETE' })
  expect(del.status).toBe(405)
  const reverse = await localFetch(`/api/goals/${GOAL_ID}/ledger/${ENTRY_ID}/reverse`, { method: 'POST', body: '{}' })
  expect(reverse.status).toBe(201)
})

// TestGoalsListLedger_Success
it('TestGoalsListLedger_Success: the ledger of a goal is a 200 JSON array', async () => {
  newApp(fakeGoalsService({ listLedger: async () => [entry({})] }))
  const res = await localFetch(`/api/goals/${GOAL_ID}/ledger`)
  expect(res.status).toBe(200)
  const out = (await res.json()) as unknown[]
  expect(Array.isArray(out)).toBe(true)
  expect(out).toHaveLength(1)
})

describe('goals handlers beyond the Go tests (real service on the test DB)', () => {
  it('create, list, patch, add a deposit and a withdrawal, reverse, and the tracking response', async () => {
    const app = buildApp(db)
    registerGoalsRoutes(app)
    await db.query(`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, 'x', 100000, 'BRL', 1)`, [ACC_ID])
    await db.query(`INSERT INTO ledger (id, account_id, entry_type, amount, description, posted_at) VALUES (?, ?, 'opening_balance', 100000, '', '2026-01-01T00:00:00Z')`, [crypto.randomUUID(), ACC_ID])

    const created = await localFetch('/api/goals', {
      method: 'POST',
      body: JSON.stringify({
        account_id: ACC_ID,
        name: 'Car',
        target_amount: 5000,
        min_contribution_per_window: 100,
        start_date_utc: '2026-01-01T00:00:00Z',
        target_date_utc: '2027-01-01T00:00:00Z',
        notes: 'first',
      }),
    })
    expect(created.status).toBe(201)
    const goalJson = (await created.json()) as Record<string, unknown>
    expect(goalJson).toMatchObject({
      account_id: ACC_ID,
      name: 'Car',
      status: 'active',
      target_amount: 5000,
      invested_total: 0,
      min_contribution_per_window: 100,
      start_date_utc: '2026-01-01T00:00:00Z',
      target_date_utc: '2027-01-01T00:00:00Z',
      notes: 'first',
      currency: 'BRL',
    })
    const goalId = goalJson.id as string

    const list = (await (await localFetch(`/api/goals?account_id=${ACC_ID}`)).json()) as Record<string, unknown>[]
    expect(list).toHaveLength(1)

    const patched = await localFetch(`/api/goals/${goalId}`, { method: 'PATCH', body: '{"name":"Car 2","target_amount":4000}' })
    expect(patched.status).toBe(204)

    const deposit = await localFetch(`/api/goals/${goalId}/ledger`, { method: 'POST', body: '{"amount":250,"type":"contribution"}' })
    expect(deposit.status).toBe(201)
    const depositJson = (await deposit.json()) as Record<string, unknown>
    expect(depositJson).toMatchObject({ amount: 250, type: 'contribution', source: 'manual', note: null, reverses_entry_id: null })

    const tracking = (await (await localFetch(`/api/goals/tracking?account_id=${ACC_ID}`)).json()) as {
      summary: Record<string, number>
      top_goals: Record<string, unknown>[]
    }
    expect(tracking.summary.goals_count).toBe(1)
    expect(tracking.top_goals[0]).toMatchObject({ name: 'Car 2', invested_total: 250, progress_pct: 6.25 })

    const account = await db.query<{ current_balance: number }>(`SELECT current_balance FROM Account WHERE id = ?`, [ACC_ID])
    expect(account[0]?.current_balance).toBe(75000)

    const entries = (await (await localFetch(`/api/goals/${goalId}/ledger`)).json()) as { id: string }[]
    const reversed = await localFetch(`/api/goals/${goalId}/ledger/${entries[0]?.id}/reverse`, { method: 'POST', body: '{"note":"undo"}' })
    expect(reversed.status).toBe(201)
    expect(await reversed.json()).toMatchObject({ type: 'adjustment', source: 'system', note: 'undo', amount: -250 })

    const after = (await (await localFetch(`/api/goals/tracking?account_id=${ACC_ID}`)).json()) as {
      top_goals: Record<string, unknown>[]
    }
    expect(after.top_goals[0]).toMatchObject({ invested_total: 0 })
  })

  it('error statuses: bad ids are 400 with the route text, unknown goals are 400 with the Go error text, and a delete is 405', async () => {
    registerGoalsRoutes(buildApp(db))
    const badId = await localFetch('/api/goals/not-a-uuid/ledger')
    expect(badId.status).toBe(400)
    expect(await badId.json()).toEqual({ error: 'invalid goal id' })

    const unknown = await localFetch(`/api/goals/${GOAL_ID}/ledger`, { method: 'POST', body: '{"amount":5,"type":"contribution"}' })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ error: 'sql: no rows in result set' })

    const missingAccount = await localFetch('/api/goals/recurring')
    expect(missingAccount.status).toBe(400)
    expect(await missingAccount.json()).toEqual({ error: 'invalid account_id' })
  })

  it.each([
    ['no body', undefined, null],
    ['malformed JSON', '{"note":', null],
    ['a note that is a string', '{"note":"undo"}', 'undo'],
    ['a note that is null', '{"note":null}', null],
    ['a note of another JSON type (Go keeps an empty pointer)', '{"note":5}', ''],
    ['an array body (no field is set)', '[]', null],
    ['an upper-case key (matched like encoding/json)', '{"NOTE":"up"}', 'up'],
  ])('reverse note from %s is %s', async (_name, raw, want) => {
    const seen: (string | null)[] = []
    newApp(
      fakeGoalsService({
        reverseLedgerEntry: async (_goalId, _entryId, note) => {
          seen.push(note ?? null)
          return entry({ type: 'adjustment', source: 'system' })
        },
      }),
    )
    const res = await localFetch(`/api/goals/${GOAL_ID}/ledger/${ENTRY_ID}/reverse`, { method: 'POST', body: raw })
    expect(res.status).toBe(201)
    expect(seen).toEqual([want])
  })
})
