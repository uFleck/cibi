// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { Db } from './db'
import { migrate, splitStatements } from './migrate'
import baselineSql from './migrations/0001_baseline.sql?raw'
import appSettingSql from './migrations/0002_app_setting.sql?raw'
import categorySql from './migrations/0003_category.sql?raw'
import budgetSql from './migrations/0004_budget.sql?raw'
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

async function transactionColumns(db: Db): Promise<string[]> {
  return (await db.query<{ name: string }>(`PRAGMA table_info("Transaction")`)).map((r) => r.name)
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
  it('fresh database: sets user_version 4 and creates the baseline schema, AppSetting, the category column and the budget tables', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    expect(await userVersion(db)).toBe(4)
    expect(await transactionColumns(db)).toContain('category')

    const tables = (
      await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    ).map((r) => r.name)
    for (const table of ['Account', 'Transaction', 'ledger', 'GoalLedgerEntry', 'AppSetting', 'Budget', 'BudgetExclusion']) {
      expect(tables).toContain(table)
    }

    const statements = [
      ...splitStatements(baselineSql),
      ...splitStatements(appSettingSql),
      ...splitStatements(categorySql),
      ...splitStatements(budgetSql),
    ]
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
    expect(await userVersion(db)).toBe(4)
    expect(await schemaSnapshot(db)).toEqual(before)
    db.close()
  })

  it('existing database path: user_version 0 with the schema present sets 4 and adds AppSetting, category and the budget tables', async () => {
    const db = await createTestDb()
    await db.query('PRAGMA user_version = 0')
    await db.query('DROP TABLE AppSetting')
    await db.query('ALTER TABLE "Transaction" DROP COLUMN category')
    await db.query('DROP TABLE BudgetExclusion')
    await db.query('DROP TABLE Budget')
    await migrate(db)
    expect(await userVersion(db)).toBe(4)
    expect((await db.query("SELECT name FROM sqlite_master WHERE name = 'AppSetting'")).length).toBe(1)
    expect(await transactionColumns(db)).toContain('category')
    db.close()
  })

  it('version 1 database gets AppSetting and category and keeps its rows', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    await db.query("INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES ('a1', 'A', 0, 'BRL', 1)")
    await db.query('DROP TABLE AppSetting')
    await db.query('ALTER TABLE "Transaction" DROP COLUMN category')
    await db.query('DROP TABLE BudgetExclusion')
    await db.query('DROP TABLE Budget')
    await db.query('PRAGMA user_version = 1')
    await migrate(db)
    expect(await userVersion(db)).toBe(4)
    expect(await db.query("SELECT id FROM Account")).toEqual([{ id: 'a1' }])
    await db.query("INSERT INTO AppSetting (key, value) VALUES ('k', '1')")
    expect(await db.query("SELECT value FROM AppSetting WHERE key = 'k'")).toEqual([{ value: '1' }])
    db.close()
  })

  it('version 2 database gets category and keeps its transactions uncategorized', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    await db.query("INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES ('a1', 'A', 0, 'BRL', 1)")
    await db.query(
      `INSERT INTO "Transaction" (id, account_id, amount, description, timestamp, is_recurring, requires_confirmation)
       VALUES ('t1', 'a1', -1500, 'Mercado Livre', '2026-10-01T00:00:00Z', 0, 0)`,
    )
    await db.query('ALTER TABLE "Transaction" DROP COLUMN category')
    await db.query('DROP TABLE BudgetExclusion')
    await db.query('DROP TABLE Budget')
    await db.query('PRAGMA user_version = 2')
    await migrate(db)
    expect(await userVersion(db)).toBe(4)
    expect(await db.query('SELECT id, description, amount, category FROM "Transaction"')).toEqual([
      { id: 't1', description: 'Mercado Livre', amount: -1500, category: null },
    ])
    await db.query(`UPDATE "Transaction" SET category = 'Compras' WHERE id = 't1'`)
    expect(await db.query('SELECT category FROM "Transaction"')).toEqual([{ category: 'Compras' }])
    db.close()
  })

  it('version 3 database gets the budget tables and keeps its rows', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    await db.query("INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES ('a1', 'A', 0, 'BRL', 1)")
    await db.query(
      `INSERT INTO "Transaction" (id, account_id, amount, description, timestamp, is_recurring, requires_confirmation, category)
       VALUES ('t1', 'a1', -1500, 'Mercado Livre', '2026-10-01T00:00:00Z', 0, 0, 'Compras')`,
    )
    await db.query('DROP TABLE BudgetExclusion')
    await db.query('DROP TABLE Budget')
    await db.query('PRAGMA user_version = 3')
    await migrate(db)
    expect(await userVersion(db)).toBe(4)
    expect(await db.query('SELECT id, amount, category FROM "Transaction"')).toEqual([
      { id: 't1', amount: -1500, category: 'Compras' },
    ])
    await db.query("INSERT INTO Budget (category, monthly_limit, is_fixed) VALUES ('Compras', 50000, 0)")
    await db.query(`INSERT INTO BudgetExclusion (transaction_id, month) VALUES ('t1', '2026-10')`)
    expect(await db.query('SELECT category FROM Budget')).toEqual([{ category: 'Compras' }])
    expect(await db.query('SELECT transaction_id, month FROM BudgetExclusion')).toEqual([
      { transaction_id: 't1', month: '2026-10' },
    ])
    db.close()
  })

  it('unrecognized database with user_version 0 throws', async () => {
    const db = await createTestDb({ migrate: false })
    await db.query('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)')
    await expect(migrate(db)).rejects.toThrow('unrecognized database')
    expect(await userVersion(db)).toBe(0)
    db.close()
  })

  it.skipIf(!process.env.CIBI_TEST_DB)('real database copy migrates to version 4 and gains only the category column and the budget tables', async () => {
    const raw = new DatabaseSync(process.env.CIBI_TEST_DB ?? '')
    const db = wrapDatabaseSync(raw)
    try {
      const versionBefore = await userVersion(db)
      const before = await schemaSnapshot(db)
      await migrate(db)
      expect(await userVersion(db)).toBe(4)
      const after = await schemaSnapshot(db)

      const fresh = await createTestDb()
      const freshSchema = schemaSet(await schemaSnapshot(fresh))
      fresh.close()
      expect(schemaSet(after)).toEqual(freshSchema)

      if (versionBefore === 2) {
        const priorSql = new Map(before.map((r) => [`${r.type}|${r.name}`, normalizeSql(r.sql)]))
        const changed = after
          .filter((r) => priorSql.has(`${r.type}|${r.name}`) && priorSql.get(`${r.type}|${r.name}`) !== normalizeSql(r.sql))
          .map((r) => `${r.type}|${r.name}`)
        expect(changed).toEqual(['table|Transaction'])
      }
    } finally {
      db.close()
    }
  })
})
