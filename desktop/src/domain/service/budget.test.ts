// BudgetService: a month built from payments, recurring bills, exclusions and limits.
// The repos are in-memory fakes. Local instants use new Date(y, m, d, ...) and UTC instants use
// Date.UTC, so the expectations hold in any timezone.
import { describe, expect, it } from 'vitest'
import type { Db } from '../db'
import { AppError, ErrNoRows, isErr, wrap } from '../errors'
import type { BudgetLimit, BudgetResponse, BudgetRow } from '../budget'
import type { BudgetRepo, PaymentRow, RecurringRow } from '../repo/budget'
import type { Transaction, TransactionsRepo } from '../repo/transactions'
import { BudgetService } from './budget'

interface Store {
  limits: BudgetLimit[]
  payments: PaymentRow[]
  recurring: RecurringRow[]
  /** 'YYYY-MM|transactionId' keys. */
  exclusions: Set<string>
  /** Calls to replaceLimits, with the limits it received. */
  replaced: BudgetLimit[][]
  /** Ids the fake transactions repo knows about. */
  transactionIds: Set<string>
  categories: string[]
}

function makeStore(seed: Partial<Store> = {}): Store {
  return {
    limits: [],
    payments: [],
    recurring: [],
    exclusions: new Set(),
    replaced: [],
    transactionIds: new Set(),
    categories: [],
    ...seed,
  }
}

function fakeRepo(store: Store): BudgetRepo {
  return {
    listLimits: async () => store.limits.map((l) => ({ ...l })),
    replaceLimits: async (limits) => {
      store.replaced.push(limits)
      store.limits = limits.map((l) => ({ ...l }))
    },
    listPaymentsBetween: async (from, to) =>
      store.payments.filter((p) => p.postedAt.getTime() >= from.getTime() && p.postedAt.getTime() < to.getTime()),
    listRecurringBetween: async (from, to) =>
      store.recurring.filter(
        (r) => r.nextOccurrence.getTime() >= from.getTime() && r.nextOccurrence.getTime() < to.getTime(),
      ),
    listExclusionIds: async (month) =>
      [...store.exclusions].filter((k) => k.startsWith(`${month}|`)).map((k) => k.slice(month.length + 1)),
    addExclusion: async (id, month) => {
      store.exclusions.add(`${month}|${id}`)
    },
    removeExclusion: async (id, month) => {
      store.exclusions.delete(`${month}|${id}`)
    },
  }
}

function fakeTxns(store: Store): Pick<TransactionsRepo, 'getById'> {
  return {
    getById: async (id: string) => {
      if (!store.transactionIds.has(id)) throw wrap('transactions.GetByID', ErrNoRows)
      return { id } as Transaction
    },
  }
}

/** A Db whose tx runs the callback directly; the fakes do not query SQL. */
function fakeDb(): Db & { txCount: number } {
  const db: Db & { txCount: number } = {
    txCount: 0,
    query: async () => [],
    tx: async <T>(fn: () => Promise<T>): Promise<T> => {
      db.txCount++
      return fn()
    },
  }
  return db
}

function setup(seed: Partial<Store> = {}) {
  const store = makeStore(seed)
  const db = fakeDb()
  const service = new BudgetService(db, fakeRepo(store), fakeTxns(store), async () =>
    store.categories.map((label) => ({ id: label, label, description: '' })),
  )
  return { store, db, service }
}

function payment(amount: number, postedAt: Date, category: string | null, transactionType: string | null = 'personal'): PaymentRow {
  return { amount, postedAt, category, transactionType }
}

function bill(id: string, amount: number, nextOccurrence: Date, category: string | null, title = id): RecurringRow {
  return { transactionId: id, title, category, amount, nextOccurrence, estimateSource: null, estimateKey: null }
}

function rowOf(res: BudgetResponse, category: string): BudgetRow {
  const row = res.rows.find((r) => r.category === category)
  if (!row) throw new Error(`no row for ${category}`)
  return row
}

const OCT_16 = new Date(2026, 9, 16, 12, 0)

describe('spend', () => {
  it('sums negative payments by category, with blank or missing categories as Uncategorized', async () => {
    const { service } = setup({
      payments: [
        payment(-100000, new Date(2026, 9, 5, 10), 'Mercado'),
        payment(-50000, new Date(2026, 9, 6, 10), ' Mercado '),
        payment(-30000, new Date(2026, 9, 7, 10), null),
        payment(-20000, new Date(2026, 9, 8, 10), '   '),
      ],
    })
    const res = await service.getBudget('2026-10', OCT_16)
    expect(rowOf(res, 'Mercado').spent).toBe(150000)
    expect(rowOf(res, 'Uncategorized').spent).toBe(50000)
    expect(res.totals.spent).toBe(200000)
  })

  it('does not count peer transfers', async () => {
    const { service } = setup({
      payments: [
        payment(-100000, new Date(2026, 9, 5, 10), 'Mercado'),
        payment(-400000, new Date(2026, 9, 6, 10), 'Mercado', 'peer'),
      ],
    })
    const res = await service.getBudget('2026-10', OCT_16)
    expect(rowOf(res, 'Mercado').spent).toBe(100000)
    expect(res.totals.spent).toBe(100000)
  })

  it('uses local month boundaries', async () => {
    const { service } = setup({
      payments: [
        payment(-100, new Date(2026, 9, 1, 0, 0), 'Lazer'),
        payment(-200, new Date(2026, 9, 31, 23, 30), 'Lazer'),
        payment(-400, new Date(2026, 10, 1, 0, 30), 'Lazer'),
        payment(-800, new Date(2026, 8, 30, 23, 59), 'Lazer'),
      ],
    })
    expect((await service.getBudget('2026-10', OCT_16)).totals.spent).toBe(300)
    expect((await service.getBudget('2026-11', OCT_16)).totals.spent).toBe(400)
    expect((await service.getBudget('2026-09', OCT_16)).totals.spent).toBe(800)
  })
})

describe('scheduled bills', () => {
  it('groups a bill by its UTC due day', async () => {
    const { service } = setup({
      recurring: [bill('rent', -150000, new Date(Date.UTC(2026, 10, 1)), 'Moradia', 'Aluguel')],
    })
    const nov = await service.getBudget('2026-11', OCT_16)
    expect(nov.bills).toHaveLength(1)
    expect(nov.bills[0]).toEqual({
      transactionId: 'rent',
      title: 'Aluguel',
      category: 'Moradia',
      amount: 150000,
      dueDate: '2026-11-01',
      excluded: false,
    })
    expect(rowOf(nov, 'Moradia').scheduled).toBe(150000)
    expect(nov.totals.scheduled).toBe(150000)

    const oct = await service.getBudget('2026-10', OCT_16)
    expect(oct.bills).toHaveLength(0)
    expect(oct.totals.scheduled).toBe(0)
  })

  it('counts an overdue unpaid bill in its own month, whatever now is', async () => {
    const { service } = setup({
      recurring: [bill('water', -8000, new Date(Date.UTC(2026, 9, 3)), 'Contas e serviços', 'Água')],
    })
    const res = await service.getBudget('2026-10', new Date(2026, 9, 20, 12))
    expect(res.bills.map((b) => b.transactionId)).toEqual(['water'])
    expect(rowOf(res, 'Contas e serviços').scheduled).toBe(8000)
  })

  it('does not count a paid bill in the month it was paid from', async () => {
    // Paid on 3 Oct: the ledger holds the payment and next_occurrence moved to November.
    const { service } = setup({
      payments: [payment(-150000, new Date(2026, 9, 3, 9), 'Moradia')],
      recurring: [bill('rent', -150000, new Date(Date.UTC(2026, 10, 3)), 'Moradia')],
    })
    const oct = await service.getBudget('2026-10', OCT_16)
    expect(oct.bills).toHaveLength(0)
    expect(oct.totals.scheduled).toBe(0)
    expect(oct.totals.spent).toBe(150000)

    const nov = await service.getBudget('2026-11', OCT_16)
    expect(nov.totals.scheduled).toBe(150000)
  })

  it('removes an excluded bill from that month only', async () => {
    const { service, store } = setup({
      transactionIds: new Set(['gym']),
      recurring: [
        bill('gym', -90000, new Date(Date.UTC(2026, 9, 15)), 'Saúde', 'Academia'),
        bill('gym', -90000, new Date(Date.UTC(2026, 10, 15)), 'Saúde', 'Academia'),
      ],
    })
    await service.addExclusion('gym', '2026-10')
    expect(store.exclusions.has('2026-10|gym')).toBe(true)

    const oct = await service.getBudget('2026-10', OCT_16)
    expect(oct.bills).toEqual([expect.objectContaining({ transactionId: 'gym', excluded: true })])
    expect(oct.totals.scheduled).toBe(0)
    expect(oct.rows.find((r) => r.category === 'Saúde')).toBeUndefined()

    const nov = await service.getBudget('2026-11', OCT_16)
    expect(nov.bills).toEqual([expect.objectContaining({ transactionId: 'gym', excluded: false })])
    expect(nov.totals.scheduled).toBe(90000)

    await service.removeExclusion('gym', '2026-10')
    expect((await service.getBudget('2026-10', OCT_16)).totals.scheduled).toBe(90000)
  })

  it('sorts bills by due date, then title', async () => {
    const { service } = setup({
      recurring: [
        bill('b', -100, new Date(Date.UTC(2026, 9, 20)), null, 'Zeta'),
        bill('a', -100, new Date(Date.UTC(2026, 9, 5)), null, 'Zeta'),
        bill('c', -100, new Date(Date.UTC(2026, 9, 5)), null, 'Alfa'),
      ],
    })
    const res = await service.getBudget('2026-10', OCT_16)
    expect(res.bills.map((b) => b.transactionId)).toEqual(['c', 'a', 'b'])
    expect(res.bills.map((b) => b.dueDate)).toEqual(['2026-10-05', '2026-10-05', '2026-10-20'])
  })
})

describe('status and rows', () => {
  it('marks a fixed category over when past its limit and never ahead', async () => {
    const seed = {
      limits: [{ category: 'Moradia', monthlyLimit: 100000, isFixed: true }],
      payments: [payment(-50000, new Date(2026, 9, 2, 9), 'Moradia')],
    }
    const early = new Date(2026, 9, 2, 12) // pace 2/31, so 50% spent would be ahead if not fixed
    expect(rowOf(await setup(seed).service.getBudget('2026-10', early), 'Moradia').status).toBe('ok')

    const over = setup({
      limits: [{ category: 'Moradia', monthlyLimit: 100000, isFixed: true }],
      payments: [payment(-120000, new Date(2026, 9, 2, 9), 'Moradia')],
    })
    const row = rowOf(await over.service.getBudget('2026-10', early), 'Moradia')
    expect(row.status).toBe('over')
    expect(row.isFixed).toBe(true)
  })

  it('marks a non-fixed category ahead when spent is above pace plus the margin', async () => {
    const { service } = setup({
      limits: [{ category: 'Mercado', monthlyLimit: 100000, isFixed: false }],
      payments: [payment(-50000, new Date(2026, 9, 2, 9), 'Mercado')],
    })
    const row = rowOf(await service.getBudget('2026-10', new Date(2026, 9, 2, 12)), 'Mercado')
    expect(row.status).toBe('ahead')
    expect(row.limit).toBe(100000)
  })

  it('treats a zero limit as over only when something is spent or scheduled', async () => {
    const quiet = setup({ limits: [{ category: 'Viagem', monthlyLimit: 0, isFixed: false }] })
    expect(rowOf(await quiet.service.getBudget('2026-10', OCT_16), 'Viagem').status).toBe('ok')

    const spent = setup({
      limits: [{ category: 'Viagem', monthlyLimit: 0, isFixed: false }],
      payments: [payment(-1, new Date(2026, 9, 4, 9), 'Viagem')],
    })
    expect(rowOf(await spent.service.getBudget('2026-10', OCT_16), 'Viagem').status).toBe('over')
  })

  it('gives a category without a limit a null status and leaves it out of totals.limit', async () => {
    const { service } = setup({
      limits: [{ category: 'Mercado', monthlyLimit: 100000, isFixed: false }],
      payments: [payment(-30000, new Date(2026, 9, 4, 9), 'Lazer')],
    })
    const res = await service.getBudget('2026-10', OCT_16)
    const lazer = rowOf(res, 'Lazer')
    expect(lazer.limit).toBeNull()
    expect(lazer.status).toBeNull()
    expect(lazer.spent).toBe(30000)
    expect(res.totals.limit).toBe(100000)
    expect(res.totals.spent).toBe(30000)
  })

  it('lists budgeted categories first by name, then the rest by amount', async () => {
    const { service } = setup({
      limits: [
        { category: 'Viagem', monthlyLimit: 500, isFixed: false },
        { category: 'Mercado', monthlyLimit: 500, isFixed: false },
      ],
      payments: [
        payment(-100, new Date(2026, 9, 4, 9), 'Lazer'),
        payment(-900, new Date(2026, 9, 4, 9), 'Compras'),
        payment(-300, new Date(2026, 9, 4, 9), 'Cinema'),
      ],
    })
    const res = await service.getBudget('2026-10', OCT_16)
    expect(res.rows.map((r) => r.category)).toEqual(['Mercado', 'Viagem', 'Compras', 'Cinema', 'Lazer'])
  })
})

describe('totals and pace', () => {
  it('computes left as limit minus spent minus scheduled', async () => {
    const { service } = setup({
      limits: [
        { category: 'Mercado', monthlyLimit: 100000, isFixed: false },
        { category: 'Moradia', monthlyLimit: 200000, isFixed: true },
      ],
      payments: [payment(-30000, new Date(2026, 9, 4, 9), 'Mercado')],
      transactionIds: new Set(['gym']),
      recurring: [
        bill('rent', -150000, new Date(Date.UTC(2026, 9, 1)), 'Moradia'),
        bill('gym', -50000, new Date(Date.UTC(2026, 9, 10)), 'Saúde'),
      ],
    })
    await service.addExclusion('gym', '2026-10')
    const res = await service.getBudget('2026-10', OCT_16)
    expect(res.totals).toEqual({ limit: 300000, spent: 30000, scheduled: 150000, left: 120000 })
  })

  it('reports pace for the current, past and future months', async () => {
    const { service } = setup()
    expect(await service.getBudget('2026-10', OCT_16)).toMatchObject({
      pace: { day: 16, daysInMonth: 31, ratio: 16 / 31 },
    })
    expect((await service.getBudget('2026-09', OCT_16)).pace).toEqual({ day: 30, daysInMonth: 30, ratio: 1 })
    expect((await service.getBudget('2026-11', OCT_16)).pace).toEqual({ day: 0, daysInMonth: 30, ratio: 0 })
  })

  it('defaults to the local month of now', async () => {
    const { service } = setup()
    expect((await service.getBudget(undefined, OCT_16)).month).toBe('2026-10')
  })
})

describe('categories', () => {
  it('offers the categories the category list returns', async () => {
    const { service } = setup({ categories: ['Mercado', 'Pet shop'] })
    const labels = (await service.getBudget('2026-10', OCT_16)).categories.map((c) => c.label)
    expect(labels).toEqual(['Mercado', 'Pet shop'])
  })
})

describe('errors and writes', () => {
  it('rejects an invalid month with an AppError', async () => {
    const { service } = setup()
    const err = await service.getBudget('2026-13').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as Error).message).toBe('invalid month: use YYYY-MM')
    await expect(service.addExclusion('x', '2026-1')).rejects.toThrow('invalid month: use YYYY-MM')
    await expect(service.removeExclusion('x', 'oct')).rejects.toBeInstanceOf(AppError)
  })

  it('rejects invalid limits without saving', async () => {
    const { service, store, db } = setup()
    await expect(service.replaceLimits([{ category: ' ', monthlyLimit: 1, isFixed: false }])).rejects.toThrow(
      'category is required',
    )
    await expect(service.replaceLimits([{ category: 'A', monthlyLimit: -1, isFixed: false }])).rejects.toThrow(
      'monthlyLimit must be a non-negative integer (cents)',
    )
    expect(store.replaced).toHaveLength(0)
    expect(db.txCount).toBe(0)
  })

  it('trims categories before saving the limits, in one transaction', async () => {
    const { service, store, db } = setup()
    await service.replaceLimits([{ category: '  Mercado ', monthlyLimit: 100000, isFixed: false }])
    expect(store.replaced).toEqual([[{ category: 'Mercado', monthlyLimit: 100000, isFixed: false }]])
    expect(db.txCount).toBe(1)
  })

  it('keeps the ErrNoRows sentinel when adding an exclusion for a missing transaction', async () => {
    const { service, store } = setup()
    const err = await service.addExclusion('missing', '2026-10').catch((e: unknown) => e)
    expect(isErr(err, ErrNoRows)).toBe(true)
    expect(store.exclusions.size).toBe(0)
  })
})
