// Port of internal/repo/sqlite/ledger.go.
//
// Times: posted_at is written as formatDbTime (RFC3339, UTC, whole seconds) and read with
// parseDbTime, which also accepts the "YYYY-MM-DD HH:MM:SS" rows older code wrote.
// Ids: see repo/accounts.ts. Two real rows have a 32-hex-digit id; parseUuid canonicalizes them.

import type { Db, SqlParam } from '../db'
import { wrap } from '../errors'
import { formatDbTime, parseDbTime } from '../dates'
import { parseUuid } from '../uuid'
import { type Row, intCol, nullableTextCol, textCol } from './scan'

/** Mirrors the ledger schema row. */
export interface LedgerEntry {
  id: string
  accountId: string
  transactionId: string | null
  payScheduleId: string | null
  entryType: string
  /** Cents. */
  amount: number
  description: string
  postedAt: Date
  /** The due date (or payday) this entry settled; null for a manual entry. */
  occurrenceDate: Date | null
  /** Set on a reversal: the entry it reverses. */
  reversesEntryId: string | null
  /** Set on the original: the reversal that undid it. */
  reversedById: string | null
}

/** A ledger entry before insert. The repo assigns the id when it is omitted (Go: uuid.Nil). */
export type NewLedgerEntry = Omit<
  LedgerEntry,
  'id' | 'occurrenceDate' | 'reversesEntryId' | 'reversedById'
> & {
  id?: string
  occurrenceDate?: Date | null
  reversesEntryId?: string | null
  reversedById?: string | null
}

export interface LedgerRepo {
  insert(e: NewLedgerEntry): Promise<void>
  listByAccount(accountId: string): Promise<LedgerEntry[]>
  deleteById(id: string): Promise<void>
  findByTransactionId(txnId: string): Promise<LedgerEntry | null>
  /** The latest entry of a transaction that is neither a reversal nor already reversed. */
  findLatestByTransactionId(txnId: string): Promise<LedgerEntry | null>
  /** The latest income entry of a pay schedule that is neither a reversal nor already reversed. */
  findLatestByPayScheduleId(payScheduleId: string): Promise<LedgerEntry | null>
  findById(id: string): Promise<LedgerEntry | null>
  sumByAccount(accountId: string): Promise<number>
  updateAmount(id: string, amount: number): Promise<void>
  /** Marks the original entry as undone by `reversalId`. */
  markReversed(originalId: string, reversalId: string): Promise<void>
  /** Sets transaction_id to null on every entry of a transaction. The rows and their amounts stay. */
  detachFromTransaction(txnId: string): Promise<void>
}

const SELECT_ENTRY = `SELECT id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at,
  occurrence_date, reverses_entry_id, reversed_by_id`

function nullableUuid(row: Row, name: string): string | null {
  const v = nullableTextCol(row, name)
  return v === null ? null : parseUuid(v)
}

function nullableDate(row: Row, name: string): Date | null {
  const v = nullableTextCol(row, name)
  if (v === null) return null
  try {
    return parseDbTime(v)
  } catch {
    return null
  }
}

function scanLedger(row: Row): LedgerEntry {
  return {
    id: parseUuid(textCol(row, 'id')),
    accountId: parseUuid(textCol(row, 'account_id')),
    transactionId: nullableUuid(row, 'transaction_id'),
    payScheduleId: nullableUuid(row, 'pay_schedule_id'),
    entryType: textCol(row, 'entry_type'),
    amount: intCol(row, 'amount'),
    description: textCol(row, 'description'),
    postedAt: parseDbTime(textCol(row, 'posted_at')),
    occurrenceDate: nullableDate(row, 'occurrence_date'),
    reversesEntryId: nullableUuid(row, 'reverses_entry_id'),
    reversedById: nullableUuid(row, 'reversed_by_id'),
  }
}

export class SqliteLedgerRepo implements LedgerRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insert(e: NewLedgerEntry): Promise<void> {
    const id = e.id ?? crypto.randomUUID()
    const args: SqlParam[] = [
      id,
      e.accountId,
      e.transactionId,
      e.payScheduleId,
      e.entryType,
      e.amount,
      e.description,
      formatDbTime(e.postedAt),
      e.occurrenceDate === undefined || e.occurrenceDate === null ? null : formatDbTime(e.occurrenceDate),
      e.reversesEntryId ?? null,
      e.reversedById ?? null,
    ]
    try {
      await this.db.query(
        `INSERT INTO ledger (id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at,
          occurrence_date, reverses_entry_id, reversed_by_id)
	      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args,
      )
    } catch (err) {
      throw wrap('ledger.Insert', err)
    }
  }

  async listByAccount(accountId: string): Promise<LedgerEntry[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(`${SELECT_ENTRY}
		FROM ledger WHERE account_id = ? ORDER BY posted_at DESC`, [accountId])
    } catch (err) {
      throw wrap('ledger.ListByAccount', err)
    }
    try {
      return rows.map(scanLedger)
    } catch (err) {
      throw wrap('ledger.ListByAccount: scan', err)
    }
  }

  async deleteById(id: string): Promise<void> {
    try {
      await this.db.query(`DELETE FROM ledger WHERE id = ?`, [id])
    } catch (err) {
      throw wrap('ledger.DeleteByID', err)
    }
  }

  async findByTransactionId(txnId: string): Promise<LedgerEntry | null> {
    return this.findOne(`${SELECT_ENTRY}
		FROM ledger WHERE transaction_id = ? LIMIT 1`, txnId, 'ledger.FindByTransactionID')
  }

  async findLatestByTransactionId(txnId: string): Promise<LedgerEntry | null> {
    return this.findOne(`${SELECT_ENTRY}
		FROM ledger
		WHERE transaction_id = ? AND reverses_entry_id IS NULL AND reversed_by_id IS NULL
		ORDER BY posted_at DESC, rowid DESC LIMIT 1`, txnId, 'ledger.FindLatestByTransactionID')
  }

  async findLatestByPayScheduleId(payScheduleId: string): Promise<LedgerEntry | null> {
    return this.findOne(`${SELECT_ENTRY}
		FROM ledger
		WHERE pay_schedule_id = ? AND reverses_entry_id IS NULL AND reversed_by_id IS NULL
		ORDER BY posted_at DESC, rowid DESC LIMIT 1`, payScheduleId, 'ledger.FindLatestByPayScheduleID')
  }

  async findById(id: string): Promise<LedgerEntry | null> {
    return this.findOne(`${SELECT_ENTRY}
		FROM ledger WHERE id = ?`, id, 'ledger.FindByID')
  }

  async sumByAccount(accountId: string): Promise<number> {
    try {
      const rows = await this.db.query(`SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE account_id = ?`, [accountId])
      const row = rows[0]
      if (row === undefined) return 0
      return intCol(row, 'COALESCE(SUM(amount), 0)')
    } catch (err) {
      throw wrap('ledger.SumByAccount', err)
    }
  }

  async updateAmount(id: string, amount: number): Promise<void> {
    try {
      await this.db.query(`UPDATE ledger SET amount = ? WHERE id = ?`, [amount, id])
    } catch (err) {
      throw wrap('ledger.UpdateAmount', err)
    }
  }

  async markReversed(originalId: string, reversalId: string): Promise<void> {
    try {
      await this.db.query(`UPDATE ledger SET reversed_by_id = ? WHERE id = ?`, [reversalId, originalId])
    } catch (err) {
      throw wrap('ledger.MarkReversed', err)
    }
  }

  async detachFromTransaction(txnId: string): Promise<void> {
    try {
      await this.db.query(`UPDATE ledger SET transaction_id = NULL WHERE transaction_id = ?`, [txnId])
    } catch (err) {
      throw wrap('ledger.DetachFromTransaction', err)
    }
  }

  /** QueryRow semantics for the lookups: no row is null (Go: sql.ErrNoRows gives nil, nil). */
  private async findOne(sql: string, param: string, op: string): Promise<LedgerEntry | null> {
    let rows: Row[]
    try {
      rows = await this.db.query(sql, [param])
    } catch (err) {
      throw wrap(op, err)
    }
    const row = rows[0]
    if (row === undefined) return null
    try {
      return scanLedger(row)
    } catch (err) {
      throw wrap(op, err)
    }
  }
}
