// @vitest-environment node
// Bills that do not follow their schedule: skipping one occurrence, paying a different amount, bills we
// are not sure about, and as-needed bills with a monthly budget. Runs on the real schema through buildApp.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'
import type { NewTransaction } from './transactions'
import { createTestDb } from '../testing/testDb'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb
let app: App
const accountId = crypto.randomUUID()
// Mid-month, so local-time month boundaries do not depend on the machine's time zone.
const NOW = new Date('2026-04-16T12:00:00Z')

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
  await app.ledgerSvc.recordEntry({
    accountId,
    transactionId: null,
    payScheduleId: null,
    entryType: 'income',
    amount: 100000,
    description: 'seed',
    postedAt: new Date('2026-03-20T12:00:00Z'),
  })
})

afterEach(() => {
  db.close()
})

function bill(over: Partial<NewTransaction> = {}): Promise<Awaited<ReturnType<App['txnsSvc']['createTransaction']>>> {
  return app.txnsSvc.createTransaction({
    accountId,
    type: '',
    friendId: null,
    amount: -10000,
    title: 'Internet',
    category: 'Bills',
    description: null,
    links: [],
    isRecurring: true,
    frequency: 'monthly',
    anchorDate: new Date('2099-01-01T00:00:00Z'), // in the future, so creating it does not debit a payment
    nextOccurrence: new Date('2026-04-20T00:00:00Z'),
    requiresConfirmation: false,
    confirmedAt: null,
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    estimateSource: null,
    estimateKey: null,
    isUncertain: false,
    isAsNeeded: false,
    ...over,
  })
}

function diapers(over: Partial<NewTransaction> = {}) {
  return bill({ title: 'Fralda+Lenço', amount: -30000, isAsNeeded: true, anchorDate: new Date('2026-04-01T00:00:00Z'), ...over })
}

async function payment(transactionId: string, cents: number, postedAt: string): Promise<void> {
  await app.ledgerSvc.recordEntry({
    accountId,
    transactionId,
    payScheduleId: null,
    entryType: 'payment',
    amount: -cents,
    description: 'x',
    postedAt: new Date(postedAt),
  })
}

const balance = async () => (await app.accountsRepo.getById(accountId)).currentBalance
const power = async () => (await app.engineSvc.canIBuyIt(accountId, 1, NOW)).purchasingPower

describe('skip and pay a different amount', () => {
  it('skipping moves the bill to its next occurrence and leaves the balance alone', async () => {
    const t = await bill()
    await app.txnsSvc.postponeRecurring(t.id)
    expect((await app.txnsRepo.getById(t.id)).nextOccurrence).toEqual(new Date('2026-05-20T00:00:00Z'))
    expect(await balance()).toBe(100000)
  })

  it('a fixed bill is debited the amount typed when paying', async () => {
    const t = await bill()
    await app.txnsSvc.confirmRecurring(t.id, -12345)
    expect(await balance()).toBe(100000 - 12345)
  })
})

describe('uncertain bills', () => {
  it('are left out of the purchasing power until paid, and paying clears the mark', async () => {
    const t = await bill({ isUncertain: true })
    expect(await power()).toBe(100000)

    await app.txnsSvc.updateTransaction(t.id, { isUncertain: false })
    expect(await power()).toBe(100000 - 10000)

    await app.txnsSvc.updateTransaction(t.id, { isUncertain: true })
    await app.txnsSvc.confirmRecurring(t.id)
    expect((await app.txnsRepo.getById(t.id)).isUncertain).toBe(false)
  })

  it('creating one with a past anchor debits nothing', async () => {
    await bill({ isUncertain: true, anchorDate: new Date('2026-04-01T00:00:00Z') })
    expect(await balance()).toBe(100000)
  })
})

describe('as-needed bills', () => {
  it('creating one debits nothing and it is always monthly', async () => {
    const t = await diapers({ frequency: 'weekly' })
    expect(await balance()).toBe(100000)
    expect(t.frequency).toBe('monthly')
  })

  it('paying needs the amount and never moves the bill', async () => {
    const t = await diapers()
    await expect(app.txnsSvc.confirmRecurring(t.id)).rejects.toThrow('needs the amount paid')
    await app.txnsSvc.confirmRecurring(t.id, -4000)
    await app.txnsSvc.confirmRecurring(t.id, -6000)
    expect(await balance()).toBe(100000 - 10000)
    expect((await app.txnsRepo.getById(t.id)).nextOccurrence).toEqual(t.nextOccurrence)
    await expect(app.txnsSvc.postponeRecurring(t.id)).rejects.toThrow('no due date to skip')
  })

  it('the budget is the stored amount without history, else the median of the last months that have payments', async () => {
    const t = await diapers()
    expect(await app.estimateSvc.monthBudget(t, NOW)).toEqual({ budget: -30000, spent: 0, samples: 0 })

    await payment(t.id, 10000, '2026-01-10T12:00:00Z')
    await payment(t.id, 15000, '2026-01-25T12:00:00Z') // January: 25000
    await payment(t.id, 40000, '2026-02-12T12:00:00Z') // February: 40000; March has none
    await payment(t.id, 5000, '2026-04-05T12:00:00Z') // this month
    expect(await app.estimateSvc.monthBudget(t, NOW)).toEqual({ budget: -32500, spent: -5000, samples: 2 })
  })

  it('the engine reserves what is left of the month, and nothing once the month is overspent', async () => {
    const t = await diapers()
    await app.txnsSvc.confirmRecurring(t.id, -10000)
    // Balance 90000, and 20000 of the 30000 budget is still to buy.
    expect((await app.engineSvc.canIBuyIt(accountId, 1, new Date())).purchasingPower).toBe(90000 - 20000)

    await app.txnsSvc.confirmRecurring(t.id, -25000)
    expect((await app.engineSvc.canIBuyIt(accountId, 1, new Date())).purchasingPower).toBe(65000)
  })

  it('an uncertain as-needed bill reserves nothing', async () => {
    await diapers({ isUncertain: true })
    expect(await power()).toBe(100000)
  })

  it('changing the budget does not rewrite a past purchase', async () => {
    const t = await diapers()
    await app.txnsSvc.confirmRecurring(t.id, -4000)
    await app.txnsSvc.updateTransaction(t.id, { amount: -50000 })
    expect(await balance()).toBe(100000 - 4000)
  })

  it('must be a recurring expense without a keyword estimate', async () => {
    await expect(diapers({ amount: 100 })).rejects.toThrow('must be an expense')
    await expect(diapers({ estimateSource: 'category', estimateKey: 'Bebê' })).rejects.toThrow('estimates its own budget')
    const t = await bill()
    await app.txnsSvc.updateTransaction(t.id, { isAsNeeded: true })
    const stored = await app.txnsRepo.getById(t.id)
    expect(stored.isAsNeeded).toBe(true)
    await expect(app.txnsSvc.updateTransaction(t.id, { estimateSource: 'category', estimateKey: 'Bills' })).rejects.toThrow(
      'estimates its own budget',
    )
  })
})
