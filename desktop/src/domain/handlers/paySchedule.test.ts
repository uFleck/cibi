// @vitest-environment node
// Ports of internal/handler/pay_schedule_test.go. The Go mockPayScheduleService is a fake here,
// injected through registerPayScheduleRoutes(app, fake). The last block runs the real service
// and repos on createTestDb() for the Go quirks (unknown account, unknown schedule).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, type App } from '../app'
import { ErrNoRows } from '../errors'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import type { PaySchedule } from '../repo/paySchedule'
import { createTestDb } from '../testing/testDb'
import { registerPayScheduleRoutes, type PayScheduleResponse, type PayScheduleServiceIface } from './paySchedule'

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

/** Go mockPayScheduleService: unset methods panic in Go; here they reject, so the test fails. */
function fakePayScheduleService(overrides: Partial<PayScheduleServiceIface>): PayScheduleServiceIface {
  const unset = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return {
    createPaySchedule: unset,
    listPaySchedules: unset,
    updatePaySchedule: unset,
    deletePaySchedule: unset,
    confirmPayday: unset,
    ...overrides,
  }
}

function withService(fake: PayScheduleServiceIface): App {
  const app = buildApp(db)
  registerPayScheduleRoutes(app, fake)
  return app
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

// A schedule whose anchor is today reports today as its next payday, not the following one.
it('TestPayScheduleHandler_List_PaydayDatedToday', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-10T15:00:00Z'))
  try {
    const accountId = crypto.randomUUID()
    withService(
      fakePayScheduleService({
        listPaySchedules: async (): Promise<PaySchedule[]> => [
          {
            id: crypto.randomUUID(),
            accountId,
            frequency: 'monthly',
            anchorDate: new Date('2026-03-10T00:00:00Z'),
            dayOfMonth2: null,
            label: null,
            amount: 250000,
          },
        ],
      }),
    )
    const res = await localFetch(`/api/pay-schedule?account_id=${accountId}`)
    expect(res.status).toBe(200)
    const list = await json<PayScheduleResponse[]>(res)
    expect(list[0].next_payday).toBe('2026-03-10')
  } finally {
    vi.useRealTimers()
  }
})

// TestPayScheduleHandler_Confirm_Success: 200 and the schedule in the body.
it('TestPayScheduleHandler_Confirm_Success', async () => {
  const scheduleId = crypto.randomUUID()
  const accountId = crypto.randomUUID()

  withService(
    fakePayScheduleService({
      confirmPayday: async (id: string): Promise<PaySchedule> => {
        expect(id).toBe(scheduleId)
        return {
          id: scheduleId,
          accountId,
          frequency: 'monthly',
          anchorDate: new Date('2026-05-10T00:00:00Z'),
          dayOfMonth2: null,
          label: null,
          amount: 250000,
        }
      },
    }),
  )

  const res = await localFetch(`/api/pay-schedule/${scheduleId}/confirm`, { method: 'POST' })
  expect(res.status).toBe(200)
  const resp = await json<PayScheduleResponse>(res)
  expect(resp.id).toBe(scheduleId)
})

// TestPayScheduleHandler_Confirm_InvalidID: a malformed id is a 400.
it('TestPayScheduleHandler_Confirm_InvalidID', async () => {
  withService(fakePayScheduleService({}))
  const res = await localFetch('/api/pay-schedule/not-a-uuid/confirm', { method: 'POST' })
  expect(res.status).toBe(400)
})

// TestPayScheduleHandler_Confirm_NotFound: sql.ErrNoRows is a 404.
it('TestPayScheduleHandler_Confirm_NotFound', async () => {
  const scheduleId = crypto.randomUUID()
  withService(
    fakePayScheduleService({
      confirmPayday: async () => {
        throw ErrNoRows
      },
    }),
  )
  const res = await localFetch(`/api/pay-schedule/${scheduleId}/confirm`, { method: 'POST' })
  expect(res.status).toBe(404)
})

// TestPayScheduleHandler_Create_ConvertsAmountToCents: 1234.56 dollars is 123456 cents.
it('TestPayScheduleHandler_Create_ConvertsAmountToCents', async () => {
  const accountId = crypto.randomUUID()
  let gotAmount = 0

  withService(
    fakePayScheduleService({
      createPaySchedule: async (aid, frequency, anchorDate, dayOfMonth2, label, amount) => {
        gotAmount = amount
        return {
          id: crypto.randomUUID(),
          accountId: aid,
          frequency,
          anchorDate,
          dayOfMonth2,
          label,
          amount,
        }
      },
    }),
  )

  const body = JSON.stringify({
    account_id: accountId,
    frequency: 'monthly',
    anchor_date: '2026-04-10',
    amount: 1234.56,
  })
  const res = await localFetch('/api/pay-schedule', {
    method: 'POST',
    body,
  })
  expect(res.status).toBe(201)
  expect(gotAmount).toBe(123456)

  const resp = await json<PayScheduleResponse>(res)
  expect(resp.amount).toBe(1234.56)
})

// TestPayScheduleHandler_Update_ConvertsAmountToCents: 99.99 dollars is 9999 cents, and the
// anchor date is 2026-03-15 (UTC midnight).
it('TestPayScheduleHandler_Update_ConvertsAmountToCents', async () => {
  const scheduleId = crypto.randomUUID()
  let gotAmount = 0
  let gotAnchor = new Date(0)

  withService(
    fakePayScheduleService({
      updatePaySchedule: async (id, _frequency, anchorDate, _dayOfMonth2, _label, amount) => {
        expect(id).toBe(scheduleId)
        gotAmount = amount
        gotAnchor = anchorDate
      },
    }),
  )

  const body = JSON.stringify({ frequency: 'monthly', anchor_date: '2026-03-15', amount: 99.99 })
  const res = await localFetch(`/api/pay-schedule/${scheduleId}`, { method: 'PATCH', body })
  expect(res.status).toBe(204)
  expect(gotAmount).toBe(9999)
  expect(gotAnchor.toISOString()).toBe('2026-03-15T00:00:00.000Z')
})

// Real service and repos (no Go test of these: they cover the Go quirks kept by the port).
describe('pay schedule routes on the real service', () => {
  beforeEach(() => {
    registerPayScheduleRoutes(buildApp(db))
  })

  it('answers an unknown account_id with 500 and the Go error text (not 404)', async () => {
    const body = JSON.stringify({
      account_id: crypto.randomUUID(),
      frequency: 'monthly',
      anchor_date: '2026-04-10',
      amount: 10,
    })
    const res = await localFetch('/api/pay-schedule', { method: 'POST', body })
    expect(res.status).toBe(500)
    expect(await json<{ error: string }>(res)).toEqual({
      error:
        'service.CreatePaySchedule: account not found: accounts.GetByID: sql: no rows in result set',
    })
  })

  it('answers a missing schedule on confirm with 404', async () => {
    const res = await localFetch(`/api/pay-schedule/${crypto.randomUUID()}/confirm`, { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await json<{ error: string }>(res)).toEqual({ error: 'schedule not found' })
  })

  it('answers an update of an unknown schedule with 404', async () => {
    const patch = await localFetch(`/api/pay-schedule/${crypto.randomUUID()}`, {
      method: 'PATCH',
      body: JSON.stringify({ frequency: 'weekly', anchor_date: '2026-01-02', amount: 1 }),
    })
    expect(patch.status).toBe(404)
    expect(await json<{ error: string }>(patch)).toEqual({ error: 'schedule not found' })
  })

  it('answers a delete of an unknown schedule with 404', async () => {
    const del = await localFetch(`/api/pay-schedule/${crypto.randomUUID()}`, { method: 'DELETE' })
    expect(del.status).toBe(404)
    expect(await json<{ error: string }>(del)).toEqual({ error: 'schedule not found' })
  })
})
