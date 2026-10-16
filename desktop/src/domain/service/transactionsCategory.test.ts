// @vitest-environment node
// Category auto-fill on create (see service/transactions.ts). Runs on the real schema and the real
// services, built by buildApp, so the stored row is what the app would store.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'
import { rulesClassifier, setClassifier, type Classification, type Classifier } from '../classifier'
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
  await db.query(`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, 'x', 0, 'BRL', 1)`, [
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
    description: 'Mercado Livre',
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
    const created = await app.txnsSvc.createTransaction(input({ amount: 1500, description: 'Mercado Livre estorno' }))
    expect(await storedCategory(created.id)).toBeNull()
  })

  it('leaves an expense with no confident match uncategorized, and saves it', async () => {
    const created = await app.txnsSvc.createTransaction(input({ description: 'Pix para Maria' }))
    expect(await storedCategory(created.id)).toBeNull()
    expect((await app.txnsRepo.getById(created.id)).description).toBe('Pix para Maria')
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
      input({ description: 'Netflix', isRecurring: true, frequency: FREQ_MONTHLY, anchorDate: new Date() }),
    )
    expect(await storedCategory(created.id)).toBe('Assinaturas')
  })

  it('offers the classifier the custom values already in use', async () => {
    await app.txnsSvc.createTransaction(input({ category: 'Pet', description: 'Ração' }))
    let offered: string[] = []
    setClassifier({
      classify: async (_d, options) => {
        offered = options.map((o) => o.label)
        return null
      },
    })
    await app.txnsSvc.createTransaction(input({ description: 'Pet shop' }))
    expect(offered).toContain('Pet')
    expect(offered).toContain('Mercado')
  })
})
