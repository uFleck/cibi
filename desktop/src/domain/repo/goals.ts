// Port of internal/repo/sqlite/goals.go.
//
// Times: every time column is written with formatDbTime (RFC3339, UTC, whole seconds) and read
// back with parseRfc3339, which is Go's time.Parse(time.RFC3339): the other two forms are errors
// here, as they are in Go. The created/updated columns of a Goal are the exception: Go ignores
// their parse errors and leaves the zero time, and so does scanGoal.
// Ids: see repo/accounts.ts. Money is integer cents.
// The SQL text is Go's. The repo methods run on the one Db connection, so inside db.tx() they are
// part of the transaction (Go's *sql.Tx parameters are gone).

import type { Db, SqlParam } from '../db'
import { AppError, ErrNoRows, wrap } from '../errors'
import { date, formatDbTime, parseRfc3339 } from '../dates'
import { parseUuid } from '../uuid'
import { boolCol, intCol, nullableTextCol, type Row, textCol } from './scan'

export const VALID_GOAL_STATUSES: ReadonlySet<string> = new Set(['draft', 'active', 'completed', 'archived'])
export const VALID_GOAL_LEDGER_TYPES: ReadonlySet<string> = new Set(['contribution', 'withdrawal', 'adjustment'])
export const VALID_GOAL_LEDGER_SOURCES: ReadonlySet<string> = new Set(['manual', 'system', 'recurring'])

/** Mirrors the Goal schema row. Cents for money. */
export interface Goal {
  id: string
  accountId: string
  name: string
  status: string
  targetAmountCents: number
  investedTotalCents: number
  minContributionPerWindowCents: number
  startDateUtc: Date
  /** null when the goal has no target date. */
  targetDateUtc: Date | null
  notes: string | null
  currency: string
  createdAtUtc: Date
  updatedAtUtc: Date
}

/** Mirrors the GoalLedgerEntry schema row. */
export interface GoalLedgerEntry {
  id: string
  goalId: string
  amountCents: number
  type: string
  source: string
  note: string | null
  reversesEntryId: string | null
  timestampUtc: Date
  createdAtUtc: Date
}

/** Mirrors the GoalTargetAudit schema row. */
export interface GoalTargetAudit {
  id: string
  goalId: string
  previousTargetAmountCents: number
  newTargetAmountCents: number
  changedAtUtc: Date
  note: string | null
}

/** Mirrors the GoalRecurringContribution schema row. */
export interface GoalRecurringContribution {
  id: string
  goalId: string
  amountCents: number
  frequency: string
  anchorDateUtc: Date
  nextDueUtc: Date
  active: boolean
  createdAtUtc: Date
  updatedAtUtc: Date
}

/** Go UpdateGoal: a field left undefined is not updated (Go nil pointer). */
export interface UpdateGoal {
  name?: string
  status?: string
  targetAmountCents?: number
  investedTotalCents?: number
  targetDateUtc?: Date
  notes?: string
  minContributionPerWindowCents?: number
  updatedAtUtc?: Date
}

/** Go UpdateGoalRecurringContribution: a field left undefined is not updated. */
export interface UpdateGoalRecurringContribution {
  nextDueUtc?: Date
  active?: boolean
  updatedAtUtc?: Date
}

export interface GoalsRepo {
  insertGoal(g: Goal): Promise<void>
  getGoalsByAccount(accountId: string): Promise<Goal[]>
  getGoalById(id: string): Promise<Goal>
  updateGoal(id: string, upd: UpdateGoal): Promise<void>
  insertLedgerEntry(entry: GoalLedgerEntry): Promise<void>
  listLedgerByGoal(goalId: string): Promise<GoalLedgerEntry[]>
  getLedgerEntryById(id: string): Promise<GoalLedgerEntry>
  addTargetAudit(a: GoalTargetAudit): Promise<void>
  insertRecurring(r: GoalRecurringContribution): Promise<void>
  listRecurringByAccount(accountId: string): Promise<GoalRecurringContribution[]>
  getRecurringById(id: string): Promise<GoalRecurringContribution>
  updateRecurring(id: string, upd: UpdateGoalRecurringContribution): Promise<void>
}

const GOAL_COLUMNS = `id, account_id, name, status, target_amount_cents, invested_total_cents, min_contribution_per_window_cents, start_date_utc, target_date_utc, notes, currency, created_at_utc, updated_at_utc`
const LEDGER_COLUMNS = `id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc`
const RECURRING_COLUMNS = `id, goal_id, amount_cents, frequency, anchor_date_utc, next_due_utc, active, created_at_utc, updated_at_utc`

/** Go's zero time.Time: 0001-01-01T00:00:00Z. Scan leaves it when a created/updated column does not parse. */
const ZERO_TIME = date(1, 1, 1)

function parseOrZero(s: string): Date {
  try {
    return parseRfc3339(s)
  } catch {
    return new Date(ZERO_TIME.getTime())
  }
}

function scanGoal(row: Row): Goal {
  const target = nullableTextCol(row, 'target_date_utc')
  const notes = nullableTextCol(row, 'notes')
  return {
    id: parseUuid(textCol(row, 'id')),
    accountId: parseUuid(textCol(row, 'account_id')),
    name: textCol(row, 'name'),
    status: textCol(row, 'status'),
    targetAmountCents: intCol(row, 'target_amount_cents'),
    investedTotalCents: intCol(row, 'invested_total_cents'),
    minContributionPerWindowCents: intCol(row, 'min_contribution_per_window_cents'),
    startDateUtc: parseRfc3339(textCol(row, 'start_date_utc')),
    targetDateUtc: target !== null && target !== '' ? parseRfc3339(target) : null,
    notes,
    currency: textCol(row, 'currency'),
    createdAtUtc: parseOrZero(textCol(row, 'created_at_utc')),
    updatedAtUtc: parseOrZero(textCol(row, 'updated_at_utc')),
  }
}

function scanLedger(row: Row): GoalLedgerEntry {
  const rev = nullableTextCol(row, 'reverses_entry_id')
  return {
    id: parseUuid(textCol(row, 'id')),
    goalId: parseUuid(textCol(row, 'goal_id')),
    amountCents: intCol(row, 'amount_cents'),
    type: textCol(row, 'type'),
    source: textCol(row, 'source'),
    note: nullableTextCol(row, 'note'),
    reversesEntryId: rev !== null && rev !== '' ? parseUuid(rev) : null,
    timestampUtc: parseRfc3339(textCol(row, 'timestamp_utc')),
    createdAtUtc: parseRfc3339(textCol(row, 'created_at_utc')),
  }
}

function scanRecurring(row: Row): GoalRecurringContribution {
  return {
    id: parseUuid(textCol(row, 'id')),
    goalId: parseUuid(textCol(row, 'goal_id')),
    amountCents: intCol(row, 'amount_cents'),
    frequency: textCol(row, 'frequency'),
    anchorDateUtc: parseRfc3339(textCol(row, 'anchor_date_utc')),
    nextDueUtc: parseRfc3339(textCol(row, 'next_due_utc')),
    active: boolCol(row, 'active'),
    createdAtUtc: parseRfc3339(textCol(row, 'created_at_utc')),
    updatedAtUtc: parseRfc3339(textCol(row, 'updated_at_utc')),
  }
}

export class SqliteGoalsRepo implements GoalsRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insertGoal(g: Goal): Promise<void> {
    if (!VALID_GOAL_STATUSES.has(g.status)) {
      throw new AppError('goals.InsertGoal: invalid status')
    }
    try {
      await this.db.query(
        `INSERT INTO Goal (id, account_id, name, status, target_amount_cents, invested_total_cents, min_contribution_per_window_cents, start_date_utc, target_date_utc, notes, currency, created_at_utc, updated_at_utc)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          g.id,
          g.accountId,
          g.name,
          g.status,
          g.targetAmountCents,
          g.investedTotalCents,
          g.minContributionPerWindowCents,
          formatDbTime(g.startDateUtc),
          g.targetDateUtc === null ? null : formatDbTime(g.targetDateUtc),
          g.notes,
          g.currency,
          formatDbTime(g.createdAtUtc),
          formatDbTime(g.updatedAtUtc),
        ],
      )
    } catch (err) {
      throw wrap('goals.InsertGoal', err)
    }
  }

  async getGoalsByAccount(accountId: string): Promise<Goal[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT ${GOAL_COLUMNS} FROM Goal WHERE account_id = ?`, [accountId])
    } catch (err) {
      throw wrap('goals.GetGoalsByAccount', err)
    }
    return rows.map(scanGoal)
  }

  async getGoalById(id: string): Promise<Goal> {
    const row = await this.queryOne(`SELECT ${GOAL_COLUMNS} FROM Goal WHERE id = ?`, [id])
    return scanGoal(row)
  }

  async updateGoal(id: string, upd: UpdateGoal): Promise<void> {
    if (upd.name !== undefined) {
      await this.db.query(`UPDATE Goal SET name = ? WHERE id = ?`, [upd.name, id])
    }
    if (upd.status !== undefined) {
      await this.db.query(`UPDATE Goal SET status = ? WHERE id = ?`, [upd.status, id])
    }
    if (upd.targetAmountCents !== undefined) {
      await this.db.query(`UPDATE Goal SET target_amount_cents = ? WHERE id = ?`, [upd.targetAmountCents, id])
    }
    if (upd.investedTotalCents !== undefined) {
      await this.db.query(`UPDATE Goal SET invested_total_cents = ? WHERE id = ?`, [upd.investedTotalCents, id])
    }
    if (upd.targetDateUtc !== undefined) {
      await this.db.query(`UPDATE Goal SET target_date_utc = ? WHERE id = ?`, [formatDbTime(upd.targetDateUtc), id])
    }
    if (upd.notes !== undefined) {
      await this.db.query(`UPDATE Goal SET notes = ? WHERE id = ?`, [upd.notes, id])
    }
    if (upd.minContributionPerWindowCents !== undefined) {
      await this.db.query(`UPDATE Goal SET min_contribution_per_window_cents = ? WHERE id = ?`, [
        upd.minContributionPerWindowCents,
        id,
      ])
    }
    if (upd.updatedAtUtc !== undefined) {
      await this.db.query(`UPDATE Goal SET updated_at_utc = ? WHERE id = ?`, [formatDbTime(upd.updatedAtUtc), id])
    }
  }

  async insertLedgerEntry(entry: GoalLedgerEntry): Promise<void> {
    if (!VALID_GOAL_LEDGER_TYPES.has(entry.type)) {
      throw new AppError('goals.InsertLedgerEntry: invalid type')
    }
    if (!VALID_GOAL_LEDGER_SOURCES.has(entry.source)) {
      throw new AppError('goals.InsertLedgerEntry: invalid source')
    }
    try {
      await this.db.query(
        `INSERT INTO GoalLedgerEntry (id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.goalId,
          entry.amountCents,
          entry.type,
          entry.source,
          entry.note,
          entry.reversesEntryId,
          formatDbTime(entry.timestampUtc),
          formatDbTime(entry.createdAtUtc),
        ],
      )
    } catch (err) {
      throw wrap('goals.InsertLedgerEntry', err)
    }
  }

  async listLedgerByGoal(goalId: string): Promise<GoalLedgerEntry[]> {
    const rows = await this.db.query(
      `SELECT ${LEDGER_COLUMNS} FROM GoalLedgerEntry WHERE goal_id = ? ORDER BY timestamp_utc ASC`,
      [goalId],
    )
    return rows.map(scanLedger)
  }

  async getLedgerEntryById(id: string): Promise<GoalLedgerEntry> {
    const row = await this.queryOne(`SELECT ${LEDGER_COLUMNS} FROM GoalLedgerEntry WHERE id = ?`, [id])
    return scanLedger(row)
  }

  async addTargetAudit(a: GoalTargetAudit): Promise<void> {
    await this.db.query(
      `INSERT INTO GoalTargetAudit (id, goal_id, previous_target_amount_cents, new_target_amount_cents, changed_at_utc, note) VALUES (?, ?, ?, ?, ?, ?)`,
      [a.id, a.goalId, a.previousTargetAmountCents, a.newTargetAmountCents, formatDbTime(a.changedAtUtc), a.note],
    )
  }

  async insertRecurring(r: GoalRecurringContribution): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO GoalRecurringContribution (id, goal_id, amount_cents, frequency, anchor_date_utc, next_due_utc, active, created_at_utc, updated_at_utc)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id,
          r.goalId,
          r.amountCents,
          r.frequency,
          formatDbTime(r.anchorDateUtc),
          formatDbTime(r.nextDueUtc),
          r.active ? 1 : 0,
          formatDbTime(r.createdAtUtc),
          formatDbTime(r.updatedAtUtc),
        ],
      )
    } catch (err) {
      throw wrap('goals.InsertRecurring', err)
    }
  }

  async listRecurringByAccount(accountId: string): Promise<GoalRecurringContribution[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT grc.id, grc.goal_id, grc.amount_cents, grc.frequency, grc.anchor_date_utc, grc.next_due_utc, grc.active, grc.created_at_utc, grc.updated_at_utc
FROM GoalRecurringContribution grc
JOIN Goal g ON g.id = grc.goal_id
WHERE g.account_id = ? AND grc.active = 1
ORDER BY grc.next_due_utc ASC`,
        [accountId],
      )
    } catch (err) {
      throw wrap('goals.ListRecurringByAccount', err)
    }
    return rows.map(scanRecurring)
  }

  async getRecurringById(id: string): Promise<GoalRecurringContribution> {
    const row = await this.queryOne(`SELECT ${RECURRING_COLUMNS} FROM GoalRecurringContribution WHERE id = ?`, [id])
    return scanRecurring(row)
  }

  async updateRecurring(id: string, upd: UpdateGoalRecurringContribution): Promise<void> {
    try {
      if (upd.nextDueUtc !== undefined) {
        await this.db.query(`UPDATE GoalRecurringContribution SET next_due_utc = ? WHERE id = ?`, [
          formatDbTime(upd.nextDueUtc),
          id,
        ])
      }
      if (upd.active !== undefined) {
        await this.db.query(`UPDATE GoalRecurringContribution SET active = ? WHERE id = ?`, [upd.active ? 1 : 0, id])
      }
      if (upd.updatedAtUtc !== undefined) {
        await this.db.query(`UPDATE GoalRecurringContribution SET updated_at_utc = ? WHERE id = ?`, [
          formatDbTime(upd.updatedAtUtc),
          id,
        ])
      }
    } catch (err) {
      throw wrap('goals.UpdateRecurring', err)
    }
  }

  /** QueryRow semantics: the first row, or ErrNoRows (returned as is, as Go returns sql.ErrNoRows). */
  private async queryOne(sql: string, params: SqlParam[]): Promise<Row> {
    const rows = await this.db.query(sql, params)
    const row = rows[0]
    if (row === undefined) throw ErrNoRows
    return row
  }
}
