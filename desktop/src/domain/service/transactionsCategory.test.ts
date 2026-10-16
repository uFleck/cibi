// @vitest-environment node
// Category auto-fill on create (see service/transactions.ts). Runs on the real schema and the real
// services, built by buildApp, so the stored row is what the app would store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, type App } from '../app'
import { rulesClassifier, setClassifier, type Classification, type Classifier } from '../classifier'
import { composeClassifiers } from '../classifier/compose'
import { createLayaClassifier, type LayaAgent } from '../classifier/laya'
import { DEFAULT_CATEGORIES } from '../categories'
import { FREQ_MONTHLY } from '../engine/engine'
import { createTestDb } from '../testing/testDb'
import type { NewTransaction } from './transactions'

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

function input(over: Partial<NewTransaction> = {}): NewTransaction {
  return {
    accountId,
    type: '',
    friendId: null,
    amount: -1500,
    title: 'Mercado Livre',
    description: null,
    links: [],
    isRecurring: false,
    frequency: null,
    anchorDate: null,
    nextOccurrence: null,
    requiresConfirmation: false,
    confirmedAt: null,
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    ...over,
  }
}

async function storedCategory(id: string): Promise<string | null> {
  return (await app.txnsRepo.getById(id)).category
}

function classifier(result: Classification | null | (() => never)): Classifier {
  return {
    classify: async () => {
      if (typeof result === 'function') return result()
      return result
    },
  }
}

describe('create: category auto-fill', () => {
  it('fills a blank category on an expense and stores it', async () => {
    const created = await app.txnsSvc.createTransaction(input())
    expect(created.category).toBe('Compras')
    expect(await storedCategory(created.id)).toBe('Compras')
  })

  it('keeps a category the user typed', async () => {
    const created = await app.txnsSvc.createTransaction(input({ category: 'Lazer' }))
    expect(await storedCategory(created.id)).toBe('Lazer')
  })

  it('treats a whitespace-only category as blank', async () => {
    const created = await app.txnsSvc.createTransaction(input({ category: '   ' }))
    expect(await storedCategory(created.id)).toBe('Compras')
  })

  it('does not classify income', async () => {
    const created = await app.txnsSvc.createTransaction(input({ amount: 1500, title: 'Mercado Livre estorno' }))
    expect(await storedCategory(created.id)).toBeNull()
  })

  it('leaves an expense with no confident match uncategorized, and saves it', async () => {
    const created = await app.txnsSvc.createTransaction(input({ title: 'Pix para Maria' }))
    expect(await storedCategory(created.id)).toBeNull()
    expect((await app.txnsRepo.getById(created.id)).title).toBe('Pix para Maria')
  })

  it('reads the description too: a title with no match is categorized from the detail', async () => {
    const created = await app.txnsSvc.createTransaction(input({ title: 'Pix para Maria', description: 'Netflix da familia' }))
    expect(await storedCategory(created.id)).toBe('Assinaturas')
    expect((await app.txnsRepo.getById(created.id)).description).toBe('Netflix da familia')
  })

  it('a failing classifier never fails the save', async () => {
    setClassifier(
      classifier(() => {
        throw new Error('model unavailable')
      }),
    )
    const created = await app.txnsSvc.createTransaction(input())
    expect(await storedCategory(created.id)).toBeNull()
    expect((await app.txnsRepo.getById(created.id)).amount).toBe(-1500)
  })

  it('does not store a suggestion below the confidence threshold', async () => {
    setClassifier(classifier({ category: 'Lazer', confidence: 0.2 }))
    const created = await app.txnsSvc.createTransaction(input())
    expect(await storedCategory(created.id)).toBeNull()
  })

  it('classifies a recurring template too', async () => {
    const created = await app.txnsSvc.createTransaction(
      input({ title: 'Netflix', isRecurring: true, frequency: FREQ_MONTHLY, anchorDate: new Date() }),
    )
    expect(await storedCategory(created.id)).toBe('Assinaturas')
  })

  it('offers the classifier the custom values already in use', async () => {
    await app.txnsSvc.createTransaction(input({ category: 'Pet', title: 'Ração' }))
    let offered: string[] = []
    setClassifier({
      classify: async (_d, options) => {
        offered = options.map((o) => o.label)
        return null
      },
    })
    await app.txnsSvc.createTransaction(input({ title: 'Pet shop' }))
    expect(offered).toContain('Pet')
    expect(offered).toContain('Mercado')
  })
})

describe('create: never waits for the model', () => {
  it('saves at once without a category when the model is not loaded, and does not start loading it', async () => {
    const load = vi.fn(() => new Promise<LayaAgent>(() => {}))
    setClassifier(composeClassifiers(rulesClassifier, createLayaClassifier(load, { loadTimeoutMs: 60_000 })))
    const started = Date.now()
    const created = await app.txnsSvc.createTransaction(input({ title: 'Pet shop' }))
    expect(Date.now() - started).toBeLessThan(2000)
    expect(await storedCategory(created.id)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('uses the model once it is loaded', async () => {
    const agent: LayaAgent = {
      predict: async () => ({ answers: { category: { type: 'choice', choice: 'Outros', answer_confidence: 0.95 } } }),
    }
    const laya = createLayaClassifier(async () => agent)
    laya.warm?.()
    setClassifier(composeClassifiers(rulesClassifier, laya))
    await vi.waitFor(async () => {
      expect(await laya.classify('Pet shop', DEFAULT_CATEGORIES, { onlyIfReady: true })).not.toBeNull()
    })
    const created = await app.txnsSvc.createTransaction(input({ title: 'Pet shop' }))
    expect(await storedCategory(created.id)).toBe('Outros')
  })
})
