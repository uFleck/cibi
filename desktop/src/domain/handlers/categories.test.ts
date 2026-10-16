// @vitest-environment node
// Routes under /api/categories, and the category field of /api/transactions.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import { registerRoutes } from '../routes'
import { createTestDb } from '../testing/testDb'
import { DEFAULT_CATEGORIES } from '../categories'

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

async function createTxn(body: Record<string, unknown>): Promise<{ id: string; category: string | null }> {
  const res = await localFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, amount: -10, description: 'x', ...body }),
  })
  expect(res.status).toBe(201)
  return json(res)
}

describe('GET /api/categories', () => {
  it('returns the defaults and the custom values in use', async () => {
    await createTxn({ amount: -4000, description: 'Ração', category: ' Pet ' })
    const res = await localFetch('/api/categories')
    expect(res.status).toBe(200)
    const options = await json<{ id: string; label: string; description: string }[]>(res)
    expect(options.slice(0, DEFAULT_CATEGORIES.length).map((o) => o.label)).toEqual(
      DEFAULT_CATEGORIES.map((c) => c.label),
    )
    expect(options.at(-1)).toEqual({ id: 'custom:Pet', label: 'Pet', description: '' })
  })
})

describe('GET /api/categories/suggest', () => {
  it('returns the confident suggestion for a description', async () => {
    const res = await localFetch('/api/categories/suggest?description=Carrefour%20Hiper')
    expect(await json(res)).toEqual({ category: 'Mercado', confidence: 0.9 })
  })

  it('returns null when nothing matches', async () => {
    const res = await localFetch('/api/categories/suggest?description=Pix%20Maria')
    expect(res.status).toBe(200)
    expect(await json(res)).toBeNull()
  })
})

describe('POST /api/categories/backfill', () => {
  it('categorizes the uncategorized expenses and reports the counts', async () => {
    await db.query(
      `INSERT INTO "Transaction" (id, account_id, amount, description, timestamp, is_recurring) VALUES (?, ?, -1500, 'Mercado Livre', '2026-10-01T00:00:00Z', 0)`,
      [crypto.randomUUID(), accountId],
    )
    const res = await localFetch('/api/categories/backfill', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ scanned: 1, categorized: 1, skipped: 0 })
  })
})

describe('transactions carry a category', () => {
  it('auto-fills the category of a new expense in the response', async () => {
    const created = await createTxn({ description: 'iFood pedido' })
    expect(created.category).toBe('Restaurantes e delivery')
  })

  it('keeps a category the user typed', async () => {
    const created = await createTxn({ description: 'iFood pedido', category: 'Lazer' })
    expect(created.category).toBe('Lazer')
  })

  it('leaves income uncategorized', async () => {
    const created = await createTxn({ amount: 100, description: 'Mercado Livre venda' })
    expect(created.category).toBeNull()
  })

  it('PATCH sets, keeps when absent, and clears on an empty string', async () => {
    const created = await createTxn({ description: 'Academia Smart Fit' })
    expect(created.category).toBe('Saúde')

    const set = await localFetch(`/api/transactions/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ category: 'Lazer' }),
    })
    expect((await json<{ category: string | null }>(set)).category).toBe('Lazer')

    const kept = await localFetch(`/api/transactions/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Academia' }),
    })
    expect((await json<{ category: string | null }>(kept)).category).toBe('Lazer')

    const cleared = await localFetch(`/api/transactions/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ category: '' }),
    })
    expect((await json<{ category: string | null }>(cleared)).category).toBeNull()
  })

  it('GET /api/transactions includes the category field', async () => {
    await createTxn({ description: 'Netflix', category: 'Assinaturas' })
    const res = await localFetch(`/api/transactions?account_id=${accountId}`)
    const rows = await json<{ category: string | null }[]>(res)
    expect(rows.map((r) => r.category)).toEqual(['Assinaturas'])
  })
})
