// Port-style repo for the monthly budget: the limits, the ledger payments and recurring expenses a
// month is built from, and the per-month exclusions of scheduled bills.
//
// Money: integer cents, signed as stored (ledger payments and recurring expenses are negative).
// Times: read with parseDbTime (RFC3339, "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"). The window
// arguments are inclusive lower and exclusive upper bounds, compared on the stored text, so callers
// pad them by a day or two and filter exactly in JS.

import type { BudgetLimit } from '../budget'
import type { Db } from '../db'
import { formatDbTime, parseDbTime } from '../dates'
import { wrap } from '../errors'
import { intCol, nullableTextCol, type Row, textCol } from './scan'

/** A ledger payment with the type and category of the transaction it came from (null when none). */
export interface PaymentRow {
  /** Cents, negative (an outflow). */
  amount: number
  postedAt: Date
  category: string | null
  /** 'personal' | 'peer' | null when the payment has no source transaction. */
  transactionType: string | null
}

/** A recurring personal expense with its next occurrence. */
export interface RecurringRow {
  transactionId: string
  title: string
  category: string | null
  /** Cents, negative (an outflow). */
  amount: number
  nextOccurrence: Date
}

export interface BudgetRepo {
  listLimits(): Promise<BudgetLimit[]>
  /** Replaces the whole limits set. The caller runs it inside a transaction. */
  replaceLimits(limits: BudgetLimit[]): Promise<void>
  /** Ledger rows of entry_type 'payment' with a negative amount and posted_at in [from, to). */
  listPaymentsBetween(from: Date, to: Date): Promise<PaymentRow[]>
  /** Recurring personal expenses (is_recurring, amount < 0) with next_occurrence in [from, to). */
  listRecurringBetween(from: Date, to: Date): Promise<RecurringRow[]>
  /** The transaction ids excluded for the month. */
  listExclusionIds(month: string): Promise<string[]>
  /** Idempotent. */
  addExclusion(transactionId: string, month: string): Promise<void>
  /** Idempotent. */
  removeExclusion(transactionId: string, month: string): Promise<void>
}

export class SqliteBudgetRepo implements BudgetRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async listLimits(): Promise<BudgetLimit[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT category, monthly_limit, is_fixed FROM Budget ORDER BY category`)
    } catch (err) {
      throw wrap('budget.ListLimits', err)
    }
    try {
      return rows.map((row) => ({
        category: textCol(row, 'category'),
        monthlyLimit: intCol(row, 'monthly_limit'),
        isFixed: intCol(row, 'is_fixed') === 1,
      }))
    } catch (err) {
      throw wrap('budget.ListLimits: scan', err)
    }
  }

  async replaceLimits(limits: BudgetLimit[]): Promise<void> {
    try {
      await this.db.query('DELETE FROM Budget')
      for (const limit of limits) {
        await this.db.query(`INSERT INTO Budget (category, monthly_limit, is_fixed) VALUES (?, ?, ?)`, [
          limit.category,
          limit.monthlyLimit,
          limit.isFixed ? 1 : 0,
        ])
      }
    } catch (err) {
      throw wrap('budget.ReplaceLimits', err)
    }
  }

  async listPaymentsBetween(from: Date, to: Date): Promise<PaymentRow[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT l.amount, l.posted_at, t.category, t.type AS transaction_type
		 FROM ledger l LEFT JOIN "Transaction" t ON t.id = l.transaction_id
		 WHERE l.entry_type = 'payment' AND l.amount < 0 AND l.posted_at >= ? AND l.posted_at < ?`,
        [formatDbTime(from), formatDbTime(to)],
      )
    } catch (err) {
      throw wrap('budget.ListPaymentsBetween', err)
    }
    try {
      return rows.map((row) => ({
        amount: intCol(row, 'amount'),
        postedAt: parseDbTime(textCol(row, 'posted_at')),
        category: nullableTextCol(row, 'category'),
        transactionType: nullableTextCol(row, 'transaction_type'),
      }))
    } catch (err) {
      throw wrap('budget.ListPaymentsBetween: scan', err)
    }
  }

  async listRecurringBetween(from: Date, to: Date): Promise<RecurringRow[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT id, title, category, amount, next_occurrence FROM "Transaction"
		 WHERE COALESCE(type, 'personal') = 'personal' AND is_recurring = 1 AND amount < 0
		   AND next_occurrence >= ? AND next_occurrence < ?`,
        [formatDbTime(from), formatDbTime(to)],
      )
    } catch (err) {
      throw wrap('budget.ListRecurringBetween', err)
    }
    try {
      return rows.map((row) => ({
        transactionId: textCol(row, 'id'),
        title: textCol(row, 'title'),
        category: nullableTextCol(row, 'category'),
        amount: intCol(row, 'amount'),
        nextOccurrence: parseDbTime(textCol(row, 'next_occurrence')),
      }))
    } catch (err) {
      throw wrap('budget.ListRecurringBetween: scan', err)
    }
  }

  async listExclusionIds(month: string): Promise<string[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT transaction_id FROM BudgetExclusion WHERE month = ?`, [month])
    } catch (err) {
      throw wrap('budget.ListExclusionIds', err)
    }
    try {
      return rows.map((row) => textCol(row, 'transaction_id'))
    } catch (err) {
      throw wrap('budget.ListExclusionIds: scan', err)
    }
  }

  async addExclusion(transactionId: string, month: string): Promise<void> {
    try {
      await this.db.query(`INSERT OR IGNORE INTO BudgetExclusion (transaction_id, month) VALUES (?, ?)`, [
        transactionId,
        month,
      ])
    } catch (err) {
      throw wrap('budget.AddExclusion', err)
    }
  }

  async removeExclusion(transactionId: string, month: string): Promise<void> {
    try {
      await this.db.query(`DELETE FROM BudgetExclusion WHERE transaction_id = ? AND month = ?`, [transactionId, month])
    } catch (err) {
      throw wrap('budget.RemoveExclusion', err)
    }
  }
}
