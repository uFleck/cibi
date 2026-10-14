// Column readers for raw rows from Db.query. They follow database/sql Scan as the Go repos use it:
// a NULL cannot go into a non-nullable Go value (error), a nullable column maps to null, and an
// integer column scans into a bool only when it is 0 or 1.
//
// Errors are plain AppErrors; the repo method that calls them wraps them with its own prefix.

import { AppError } from '../errors'

export type Row = Record<string, unknown>

export function textCol(row: Row, name: string): string {
  const v = row[name]
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  throw new AppError(`converting NULL to string is unsupported (column ${name})`)
}

export function nullableTextCol(row: Row, name: string): string | null {
  return row[name] === null || row[name] === undefined ? null : textCol(row, name)
}

export function intCol(row: Row, name: string): number {
  const v = row[name]
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (v === null || v === undefined) {
    throw new AppError(`converting NULL to int64 is unsupported (column ${name})`)
  }
  throw new AppError(`unsupported value for int64 column ${name}: ${String(v)}`)
}

/** A nullable integer column: NULL gives null (Go sql.NullInt64 with Valid false). */
export function nullableIntCol(row: Row, name: string): number | null {
  const v = row[name]
  if (v === null || v === undefined) return null
  return intCol(row, name)
}

export function boolCol(row: Row, name: string): boolean {
  const v = row[name]
  if (v === 1 || v === true) return true
  if (v === 0 || v === false) return false
  throw new AppError(`sql/driver: couldn't convert ${String(v)} into type bool (column ${name})`)
}
