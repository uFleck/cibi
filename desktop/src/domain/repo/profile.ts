// Port of internal/repo/sqlite/profile.go.
//
// Ids are canonical UUID strings (see repo/accounts.ts for the shared conventions).

import type { Db } from '../db'
import { ErrNoRows, wrap } from '../errors'
import { type Row, nullableTextCol, textCol } from './scan'

/** Account-scoped profile settings (table AccountProfile). */
export interface UserProfile {
  accountId: string
  displayName: string
  pixKey: string | null
  theme: string
}

export interface ProfileRepo {
  getByAccount(accountId: string): Promise<UserProfile>
  upsertByAccount(accountId: string, displayName: string, pixKey: string | null, theme: string): Promise<void>
}

export class SqliteProfileRepo implements ProfileRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async getByAccount(accountId: string): Promise<UserProfile> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT display_name, pix_key, theme FROM AccountProfile WHERE account_id = ?`, [
        accountId,
      ])
    } catch (err) {
      throw wrap('profile.GetByAccount', err)
    }
    const row = rows[0]
    if (row === undefined) throw wrap('profile.GetByAccount', ErrNoRows)
    try {
      return {
        accountId,
        displayName: textCol(row, 'display_name'),
        pixKey: nullableTextCol(row, 'pix_key'),
        theme: textCol(row, 'theme'),
      }
    } catch (err) {
      throw wrap('profile.GetByAccount', err)
    }
  }

  async upsertByAccount(accountId: string, displayName: string, pixKey: string | null, theme: string): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO AccountProfile (account_id, display_name, pix_key, theme) VALUES (?, ?, ?, ?)
		 ON CONFLICT(account_id) DO UPDATE SET
		   display_name = excluded.display_name,
		   pix_key      = excluded.pix_key,
		   theme        = excluded.theme`,
        [accountId, displayName, pixKey, theme],
      )
    } catch (err) {
      throw wrap('profile.UpsertByAccount', err)
    }
  }
}
