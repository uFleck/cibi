// Port of internal/repo/sqlite/peer_debt.go.
//
// A peer debt is a row of the "Transaction" table with type = 'peer' (see the merge migration).
// Ids: see repo/accounts.ts. Money is integer cents; positive = the friend owes the user.
//
// Times: a peer debt's date (Date, the timestamp column) and anchor date are kept as the raw
// stored text, as Go keeps them (Go's PeerDebt.Date is a string). Insert writes the date string
// as given. The reads that need a calendar date (SumUpcomingPeerObligations, the debt breakdown)
// parse it with parseRfc3339OrYmd. Real rows hold "2026-06-10" (date only) and
// "2026-10-10T00:00:00Z" (anchor_date).
//
// Column aliases: SQL expressions get an explicit alias (AS ...) so the row key is a plain name.
// The SQL is otherwise Go's.

import type { Db, SqlParam } from '../db'
import { AppError, ErrNoRows, wrap } from '../errors'
import { parseRfc3339OrYmd } from '../dates'
import { goFloatText } from '../num'
import { nextInstallmentDue } from '../engine/installment'
import { parseUuid } from '../uuid'
import { execRowsAffected } from './exec'
import { boolCol, intCol, nullableIntCol, nullableTextCol, type Row, textCol } from './scan'

/** Mirrors a peer debt (a Transaction row with type 'peer'). */
export interface PeerDebt {
  id: string
  accountId: string
  friendId: string
  /** Cents; positive = friend owes user, negative = user owes friend. */
  amount: number
  description: string
  /** Stored text, RFC3339 or YYYY-MM-DD, written as given. */
  date: string
  isInstallment: boolean
  totalInstallments: number | null
  paidInstallments: number
  /** e.g. "monthly"; null when not set. */
  frequency: string | null
  /** Stored text, RFC3339 or YYYY-MM-DD; null when not set. */
  anchorDate: string | null
  isConfirmed: boolean
}

/** Mirrors the Go PeerDebtBalance (cents). */
export interface PeerDebtBalance {
  /** Sum of the positive amounts still open. */
  friendOwesUser: number
  /** abs(sum of the negative amounts still open). */
  userOwesFriend: number
  /** friendOwesUser - userOwesFriend. */
  net: number
}

/** Mirrors the Go GlobalPeerBalance (cents). */
export interface GlobalPeerBalance {
  totalOwedToUser: number
  totalUserOwes: number
  net: number
}

/** One active debt the user owes a friend, flattened for the breakdown. */
export interface ActiveUserDebt {
  friendName: string
  /** Negative cents. */
  amount: number
  isInstallment: boolean
  /** 0 when not an installment debt. */
  totalInstallments: number
  paidInstallments: number
  /** "" when not set. */
  frequency: string
  /** Stored text (the timestamp column). */
  date: string
  /** Stored text; null when not set. */
  anchorDate: string | null
}

export interface PeerDebtRepo {
  insert(d: PeerDebt): Promise<void>
  /** accountId null = every account. Go nil slice for no rows is an empty array here. */
  getByFriend(friendId: string, accountId: string | null): Promise<PeerDebt[]>
  getAll(accountId: string | null): Promise<PeerDebt[]>
  /** Rejects with an error wrapping ErrNoRows when the id is unknown. */
  getById(id: string): Promise<PeerDebt>
  /** Each given field is written; undefined = no change. Rejects when no field is given or the row is missing. */
  update(id: string, amount?: number, description?: string, isConfirmed?: boolean, paidInstallments?: number): Promise<void>
  deleteById(id: string): Promise<void>
  getBalanceByFriend(friendId: string, accountId: string | null): Promise<PeerDebtBalance>
  getGlobalBalance(accountId: string | null): Promise<GlobalPeerBalance>
  sumUpcomingPeerObligations(accountId: string | null, after: Date, onOrBefore: Date): Promise<number>
  /** The total of the user's next payment for each active debt (one installment, or the full lump sum). */
  sumNextUserPayment(accountId: string | null): Promise<number>
  /** Active debts the user owes friends, with the friend name, ordered by name then timestamp. */
  getActiveUserDebtsWithFriend(accountId: string | null): Promise<ActiveUserDebt[]>
  /** Installment: paid + 1, capped at total. Lump sum: confirmed_at = timestamp. Rejects when the id is unknown. */
  confirmInstallment(id: string): Promise<void>
  /** Toggles a lump sum's confirmation, or steps an installment up or back. Rejects when the id is unknown. */
  toggleInstallmentConfirmation(id: string): Promise<void>
}

function bit(v: boolean): number {
  return v ? 1 : 0
}

/** Column list of every peer debt query; the last column is the confirmed flag. */
const PEER_SELECT = `SELECT id, account_id, friend_id, amount, description, timestamp, is_installment,
	 total_installments, paid_installments, frequency, anchor_date,
	 CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END AS is_confirmed`

function scanPeerDebt(row: Row): PeerDebt {
  return {
    id: parseUuid(textCol(row, 'id')),
    accountId: parseUuid(textCol(row, 'account_id')),
    friendId: parseUuid(textCol(row, 'friend_id')),
    amount: intCol(row, 'amount'),
    description: textCol(row, 'description'),
    date: textCol(row, 'timestamp'),
    isInstallment: boolCol(row, 'is_installment'),
    totalInstallments: nullableIntCol(row, 'total_installments'),
    paidInstallments: intCol(row, 'paid_installments'),
    frequency: nullableTextCol(row, 'frequency'),
    anchorDate: nullableTextCol(row, 'anchor_date'),
    isConfirmed: boolCol(row, 'is_confirmed'),
  }
}

/** The two balance columns as Go names them (the expression text): the message names the column. */
const GO_COL_OWED_TO_USER = 'COALESCE(SUM(CASE WHEN adj > 0 THEN adj ELSE 0 END), 0)'
const GO_COL_USER_OWES = 'COALESCE(ABS(SUM(CASE WHEN adj < 0 THEN adj ELSE 0 END)), 0)'

/**
 * Go quirk: the balance queries sum a float remainder
 * (CAST(amount AS REAL) / total_installments * (total_installments - paid_installments)) and Go
 * scans that SUM into an int64. A SUM that is not a whole number fails to scan:
 * database/sql formats the float with strconv 'g' and ParseInt rejects "566.666". A whole float of
 * 1e6 or more fails too, because 'g' prints it with an exponent ("2e+06"). A SUM of 0 is an integer
 * in SQLite (every nonzero SUM here is REAL), so 0 scans fine. The message is Go's, byte for byte
 * except for the driver value text, which is the same shortest float text (checked against the Go
 * server: GET /api/friends/summary returns it in the 500 body). getGlobalBalance rounds its two sums
 * to the nearest cent in SQL, so a fractional remainder no longer fails there (bug 3.2). The
 * per-friend balance still reproduces Go's failure.
 */
// Go quirk: float remainder fails to scan into int64
function scanBalanceSum(row: Row, column: string, goName: string, index: number, op: string): number {
  const v = row[column]
  if (typeof v !== 'number') {
    throw new AppError(`${op}: converting NULL to int64 is unsupported (column ${goName})`)
  }
  if (Number.isInteger(v) && Math.abs(v) < 1e6) return v
  throw new AppError(
    `${op}: sql: Scan error on column index ${index}, name "${goName}": converting driver.Value type float64 ("${goFloatText(v)}") to a int64: invalid syntax`,
  )
}

export class SqlitePeerDebtRepo implements PeerDebtRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insert(d: PeerDebt): Promise<void> {
    const args: SqlParam[] = [
      d.id,
      d.accountId,
      d.friendId,
      d.amount,
      d.description,
      d.date,
      bit(d.frequency !== null),
      d.frequency,
      d.anchorDate,
      bit(d.isInstallment),
      d.totalInstallments,
      d.paidInstallments,
      // Go: confirmed_at is the date string itself when the debt is confirmed, else NULL.
      d.isConfirmed ? d.date : null,
    ]
    try {
      await this.db.query(
        `INSERT INTO "Transaction" (id, account_id, type, friend_id, amount, description, timestamp,
		 is_recurring, frequency, anchor_date, is_installment,
		 total_installments, paid_installments, requires_confirmation, confirmed_at)
		 VALUES (?, ?, 'peer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        args,
      )
    } catch (err) {
      throw wrap('peer_debt.Insert', err)
    }
  }

  async getByFriend(friendId: string, accountId: string | null): Promise<PeerDebt[]> {
    let query = `${PEER_SELECT} FROM "Transaction" WHERE type = 'peer' AND friend_id = ?`
    const args: SqlParam[] = [friendId]
    if (accountId !== null) {
      query += ` AND account_id = ?`
      args.push(accountId)
    }
    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap('peer_debt.GetByFriend: query', err)
    }
    return this.scanRows(rows, 'peer_debt.GetByFriend')
  }

  async getAll(accountId: string | null): Promise<PeerDebt[]> {
    let query = `${PEER_SELECT} FROM "Transaction" WHERE type = 'peer'`
    const args: SqlParam[] = []
    if (accountId !== null) {
      query += ` AND account_id = ?`
      args.push(accountId)
    }
    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap('peer_debt.GetAll: query', err)
    }
    return this.scanRows(rows, 'peer_debt.GetAll')
  }

  private scanRows(rows: Row[], op: string): PeerDebt[] {
    try {
      return rows.map(scanPeerDebt)
    } catch (err) {
      throw wrap(`${op}: scan`, err)
    }
  }

  async getById(id: string): Promise<PeerDebt> {
    let rows: Row[]
    try {
      rows = await this.db.query(`${PEER_SELECT} FROM "Transaction" WHERE type = 'peer' AND id = ?`, [id])
    } catch (err) {
      throw wrap('peer_debt.GetByID', err)
    }
    const row = rows[0]
    // QueryRow semantics: no row is sql.ErrNoRows.
    if (row === undefined) throw wrap('peer_debt.GetByID', ErrNoRows)
    try {
      return scanPeerDebt(row)
    } catch (err) {
      throw wrap('peer_debt.GetByID', err)
    }
  }

  /**
   * Go Update: the amount, description and paid_installments fields are one UPDATE, the confirmation
   * is a second UPDATE. A missing row sets the error but the other statement still runs; the error
   * (bare sql.ErrNoRows, as Go returns it) is reported at the end.
   */
  async update(
    id: string,
    amount?: number,
    description?: string,
    isConfirmed?: boolean,
    paidInstallments?: number,
  ): Promise<void> {
    const setClauses: string[] = []
    const args: SqlParam[] = []
    if (amount !== undefined) {
      setClauses.push('amount = ?')
      args.push(amount)
    }
    if (description !== undefined) {
      setClauses.push('description = ?')
      args.push(description)
    }
    if (paidInstallments !== undefined) {
      setClauses.push('paid_installments = ?')
      args.push(paidInstallments)
    }

    if (setClauses.length === 0 && isConfirmed === undefined) {
      throw new AppError('peer_debt.Update: no fields provided')
    }

    let missing = false
    if (setClauses.length > 0) {
      const query = `UPDATE "Transaction" SET ${setClauses.join(', ')} WHERE id = ? AND type = 'peer'`
      let changed: number
      try {
        changed = await execRowsAffected(this.db, query, [...args, id])
      } catch (err) {
        throw wrap('peer_debt.Update', err)
      }
      if (changed === 0) missing = true
    }

    if (isConfirmed !== undefined) {
      const query = isConfirmed
        ? `UPDATE "Transaction" SET confirmed_at = timestamp WHERE id = ? AND type = 'peer'`
        : `UPDATE "Transaction" SET confirmed_at = NULL WHERE id = ? AND type = 'peer'`
      let changed: number
      try {
        changed = await execRowsAffected(this.db, query, [id])
      } catch (err) {
        throw wrap('peer_debt.Update is_confirmed', err)
      }
      if (changed === 0) missing = true
    }

    if (missing) throw ErrNoRows
  }

  async deleteById(id: string): Promise<void> {
    try {
      await this.db.query(`DELETE FROM "Transaction" WHERE id = ? AND type = 'peer'`, [id])
    } catch (err) {
      throw wrap('peer_debt.DeleteByID', err)
    }
  }

  async getBalanceByFriend(friendId: string, accountId: string | null): Promise<PeerDebtBalance> {
    const op = 'peer_debt.GetBalanceByFriend'
    let query = `
		SELECT
		    COALESCE(SUM(CASE WHEN adj > 0 THEN adj ELSE 0 END), 0) AS friend_owes_user,
		    COALESCE(ABS(SUM(CASE WHEN adj < 0 THEN adj ELSE 0 END)), 0) AS user_owes_friend
		FROM (
		    SELECT
		        CASE
		            WHEN is_installment = 1 AND COALESCE(total_installments, 0) > 0
		            THEN CAST(amount AS REAL) / total_installments * (total_installments - COALESCE(paid_installments, 0))
		            ELSE CAST(amount AS REAL)
		        END AS adj
		    FROM "Transaction"
		    WHERE type = 'peer' AND friend_id = ?
		      AND (
		        (is_installment = 1 AND paid_installments < total_installments)
		        OR
		        (is_installment = 0 AND confirmed_at IS NULL)
		      )`
    const args: SqlParam[] = [friendId]
    if (accountId !== null) {
      query += ` AND account_id = ?`
      args.push(accountId)
    }
    query += `)`

    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap(op, err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap(op, ErrNoRows)
    const friendOwesUser = scanBalanceSum(row, 'friend_owes_user', GO_COL_OWED_TO_USER, 0, op)
    const userOwesFriend = scanBalanceSum(row, 'user_owes_friend', GO_COL_USER_OWES, 1, op)
    return { friendOwesUser, userOwesFriend, net: friendOwesUser - userOwesFriend }
  }

  async getGlobalBalance(accountId: string | null): Promise<GlobalPeerBalance> {
    const op = 'peer_debt.GetGlobalBalance'
    let query = `
		SELECT
		    ROUND(COALESCE(SUM(CASE WHEN adj > 0 THEN adj ELSE 0 END), 0)) AS total_owed_to_user,
		    ROUND(COALESCE(ABS(SUM(CASE WHEN adj < 0 THEN adj ELSE 0 END)), 0)) AS total_user_owes
		FROM (
		    SELECT
		        CASE
		            WHEN is_installment = 1 AND COALESCE(total_installments, 0) > 0
		            THEN CAST(amount AS REAL) / total_installments * (total_installments - COALESCE(paid_installments, 0))
		            ELSE CAST(amount AS REAL)
		        END AS adj
		    FROM "Transaction"
		    WHERE type = 'peer'
		      AND (
		        (is_installment = 1 AND paid_installments < total_installments)
		        OR
		        (is_installment = 0 AND confirmed_at IS NULL)
		      )`
    const args: SqlParam[] = []
    if (accountId !== null) {
      query += ` AND account_id = ?`
      args.push(accountId)
    }
    query += `)`

    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap(op, err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap(op, ErrNoRows)
    const totalOwedToUser = scanBalanceSum(row, 'total_owed_to_user', GO_COL_OWED_TO_USER, 0, op)
    const totalUserOwes = scanBalanceSum(row, 'total_user_owes', GO_COL_USER_OWES, 1, op)
    return { totalOwedToUser, totalUserOwes, net: totalOwedToUser - totalUserOwes }
  }

  async confirmInstallment(id: string): Promise<void> {
    let changed: number
    try {
      changed = await execRowsAffected(
        this.db,
        `
		UPDATE "Transaction" SET
		    paid_installments = CASE WHEN is_installment = 1
		        THEN MIN(paid_installments + 1, COALESCE(total_installments, paid_installments + 1))
		        ELSE paid_installments END,
		    confirmed_at = CASE WHEN is_installment = 0 THEN timestamp ELSE confirmed_at END
		WHERE id = ? AND type = 'peer'`,
        [id],
      )
    } catch (err) {
      throw wrap('peer_debt.ConfirmInstallment', err)
    }
    if (changed === 0) throw wrap('peer_debt.ConfirmInstallment', ErrNoRows)
  }

  async toggleInstallmentConfirmation(id: string): Promise<void> {
    let changed: number
    try {
      changed = await execRowsAffected(
        this.db,
        `
		UPDATE "Transaction"
		SET
			paid_installments = CASE
				WHEN is_installment = 1 THEN
					CASE
						WHEN paid_installments >= COALESCE(total_installments, paid_installments)
							THEN MAX(paid_installments - 1, 0)
						ELSE MIN(paid_installments + 1, COALESCE(total_installments, paid_installments + 1))
					END
				ELSE paid_installments
			END,
			confirmed_at = CASE
				WHEN is_installment = 0 THEN
					CASE WHEN confirmed_at IS NOT NULL THEN NULL ELSE timestamp END
				ELSE confirmed_at
			END
		WHERE id = ? AND type = 'peer'`,
        [id],
      )
    } catch (err) {
      throw wrap('peer_debt.ToggleInstallmentConfirmation', err)
    }
    if (changed === 0) throw wrap('peer_debt.ToggleInstallmentConfirmation', ErrNoRows)
  }

  async sumNextUserPayment(accountId: string | null): Promise<number> {
    const op = 'peer_debt.SumNextUserPayment'
    let query = `
		SELECT COALESCE(ABS(SUM(
			CASE
				WHEN is_installment = 1 AND total_installments > 0
					THEN amount / total_installments
				ELSE amount
			END
		)), 0) AS total
		FROM "Transaction"
		WHERE type = 'peer'
		AND amount < 0
		  AND (
		    (is_installment = 1 AND paid_installments < total_installments)
		    OR
		    (is_installment = 0 AND confirmed_at IS NULL)
		  )`
    const args: SqlParam[] = []
    if (accountId !== null) {
      query += ` AND account_id = ?`
      args.push(accountId)
    }

    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap(op, err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap(op, ErrNoRows)
    try {
      return intCol(row, 'total')
    } catch (err) {
      throw wrap(op, err)
    }
  }

  async getActiveUserDebtsWithFriend(accountId: string | null): Promise<ActiveUserDebt[]> {
    const op = 'peer_debt.GetActiveUserDebtsWithFriend'
    let query = `
		SELECT f.name, t.amount, t.is_installment,
		       COALESCE(t.total_installments, 0) AS total_installments,
		       t.paid_installments,
		       COALESCE(t.frequency, '') AS frequency,
		       t.timestamp,
		       t.anchor_date
		FROM "Transaction" t
		JOIN Friend f ON f.id = t.friend_id
		WHERE t.type = 'peer'
		  AND t.amount < 0
		  AND (
		    (t.is_installment = 1 AND t.paid_installments < t.total_installments)
		    OR
		    (t.is_installment = 0 AND t.confirmed_at IS NULL)
		  )`
    const args: SqlParam[] = []
    if (accountId !== null) {
      query += ` AND t.account_id = ?`
      args.push(accountId)
    }
    query += ` ORDER BY f.name, t.timestamp`

    let rows: Row[]
    try {
      rows = await this.db.query(query, args)
    } catch (err) {
      throw wrap(`${op}: query`, err)
    }
    try {
      return rows.map((row) => ({
        friendName: textCol(row, 'name'),
        amount: intCol(row, 'amount'),
        isInstallment: boolCol(row, 'is_installment'),
        totalInstallments: intCol(row, 'total_installments'),
        paidInstallments: intCol(row, 'paid_installments'),
        frequency: textCol(row, 'frequency'),
        date: textCol(row, 'timestamp'),
        anchorDate: nullableTextCol(row, 'anchor_date'),
      }))
    } catch (err) {
      throw wrap(`${op}: scan`, err)
    }
  }

  /**
   * Go SumUpcomingPeerObligations: the lump-sum debts and the next installment of each installment
   * debt that fall strictly after `after` and strictly before `onOrBefore`. Dates that do not parse
   * are skipped (Go `continue`). The result is negative or zero.
   */
  async sumUpcomingPeerObligations(accountId: string | null, after: Date, onOrBefore: Date): Promise<number> {
    const op = 'peer_debt.SumUpcomingPeerObligations'
    let lumpQuery = `SELECT amount, timestamp FROM "Transaction"
		 WHERE type = 'peer' AND amount < 0 AND is_installment = 0 AND confirmed_at IS NULL`
    const lumpArgs: SqlParam[] = []
    if (accountId !== null) {
      lumpQuery += ` AND account_id = ?`
      lumpArgs.push(accountId)
    }

    let lumpRows: Row[]
    try {
      lumpRows = await this.db.query(lumpQuery, lumpArgs)
    } catch (err) {
      throw wrap(`${op}: lump query`, err)
    }
    let lumpSum = 0
    try {
      for (const row of lumpRows) {
        const amount = intCol(row, 'amount')
        const dateStr = textCol(row, 'timestamp')
        let due: Date
        try {
          due = parseRfc3339OrYmd(dateStr)
        } catch {
          continue
        }
        if (due.getTime() > after.getTime() && due.getTime() < onOrBefore.getTime()) {
          lumpSum += amount
        }
      }
    } catch (err) {
      throw wrap(`${op}: lump scan`, err)
    }

    let instQuery = `SELECT id, amount, total_installments, paid_installments, frequency, timestamp
		 FROM "Transaction"
		 WHERE type = 'peer'
		   AND amount < 0
		   AND is_installment = 1
		   AND total_installments IS NOT NULL
		   AND total_installments > 0
		   AND paid_installments < total_installments`
    const instArgs: SqlParam[] = []
    if (accountId !== null) {
      instQuery += ` AND account_id = ?`
      instArgs.push(accountId)
    }

    let rows: Row[]
    try {
      rows = await this.db.query(instQuery, instArgs)
    } catch (err) {
      throw wrap(`${op}: query`, err)
    }
    let totalInstallmentSum = 0
    try {
      for (const row of rows) {
        const amount = intCol(row, 'amount')
        const totalInst = intCol(row, 'total_installments')
        const paidInst = intCol(row, 'paid_installments')
        const freq = textCol(row, 'frequency')
        const dateStr = textCol(row, 'timestamp')
        // Go integer division truncates toward zero, as Math.trunc does.
        const instPayment = Math.trunc(amount / totalInst)

        let firstDue: Date
        try {
          firstDue = parseRfc3339OrYmd(dateStr)
        } catch {
          continue
        }

        const nextDue = nextInstallmentDue(firstDue, paidInst, freq)
        if (nextDue.getTime() > after.getTime() && nextDue.getTime() < onOrBefore.getTime()) {
          totalInstallmentSum += instPayment
        }
      }
    } catch (err) {
      throw wrap(`${op}: scan`, err)
    }

    return lumpSum + totalInstallmentSum
  }
}
