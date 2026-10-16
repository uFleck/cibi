// History for the variable-amount estimate: the latest ledger payments that match a category or a keyword.
//
// Money: integer cents, negative (outflows). Peer transfers are not spending, so they are left out.

import type { Db, SqlParam } from '../db'
import type { EstimateSource } from '../estimate'
import { wrap } from '../errors'
import { intCol, type Row } from './scan'

export interface EstimateRepo {
  /** The amounts of the latest `limit` payments that match, newest first. */
  recentPaymentAmounts(source: EstimateSource, key: string, limit: number): Promise<number[]>
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
}
