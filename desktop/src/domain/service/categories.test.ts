// @vitest-environment node
// CategoriesService: the list of categories and the backfill of uncategorized expenses.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'
import { DEFAULT_CATEGORIES } from '../categories'
import { rulesClassifier, setClassifier, type Classification } from '../classifier'
import { composeClassifiers } from '../classifier/compose'
import { createLayaClassifier } from '../classifier/laya'
import { createTestDb } from '../testing/testDb'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb
let app: App
let accountId: string

beforeEach(async () => {
  db = await createTestDb()
  app = buildApp(db)
  accountId = crypto.randomUUID()
  await db.query(`INSERT INTO Account (id, name, current_balance, currency) VALUES (?, 'x', 0, 'BRL')`, [
    accountId,
  ])
})

afterEach(() => {
  setClassifier(rulesClassifier)
  db.close()
})

async function insertTxn(title: string, amount: number, category: string | null, extra: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID()
  const row = { id, account_id: accountId, amount, title, timestamp: '2026-10-01T00:00:00Z', is_recurring: 0, category, ...extra }
  const columns = Object.keys(row)
  await db.query(
    `INSERT INTO "Transaction" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    Object.values(row) as (string | number | null)[],
  )
  return id
}

async function categoryOf(id: string): Promise<string | null> {
  return (await app.txnsRepo.getById(id)).category
}

describe('CategoriesService.list', () => {
  it('returns the defaults, then the custom values in use', async () => {
    await insertTxn('Ração', -4000, 'Pet')
    await insertTxn('Mercado', -1000, '  ')
    const options = await app.categoriesSvc.list()
    expect(options.slice(0, DEFAULT_CATEGORIES.length)).toEqual([...DEFAULT_CATEGORIES])
    expect(options.slice(DEFAULT_CATEGORIES.length).map((o) => o.label)).toEqual(['Pet'])
  })

  it('adds a budget limit category that has no transaction', async () => {
    await db.query(`INSERT INTO Budget (category, monthly_limit, is_fixed) VALUES ('Viagem extra', 1, 0)`)
    expect((await app.categoriesSvc.list()).map((o) => o.label)).toContain('Viagem extra')
  })

  it('treats case variants of one label as a single category', async () => {
    await insertTxn('a', -1, 'Pet')
    await insertTxn('b', -1, 'pet')
    const options = await app.categoriesSvc.list()
    expect(options.filter((o) => o.label.toLowerCase() === 'pet')).toHaveLength(1)
  })
})

describe('CategoriesService write path', () => {
  it('a rename moves every case variant of the label, and an edited description reaches Laya', async () => {
    const a = await insertTxn('a', -1, 'Mercado')
    const b = await insertTxn('b', -1, ' mercado ')
    await app.categoriesSvc.update('mercado', { label: 'Feira', description: 'Hortifruti e feira livre' })
    expect(await categoryOf(a)).toBe('Feira')
    expect(await categoryOf(b)).toBe('Feira')
    const feira = (await app.categoriesSvc.list()).find((o) => o.id === 'mercado')
    expect(feira).toEqual({ id: 'mercado', label: 'Feira', description: 'Hortifruti e feira livre' })
  })

  it('a rename onto a label already on a transaction is rejected', async () => {
    await insertTxn('Ração', -4000, 'Pet')
    await expect(app.categoriesSvc.update('mercado', { label: 'pet', description: '' })).rejects.toThrow(/already exists/)
  })

  it('a failed rename changes nothing', async () => {
    const id = await insertTxn('a', -1, 'Mercado')
    await expect(app.categoriesSvc.update('mercado', { label: '  ', description: '' })).rejects.toThrow()
    expect(await categoryOf(id)).toBe('Mercado')
  })
})

describe('CategoriesService.suggest', () => {
  it('returns the classifier answer for a description', async () => {
    expect(await app.categoriesSvc.suggest('Spotify Premium')).toEqual({ category: 'Assinaturas', confidence: 0.9 })
    expect(await app.categoriesSvc.suggest('Pix para Maria')).toBeNull()
  })
})

describe('CategoriesService.backfill', () => {
  it('does not hang when the model load stalls: the rules still categorize', async () => {
    setClassifier(composeClassifiers(rulesClassifier, createLayaClassifier(() => new Promise(() => {}), { loadTimeoutMs: 20 })))
    const ml = await insertTxn('Mercado Livre', -1500, null)
    const unmatched = await insertTxn('Pix para Maria', -2000, null)
    expect(await app.categoriesSvc.backfill()).toEqual({ scanned: 2, categorized: 1, skipped: 1 })
    expect(await categoryOf(ml)).toBe('Compras')
    expect(await categoryOf(unmatched)).toBeNull()
  })

  it('yields to the event loop between rows, so the UI is not blocked', async () => {
    for (const description of ['Pix A', 'Pix B', 'Pix C']) await insertTxn(description, -100, null)
    let timerFired = false
    setTimeout(() => {
      timerFired = true
    }, 0)
    const seen: boolean[] = []
    setClassifier({
      classify: async (): Promise<Classification | null> => {
        seen.push(timerFired)
        return null
      },
    })
    await app.categoriesSvc.backfill()
    expect(seen).toHaveLength(3)
    expect(seen.at(-1)).toBe(true)
  })

  it('categorizes the uncategorized expenses it is confident about and reports the counts', async () => {
    const ml = await insertTxn('Mercado Livre', -1500, null)
    const unmatched = await insertTxn('Pix para Maria', -2000, null)
    const blank = await insertTxn('Spotify', -1900, '   ')
    const typed = await insertTxn('Carrefour', -3000, 'Lazer')
    const income = await insertTxn('Netflix estorno', 5000, null)
    const friend = crypto.randomUUID()
    await db.query(`INSERT INTO Friend (id, name, public_token) VALUES (?, 'Ana', ?)`, [friend, crypto.randomUUID()])
    const peer = await insertTxn('Uber', -1000, null, { type: 'peer', friend_id: friend })

    expect(await app.categoriesSvc.backfill()).toEqual({ scanned: 3, categorized: 2, skipped: 1 })

    expect(await categoryOf(ml)).toBe('Compras')
    expect(await categoryOf(blank)).toBe('Assinaturas')
    expect(await categoryOf(unmatched)).toBeNull()
    expect(await categoryOf(typed)).toBe('Lazer')
    expect(await categoryOf(income)).toBeNull()
    expect(await categoryOf(peer)).toBeNull()
  })

  it('is idempotent: a second run changes nothing', async () => {
    const ml = await insertTxn('Mercado Livre', -1500, null)
    await insertTxn('Pix para Maria', -2000, null)
    await app.categoriesSvc.backfill()
    expect(await app.categoriesSvc.backfill()).toEqual({ scanned: 1, categorized: 0, skipped: 1 })
    expect(await categoryOf(ml)).toBe('Compras')
  })

  it('leaves a row alone when the user categorizes it during the scan', async () => {
    const id = await insertTxn('Mercado Livre', -1500, null)
    setClassifier({
      classify: async () => {
        await db.query(`UPDATE "Transaction" SET category = 'Lazer' WHERE id = ?`, [id])
        return { category: 'Compras', confidence: 0.9 }
      },
    })
    expect(await app.categoriesSvc.backfill()).toEqual({ scanned: 1, categorized: 0, skipped: 1 })
    expect(await categoryOf(id)).toBe('Lazer')
  })

  it('never reads rows that already have a category', async () => {
    const typed = await insertTxn('Mercado Livre', -1500, 'Presentes e doações')
    expect(await app.categoriesSvc.backfill()).toEqual({ scanned: 0, categorized: 0, skipped: 0 })
    expect(await categoryOf(typed)).toBe('Presentes e doações')
  })
})
