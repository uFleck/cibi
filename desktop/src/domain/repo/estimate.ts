// History for the variable-amount estimate: the latest ledger payments that match a category or a keyword.
//
// Money: integer cents, negative (outflows). Peer transfers are not spending, so they are left out.

import type { Db, SqlParam } from '../db'
import { formatDbTime, parseDbTime } from '../dates'
import type { EstimateSource } from '../estimate'
import { wrap } from '../errors'
import { intCol, textCol, type Row } from './scan'

/** One payment made for a transaction. */
export interface Payment {
  /** Cents, negative. */
  amount: number
  postedAt: Date
}

export interface EstimateRepo {
  /** The amounts of the latest `limit` payments that match, newest first. */
  recentPaymentAmounts(source: EstimateSource, key: string, limit: number): Promise<number[]>
  /** The payments recorded for one transaction posted on or after `from`, oldest first. */
  paymentsForTransaction(transactionId: string, from: Date): Promise<Payment[]>
}

/** Escapes LIKE wildcards so a keyword matches as plain text. */
function likePattern(keyword: string): string {
  return `%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export class SqliteEstimateRepo implements EstimateRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async recentPaymentAmounts(source: EstimateSource, key: string, limit: number): Promise<number[]> {
    const match =
      source === 'category'
        ? { sql: `LOWER(TRIM(COALESCE(t.category, ''))) = LOWER(TRIM(?))`, arg: key }
        : {
            sql: `LOWER(COALESCE(t.title, '') || ' ' || l.description) LIKE LOWER(?) ESCAPE '\\'`,
            arg: likePattern(key.trim()),
          }
    const args: SqlParam[] = [match.arg, limit]
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT l.amount
		 FROM ledger l LEFT JOIN "Transaction" t ON t.id = l.transaction_id
		 WHERE l.entry_type = 'payment' AND l.amount < 0 AND COALESCE(t.type, 'personal') = 'personal'
		   AND ${match.sql}
		 ORDER BY l.posted_at DESC
		 LIMIT ?`,
        args,
      )
    } catch (err) {
      throw wrap('estimate.RecentPaymentAmounts', err)
    }
    try {
      return rows.map((row) => intCol(row, 'amount'))
    } catch (err) {
      throw wrap('estimate.RecentPaymentAmounts: scan', err)
    }
  }

  async paymentsForTransaction(transactionId: string, from: Date): Promise<Payment[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT amount, posted_at FROM ledger
		 WHERE transaction_id = ? AND entry_type = 'payment' AND amount < 0 AND posted_at >= ?
		 ORDER BY posted_at`,
        [transactionId, formatDbTime(from)],
      )
    } catch (err) {
      throw wrap('estimate.PaymentsForTransaction', err)
    }
    try {
      return rows.map((row) => ({ amount: intCol(row, 'amount'), postedAt: parseDbTime(textCol(row, 'posted_at')) }))
    } catch (err) {
      throw wrap('estimate.PaymentsForTransaction: scan', err)
    }
  }
}
