import { invoke } from '@tauri-apps/api/core'
import { migrate } from './migrate'

export type SqlParam = string | number | boolean | null | undefined

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>
  tx<T>(fn: () => Promise<T>): Promise<T>
}

type Row = Record<string, unknown>
type RawRunner = (sql: string, params: SqlParam[]) => Promise<Row[]>

/**
 * Builds a Db on top of a raw runner. Transactions are plain BEGIN/COMMIT/ROLLBACK
 * statements sent through the runner; the Tauri side has a single connection, so
 * they behave like the Go server's sql.Tx.
 */
export function makeDb(run: RawRunner): Db {
  let depth = 0

  return {
    query<T = Row>(sql: string, params: SqlParam[] = []): Promise<T[]> {
      return run(sql, params) as Promise<T[]>
    },

    async tx<T>(fn: () => Promise<T>): Promise<T> {
      if (depth > 0) throw new Error('nested transactions are not supported')
      depth++
      try {
        await run('BEGIN IMMEDIATE', [])
        try {
          const result = await fn()
          await run('COMMIT', [])
          return result
        } catch (err) {
          try {
            await run('ROLLBACK', [])
          } catch {
            // The original error is the one worth reporting.
          }
          throw err
        }
      } finally {
        depth--
      }
    },
  }
}

async function tauriRunner(sql: string, params: SqlParam[]): Promise<Row[]> {
  const args = params.map((p) => (p === undefined ? null : p))
  return invoke<Row[]>('db_query', { sql, params: args })
}

export function createTauriDb(): Db {
  return makeDb(tauriRunner)
}

let current: Db | undefined

export function setDb(db: Db): void {
  current = db
}

export function getDb(): Db {
  if (!current) throw new Error('database is not initialized: call initDb() first')
  return current
}

let queue: Promise<void> = Promise.resolve()

/** Runs functions one at a time, in call order. A failure only rejects its own caller. */
export function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(() => fn())
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export async function initDb(): Promise<void> {
  setDb(createTauriDb())
  try {
    // Closes a transaction left open by a webview reload; there is none in the normal case.
    await tauriRunner('ROLLBACK', [])
  } catch {
    // No transaction was open.
  }
  await migrate(getDb())
}
