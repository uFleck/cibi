// Port of internal/repo/sqlite/accounts.go.
//
// Conventions (shared by every repo in the port):
// - Ids are canonical lowercase UUID strings: ids read from the database go through parseUuid,
//   ids passed in are already canonical (the handlers parse them).
// - Money is integer cents.
// - Go's *sql.Tx parameters are gone. Every query goes through the one Db connection, so the
//   methods that Go runs in a transaction use db.tx() here, and a method called from inside
//   db.tx() is part of that transaction. One TS method replaces each Go tx/no-tx pair.
// - Go's `fmt.Errorf("op: %w", err)` is wrap('op', err); sql.ErrNoRows is ErrNoRows.

import type { Db, SqlParam } from '../db'
import { ErrNoRows, wrap } from '../errors'
import { parseUuid } from '../uuid'
import { execRowsAffected } from './exec'
import { boolCol, intCol, type Row, textCol } from './scan'

/** Mirrors the Account schema row. */
export interface Account {
  id: string
  name: string
  /** Cents. */
  currentBalance: number
  currency: string
  isDefault: boolean
  /** Cents; account-specific reserve threshold. */
  safetyBuffer: number
  version: number
}

/** An Account before insert: the version is set by the database (always 1 on insert). */
export type NewAccount = Omit<Account, 'version'>

export interface AccountsRepo {
  insert(a: NewAccount): Promise<void>
  getAll(): Promise<Account[]>
  getDefault(): Promise<Account>
  getById(id: string): Promise<Account>
  updateBalance(id: string, balance: number): Promise<void>
  updateName(id: string, name: string): Promise<void>
  updateSafetyBuffer(id: string, safetyBuffer: number): Promise<void>
  updateIsDefault(id: string, isDefault: boolean): Promise<void>
  deleteById(id: string): Promise<void>
  unsetDefaults(): Promise<void>
  incrementVersion(id: string): Promise<void>
}

function scanAccount(row: Row): Account {
  return {
    id: parseUuid(textCol(row, 'id')),
    name: textCol(row, 'name'),
    currentBalance: intCol(row, 'current_balance'),
    currency: textCol(row, 'currency'),
    isDefault: boolCol(row, 'is_default'),
    safetyBuffer: intCol(row, 'safety_buffer'),
    version: intCol(row, 'COALESCE(version,1)'),
  }
}

export class SqliteAccountsRepo implements AccountsRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async insert(a: NewAccount): Promise<void> {
    await this.db.tx(async () => {
      if (a.isDefault) {
        await this.unsetDefaults().catch((err: unknown) => {
          throw wrap('accounts.Insert: unset defaults', err)
        })
      }
      await this.exec(
        `INSERT INTO Account (id, name, current_balance, currency, is_default, safety_buffer, version) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.name, a.currentBalance, a.currency, a.isDefault ? 1 : 0, a.safetyBuffer, 1],
      ).catch((err: unknown) => {
        throw wrap('accounts.Insert: exec', err)
      })
    })
  }

  async unsetDefaults(): Promise<void> {
    await this.exec(`UPDATE Account SET is_default = 0 WHERE is_default = 1`, []).catch((err: unknown) => {
      throw wrap('accounts.UnsetDefaults', err)
    })
  }

  async getAll(): Promise<Account[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT id, name, current_balance, currency, is_default, safety_buffer, COALESCE(version,1) FROM Account`,
      )
    } catch (err) {
      throw wrap('accounts.GetAll: query', err)
    }
    try {
      return rows.map(scanAccount)
    } catch (err) {
      throw wrap('accounts.GetAll: scan', err)
    }
  }

  getDefault(): Promise<Account> {
    return this.getOne(
      `SELECT id, name, current_balance, currency, is_default, safety_buffer, COALESCE(version,1) FROM Account WHERE is_default = 1`,
      [],
      'accounts.GetDefault',
    )
  }

  getById(id: string): Promise<Account> {
    return this.getOne(
      `SELECT id, name, current_balance, currency, is_default, safety_buffer, COALESCE(version,1) FROM Account WHERE id = ?`,
      [id],
      'accounts.GetByID',
    )
  }

  async updateBalance(id: string, balance: number): Promise<void> {
    await this.exec(`UPDATE Account SET current_balance = ? WHERE id = ?`, [balance, id]).catch((err: unknown) => {
      throw wrap('accounts.UpdateBalance', err)
    })
  }

  async updateName(id: string, name: string): Promise<void> {
    await this.exec(`UPDATE Account SET name = ? WHERE id = ?`, [name, id]).catch((err: unknown) => {
      throw wrap('accounts.UpdateName', err)
    })
  }

  async updateSafetyBuffer(id: string, safetyBuffer: number): Promise<void> {
    await this.exec(`UPDATE Account SET safety_buffer = ? WHERE id = ?`, [safetyBuffer, id]).catch((err: unknown) => {
      throw wrap('accounts.UpdateSafetyBuffer', err)
    })
  }

  async updateIsDefault(id: string, isDefault: boolean): Promise<void> {
    await this.db.tx(async () => {
      await this.unsetDefaults().catch((err: unknown) => {
        throw wrap('accounts.UpdateIsDefault: unset', err)
      })
      let changed: number
      try {
        changed = await execRowsAffected(this.db, `UPDATE Account SET is_default = ? WHERE id = ?`, [isDefault ? 1 : 0, id])
      } catch (err) {
        throw wrap('accounts.UpdateIsDefault: exec', err)
      }
      // An unknown id rolls the transaction back, so the current default is kept.
      if (changed === 0) throw wrap('accounts.UpdateIsDefault', ErrNoRows)
    })
  }

  async incrementVersion(id: string): Promise<void> {
    await this.exec(`UPDATE Account SET version = COALESCE(version,1) + 1 WHERE id = ?`, [id]).catch((err: unknown) => {
      throw wrap('accounts.IncrementVersion', err)
    })
  }

  async deleteById(id: string): Promise<void> {
    await this.db.tx(async () => {
      // Children go before parents: the ledger before the transactions and pay schedules it references.
      await this.exec(`DELETE FROM ledger WHERE account_id = ?`, [id]).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete ledger', err)
      })
      await this.exec(
        `DELETE FROM GoalLedgerEntry WHERE goal_id IN (SELECT id FROM Goal WHERE account_id = ?)`,
        [id],
      ).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete goal entries', err)
      })
      await this.exec(
        `DELETE FROM GoalRecurringContribution WHERE goal_id IN (SELECT id FROM Goal WHERE account_id = ?)`,
        [id],
      ).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete goal recurring', err)
      })
      await this.exec(
        `DELETE FROM GoalTargetAudit WHERE goal_id IN (SELECT id FROM Goal WHERE account_id = ?)`,
        [id],
      ).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete goal audits', err)
      })
      await this.exec(`DELETE FROM Goal WHERE account_id = ?`, [id]).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete goals', err)
      })
      await this.exec(`DELETE FROM GroupEvent WHERE account_id = ?`, [id]).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete group events', err)
      })
      await this.exec(`DELETE FROM PeerDebt WHERE account_id = ?`, [id]).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete peer debts', err)
      })
      await this.exec(`DELETE FROM "Transaction" WHERE account_id = ?`, [id]).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete txns', err)
      })
      await this.exec(`DELETE FROM PaySchedule WHERE account_id = ?`, [id]).catch((err: unknown) => {
        throw wrap('accounts.DeleteByID: delete pay schedules', err)
      })
      let changed: number
      try {
        changed = await execRowsAffected(this.db, `DELETE FROM Account WHERE id = ?`, [id])
      } catch (err) {
        throw wrap('accounts.DeleteByID: delete account', err)
      }
      if (changed === 0) throw wrap('accounts.DeleteByID', ErrNoRows)
    })
  }

  private async exec(sql: string, params: SqlParam[]): Promise<void> {
    await this.db.query(sql, params)
  }

  /** QueryRow semantics: the first row, or ErrNoRows when there is none. */
  private async getOne(sql: string, params: SqlParam[], op: string): Promise<Account> {
    let rows: Row[]
    try {
      rows = await this.db.query(sql, params)
    } catch (err) {
      throw wrap(op, err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap(op, ErrNoRows)
    try {
      return scanAccount(row)
    } catch (err) {
      throw wrap(op, err)
    }
  }
}
