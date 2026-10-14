// Rows-affected helper for the repos whose Go code checks res.RowsAffected().
//
// The Db interface returns rows only, so the count is read with SELECT changes(). changes() is
// the number of rows the last INSERT/UPDATE/DELETE on this connection changed. Requests are
// serialized and all statements go through the one connection, so no other statement runs
// between the two calls.

import type { Db, SqlParam } from '../db'
import { intCol, type Row } from './scan'

/** Runs a data-changing statement and returns how many rows it changed (Go res.RowsAffected()). */
export async function execRowsAffected(db: Db, sql: string, params: SqlParam[]): Promise<number> {
  await db.query(sql, params)
  const rows = await db.query<Row>('SELECT changes() AS n')
  const row = rows[0]
  if (row === undefined) throw new Error('changes() returned no row')
  return intCol(row, 'n')
}
