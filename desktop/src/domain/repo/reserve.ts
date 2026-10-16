// The reserve's ledger: contributions made on paydays and withdrawals, per account.
//
// Money: integer cents; a contribution is positive and a withdrawal negative.

import type { Db } from '../db'
import { formatDbTime, parseDbTime } from '../dates'
import { ErrNoRows, wrap } from '../errors'
import { execRowsAffected } from './exec'
import { intCol, nullableTextCol, type Row, textCol } from './scan'

export interface ReserveEntry {
  id: string
  accountId: string
  /** Cents: positive for a contribution, negative for a withdrawal. */
  amount: number
  kind: 'contribution' | 'withdrawal'
  payScheduleId: string | null
  /** YYYY-MM-DD of the payday a contribution was made for. */
  payday: string | null
  note: string | null
  postedAt: Date
  /** When the user moved the money to a real place; null while it is still to be moved. */
  movedAt: Date | null
}

export interface ReserveRepo {
  insert(entry: ReserveEntry): Promise<void>
  /** The reserve balance in cents. */
  balance(accountId: string): Promise<number>
  /** Newest first. */
  list(accountId: string, limit: number): Promise<ReserveEntry[]>
  /** Contributions not yet moved, oldest first. */
  listPendingTransfers(accountId: string): Promise<ReserveEntry[]>
  /** Rejects with an error wrapping ErrNoRows when the id is not a contribution. */
  markMoved(id: string, movedAt: Date): Promise<void>
  /** Whether a contribution for this payday already exists. */
  hasContribution(payScheduleId: string, payday: string): Promise<boolean>
}

const SELECT_ENTRY = `SELECT id, account_id, amount, kind, pay_schedule_id, payday, note, posted_at, moved_at FROM ReserveEntry`

function scanEntry(row: Row): ReserveEntry {
  const movedAt = nullableTextCol(row, 'moved_at')
  return {
    id: textCol(row, 'id'),
    accountId: textCol(row, 'account_id'),
    amount: intCol(row, 'amount'),
    kind: textCol(row, 'kind') === 'withdrawal' ? 'withdrawal' : 'contribution',
    payScheduleId: nullableTextCol(row, 'pay_schedule_id'),
    payday: nullableTextCol(row, 'payday'),
    note: nullableTextCol(row, 'note'),
    postedAt: parseDbTime(textCol(row, 'posted_at')),
    movedAt: movedAt === null ? null : parseDbTime(movedAt),
  }
}

export class SqliteReserveRepo implements ReserveRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insert(entry: ReserveEntry): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO ReserveEntry (id, account_id, amount, kind, pay_schedule_id, payday, note, posted_at, moved_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.accountId,
          entry.amount,
          entry.kind,
          entry.payScheduleId,
          entry.payday,
          entry.note,
          formatDbTime(entry.postedAt),
          entry.movedAt === null ? null : formatDbTime(entry.movedAt),
        ],
      )
    } catch (err) {
      throw wrap('reserve.Insert', err)
    }
  }

  async balance(accountId: string): Promise<number> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM ReserveEntry WHERE account_id = ?`, [accountId])
    } catch (err) {
      throw wrap('reserve.Balance', err)
    }
    const row = rows[0]
    return row === undefined ? 0 : intCol(row, 'total')
  }

  async list(accountId: string, limit: number): Promise<ReserveEntry[]> {
    try {
      const rows = await this.db.query(`${SELECT_ENTRY} WHERE account_id = ? ORDER BY posted_at DESC, rowid DESC LIMIT ?`, [
        accountId,
        limit,
      ])
      return rows.map(scanEntry)
    } catch (err) {
      throw wrap('reserve.List', err)
    }
  }

  async listPendingTransfers(accountId: string): Promise<ReserveEntry[]> {
    try {
      const rows = await this.db.query(
        `${SELECT_ENTRY} WHERE account_id = ? AND kind = 'contribution' AND moved_at IS NULL ORDER BY posted_at, rowid`,
        [accountId],
      )
      return rows.map(scanEntry)
    } catch (err) {
      throw wrap('reserve.ListPendingTransfers', err)
    }
  }

  async markMoved(id: string, movedAt: Date): Promise<void> {
    let changed: number
    try {
      changed = await execRowsAffected(
        this.db,
        `UPDATE ReserveEntry SET moved_at = ? WHERE id = ? AND kind = 'contribution'`,
        [formatDbTime(movedAt), id],
      )
    } catch (err) {
      throw wrap('reserve.MarkMoved', err)
    }
    if (changed === 0) throw wrap('reserve.MarkMoved', ErrNoRows)
  }

  async hasContribution(payScheduleId: string, payday: string): Promise<boolean> {
    try {
      const rows = await this.db.query(
        `SELECT 1 AS found FROM ReserveEntry WHERE kind = 'contribution' AND pay_schedule_id = ? AND payday = ?`,
        [payScheduleId, payday],
      )
      return rows.length > 0
    } catch (err) {
      throw wrap('reserve.HasContribution', err)
    }
  }
}
