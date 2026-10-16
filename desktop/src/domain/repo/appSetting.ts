// Port-style repo for the AppSetting table (desktop only, migration 0002). Values are JSON text;
// the service encodes and decodes them.

import type { Db } from '../db'
import { wrap } from '../errors'
import { type Row, textCol } from './scan'

export interface AppSettingRepo {
  /** The stored text for key, or null when the key was never set. */
  get(key: string): Promise<string | null>
  upsert(key: string, value: string): Promise<void>
}

export class SqliteAppSettingRepo implements AppSettingRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async get(key: string): Promise<string | null> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT value FROM AppSetting WHERE key = ?`, [key])
    } catch (err) {
      throw wrap('appSetting.Get', err)
    }
    const row = rows[0]
    if (row === undefined) return null
    try {
      return textCol(row, 'value')
    } catch (err) {
      throw wrap('appSetting.Get', err)
    }
  }

  async upsert(key: string, value: string): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO AppSetting (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
      )
    } catch (err) {
      throw wrap('appSetting.Upsert', err)
    }
  }
}
