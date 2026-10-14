/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite'
import { makeDb, type Db, type SqlParam } from '../db'
import { migrate } from '../migrate'

function toSqliteValue(p: SqlParam): string | number | null {
  if (p === undefined) return null
  if (typeof p === 'boolean') return p ? 1 : 0
  return p
}

/** Wraps a node:sqlite connection in the same Db interface the app uses. */
export function wrapDatabaseSync(raw: DatabaseSync): Db & { close(): void } {
  const db = makeDb(async (sql, params) => {
    const values = params.map(toSqliteValue)
    const stmt = raw.prepare(sql)
    if (stmt.columns().length > 0) {
      return stmt.all(...values)
    }
    stmt.run(...values)
    return []
  })
  return Object.assign(db, { close: () => raw.close() })
}

export async function createTestDb(options: { migrate?: boolean } = {}): Promise<Db & { close(): void }> {
  const db = wrapDatabaseSync(new DatabaseSync(':memory:'))
  await db.query('PRAGMA foreign_keys = ON')
  if (options.migrate !== false) {
    await migrate(db)
  }
  return db
}
