// Port of internal/repo/sqlite/pay_schedule.go.
//
// Times: anchor_date is written as formatDbTime (RFC3339, UTC, whole seconds, as Go's
// t.UTC().Format(time.RFC3339)) and read with parseDbTime. Go only accepts RFC3339 on read;
// parseDbTime also accepts the other forms, which the real rows do not have.
// Ids: see repo/accounts.ts.
// Go's UpdateAnchorDate(id, date, tx) keeps one TS method: the transaction comes from db.tx().

import type { Db, SqlParam } from '../db'
import { ErrNoRows, wrap } from '../errors'
import { formatDbTime, parseDbTime } from '../dates'
import { parseUuid } from '../uuid'
import { execRowsAffected } from './exec'
import { intCol, nullableIntCol, nullableTextCol, type Row, textCol } from './scan'

/** Mirrors the PaySchedule schema row. */
export interface PaySchedule {
  id: string
  accountId: string
  frequency: string
  /** UTC. */
  anchorDate: Date
  /** Go *int: null when absent. */
  dayOfMonth2: number | null
  /** Go *string: null when absent (an empty string is a label too). */
  label: string | null
  /** Cents. */
  amount: number
}

/** The fields UpdateByID writes (Go passes a PaySchedule whose id and account_id are unused). */
export type PayScheduleFields = Omit<PaySchedule, 'id' | 'accountId'>

export interface PayScheduleRepo {
  insert(ps: PaySchedule): Promise<void>
  listByAccountId(accountId: string): Promise<PaySchedule[]>
  /** Rejects with ErrNoRows (unwrapped, as Go returns sql.ErrNoRows) when the id is unknown. */
  getById(id: string): Promise<PaySchedule>
  updateById(id: string, ps: PayScheduleFields): Promise<void>
  updateAnchorDate(id: string, anchorDate: Date): Promise<void>
  deleteById(id: string): Promise<void>
}

const SELECT_SCHEDULE = `SELECT id, account_id, frequency, anchor_date, day_of_month2, label, amount`

function scanPaySchedule(row: Row): PaySchedule {
  return {
    id: parseUuid(textCol(row, 'id')),
    accountId: parseUuid(textCol(row, 'account_id')),
    frequency: textCol(row, 'frequency'),
    anchorDate: parseDbTime(textCol(row, 'anchor_date')),
    dayOfMonth2: nullableIntCol(row, 'day_of_month2'),
    label: nullableTextCol(row, 'label'),
    amount: intCol(row, 'amount'),
  }
}

export class SqlitePayScheduleRepo implements PayScheduleRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insert(ps: PaySchedule): Promise<void> {
    const params: SqlParam[] = [
      ps.id,
      ps.accountId,
      ps.frequency,
      formatDbTime(ps.anchorDate),
      ps.dayOfMonth2,
      ps.label,
      ps.amount,
    ]
    await this.db
      .query(
        `INSERT INTO PaySchedule (id, account_id, frequency, anchor_date, day_of_month2, label, amount)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params,
      )
      .catch((err: unknown) => {
        throw wrap('pay_schedule.Insert', err)
      })
  }

  async listByAccountId(accountId: string): Promise<PaySchedule[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `${SELECT_SCHEDULE}
		 FROM PaySchedule WHERE account_id = ?
		 ORDER BY anchor_date ASC`,
        [accountId],
      )
    } catch (err) {
      throw wrap('pay_schedule.ListByAccountID', err)
    }
    try {
      return rows.map(scanPaySchedule)
    } catch (err) {
      throw wrap('pay_schedule.ListByAccountID: scan', err)
    }
  }

  async getById(id: string): Promise<PaySchedule> {
    let rows: Row[]
    try {
      rows = await this.db.query(`${SELECT_SCHEDULE} FROM PaySchedule WHERE id = ?`, [id])
    } catch (err) {
      throw wrap('pay_schedule.GetByID: query', err)
    }
    const row = rows[0]
    if (row === undefined) throw ErrNoRows
    try {
      return scanPaySchedule(row)
    } catch (err) {
      throw wrap('pay_schedule.GetByID: scan', err)
    }
  }

  async updateById(id: string, ps: PayScheduleFields): Promise<void> {
    let changed: number
    try {
      changed = await execRowsAffected(
        this.db,
        `UPDATE PaySchedule
		 SET frequency = ?, anchor_date = ?, day_of_month2 = ?, label = ?, amount = ?
		 WHERE id = ?`,
        [ps.frequency, formatDbTime(ps.anchorDate), ps.dayOfMonth2, ps.label, ps.amount, id],
      )
    } catch (err) {
      throw wrap('pay_schedule.UpdateByID', err)
    }
    if (changed === 0) throw wrap('pay_schedule.UpdateByID', ErrNoRows)
  }

  async updateAnchorDate(id: string, anchorDate: Date): Promise<void> {
    await this.db
      .query(`UPDATE PaySchedule SET anchor_date = ? WHERE id = ?`, [formatDbTime(anchorDate), id])
      .catch((err: unknown) => {
        throw wrap('pay_schedule.UpdateAnchorDate', err)
      })
  }

  async deleteById(id: string): Promise<void> {
    let changed: number
    try {
      changed = await execRowsAffected(this.db, `DELETE FROM PaySchedule WHERE id = ?`, [id])
    } catch (err) {
      throw wrap('pay_schedule.DeleteByID', err)
    }
    if (changed === 0) throw wrap('pay_schedule.DeleteByID', ErrNoRows)
  }
}
