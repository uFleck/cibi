import type { Db } from './db'

const BREAKPOINT = '--> statement-breakpoint'
const BASELINE_NAME = '0001_baseline.sql'
const BASELINE_PATH = `./migrations/${BASELINE_NAME}`
const BASELINE_VERSION = 1

const migrationFiles: Record<string, string> = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})

interface Migration {
  version: number
  name: string
  sql: string
}

function isCommentOnly(part: string): boolean {
  return part
    .split('\n')
    .every((line) => line.trim() === '' || line.trim().startsWith('--'))
}

/** Splits a migration file on its breakpoint marker lines and drops empty and comment-only parts. */
export function splitStatements(sql: string): string[] {
  const parts: string[] = []
  let current: string[] = []
  for (const line of sql.split(/\r?\n/)) {
    if (line.trim() === BREAKPOINT) {
      parts.push(current.join('\n'))
      current = []
    } else {
      current.push(line)
    }
  }
  parts.push(current.join('\n'))
  return parts.map((p) => p.trim()).filter((p) => p !== '' && !isCommentOnly(p))
}

function loadMigrations(): Migration[] {
  return Object.entries(migrationFiles)
    .map(([path, sql]) => {
      const name = path.slice(path.lastIndexOf('/') + 1)
      const match = /^(\d+)_/.exec(name)
      if (!match) throw new Error(`invalid migration file name: ${name}`)
      return { version: Number(match[1]), name, sql }
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

async function readUserVersion(db: Db): Promise<number> {
  const rows = await db.query('PRAGMA user_version')
  const first = rows[0]
  const value = first ? Object.values(first)[0] : undefined
  if (typeof value !== 'number') throw new Error('could not read PRAGMA user_version')
  return value
}

async function setUserVersion(db: Db, version: number): Promise<void> {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error(`invalid user_version: ${version}`)
  }
  await db.query(`PRAGMA user_version = ${version}`)
}

async function countUserTables(db: Db): Promise<number> {
  const rows = await db.query<{ n: number }>(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  )
  return rows[0]?.n ?? 0
}

async function verifyLegacySchema(db: Db): Promise<void> {
  const rows = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('Account', 'Transaction')",
  )
  const names = new Set(rows.map((r) => r.name))
  if (!names.has('Account') || !names.has('Transaction')) {
    throw new Error('unrecognized database: expected tables Account and "Transaction" are missing')
  }
}

async function applyStatements(db: Db, sql: string): Promise<void> {
  for (const stmt of splitStatements(sql)) {
    await db.query(stmt)
  }
}

/**
 * Brings the database schema up to date using PRAGMA user_version as the version marker.
 * Safe to call repeatedly.
 */
export async function migrate(db: Db): Promise<void> {
  const baseline = migrationFiles[BASELINE_PATH]
  if (baseline === undefined) throw new Error(`missing migration: ${BASELINE_PATH}`)

  let version = await readUserVersion(db)
  if (version === 0) {
    const tables = await countUserTables(db)
    if (tables === 0) {
      await db.tx(async () => {
        await applyStatements(db, baseline)
        await setUserVersion(db, BASELINE_VERSION)
      })
    } else {
      // Created by the Go server: the schema is already in place.
      await verifyLegacySchema(db)
      await setUserVersion(db, BASELINE_VERSION)
    }
    version = BASELINE_VERSION
  }

  for (const migration of loadMigrations()) {
    if (migration.name === BASELINE_NAME) continue
    if (migration.version <= version) continue
    await db.tx(async () => {
      await applyStatements(db, migration.sql)
      await setUserVersion(db, migration.version)
    })
    version = migration.version
  }
}
