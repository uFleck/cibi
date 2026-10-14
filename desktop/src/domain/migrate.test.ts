// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { Db } from './db'
import { migrate, splitStatements } from './migrate'
import baselineSql from './migrations/0001_baseline.sql?raw'
import { createTestDb, wrapDatabaseSync } from './testing/testDb'

interface SchemaRow {
  type: string
  name: string
  tbl_name: string
  sql: string | null
}

async function schemaSnapshot(db: Db): Promise<SchemaRow[]> {
  return db.query<SchemaRow>(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%' AND name != 'goose_db_version' AND tbl_name != 'goose_db_version'
     ORDER BY type, name, tbl_name`,
  )
}

async function userVersion(db: Db): Promise<number> {
  return (await db.query<{ user_version: number }>('PRAGMA user_version'))[0].user_version
}

function normalizeSql(sql: string | null): string | null {
  return sql === null ? null : sql.replace(/\s+/g, ' ').trim()
}

function schemaSet(rows: SchemaRow[]): string[] {
  return rows.map((r) => `${r.type}|${r.name}|${normalizeSql(r.sql)}`).sort()
}

describe('splitStatements', () => {
  it('keeps a trigger body with inner semicolons in one statement', () => {
    const sql = [
      '-- header comment',
      '--> statement-breakpoint',
      'CREATE TABLE t (id INTEGER);',
      '--> statement-breakpoint',
      'CREATE TRIGGER trg AFTER INSERT ON t BEGIN',
      "  UPDATE t SET id = id WHERE 0;",
      '  SELECT 1;',
      'END;',
      '--> statement-breakpoint',
      '',
    ].join('\n')
    const parts = splitStatements(sql)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe('CREATE TABLE t (id INTEGER);')
    expect(parts[1]).toContain('CREATE TRIGGER trg AFTER INSERT ON t BEGIN')
    expect(parts[1]).toContain('SELECT 1;')
    expect(parts[1].endsWith('END;')).toBe(true)
  })

  it('drops empty and comment-only parts', () => {
    expect(splitStatements('-- only a comment\n--> statement-breakpoint\n\n--> statement-breakpoint\nSELECT 1;')).toEqual([
      'SELECT 1;',
    ])
  })
})

describe('migrate', () => {
  it('fresh database: sets user_version 1 and creates the baseline schema', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    expect(await userVersion(db)).toBe(1)

    const tables = (
      await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    ).map((r) => r.name)
    for (const table of ['Account', 'Transaction', 'ledger', 'GoalLedgerEntry']) {
      expect(tables).toContain(table)
    }

    const statements = splitStatements(baselineSql)
    const expected = {
      table: statements.filter((s) => /^CREATE TABLE/i.test(s)).length,
      view: statements.filter((s) => /^CREATE VIEW/i.test(s)).length,
      index: statements.filter((s) => /^CREATE (UNIQUE )?INDEX/i.test(s)).length,
      trigger: statements.filter((s) => /^CREATE TRIGGER/i.test(s)).length,
    }
    const actual = await db.query<{ type: string; n: number }>(
      `SELECT type, count(*) AS n FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name != 'goose_db_version'
       GROUP BY type`,
    )
    const byType = Object.fromEntries(actual.map((r) => [r.type, r.n]))
    expect(byType.table ?? 0).toBe(expected.table)
    expect(byType.view ?? 0).toBe(expected.view)
    expect(byType.index ?? 0).toBe(expected.index)
    expect(byType.trigger ?? 0).toBe(expected.trigger)
    db.close()
  })

  it('is idempotent: a second run changes nothing', async () => {
    const db = await createTestDb()
    const before = await schemaSnapshot(db)
    await migrate(db)
    expect(await userVersion(db)).toBe(1)
    expect(await schemaSnapshot(db)).toEqual(before)
    db.close()
  })

  it('existing database path: user_version 0 with the schema present only sets 1', async () => {
    const db = await createTestDb()
    await db.query('PRAGMA user_version = 0')
    const before = await schemaSnapshot(db)
    await migrate(db)
    expect(await userVersion(db)).toBe(1)
    expect(await schemaSnapshot(db)).toEqual(before)
    db.close()
  })

  it('unrecognized database with user_version 0 throws', async () => {
    const db = await createTestDb({ migrate: false })
    await db.query('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)')
    await expect(migrate(db)).rejects.toThrow('unrecognized database')
    expect(await userVersion(db)).toBe(0)
    db.close()
  })

  it.skipIf(!process.env.CIBI_TEST_DB)('real database copy keeps its schema', async () => {
    const raw = new DatabaseSync(process.env.CIBI_TEST_DB ?? '')
    const db = wrapDatabaseSync(raw)
    try {
      const before = await schemaSnapshot(db)
      await migrate(db)
      expect(await userVersion(db)).toBe(1)
      expect(await schemaSnapshot(db)).toEqual(before)

      const fresh = await createTestDb()
      const freshSchema = schemaSet(await schemaSnapshot(fresh))
      fresh.close()
      expect(schemaSet(before)).toEqual(freshSchema)
    } finally {
      db.close()
    }
  })
})
