// Port of internal/repo/sqlite/safety_buffer.go.
//
// Dead code in the Go server: nothing calls it, app.go does not wire it, and migration
// 20260501000001 drops the SafetyBuffer table it reads, so get() fails with "no such table"
// on a migrated database. It is ported for fidelity and is not wired into buildApp.

import type { Db } from '../db'
import { wrap } from '../errors'
import { type Row, intCol } from './scan'

/** Mirrors the SafetyBuffer schema row. */
export interface SafetyBuffer {
  /** Cents; 0 = buffer disabled. */
  minThreshold: number
}

export interface SafetyBufferRepo {
  get(): Promise<SafetyBuffer>
  set(threshold: number): Promise<void>
}

export class SqliteSafetyBufferRepo implements SafetyBufferRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  /** Returns a threshold of 0 when no row exists (Go: sql.ErrNoRows gives the default). */
  async get(): Promise<SafetyBuffer> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT min_threshold FROM SafetyBuffer LIMIT 1`)
    } catch (err) {
      throw wrap('safety_buffer.Get', err)
    }
    const row = rows[0]
    if (row === undefined) return { minThreshold: 0 }
    try {
      return { minThreshold: intCol(row, 'min_threshold') }
    } catch (err) {
      throw wrap('safety_buffer.Get', err)
    }
  }

  /** Replaces any existing row. */
  async set(threshold: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.query(`DELETE FROM SafetyBuffer`).catch((err: unknown) => {
        throw wrap('safety_buffer.Set: delete', err)
      })
      await this.db.query(`INSERT INTO SafetyBuffer (min_threshold) VALUES (?)`, [threshold]).catch((err: unknown) => {
        throw wrap('safety_buffer.Set: insert', err)
      })
    })
  }
}
