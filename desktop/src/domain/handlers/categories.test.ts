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
  await db.query(`INSERT INTO Account (id, name, current_balance, currency) VALUES (?, 'x', 0, 'BRL')`, [
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
    body: JSON.stringify({ account_id: accountId, amount: -10, title: 'x', ...body }),
  })
  expect(res.status).toBe(201)
  return json(res)
}

describe('GET /api/categories', () => {
  it('returns the defaults and the custom values in use', async () => {
    await createTxn({ amount: -4000, title: 'Ração', category: ' Pet ' })
    const res = await localFetch('/api/categories')
    expect(res.status).toBe(200)
    const options = await json<{ id: string; label: string; description: string }[]>(res)
    expect(options.slice(0, DEFAULT_CATEGORIES.length).map((o) => o.label)).toEqual(
      DEFAULT_CATEGORIES.map((c) => c.label),
    )
    expect(options.at(-1)).toMatchObject({ label: 'Pet', description: '' })
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
      `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring) VALUES (?, ?, -1500, 'Mercado Livre', '2026-10-01T00:00:00Z', 0)`,
      [crypto.randomUUID(), accountId],
    )
    const res = await localFetch('/api/categories/backfill', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ scanned: 1, categorized: 1, skipped: 0 })
  })
})

describe('transactions carry a category', () => {
  it('auto-fills the category of a new expense in the response', async () => {
    const created = await createTxn({ title: 'iFood pedido' })
    expect(created.category).toBe('Restaurantes e delivery')
  })

  it('keeps a category the user typed', async () => {
    const created = await createTxn({ title: 'iFood pedido', category: 'Lazer' })
    expect(created.category).toBe('Lazer')
  })

  it('leaves income uncategorized', async () => {
    const created = await createTxn({ amount: 100, title: 'Mercado Livre venda' })
    expect(created.category).toBeNull()
  })

  it('PATCH sets, keeps when absent, and clears on an empty string', async () => {
    const created = await createTxn({ title: 'Academia Smart Fit' })
    expect(created.category).toBe('Saúde')

    const set = await localFetch(`/api/transactions/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ category: 'Lazer' }),
    })
    expect((await json<{ category: string | null }>(set)).category).toBe('Lazer')

    const kept = await localFetch(`/api/transactions/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Academia' }),
    })
    expect((await json<{ category: string | null }>(kept)).category).toBe('Lazer')

    const cleared = await localFetch(`/api/transactions/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ category: '' }),
    })
    expect((await json<{ category: string | null }>(cleared)).category).toBeNull()
  })

  it('GET /api/transactions includes the category field', async () => {
    await createTxn({ title: 'Netflix', category: 'Assinaturas' })
    const res = await localFetch(`/api/transactions?account_id=${accountId}`)
    const rows = await json<{ category: string | null }[]>(res)
    expect(rows.map((r) => r.category)).toEqual(['Assinaturas'])
  })
})

type Option = { id: string; label: string; description: string }
type Details = Option & { usage: number }

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  return localFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
}

describe('category management', () => {
  it('seeds the defaults, with the default text', async () => {
    const options = await json<Option[]>(await localFetch('/api/categories'))
    expect(options).toEqual([...DEFAULT_CATEGORIES])
  })

  it('adopts a label already on a transaction as a custom category', async () => {
    await createTxn({ title: 'Ração', category: ' Pet ' })
    const options = await json<Option[]>(await localFetch('/api/categories'))
    const pet = options.find((o) => o.label === 'Pet')
    expect(pet).toMatchObject({ description: '' })
    expect(pet?.id.startsWith('custom-')).toBe(true)
    expect(options.filter((o) => o.label === 'Pet')).toHaveLength(1)
  })

  it('POST adds a category and details count its transactions', async () => {
    const res = await send('POST', '/api/categories', { label: ' Pet ', description: ' Ração e veterinário ' })
    expect(res.status).toBe(201)
    expect(await json<Option>(res)).toMatchObject({ label: 'Pet', description: 'Ração e veterinário' })
    await createTxn({ title: 'Ração', category: 'pet' })
    const details = await json<Details[]>(await localFetch('/api/categories/details'))
    expect(details.find((d) => d.label === 'Pet')?.usage).toBe(1)
    expect(details.find((d) => d.label === 'Mercado')?.usage).toBe(0)
  })

  it('POST rejects a blank name, a taken name (any case) and Uncategorized', async () => {
    expect((await send('POST', '/api/categories', { label: '  ', description: '' })).status).toBe(400)
    expect((await send('POST', '/api/categories', { label: 'mercado', description: '' })).status).toBe(409)
    expect((await send('POST', '/api/categories', { label: 'uncategorized', description: '' })).status).toBe(409)
    expect((await send('POST', '/api/categories', { label: 'x'.repeat(61), description: '' })).status).toBe(400)
    expect((await send('POST', '/api/categories', { label: 'Ok', description: 'x'.repeat(501) })).status).toBe(400)
  })

  it('PUT edits the description and Laya reads it', async () => {
    const res = await send('PUT', '/api/categories/mercado', { label: 'Mercado', description: 'Feira e açougue' })
    expect(res.status).toBe(200)
    const options = await json<Option[]>(await localFetch('/api/categories'))
    expect(options.find((o) => o.id === 'mercado')?.description).toBe('Feira e açougue')
  })

  it('PUT renames the category on its transactions and budget limit, and keeps its keyword rules', async () => {
    const txn = await createTxn({ title: 'Carrefour', category: 'Mercado' })
    await db.query(`INSERT INTO Budget (category, monthly_limit, is_fixed) VALUES ('Mercado', 50000, 0)`)
    const res = await send('PUT', '/api/categories/mercado', { label: 'Feira', description: 'Compras de casa' })
    expect(res.status).toBe(200)
    const rows = await db.query<{ category: string }>(`SELECT category FROM "Transaction" WHERE id = ?`, [txn.id])
    expect(rows[0].category).toBe('Feira')
    const limits = await db.query<{ category: string }>(`SELECT category FROM Budget`)
    expect(limits.map((l) => l.category)).toEqual(['Feira'])
    const suggestion = await json<{ category: string }>(await localFetch('/api/categories/suggest?title=Carrefour%20Hiper'))
    expect(suggestion.category).toBe('Feira')
  })

  it('PUT rejects a name another category has, and an unknown id is 404', async () => {
    expect((await send('PUT', '/api/categories/mercado', { label: 'saúde', description: '' })).status).toBe(409)
    expect((await send('PUT', '/api/categories/nope', { label: 'X', description: '' })).status).toBe(404)
  })

  it('PUT may change only the case of a name', async () => {
    expect((await send('PUT', '/api/categories/mercado', { label: 'MERCADO', description: 'x' })).status).toBe(200)
  })

  it('DELETE removes the category, uncategorizes its transactions and drops its budget limit', async () => {
    const txn = await createTxn({ title: 'x', category: 'Lazer' })
    await db.query(`INSERT INTO Budget (category, monthly_limit, is_fixed) VALUES ('Lazer', 100, 0)`)
    const res = await send('DELETE', '/api/categories/lazer')
    expect(res.status).toBe(204)
    const options = await json<Option[]>(await localFetch('/api/categories'))
    expect(options.some((o) => o.id === 'lazer')).toBe(false)
    const rows = await db.query<{ category: string | null }>(`SELECT category FROM "Transaction" WHERE id = ?`, [txn.id])
    expect(rows[0].category).toBeNull()
    expect(await db.query(`SELECT * FROM Budget`)).toEqual([])
    expect((await send('DELETE', '/api/categories/lazer')).status).toBe(404)
  })

  it('a deleted category is not suggested and does not come back', async () => {
    await send('DELETE', '/api/categories/mercado')
    expect(await json(await localFetch('/api/categories/suggest?title=Carrefour%20Hiper'))).toBeNull()
    const options = await json<Option[]>(await localFetch('/api/categories'))
    expect(options.some((o) => o.label === 'Mercado')).toBe(false)
  })
})
