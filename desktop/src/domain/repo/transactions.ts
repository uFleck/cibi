// Port of internal/repo/sqlite/transactions.go.
//
// Times: written as formatDbTime (RFC3339, UTC, whole seconds, as Go's t.UTC().Format(RFC3339)).
// Read with parseFlexTime, which is Go's parseFlexTime: RFC3339 first, then "YYYY-MM-DD" (UTC
// midnight). The real rows hold both forms (timestamp and confirmed_at can be date-only).
// Ids: see repo/accounts.ts. Booleans are written as 0/1.
// Types: "personal" and "peer" rows share the table. GetByAccount returns every type (as Go does);
// SumUpcomingObligations counts personal rows only. Insert always writes 'personal', as Go does.

import type { Db, SqlParam } from '../db'
import { ErrNoRows, wrap } from '../errors'
import { formatDbTime, parseRfc3339, parseYmd } from '../dates'
import { normalizeCategory } from '../categories'
import { parseUuid } from '../uuid'
import { execRowsAffected } from './exec'
import { boolCol, intCol, nullableIntCol, nullableTextCol, type Row, textCol } from './scan'

/** Go ValidFrequencies: the allowed frequency values for recurring transactions. */
export const VALID_FREQUENCIES: ReadonlySet<string> = new Set([
  'weekly',
  'bi-weekly',
  'biweekly', // legacy alias from older web clients
  'monthly',
  'yearly',
])

/** A reference stored with a transaction, such as the page where a tax is paid. */
export interface TransactionLink {
  url: string
  /** Short text to show instead of the url; null when there is none. */
  label: string | null
}

/** Mirrors the Transaction schema row, plus its links. */
export interface Transaction {
  id: string
  accountId: string
  /** 'personal' | 'peer'. A transaction built in memory has '' (Go's zero value) until stored. */
  type: string
  /** Set for type 'peer'. */
  friendId: string | null
  /** Cents; negative = debit, positive = credit. */
  amount: number
  /** The short name shown in lists. */
  title: string
  /** Optional free text with more detail about the transaction; null when there is none. */
  description: string | null
  /** In the order they were saved. A row read by listUncategorized has none loaded. */
  links: TransactionLink[]
  /** Free text; null when uncategorized. */
  category: string | null
  /** UTC. */
  timestamp: Date
  isRecurring: boolean
  frequency: string | null
  /** UTC. */
  anchorDate: Date | null
  /** UTC. */
  nextOccurrence: Date | null
  requiresConfirmation: boolean
  /** UTC. */
  confirmedAt: Date | null
  isInstallment: boolean
  totalInstallments: number | null
  paidInstallments: number
  /** 'category' or 'keyword' when the amount is estimated from history (see estimate.ts); null for a fixed amount. */
  estimateSource: string | null
  /** The category or keyword the estimate matches; null for a fixed amount. */
  estimateKey: string | null
  /** Not sure it will be paid: listed, but left out of every forecast until paid or cleared. */
  isUncertain: boolean
  /** Bought as needed: `amount` is the fallback budget per calendar month, and paying never advances it. */
  isAsNeeded: boolean
}

/** The fields Update can write. Go's nil pointer is `undefined` here (no change). */
export interface UpdateTransaction {
  title?: string
  /** Null clears the description. */
  description?: string | null
  /** Replaces every link. */
  links?: TransactionLink[]
  /** Null clears the category. */
  category?: string | null
  /** Cents. */
  amount?: number
  nextOccurrence?: Date
  timestamp?: Date
  totalInstallments?: number
  isInstallment?: boolean
  isRecurring?: boolean
  frequency?: string
  anchorDate?: Date
  /** Null makes the amount fixed again. */
  estimateSource?: string | null
  estimateKey?: string | null
  isUncertain?: boolean
  isAsNeeded?: boolean
}

export interface TransactionsRepo {
  insert(t: Transaction): Promise<void>
  getByAccount(accountId: string): Promise<Transaction[]>
  /** Expenses of type personal with no category: the rows the classifier may categorize. */
  listUncategorized(): Promise<Transaction[]>
  /** The distinct non-blank category values stored, trimmed. */
  distinctCategories(): Promise<string[]>
  /** Sets the category only while the row is still uncategorized. Resolves true when it was set. */
  setCategoryIfBlank(id: string, category: string): Promise<boolean>
  /** Rejects with an error wrapping ErrNoRows when the id is unknown. */
  getById(id: string): Promise<Transaction>
  update(id: string, upd: UpdateTransaction): Promise<void>
  deleteById(id: string): Promise<void>
  advanceNextOccurrence(id: string, next: Date): Promise<void>
  markConfirmed(id: string, confirmedAt: Date): Promise<void>
  /** Go's `after` is unused by the query and is accepted only to keep the Go signature. */
  sumUpcomingObligations(accountId: string, after: Date, onOrBefore: Date): Promise<number>
  /** Recurring personal transactions, fixed or estimated, whose next occurrence is before `onOrBefore`; uncertain and as-needed ones are left out. */
  listDueRecurring(accountId: string, onOrBefore: Date): Promise<Transaction[]>
  /** The personal as-needed bills of an account. */
  listAsNeeded(accountId: string): Promise<Transaction[]>
  incrementPaidInstallments(id: string): Promise<void>
}

const SELECT_TXN = `SELECT id, account_id, COALESCE(type, 'personal') AS type, friend_id, amount, title, description, category, timestamp,
			is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at,
			is_installment, total_installments, paid_installments, estimate_source, estimate_key, is_uncertain, is_as_needed`

/** Go parseFlexTime: RFC3339, then the calendar date. */
function parseFlexTime(s: string): Date {
  try {
    return parseRfc3339(s)
  } catch {
    return parseYmd(s)
  }
}

function nullableTime(row: Row, name: string): Date | null {
  const v = nullableTextCol(row, name)
  return v === null ? null : parseFlexTime(v)
}

function scanTransaction(row: Row): Transaction {
  const friendId = nullableTextCol(row, 'friend_id')
  return {
    id: parseUuid(textCol(row, 'id')),
    accountId: parseUuid(textCol(row, 'account_id')),
    type: textCol(row, 'type'),
    // An empty friend_id is no friend (Go: Valid && String != "").
    friendId: friendId === null || friendId === '' ? null : parseUuid(friendId),
    amount: intCol(row, 'amount'),
    title: textCol(row, 'title'),
    description: nullableTextCol(row, 'description'),
    links: [],
    category: nullableTextCol(row, 'category'),
    timestamp: parseFlexTime(textCol(row, 'timestamp')),
    isRecurring: boolCol(row, 'is_recurring'),
    frequency: nullableTextCol(row, 'frequency'),
    anchorDate: nullableTime(row, 'anchor_date'),
    nextOccurrence: nullableTime(row, 'next_occurrence'),
    requiresConfirmation: boolCol(row, 'requires_confirmation'),
    confirmedAt: nullableTime(row, 'confirmed_at'),
    isInstallment: boolCol(row, 'is_installment'),
    totalInstallments: nullableIntCol(row, 'total_installments'),
    paidInstallments: intCol(row, 'paid_installments'),
    estimateSource: nullableTextCol(row, 'estimate_source'),
    estimateKey: nullableTextCol(row, 'estimate_key'),
    isUncertain: boolCol(row, 'is_uncertain'),
    isAsNeeded: boolCol(row, 'is_as_needed'),
  }
}

const LINK_CHUNK = 500

/** A blank or whitespace-only value is no value. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

function bit(v: boolean): number {
  return v ? 1 : 0
}

export class SqliteTxnsRepo implements TransactionsRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insert(t: Transaction): Promise<void> {
    const args: SqlParam[] = [
      t.id,
      t.accountId,
      t.amount,
      t.title,
      blankToNull(t.description),
      t.category,
      formatDbTime(t.timestamp),
      bit(t.isRecurring),
      t.frequency,
      t.anchorDate === null ? null : formatDbTime(t.anchorDate),
      t.nextOccurrence === null ? null : formatDbTime(t.nextOccurrence),
      bit(t.requiresConfirmation),
      null, // confirmed_at is never written by Insert (Go passes nil)
      bit(t.isInstallment),
      t.totalInstallments,
      t.paidInstallments,
      blankToNull(t.estimateSource),
      blankToNull(t.estimateKey),
      bit(t.isUncertain),
      bit(t.isAsNeeded),
    ]
    try {
      await this.db.query(
        `INSERT INTO "Transaction"
			(id, account_id, type, amount, title, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at, is_installment, total_installments, paid_installments, estimate_source, estimate_key, is_uncertain, is_as_needed)
			VALUES (?, ?, 'personal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args,
      )
      await this.writeLinks(t.id, t.links)
    } catch (err) {
      throw wrap('transactions.Insert', err)
    }
  }

  async getByAccount(accountId: string): Promise<Transaction[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(`${SELECT_TXN}
		FROM "Transaction" WHERE account_id = ?`, [accountId])
    } catch (err) {
      throw wrap('transactions.GetByAccount', err)
    }
    try {
      const txns = rows.map(scanTransaction)
      await this.loadLinks(txns)
      return txns
    } catch (err) {
      throw wrap('transactions.GetByAccount: scan', err)
    }
  }

  async listUncategorized(): Promise<Transaction[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(`${SELECT_TXN}
		FROM "Transaction"
		WHERE (category IS NULL OR TRIM(category) = '')
		AND COALESCE(type, 'personal') = 'personal'
		AND amount < 0`)
    } catch (err) {
      throw wrap('transactions.ListUncategorized', err)
    }
    try {
      return rows.map(scanTransaction)
    } catch (err) {
      throw wrap('transactions.ListUncategorized: scan', err)
    }
  }

  async setCategoryIfBlank(id: string, category: string): Promise<boolean> {
    try {
      const changed = await execRowsAffected(
        this.db,
        `UPDATE "Transaction" SET category = ? WHERE id = ? AND (category IS NULL OR TRIM(category) = '')`,
        [normalizeCategory(category), id],
      )
      return changed > 0
    } catch (err) {
      throw wrap('transactions.SetCategoryIfBlank', err)
    }
  }

  async distinctCategories(): Promise<string[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT DISTINCT TRIM(category) AS category
		FROM "Transaction"
		WHERE category IS NOT NULL AND TRIM(category) <> ''
		ORDER BY category`)
    } catch (err) {
      throw wrap('transactions.DistinctCategories', err)
    }
    return rows.map((row) => textCol(row, 'category'))
  }

  async getById(id: string): Promise<Transaction> {
    let rows: Row[]
    try {
      rows = await this.db.query(`${SELECT_TXN}
		FROM "Transaction" WHERE id = ?`, [id])
    } catch (err) {
      throw wrap('transactions.GetByID', err)
    }
    const row = rows[0]
    // QueryRow semantics: no row is sql.ErrNoRows.
    if (row === undefined) throw wrap('transactions.GetByID', ErrNoRows)
    try {
      const txn = scanTransaction(row)
      await this.loadLinks([txn])
      return txn
    } catch (err) {
      throw wrap('transactions.GetByID', err)
    }
  }

  /** Writes each set field with its own statement, in Go's order. Run it inside db.tx() when Go used a tx. */
  async update(id: string, upd: UpdateTransaction): Promise<void> {
    if (upd.title !== undefined) {
      await this.exec(`UPDATE "Transaction" SET title = ? WHERE id = ?`, [upd.title, id]).catch((err: unknown) => {
        throw wrap('transactions.Update title', err)
      })
    }
    if (upd.description !== undefined) {
      await this.exec(`UPDATE "Transaction" SET description = ? WHERE id = ?`, [blankToNull(upd.description), id]).catch(
        (err: unknown) => {
          throw wrap('transactions.Update description', err)
        },
      )
    }
    if (upd.links !== undefined) {
      await this.writeLinks(id, upd.links).catch((err: unknown) => {
        throw wrap('transactions.Update links', err)
      })
    }
    if (upd.category !== undefined) {
      await this.exec(`UPDATE "Transaction" SET category = ? WHERE id = ?`, [normalizeCategory(upd.category), id]).catch((err: unknown) => {
        throw wrap('transactions.Update category', err)
      })
    }
    if (upd.amount !== undefined) {
      await this.exec(`UPDATE "Transaction" SET amount = ? WHERE id = ?`, [upd.amount, id]).catch((err: unknown) => {
        throw wrap('transactions.Update amount', err)
      })
    }
    if (upd.nextOccurrence !== undefined) {
      await this.exec(`UPDATE "Transaction" SET next_occurrence = ? WHERE id = ?`, [
        formatDbTime(upd.nextOccurrence),
        id,
      ]).catch((err: unknown) => {
        throw wrap('transactions.Update next_occurrence', err)
      })
    }
    if (upd.timestamp !== undefined) {
      await this.exec(`UPDATE "Transaction" SET timestamp = ? WHERE id = ?`, [formatDbTime(upd.timestamp), id]).catch(
        (err: unknown) => {
          throw wrap('transactions.Update timestamp', err)
        },
      )
    }
    if (upd.totalInstallments !== undefined) {
      await this.exec(`UPDATE "Transaction" SET total_installments = ? WHERE id = ?`, [
        upd.totalInstallments,
        id,
      ]).catch((err: unknown) => {
        throw wrap('transactions.Update total_installments', err)
      })
    }
    if (upd.isInstallment !== undefined) {
      await this.exec(`UPDATE "Transaction" SET is_installment = ? WHERE id = ?`, [bit(upd.isInstallment), id]).catch(
        (err: unknown) => {
          throw wrap('transactions.Update is_installment', err)
        },
      )
    }
    if (upd.isRecurring !== undefined) {
      await this.exec(`UPDATE "Transaction" SET is_recurring = ? WHERE id = ?`, [bit(upd.isRecurring), id]).catch(
        (err: unknown) => {
          throw wrap('transactions.Update is_recurring', err)
        },
      )
    }
    if (upd.frequency !== undefined) {
      await this.exec(`UPDATE "Transaction" SET frequency = ? WHERE id = ?`, [upd.frequency, id]).catch(
        (err: unknown) => {
          throw wrap('transactions.Update frequency', err)
        },
      )
    }
    if (upd.anchorDate !== undefined) {
      await this.exec(`UPDATE "Transaction" SET anchor_date = ? WHERE id = ?`, [
        formatDbTime(upd.anchorDate),
        id,
      ]).catch((err: unknown) => {
        throw wrap('transactions.Update anchor_date', err)
      })
    }
    if (upd.estimateSource !== undefined || upd.estimateKey !== undefined) {
      await this.exec(`UPDATE "Transaction" SET estimate_source = ?, estimate_key = ? WHERE id = ?`, [
        blankToNull(upd.estimateSource ?? null),
        blankToNull(upd.estimateKey ?? null),
        id,
      ]).catch((err: unknown) => {
        throw wrap('transactions.Update estimate', err)
      })
    }
    if (upd.isUncertain !== undefined) {
      await this.exec(`UPDATE "Transaction" SET is_uncertain = ? WHERE id = ?`, [bit(upd.isUncertain), id]).catch(
        (err: unknown) => {
          throw wrap('transactions.Update is_uncertain', err)
        },
      )
    }
    if (upd.isAsNeeded !== undefined) {
      await this.exec(`UPDATE "Transaction" SET is_as_needed = ? WHERE id = ?`, [bit(upd.isAsNeeded), id]).catch(
        (err: unknown) => {
          throw wrap('transactions.Update is_as_needed', err)
        },
      )
    }
  }

  async deleteById(id: string): Promise<void> {
    await this.exec(`DELETE FROM TransactionLink WHERE transaction_id = ?`, [id])
      .then(() => this.exec(`DELETE FROM "Transaction" WHERE id = ?`, [id])).catch((err: unknown) => {
      throw wrap('transactions.DeleteByID', err)
    })
  }

  async advanceNextOccurrence(id: string, next: Date): Promise<void> {
    await this.exec(`UPDATE "Transaction" SET next_occurrence = ? WHERE id = ?`, [formatDbTime(next), id]).catch(
      (err: unknown) => {
        throw wrap('transactions.AdvanceNextOccurrence', err)
      },
    )
  }

  async markConfirmed(id: string, confirmedAt: Date): Promise<void> {
    await this.exec(`UPDATE "Transaction" SET confirmed_at = ?, requires_confirmation = 0 WHERE id = ?`, [
      formatDbTime(confirmedAt),
      id,
    ]).catch((err: unknown) => {
      throw wrap('transactions.MarkConfirmed', err)
    })
  }

  async incrementPaidInstallments(id: string): Promise<void> {
    await this.exec(`UPDATE "Transaction" SET paid_installments = paid_installments + 1 WHERE id = ?`, [id]).catch(
      (err: unknown) => {
        throw wrap('transactions.IncrementPaidInstallments', err)
      },
    )
  }

  async sumUpcomingObligations(accountId: string, _after: Date, onOrBefore: Date): Promise<number> {
    const onOrBeforeStr = formatDbTime(onOrBefore)
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
		FROM "Transaction"
		WHERE account_id = ?
		AND COALESCE(type, 'personal') = 'personal'
		AND (
			(is_recurring = 1 AND estimate_source IS NULL AND is_uncertain = 0 AND is_as_needed = 0 AND next_occurrence < ?)
			OR (is_recurring = 0 AND requires_confirmation = 1 AND confirmed_at IS NULL AND COALESCE(anchor_date, timestamp) < ?)
		)`,
        [accountId, onOrBeforeStr, onOrBeforeStr],
      )
    } catch (err) {
      throw wrap('transactions.SumUpcomingObligations', err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap('transactions.SumUpcomingObligations', ErrNoRows)
    return intCol(row, 'total')
  }

  async listDueRecurring(accountId: string, onOrBefore: Date): Promise<Transaction[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `${SELECT_TXN}
		FROM "Transaction"
		WHERE account_id = ? AND COALESCE(type, 'personal') = 'personal'
		AND is_recurring = 1 AND is_uncertain = 0 AND is_as_needed = 0 AND next_occurrence < ?`,
        [accountId, formatDbTime(onOrBefore)],
      )
    } catch (err) {
      throw wrap('transactions.ListDueRecurring', err)
    }
    try {
      return rows.map(scanTransaction)
    } catch (err) {
      throw wrap('transactions.ListDueRecurring: scan', err)
    }
  }

  async listAsNeeded(accountId: string): Promise<Transaction[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `${SELECT_TXN}
		FROM "Transaction"
		WHERE account_id = ? AND COALESCE(type, 'personal') = 'personal' AND is_as_needed = 1`,
        [accountId],
      )
    } catch (err) {
      throw wrap('transactions.ListAsNeeded', err)
    }
    try {
      return rows.map(scanTransaction)
    } catch (err) {
      throw wrap('transactions.ListAsNeeded: scan', err)
    }
  }

  private async exec(sql: string, params: SqlParam[]): Promise<void> {
    await this.db.query(sql, params)
  }

  /** Replaces the links of one transaction, keeping the given order. */
  private async writeLinks(transactionId: string, links: TransactionLink[]): Promise<void> {
    await this.exec(`DELETE FROM TransactionLink WHERE transaction_id = ?`, [transactionId])
    for (const [position, link] of links.entries()) {
      await this.exec(`INSERT INTO TransactionLink (id, transaction_id, url, label, position) VALUES (?, ?, ?, ?, ?)`, [
        crypto.randomUUID(),
        transactionId,
        link.url,
        blankToNull(link.label),
        position,
      ])
    }
  }

  /** Fills in `links` for the given transactions, in chunks to stay under SQLite's variable limit. */
  private async loadLinks(txns: Transaction[]): Promise<void> {
    const byId = new Map(txns.map((t) => [t.id, t]))
    const ids = [...byId.keys()]
    for (let start = 0; start < ids.length; start += LINK_CHUNK) {
      const chunk = ids.slice(start, start + LINK_CHUNK)
      const rows = await this.db.query(
        `SELECT transaction_id, url, label FROM TransactionLink
		WHERE transaction_id IN (${chunk.map(() => '?').join(', ')}) ORDER BY transaction_id, position`,
        chunk,
      )
      for (const row of rows) {
        byId.get(textCol(row, 'transaction_id'))?.links.push({ url: textCol(row, 'url'), label: nullableTextCol(row, 'label') })
      }
    }
  }
}
