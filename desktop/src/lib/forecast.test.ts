import { describe, expect, it } from 'vitest'
import {
  buildForecast,
  simulateSpend,
  type ForecastBill,
  type ForecastInput,
  type ForecastSchedule,
} from './forecast'

const NOW = new Date('2026-11-10T12:00:00Z')

const semiMonthly: ForecastSchedule = {
  id: 'pay',
  frequency: 'semi-monthly',
  anchorDate: '2026-11-10',
  amount: 200_000,
  dayOfMonth2: 20,
}

function bill(overrides: Partial<ForecastBill> & Pick<ForecastBill, 'id' | 'title' | 'amount' | 'nextOccurrence'>): ForecastBill {
  return {
    isRecurring: true,
    frequency: 'monthly',
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    isAsNeeded: false,
    monthBudget: null,
    monthSpent: null,
    requiresConfirmation: true,
    confirmedAt: null,
    anchorDate: null,
    timestamp: NOW.toISOString(),
    ...overrides,
  }
}

function input(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    now: NOW,
    balance: 0,
    floor: 0,
    schedules: [semiMonthly],
    bills: [
      bill({ id: 'rent', title: 'Aluguel', amount: -160_000, nextOccurrence: '2026-11-15T00:00:00Z' }),
      bill({ id: 'card', title: 'Cartão', amount: -180_000, nextOccurrence: '2026-11-25T00:00:00Z' }),
    ],
    debts: [],
    periodCount: 3,
    ...overrides,
  }
}

describe('buildForecast', () => {
  it('gives each pay period a free amount after its bills', () => {
    const plan = buildForecast(input())

    expect(plan.periods[0]).toMatchObject({ start: '2026-11-10', end: '2026-11-19', income: 200_000 })
    expect(plan.periods[0].bills).toBe(-160_000)
    expect(plan.periods[0].free).toBe(40_000)
    expect(plan.periods[1]).toMatchObject({ start: '2026-11-19', end: '2026-12-10' })
    expect(plan.periods[1].bills).toBe(-180_000)
    expect(plan.periods[1].free).toBe(60_000)
    expect(plan.safe).toBe(true)
  })

  it('counts a weekly bill once for every occurrence before the payday', () => {
    const plan = buildForecast(input({
      bills: [bill({ id: 'market', title: 'Mercado', amount: -10_000, frequency: 'weekly', nextOccurrence: '2026-11-11T00:00:00Z' })],
    }))

    // 11/11 and 18/11 both fall before the next payday (19/11, a holiday shift).
    expect(plan.periods[0].bills).toBe(-20_000)
  })

  it('keeps an overdue bill in the current period', () => {
    const plan = buildForecast(input({
      bills: [bill({ id: 'late', title: 'Atrasada', amount: -10_000, frequency: 'weekly', nextOccurrence: '2026-11-01T00:00:00Z' })],
    }))

    // 01/11, 08/11 and 15/11 are all before the next payday (19/11).
    expect(plan.periods[0].bills).toBe(-30_000)
    expect(plan.periods[1].bills).toBe(-30_000)
  })

  it('counts the remaining installments', () => {
    const plan = buildForecast(input({
      bills: [bill({
        id: 'phone',
        title: 'Celular',
        amount: -10_000,
        isRecurring: false,
        frequency: 'monthly',
        isInstallment: true,
        totalInstallments: 6,
        paidInstallments: 2,
        nextOccurrence: '2026-11-15T00:00:00Z',
      })],
    }))

    expect(plan.periods[0].bills).toBe(-10_000)
    const all = plan.periods.flatMap(period => period.items)
    expect(all.filter(item => item.kind === 'installment')).toHaveLength(2)
  })

  it('reserves only what is left of this month for an as-needed bill, then the next budgets', () => {
    const plan = buildForecast(input({
      bills: [bill({
        id: 'home',
        title: 'Mercado',
        amount: -60_000,
        isRecurring: true,
        isAsNeeded: true,
        monthBudget: -60_000,
        monthSpent: -25_000,
        nextOccurrence: null,
      })],
    }))

    expect(plan.periods[0].bills).toBe(-35_000)
    // The next month's budget is allocated where the 1st falls.
    expect(plan.periods[1].bills).toBe(-60_000)
  })

  it('falls back to one 30-day period when there is no pay schedule', () => {
    const plan = buildForecast(input({ schedules: [] }))

    expect(plan.periods).toHaveLength(1)
    expect(plan.nextPayday).toBeNull()
    expect(plan.periods[0].income).toBe(0)
  })

  it('uses the local today instead of the UTC day', () => {
    const plan = buildForecast(input({
      now: new Date('2026-11-13T23:30:00-03:00'),
      today: '2026-11-13',
      schedules: [{ id: 'pay', frequency: 'monthly', anchorDate: '2026-11-20', amount: 100_000 }],
      bills: [],
      periodCount: 2,
    }))

    expect(plan.periods[0]?.start).toBe('2026-11-13')
  })

  it('does not count a due payday that is still unconfirmed', () => {
    const plan = buildForecast(input({
      schedules: [{ ...semiMonthly, includeIncome: false }],
      bills: [],
      periodCount: 2,
    }))

    expect(plan.periods[0]?.income).toBe(0)
    expect(plan.periods[1]?.income).toBe(200_000)
  })

  it('includes an overdue payday in the current period, not a run of past periods', () => {
    const plan = buildForecast(input({
      now: new Date('2026-11-13T12:00:00Z'),
      schedules: [{ id: 'late', frequency: 'monthly', anchorDate: '2026-11-10', amount: 100_000 }],
      bills: [],
      periodCount: 2,
    }))

    expect(plan.periods[0]).toMatchObject({ start: '2026-11-13', end: '2026-12-10', income: 100_000 })
    expect(plan.periods[1]?.start).toBe('2026-12-10')
  })

  it('includes a friend debt as an obligation', () => {
    const plan = buildForecast(input({
      debts: [{ id: 'debt', name: 'João', amount: 10_000, date: '2026-11-18' }],
    }))

    expect(plan.periods[0].debts).toBe(-10_000)
    expect(plan.periods[0].free).toBe(30_000)
  })
})

describe('simulateSpend', () => {
  it('blocks a purchase that would make the account negative before the next payday', () => {
    const result = simulateSpend(input(), 100_000, '2026-11-10')

    expect(result.safe).toBe(false)
    expect(result.minClosing).toBe(-60_000)
    expect(result.breaksAt).toBe('2026-11-19')
  })

  it('allows 400 on the 10th and 600 on the 20th, but not 401 on the 10th', () => {
    expect(simulateSpend(input(), 40_000, '2026-11-10').safe).toBe(true)
    expect(simulateSpend(input(), 60_000, '2026-11-20').safe).toBe(true)
    expect(simulateSpend(input(), 40_100, '2026-11-10').safe).toBe(false)
  })

  it('checks every period after the purchase, not only the first one', () => {
    const result = simulateSpend(input(), 60_000, '2026-11-20')

    expect(result.safe).toBe(true)
    expect(result.minClosing).toBe(0)
  })
})
