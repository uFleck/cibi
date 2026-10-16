// @vitest-environment node
// The reserve: the arithmetic of its target and contributions, and the flow from confirming a payday
// to the engine refusing to spend it. Runs on the real schema through buildApp.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'
import {
  DEFAULT_RESERVE_CONFIG,
  contributionFor,
  monthlyEquivalent,
  monthsBetween,
  parseReserveConfig,
  reserveTarget,
  validateReserveConfig,
  type ReserveConfig,
} from '../reserve'
import { createTestDb } from '../testing/testDb'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

const started = new Date('2026-01-10T00:00:00Z')
const on: ReserveConfig = { ...DEFAULT_RESERVE_CONFIG, enabled: true, startCents: 5000, stepCents: 1000, startedAt: started }

describe('monthlyEquivalent / reserveTarget', () => {
  it('turns every frequency into a monthly cost', () => {
    expect(monthlyEquivalent(1200, 'monthly')).toBe(1200)
    expect(monthlyEquivalent(1200, 'yearly')).toBe(100)
    expect(monthlyEquivalent(1200, 'weekly')).toBe(5200)
    expect(monthlyEquivalent(1200, 'bi-weekly')).toBe(2600)
    expect(monthlyEquivalent(1200, null)).toBe(1200)
  })

  it('is the number of months times the monthly obligations', () => {
    expect(reserveTarget(1, 300000)).toBe(300000)
    expect(reserveTarget(2.5, 300000)).toBe(750000)
  })
})

describe('monthsBetween', () => {
  it('counts whole months and is never negative', () => {
    expect(monthsBetween(started, started)).toBe(0)
    expect(monthsBetween(started, new Date('2026-02-09T00:00:00Z'))).toBe(0)
    expect(monthsBetween(started, new Date('2026-02-10T00:00:00Z'))).toBe(1)
    expect(monthsBetween(started, new Date('2026-05-20T00:00:00Z'))).toBe(4)
    expect(monthsBetween(started, new Date('2025-12-01T00:00:00Z'))).toBe(0)
  })
})

describe('contributionFor', () => {
  const base = { scheduleAmountCents: 400000, balanceCents: 0, targetCents: 1000000 }

  it('is the start amount plus a step for every month since it was switched on', () => {
    expect(contributionFor({ ...base, config: on, payday: new Date('2026-01-20T00:00:00Z') })).toBe(5000)
    expect(contributionFor({ ...base, config: on, payday: new Date('2026-04-10T00:00:00Z') })).toBe(8000)
  })

  it('never exceeds the percent cap of the paycheck', () => {
    const config = { ...on, startCents: 50000 }
    expect(contributionFor({ ...base, config, payday: new Date('2026-01-20T00:00:00Z') })).toBe(20000)
    expect(contributionFor({ ...base, config: { ...config, capPercent: 10 }, payday: new Date('2026-01-20T00:00:00Z') })).toBe(40000)
  })

  it('never exceeds what is missing from the target, and stops at the target', () => {
    expect(contributionFor({ ...base, config: on, payday: started, balanceCents: 998000 })).toBe(2000)
    expect(contributionFor({ ...base, config: on, payday: started, balanceCents: 1000000 })).toBe(0)
  })

  it('is zero while the reserve is off', () => {
    expect(contributionFor({ ...base, config: { ...on, enabled: false }, payday: started })).toBe(0)
    expect(contributionFor({ ...base, config: { ...on, startedAt: null }, payday: started })).toBe(0)
  })
})

describe('config', () => {
  it('rejects values that make no sense', () => {
    expect(validateReserveConfig({ targetMonths: 0, startCents: 0, stepCents: 0, capPercent: 5 })).toMatch(/target months/)
    expect(validateReserveConfig({ targetMonths: 1, startCents: -1, stepCents: 0, capPercent: 5 })).toMatch(/start amount/)
    expect(validateReserveConfig({ targetMonths: 1, startCents: 0, stepCents: -1, capPercent: 5 })).toMatch(/step-up/)
    expect(validateReserveConfig({ targetMonths: 1, startCents: 0, stepCents: 0, capPercent: 101 })).toMatch(/cap/)
    expect(validateReserveConfig({ targetMonths: 2.5, startCents: 0, stepCents: 0, capPercent: 5 })).toBeNull()
  })

  it('falls back to the defaults for anything stored wrongly', () => {
    expect(parseReserveConfig(null)).toEqual(DEFAULT_RESERVE_CONFIG)
    expect(parseReserveConfig({ enabled: 'yes', targetMonths: 'x', startedAt: 'nope' })).toEqual(DEFAULT_RESERVE_CONFIG)
  })
})

describe('reserve service', () => {
  let db: TestDb
  let app: App
  const accountId = crypto.randomUUID()
  let scheduleId: string

  beforeEach(async () => {
    db = await createTestDb()
    app = buildApp(db)
    await db.query(`INSERT INTO Account (id, name, current_balance, currency, safety_buffer) VALUES (?, 'x', 0, 'BRL', 777)`, [
      accountId,
    ])
    scheduleId = (
      await app.payScheduleSvc.createPaySchedule(accountId, 'monthly', new Date('2026-09-05T00:00:00Z'), null, 'salary', 400000)
    ).id
    // R$ 1.000 a month of rent. Its anchor is far ahead so creating it does not debit anything.
    await app.txnsSvc.createTransaction({
      accountId,
      type: '',
      friendId: null,
      amount: -100000,
      title: 'Rent',
      category: 'Housing',
      description: null,
      links: [],
      isRecurring: true,
      frequency: 'monthly',
      anchorDate: new Date('2099-01-01T00:00:00Z'),
      nextOccurrence: new Date('2099-01-01T00:00:00Z'),
      requiresConfirmation: false,
      confirmedAt: null,
      isInstallment: false,
      totalInstallments: null,
      paidInstallments: 0,
      estimateSource: null,
      estimateKey: null,
    })
  })

  afterEach(() => {
    db.close()
  })

  const settings = { enabled: true, targetMonths: 1, startCents: 5000, stepCents: 1000, capPercent: 5 }

  it('sizes the target as months of the recurring obligations', async () => {
    await app.reserveSvc.saveConfig(accountId, { ...settings, targetMonths: 2 })
    const state = await app.reserveSvc.state(accountId)
    expect(state.monthlyObligations).toBe(100000)
    expect(state.target).toBe(200000)
    expect(state.monthsCovered).toBe(0)
  })

  it('funds one contribution per confirmed payday, held to the percent cap', async () => {
    await app.reserveSvc.saveConfig(accountId, { ...settings, startCents: 50000 })
    await app.payScheduleSvc.confirmPayday(scheduleId)
    const state = await app.reserveSvc.state(accountId)
    // 5% of the R$ 4.000 paycheck, not the R$ 500 asked for.
    expect(state.balance).toBe(20000)
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]?.kind).toBe('contribution')
    expect(state.pendingTransfers).toHaveLength(1)
  })

  it('does not fund anything while it is off, and does not fund the same payday twice', async () => {
    await app.payScheduleSvc.confirmPayday(scheduleId)
    expect((await app.reserveSvc.state(accountId)).balance).toBe(0)

    await app.reserveSvc.saveConfig(accountId, settings)
    const ps = await app.psRepo.getById(scheduleId)
    const funded = await app.reserveSvc.contributeForPayday(ps)
    expect(funded).not.toBeNull()
    expect(await app.reserveSvc.contributeForPayday(ps)).toBeNull()
    expect((await app.reserveSvc.state(accountId)).balance).toBe(funded?.amount)
  })

  it('stops at the target', async () => {
    await app.reserveSvc.saveConfig(accountId, { ...settings, targetMonths: 0.06, startCents: 50000 })
    // 0.06 months of R$ 1.000 is R$ 60: the first contribution fills it and the second adds nothing.
    await app.payScheduleSvc.confirmPayday(scheduleId)
    await app.payScheduleSvc.confirmPayday(scheduleId)
    const state = await app.reserveSvc.state(accountId)
    expect(state.balance).toBe(6000)
    expect(state.progress).toBe(1)
    expect(state.eta).toBeNull()
  })

  it('makes the engine refuse to spend it, in place of the account safety buffer', async () => {
    const now = new Date('2026-09-20T12:00:00Z')
    await app.ledgerSvc.recordEntry({
      accountId,
      transactionId: null,
      payScheduleId: null,
      entryType: 'income',
      amount: 500000,
      description: 'seed',
      postedAt: new Date('2026-09-01T00:00:00Z'),
    })
    const before = await app.engineSvc.canIBuyIt(accountId, 1000, now)
    expect(before.purchasingPower).toBe(500000 - 777) // the legacy buffer, reserve off

    await app.reserveSvc.saveConfig(accountId, { ...settings, startCents: 50000 })
    await app.payScheduleSvc.confirmPayday(scheduleId) // the reserve gets 20000
    const after = await app.engineSvc.canIBuyIt(accountId, 1000, now)
    // The payday adds 400000 income too; what the reserve holds is not spendable.
    const balance = (await app.accountsRepo.getById(accountId)).currentBalance
    expect(after.purchasingPower).toBe(balance - 20000)
  })

  it('shows when the target will be reached at the current pace', async () => {
    await app.reserveSvc.saveConfig(accountId, { ...settings, startCents: 20000, stepCents: 0 })
    const state = await app.reserveSvc.state(accountId, new Date('2026-09-20T12:00:00Z'))
    // R$ 200 a month towards R$ 1.000: the fifth payday after 2026-09-20 reaches it.
    expect(state.nextContribution?.amount).toBe(20000)
    expect(state.eta?.toISOString().slice(0, 10)).toBe('2027-02-05')
    // Each of those paydays is listed with what it puts in, for the projection to take off the income.
    expect(state.upcomingContributions.map((c) => [c.scheduleId, c.amount])).toEqual(
      Array.from({ length: 5 }, () => [scheduleId, 20000]),
    )
    expect(state.upcomingContributions.map((c) => c.payday.toISOString().slice(0, 10))).toEqual([
      '2026-10-05',
      '2026-11-05',
      '2026-12-04',
      '2027-01-05',
      '2027-02-05',
    ])
  })

  it('lists no upcoming contributions while it is off', async () => {
    const state = await app.reserveSvc.state(accountId, new Date('2026-09-20T12:00:00Z'))
    expect(state.upcomingContributions).toEqual([])
  })

  it('takes money out only with a reason and only what it holds', async () => {
    await app.reserveSvc.saveConfig(accountId, settings)
    await app.payScheduleSvc.confirmPayday(scheduleId) // 5000
    await expect(app.reserveSvc.withdraw(accountId, 1000, '  ')).rejects.toThrow('say why')
    await expect(app.reserveSvc.withdraw(accountId, 9999, 'car repair')).rejects.toThrow('does not hold that much')
    await app.reserveSvc.withdraw(accountId, 2000, 'car repair')
    const state = await app.reserveSvc.state(accountId)
    expect(state.balance).toBe(3000)
    expect(state.entries[0]?.note).toBe('car repair')
  })

  it('stops reminding once a contribution is moved', async () => {
    await app.reserveSvc.saveConfig(accountId, settings)
    await app.payScheduleSvc.confirmPayday(scheduleId)
    const [pending] = (await app.reserveSvc.state(accountId)).pendingTransfers
    await app.reserveSvc.markMoved(pending?.id ?? '')
    expect((await app.reserveSvc.state(accountId)).pendingTransfers).toHaveLength(0)
  })

  it('keeps counting the step-up from the first time it was switched on, even after a pause', async () => {
    const first = new Date('2026-01-10T00:00:00Z')
    await app.reserveSvc.saveConfig(accountId, settings, first)
    await app.reserveSvc.saveConfig(accountId, { ...settings, enabled: false }, new Date('2026-02-01T00:00:00Z'))
    await app.reserveSvc.saveConfig(accountId, settings, new Date('2026-03-01T00:00:00Z'))
    expect((await app.reserveSvc.getConfig(accountId)).startedAt?.toISOString()).toBe(first.toISOString())
  })
})
