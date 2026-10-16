// @vitest-environment node
// Variable-amount recurring expenses: the median estimate, its use by the engine and the budget, and
// confirming with the real amount. Runs on the real schema through buildApp.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'
import { medianCents } from '../estimate'
import { createTestDb } from '../testing/testDb'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb
let app: App
const accountId = crypto.randomUUID()

beforeEach(async () => {
  db = await createTestDb()
  app = buildApp(db)
  await db.query(`INSERT INTO Account (id, name, current_balance, currency, safety_buffer) VALUES (?, 'x', 0, 'BRL', 0)`, [
    accountId,
  ])
  // Bi-weekly pay on Wednesdays: 2026-04-01, 04-15, 04-29.
  await db.query(
    `INSERT INTO PaySchedule (id, account_id, frequency, anchor_date, day_of_month2, label, amount) VALUES (?, ?, 'bi-weekly', '2026-04-01T00:00:00Z', NULL, 'pay', 100000)`,
    [crypto.randomUUID(), accountId],
  )
})

afterEach(() => {
  db.close()
})

/** A past expense that has been paid: a one-off transaction and its ledger payment. */
async function paidExpense(cents: number, title: string, category: string | null, postedAt: string): Promise<void> {
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO "Transaction" (id, account_id, amount, title, category, timestamp, is_recurring, requires_confirmation) VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    [id, accountId, -cents, title, category, postedAt],
  )
  await app.ledgerSvc.recordEntry({
    accountId,
    transactionId: id,
    payScheduleId: null,
    entryType: 'payment',
    amount: -cents,
    description: title,
    postedAt: new Date(postedAt),
  })
}

async function variableMarket(over: { source?: string; key?: string; amount?: number; next?: string } = {}) {
  return app.txnsSvc.createTransaction({
    accountId,
    type: '',
    friendId: null,
    amount: over.amount ?? -15000,
    title: 'Market',
    category: 'Groceries',
    description: null,
    links: [],
    isRecurring: true,
    frequency: 'weekly',
    anchorDate: new Date('2099-01-01T00:00:00Z'), // in the future, so creating it does not debit a payment
    nextOccurrence: new Date(over.next ?? '2026-04-17T00:00:00Z'),
    requiresConfirmation: false,
    confirmedAt: null,
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    estimateSource: over.source ?? 'category',
    estimateKey: over.key ?? 'Groceries',
  })
}

describe('medianCents', () => {
  it('is null for no values, the middle for an odd count and the rounded mean of the middle two for an even count', () => {
    expect(medianCents([])).toBeNull()
    expect(medianCents([-3, -1, -2])).toBe(-2)
    expect(medianCents([-1, -2, -3, -10])).toBe(-2) // (-3 + -2) / 2 = -2.5, rounded up
  })
})

describe('estimate', () => {
  it('uses the median of the latest payments in the category, ignoring other categories', async () => {
    await paidExpense(10000, 'Carrefour', 'Groceries', '2026-03-01T12:00:00Z')
    await paidExpense(20000, 'Extra', 'Groceries', '2026-03-08T12:00:00Z')
    await paidExpense(90000, 'Party shop', 'Groceries', '2026-03-15T12:00:00Z')
    await paidExpense(5000, 'Bus', 'Transport', '2026-03-16T12:00:00Z')
    const t = await variableMarket()
    const estimate = await app.estimateSvc.estimate(t)
    expect(estimate).toEqual({ amount: -20000, samples: 3 })
  })

  it('looks only at the latest six payments', async () => {
    for (let i = 1; i <= 8; i++) {
      await paidExpense(i * 1000, `Shop ${i}`, 'Groceries', `2026-03-${String(i).padStart(2, '0')}T12:00:00Z`)
    }
    const estimate = await app.estimateSvc.estimate(await variableMarket())
    // The latest six are 3000..8000; the median is (5000 + 6000) / 2.
    expect(estimate).toEqual({ amount: -5500, samples: 6 })
  })

  it('matches a keyword in the title regardless of case, and treats % as plain text', async () => {
    await paidExpense(12000, 'Atacadao market run', null, '2026-03-01T12:00:00Z')
    await paidExpense(18000, 'MARKET again', null, '2026-03-08T12:00:00Z')
    await paidExpense(99999, 'Something else', null, '2026-03-09T12:00:00Z')
    const t = await variableMarket({ source: 'keyword', key: 'market' })
    expect(await app.estimateSvc.estimate(t)).toEqual({ amount: -15000, samples: 2 })
    const wild = await variableMarket({ source: 'keyword', key: '%' })
    expect(await app.estimateSvc.estimate(wild)).toEqual({ amount: -15000, samples: 0 })
  })

  it('falls back to the stored amount while there is no history, and is null for a fixed amount', async () => {
    const t = await variableMarket({ key: 'Nothing' })
    expect(await app.estimateSvc.estimate(t)).toEqual({ amount: -15000, samples: 0 })
    expect(await app.estimateSvc.estimate({ amount: -500, estimateSource: null, estimateKey: null })).toBeNull()
  })
})

describe('validation', () => {
  it('rejects an estimate on income, on a one-off, or with a missing key or unknown source', async () => {
    await expect(variableMarket({ amount: 5000 })).rejects.toThrow('only an expense')
    await expect(variableMarket({ source: 'nope' })).rejects.toThrow('category or keyword')
    await expect(variableMarket({ key: ' ' })).rejects.toThrow('estimate_key is required')
    await expect(
      app.txnsSvc.createTransaction({
        accountId,
        type: '',
        friendId: null,
        amount: -100,
        title: 'once',
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
        estimateSource: 'category',
        estimateKey: 'Groceries',
      }),
    ).rejects.toThrow('only a recurring')
  })

  it('makes the amount fixed again when the estimate is cleared', async () => {
    const t = await variableMarket()
    await app.txnsSvc.updateTransaction(t.id, { estimateSource: '', estimateKey: '' })
    const stored = await app.txnsSvc.getTransaction(t.id)
    expect(stored.estimateSource).toBeNull()
    expect(stored.estimateKey).toBeNull()
  })
})

describe('engine', () => {
  it('counts the estimate once per occurrence before the next payday', async () => {
    await paidExpense(10000, 'Carrefour', 'Groceries', '2026-03-01T12:00:00Z')
    await paidExpense(20000, 'Extra', 'Groceries', '2026-03-08T12:00:00Z')
    await paidExpense(30000, 'Big', 'Groceries', '2026-03-15T12:00:00Z')
    // Balance after those three payments is -60000; bring it to a known value with income.
    await app.ledgerSvc.recordEntry({
      accountId,
      transactionId: null,
      payScheduleId: null,
      entryType: 'income',
      amount: 160000,
      description: 'seed',
      postedAt: new Date('2026-03-20T12:00:00Z'),
    })
    // Next payday after 04-16 is 04-29: the weekly run falls on 04-17 and 04-24, so two estimates of -20000.
    await variableMarket({ next: '2026-04-17T00:00:00Z' })
    const result = await app.engineSvc.canIBuyIt(accountId, 1000, new Date('2026-04-16T12:00:00Z'))
    expect(result.purchasingPower).toBe(100000 - 40000)
  })
})

describe('confirm', () => {
  it('debits the amount you typed, else the current estimate, and a fixed one always debits its own amount', async () => {
    await paidExpense(20000, 'Extra', 'Groceries', '2026-03-08T12:00:00Z')
    const t = await variableMarket()
    const before = (await app.accountsRepo.getById(accountId)).currentBalance

    await app.txnsSvc.confirmRecurring(t.id, -23456)
    expect((await app.accountsRepo.getById(accountId)).currentBalance).toBe(before - 23456)

    await app.txnsSvc.confirmRecurring(t.id)
    // The first confirmation joined the history: the payments are now -20000 and -23456.
    expect((await app.accountsRepo.getById(accountId)).currentBalance).toBe(before - 23456 - 21728)

    await expect(app.txnsSvc.confirmRecurring(t.id, 500)).rejects.toThrow('must be an expense')
  })
})

describe('budget', () => {
  it('shows the estimate as the scheduled amount of the bill', async () => {
    await paidExpense(20000, 'Extra', 'Groceries', '2026-03-08T12:00:00Z')
    await variableMarket({ next: '2026-04-17T00:00:00Z' })
    const budget = await app.budgetSvc.getBudget('2026-04', new Date('2026-04-16T12:00:00Z'))
    expect(budget.bills.map((b) => b.amount)).toEqual([20000])
  })
})
