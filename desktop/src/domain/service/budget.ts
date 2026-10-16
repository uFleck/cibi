// Monthly budget: builds a month from the ledger payments, the recurring bills and the limits.
//
// Spend counts a payment in the local month of its posted time. A bill counts in the UTC month of
// its next occurrence, because due dates are stored as UTC midnight (see dates.ts). Exclusions
// remove a bill from one month's scheduled total only.

import type { Db } from '../db'
import { AppError } from '../errors'
import { DAY_MS, formatYmd } from '../dates'
import { categoryOptions, normalizeCategory } from '../categories'
import type { BudgetRepo } from '../repo/budget'
import type { TransactionsRepo } from '../repo/transactions'
import {
  UNCATEGORIZED,
  isValidMonth,
  localMonth,
  paceFor,
  statusFor,
  utcMonth,
  validateLimits,
  type BudgetLimit,
  type BudgetResponse,
  type BudgetRow,
  type ScheduledBill,
} from '../budget'

const INVALID_MONTH = 'invalid month: use YYYY-MM'

function assertMonth(month: string): void {
  if (!isValidMonth(month)) throw new AppError(INVALID_MONTH)
}

/** Query windows are padded so a row near a boundary is not missed; the exact filter is in JS. */
const WINDOW_PAD_MS = 2 * DAY_MS

export class BudgetService {
  private readonly db: Db
  private readonly repo: BudgetRepo
  private readonly txnsRepo: Pick<TransactionsRepo, 'distinctCategories' | 'getById'>

  constructor(db: Db, repo: BudgetRepo, txnsRepo: Pick<TransactionsRepo, 'distinctCategories' | 'getById'>) {
    this.db = db
    this.repo = repo
    this.txnsRepo = txnsRepo
  }

  async getBudget(month?: string, now: Date = new Date()): Promise<BudgetResponse> {
    const target = month ?? localMonth(now)
    assertMonth(target)
    const year = Number(target.slice(0, 4))
    const month1 = Number(target.slice(5, 7))

    const spent = await this.spentByCategory(target, year, month1)
    const bills = await this.scheduledBills(target, year, month1)
    const scheduled: Record<string, number> = {}
    for (const bill of bills) {
      if (bill.excluded) continue
      const key = bill.category ?? UNCATEGORIZED
      scheduled[key] = (scheduled[key] ?? 0) + bill.amount
    }

    const limits = await this.repo.listLimits()
    const limitByCategory = new Map(limits.map((l) => [l.category, l]))
    const pace = paceFor(target, now)

    const names = new Set<string>([...limitByCategory.keys(), ...Object.keys(spent), ...Object.keys(scheduled)])
    const rows: BudgetRow[] = [...names].map((category) => {
      const limit = limitByCategory.get(category)
      const isFixed = limit?.isFixed ?? false
      const spentAmount = spent[category] ?? 0
      const scheduledAmount = scheduled[category] ?? 0
      return {
        category,
        limit: limit?.monthlyLimit ?? null,
        isFixed,
        spent: spentAmount,
        scheduled: scheduledAmount,
        status: statusFor({
          limit: limit?.monthlyLimit ?? null,
          isFixed,
          spent: spentAmount,
          scheduled: scheduledAmount,
          ratio: pace.ratio,
        }),
      }
    })
    rows.sort(compareRows)

    const totalLimit = limits.reduce((sum, l) => sum + l.monthlyLimit, 0)
    const totalSpent = rows.reduce((sum, r) => sum + r.spent, 0)
    const totalScheduled = bills.reduce((sum, b) => (b.excluded ? sum : sum + b.amount), 0)

    return {
      month: target,
      totals: {
        limit: totalLimit,
        spent: totalSpent,
        scheduled: totalScheduled,
        left: totalLimit - totalSpent - totalScheduled,
      },
      pace,
      rows,
      bills,
      categories: categoryOptions([
        ...(await this.txnsRepo.distinctCategories()),
        ...limits.map((l) => l.category),
      ]),
    }
  }

  async replaceLimits(limits: BudgetLimit[]): Promise<void> {
    const problem = validateLimits(limits)
    if (problem !== null) throw new AppError(problem)
    const trimmed = limits.map((l) => ({ ...l, category: l.category.trim() }))
    await this.db.tx(() => this.repo.replaceLimits(trimmed))
  }

  async addExclusion(transactionId: string, month: string): Promise<void> {
    assertMonth(month)
    // A missing transaction rejects with an error that still satisfies isErr(err, ErrNoRows).
    await this.txnsRepo.getById(transactionId)
    await this.repo.addExclusion(transactionId, month)
  }

  async removeExclusion(transactionId: string, month: string): Promise<void> {
    assertMonth(month)
    await this.repo.removeExclusion(transactionId, month)
  }

  /** Paid out in the month, as positive cents per category. Peer transfers are not budget spend. */
  private async spentByCategory(month: string, year: number, month1: number): Promise<Record<string, number>> {
    const start = new Date(year, month1 - 1, 1).getTime()
    const end = new Date(year, month1, 1).getTime()
    const payments = await this.repo.listPaymentsBetween(
      new Date(start - WINDOW_PAD_MS),
      new Date(end + WINDOW_PAD_MS),
    )
    const spent: Record<string, number> = {}
    for (const payment of payments) {
      if (payment.transactionType === 'peer') continue
      if (localMonth(payment.postedAt) !== month) continue
      const category = normalizeCategory(payment.category) ?? UNCATEGORIZED
      spent[category] = (spent[category] ?? 0) + -payment.amount
    }
    return spent
  }

  /** The recurring bills due in the month (UTC day), sorted by due date then title. */
  private async scheduledBills(month: string, year: number, month1: number): Promise<ScheduledBill[]> {
    const start = Date.UTC(year, month1 - 1, 1)
    const end = Date.UTC(year, month1, 1)
    const recurring = await this.repo.listRecurringBetween(
      new Date(start - WINDOW_PAD_MS),
      new Date(end + WINDOW_PAD_MS),
    )
    const excluded = new Set(await this.repo.listExclusionIds(month))
    const bills: ScheduledBill[] = recurring
      .filter((r) => utcMonth(r.nextOccurrence) === month)
      .map((r) => ({
        transactionId: r.transactionId,
        title: r.title,
        category: normalizeCategory(r.category),
        amount: -r.amount,
        dueDate: formatYmd(r.nextOccurrence),
        excluded: excluded.has(r.transactionId),
      }))
    bills.sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
      return a.title.localeCompare(b.title, 'pt-BR')
    })
    return bills
  }
}

/** Budgeted categories first (by name), then the rest by spend plus scheduled, largest first. */
function compareRows(a: BudgetRow, b: BudgetRow): number {
  const aBudgeted = a.limit !== null
  const bBudgeted = b.limit !== null
  if (aBudgeted !== bBudgeted) return aBudgeted ? -1 : 1
  if (aBudgeted) return a.category.localeCompare(b.category, 'pt-BR')
  const byAmount = b.spent + b.scheduled - (a.spent + a.scheduled)
  if (byAmount !== 0) return byAmount
  return a.category.localeCompare(b.category, 'pt-BR')
}
