// @vitest-environment node
// Routes under /api/budget. Months are fixed (2026-10) so the results do not depend on today.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import { registerRoutes } from '../routes'
import { createTestDb } from '../testing/testDb'
import type { BudgetResponse } from '../budget'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb
let accountId: string

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
  registerRoutes(buildApp(db))
  accountId = crypto.randomUUID()
  await db.query(`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, 'x', 0, 'BRL', 1)`, [
    accountId,
  ])
})

afterEach(() => {
  resetRoutesForTests()
  db.close()
})

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

async function insertRecurring(title: string, amount: number, nextOccurrence: string): Promise<string> {
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring, next_occurrence, requires_confirmation, confirmed_at, category)
     VALUES (?, ?, ?, ?, '2026-09-01T00:00:00Z', 1, ?, 0, NULL, 'Assinaturas')`,
    [id, accountId, amount, title, nextOccurrence],
  )
  return id
}

async function getBudget(month = '2026-10'): Promise<BudgetResponse> {
  const res = await localFetch(`/api/budget?month=${month}`)
  expect(res.status).toBe(200)
  return json<BudgetResponse>(res)
}

function putLimits(body: unknown): Promise<Response> {
  return localFetch('/api/budget/limits', { method: 'PUT', body: JSON.stringify(body) })
}

describe('GET /api/budget', () => {
  it('returns the budget shape for the current month when no month is given', async () => {
    const res = await localFetch('/api/budget')
    expect(res.status).toBe(200)
    const body = await json<Record<string, unknown>>(res)
    expect(Object.keys(body).sort()).toEqual(['bills', 'categories', 'month', 'pace', 'rows', 'totals'])
  })

  it('returns the requested month', async () => {
    const budget = await getBudget('2026-10')
    expect(budget.month).toBe('2026-10')
    expect(budget.pace.daysInMonth).toBe(31)
  })

  it('treats an empty month as the current month', async () => {
    const res = await localFetch('/api/budget?month=')
    expect(res.status).toBe(200)
    expect((await json<BudgetResponse>(res)).month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('answers 400 for a month that is not YYYY-MM', async () => {
    for (const month of ['2026-13', '2026-1', 'October']) {
      const res = await localFetch(`/api/budget?month=${month}`)
      expect(res.status).toBe(400)
      expect(await json(res)).toEqual({ error: 'invalid month: use YYYY-MM' })
    }
  })
})

describe('PUT /api/budget/limits', () => {
  it('saves the limits and a following GET shows them in rows', async () => {
    const res = await putLimits([
      { category: 'Mercado', monthlyLimit: 80000, isFixed: false },
      { category: 'Aluguel', monthlyLimit: 150000, isFixed: true },
    ])
    expect(res.status).toBe(204)

    const budget = await getBudget()
    const mercado = budget.rows.find((r) => r.category === 'Mercado')
    const aluguel = budget.rows.find((r) => r.category === 'Aluguel')
    expect(mercado?.limit).toBe(80000)
    expect(mercado?.isFixed).toBe(false)
    expect(aluguel?.limit).toBe(150000)
    expect(aluguel?.isFixed).toBe(true)
  })

  it('answers 400 for a body that is not an array', async () => {
    const res = await putLimits({ category: 'Mercado', monthlyLimit: 1, isFixed: false })
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: 'limits must be an array' })
  })

  it('answers 400 when there is no body', async () => {
    const res = await localFetch('/api/budget/limits', { method: 'PUT' })
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: 'limits must be an array' })
  })

  describe('rejects invalid limits and keeps the saved set', () => {
    const cases: [string, unknown[], string][] = [
      [
        'a negative monthlyLimit',
        [{ category: 'Mercado', monthlyLimit: -1, isFixed: false }],
        'monthlyLimit must be a non-negative integer (cents)',
      ],
      [
        'a fractional monthlyLimit',
        [{ category: 'Mercado', monthlyLimit: 10.5, isFixed: false }],
        'monthlyLimit must be a non-negative integer (cents)',
      ],
      [
        'a string monthlyLimit',
        [{ category: 'Mercado', monthlyLimit: '100', isFixed: false }],
        'monthlyLimit must be a non-negative integer (cents)',
      ],
      ['a blank category', [{ category: '   ', monthlyLimit: 100, isFixed: false }], 'category is required'],
      [
        'a duplicate category',
        [
          { category: 'Mercado', monthlyLimit: 100, isFixed: false },
          { category: 'Mercado', monthlyLimit: 200, isFixed: false },
        ],
        'duplicate category: Mercado',
      ],
      [
        'a non-boolean isFixed',
        [{ category: 'Mercado', monthlyLimit: 100, isFixed: 'yes' }],
        'isFixed must be a boolean',
      ],
    ]

    for (const [name, limits, message] of cases) {
      it(`answers 400 for ${name}`, async () => {
        expect((await putLimits([{ category: 'Lazer', monthlyLimit: 5000, isFixed: false }])).status).toBe(204)

        const res = await putLimits(limits)
        expect(res.status).toBe(400)
        expect(await json(res)).toEqual({ error: message })

        const budget = await getBudget()
        expect(budget.rows.find((r) => r.category === 'Lazer')?.limit).toBe(5000)
        expect(budget.rows.find((r) => r.category === 'Mercado')).toBeUndefined()
      })
    }
  })
})

describe('POST /api/budget/exclusions', () => {
  it('excludes a scheduled bill for the month; DELETE includes it again', async () => {
    const transactionId = await insertRecurring('Netflix', -4500, '2026-10-20T00:00:00Z')

    const bill = async (): Promise<{ transactionId: string; excluded: boolean } | undefined> =>
      (await getBudget()).bills.find((b) => b.transactionId === transactionId)

    expect((await bill())?.excluded).toBe(false)

    const added = await localFetch('/api/budget/exclusions', {
      method: 'POST',
      body: JSON.stringify({ transactionId, month: '2026-10' }),
    })
    expect(added.status).toBe(204)
    expect((await bill())?.excluded).toBe(true)

    const removed = await localFetch(`/api/budget/exclusions/${transactionId}/2026-10`, { method: 'DELETE' })
    expect(removed.status).toBe(204)
    expect((await bill())?.excluded).toBe(false)
  })

  it('answers 404 "transaction not found" for an unknown transactionId', async () => {
    const res = await localFetch('/api/budget/exclusions', {
      method: 'POST',
      body: JSON.stringify({ transactionId: crypto.randomUUID(), month: '2026-10' }),
    })
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({ error: 'transaction not found' })
  })

  it('answers 400 for a malformed transactionId', async () => {
    const res = await localFetch('/api/budget/exclusions', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'not-an-id', month: '2026-10' }),
    })
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: 'invalid transactionId' })
  })

  it('answers 400 when transactionId is missing or empty', async () => {
    for (const body of [{ month: '2026-10' }, { transactionId: '', month: '2026-10' }]) {
      const res = await localFetch('/api/budget/exclusions', { method: 'POST', body: JSON.stringify(body) })
      expect(res.status).toBe(400)
      expect(await json(res)).toEqual({ error: 'transactionId is required' })
    }
  })

  it('answers 400 for an invalid month', async () => {
    const transactionId = await insertRecurring('Netflix', -4500, '2026-10-20T00:00:00Z')
    const res = await localFetch('/api/budget/exclusions', {
      method: 'POST',
      body: JSON.stringify({ transactionId, month: '2026-00' }),
    })
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: 'invalid month: use YYYY-MM' })
  })
})

describe('DELETE /api/budget/exclusions/:transactionId/:month', () => {
  it('answers 400 for a malformed transactionId', async () => {
    const res = await localFetch('/api/budget/exclusions/not-an-id/2026-10', { method: 'DELETE' })
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: 'invalid transactionId' })
  })

  it('answers 400 for an invalid month', async () => {
    const res = await localFetch(`/api/budget/exclusions/${crypto.randomUUID()}/2026-7`, { method: 'DELETE' })
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: 'invalid month: use YYYY-MM' })
  })

  it('answers 204 when there is no exclusion to remove', async () => {
    const res = await localFetch(`/api/budget/exclusions/${crypto.randomUUID()}/2026-10`, { method: 'DELETE' })
    expect(res.status).toBe(204)
  })
})
