// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { Db } from './db'
import { DEFAULT_CATEGORIES } from './categories'
import { migrate, splitStatements } from './migrate'
import baselineSql from './migrations/0001_baseline.sql?raw'
import appSettingSql from './migrations/0002_app_setting.sql?raw'
import categorySql from './migrations/0003_category.sql?raw'
import budgetSql from './migrations/0004_budget.sql?raw'
import titleSql from './migrations/0005_transaction_title.sql?raw'
import peerTitleSql from './migrations/0006_peer_debt_title.sql?raw'
import categoryTableSql from './migrations/0007_category_table.sql?raw'
import dropDefaultSql from './migrations/0008_drop_account_default.sql?raw'
import reserveSql from './migrations/0010_reserve.sql?raw'
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

/** Puts the schema back to what 0008 left: no estimate columns on Transaction and no reserve table. */
async function dropEstimate(db: Db): Promise<void> {
  await db.query('DROP TABLE ReserveEntry')
  await db.query('ALTER TABLE "Transaction" DROP COLUMN estimate_source')
  await db.query('ALTER TABLE "Transaction" DROP COLUMN estimate_key')
}

/** Puts the schema back to what 0004 left: the title is the description again, there is no link or Category table, and Account has is_default. */
async function downgradeTitle(db: Db): Promise<void> {
  await dropEstimate(db)
  await db.query('ALTER TABLE Account ADD COLUMN is_default BOOLEAN')
  await db.query('DROP TABLE Category')
  await db.query('DROP VIEW peer_debts')
  await db.query('DROP TABLE TransactionLink')
  await db.query('ALTER TABLE "Transaction" DROP COLUMN description')
  await db.query('ALTER TABLE "Transaction" RENAME COLUMN title TO description')
  await db.query(`CREATE VIEW peer_debts AS
    SELECT id, account_id, friend_id, amount, description, timestamp AS date, is_installment, total_installments,
      paid_installments, frequency, anchor_date, CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END AS is_confirmed
    FROM "Transaction" WHERE type = 'peer'`)
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
  it('fresh database: sets user_version 10 and creates the baseline schema, AppSetting, the category column and the budget tables', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    expect(await userVersion(db)).toBe(10)
    expect(await transactionColumns(db)).toContain('category')

    const tables = (
      await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    ).map((r) => r.name)
    for (const table of ['Account', 'Transaction', 'ledger', 'GoalLedgerEntry', 'AppSetting', 'Budget', 'BudgetExclusion', 'Category']) {
      expect(tables).toContain(table)
    }

    const statements = [
      ...splitStatements(baselineSql),
      ...splitStatements(appSettingSql),
      ...splitStatements(categorySql),
      ...splitStatements(budgetSql),
      ...splitStatements(titleSql),
      ...splitStatements(peerTitleSql),
      ...splitStatements(categoryTableSql),
      ...splitStatements(dropDefaultSql),
      ...splitStatements(reserveSql),
    ]
    const expected = {
      table: statements.filter((s) => /^CREATE TABLE/i.test(s)).length,
      view: statements.filter((s) => /^CREATE VIEW/i.test(s)).length - statements.filter((s) => /^DROP VIEW/i.test(s)).length,
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

  it('seeds the Category table with the default categories, in order', async () => {
    const db = await createTestDb()
    const rows = await db.query<{ id: string; label: string; description: string }>(
      'SELECT id, label, description FROM Category ORDER BY position',
    )
    expect(rows).toEqual(DEFAULT_CATEGORIES.map((c) => ({ id: c.id, label: c.label, description: c.description })))
    db.close()
  })

  it('is idempotent: a second run changes nothing', async () => {
    const db = await createTestDb()
    const before = await schemaSnapshot(db)
    await migrate(db)
    expect(await userVersion(db)).toBe(10)
    expect(await schemaSnapshot(db)).toEqual(before)
    db.close()
  })

  it('existing database path: user_version 0 with the schema present sets 10 and adds AppSetting, category and the budget tables', async () => {
    const db = await createTestDb()
    await downgradeTitle(db)
    await db.query('PRAGMA user_version = 0')
    await db.query('DROP TABLE AppSetting')
    await db.query('ALTER TABLE "Transaction" DROP COLUMN category')
    await db.query('DROP TABLE BudgetExclusion')
    await db.query('DROP TABLE Budget')
    await migrate(db)
    expect(await userVersion(db)).toBe(10)
    expect((await db.query("SELECT name FROM sqlite_master WHERE name = 'AppSetting'")).length).toBe(1)
    expect(await transactionColumns(db)).toContain('category')
    db.close()
  })

  it('version 1 database gets AppSetting and category and keeps its rows', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    await downgradeTitle(db)
    await db.query("INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES ('a1', 'A', 0, 'BRL', 1)")
    await db.query('DROP TABLE AppSetting')
    await db.query('ALTER TABLE "Transaction" DROP COLUMN category')
    await db.query('DROP TABLE BudgetExclusion')
    await db.query('DROP TABLE Budget')
    await db.query('PRAGMA user_version = 1')
    await migrate(db)
    expect(await userVersion(db)).toBe(10)
    expect(await db.query("SELECT id FROM Account")).toEqual([{ id: 'a1' }])
    await db.query("INSERT INTO AppSetting (key, value) VALUES ('k', '1')")
    expect(await db.query("SELECT value FROM AppSetting WHERE key = 'k'")).toEqual([{ value: '1' }])
    db.close()
  })

  it('version 2 database gets category and keeps its transactions uncategorized', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    await downgradeTitle(db)
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
    expect(await userVersion(db)).toBe(10)
    expect(await db.query('SELECT id, title, amount, category FROM "Transaction"')).toEqual([
      { id: 't1', title: 'Mercado Livre', amount: -1500, category: null },
    ])
    await db.query(`UPDATE "Transaction" SET category = 'Compras' WHERE id = 't1'`)
    expect(await db.query('SELECT category FROM "Transaction"')).toEqual([{ category: 'Compras' }])
    db.close()
  })

  it('version 3 database gets the budget tables and keeps its rows', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    await downgradeTitle(db)
    await db.query("INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES ('a1', 'A', 0, 'BRL', 1)")
    await db.query(
      `INSERT INTO "Transaction" (id, account_id, amount, description, timestamp, is_recurring, requires_confirmation, category)
       VALUES ('t1', 'a1', -1500, 'Mercado Livre', '2026-10-01T00:00:00Z', 0, 0, 'Compras')`,
    )
    await db.query('DROP TABLE BudgetExclusion')
    await db.query('DROP TABLE Budget')
    await db.query('PRAGMA user_version = 3')
    await migrate(db)
    expect(await userVersion(db)).toBe(10)
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

  it('version 4 database: the description becomes the title, keeps its text, and the peer debts view exposes it as title', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    await downgradeTitle(db)
    await db.query("INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES ('a1', 'A', 0, 'BRL', 1)")
    await db.query("INSERT INTO Friend (id, name, public_token) VALUES ('f1', 'Ana', 'tok1')")
    await db.query(
      `INSERT INTO "Transaction" (id, account_id, type, friend_id, amount, description, timestamp, is_recurring, requires_confirmation)
       VALUES ('t1', 'a1', 'personal', NULL, -1500, 'Mercado Livre', '2026-10-01T00:00:00Z', 0, 0),
              ('t2', 'a1', 'peer', 'f1', -500, 'Pizza', '2026-10-02T00:00:00Z', 0, 0)`,
    )
    await db.query('PRAGMA user_version = 4')
    await migrate(db)
    expect(await userVersion(db)).toBe(10)
    expect(await db.query(`SELECT id, title, description FROM "Transaction" ORDER BY id`)).toEqual([
      { id: 't1', title: 'Mercado Livre', description: null },
      { id: 't2', title: 'Pizza', description: null },
    ])
    expect(await db.query('SELECT id, title FROM peer_debts')).toEqual([{ id: 't2', title: 'Pizza' }])
    await db.query("INSERT INTO TransactionLink (id, transaction_id, url) VALUES ('l1', 't1', 'https://example.com')")
    await db.query("DELETE FROM \"Transaction\" WHERE id = 't1'")
    expect(await db.query('SELECT id FROM TransactionLink')).toEqual([])
    db.close()
  })

  it('version 7 database loses the default flag and keeps its accounts', async () => {
    const db = await createTestDb({ migrate: false })
    await migrate(db)
    await dropEstimate(db)
    await db.query('ALTER TABLE Account ADD COLUMN is_default BOOLEAN')
    await db.query("INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES ('a1', 'A', 500, 'BRL', 1)")
    await db.query('PRAGMA user_version = 7')
    await migrate(db)
    expect(await userVersion(db)).toBe(10)
    expect(await db.query('SELECT id, name, current_balance FROM Account')).toEqual([{ id: 'a1', name: 'A', current_balance: 500 }])
    expect((await db.query<{ name: string }>('PRAGMA table_info(Account)')).map((c) => c.name)).not.toContain('is_default')
    db.close()
  })

  it('unrecognized database with user_version 0 throws', async () => {
    const db = await createTestDb({ migrate: false })
    await db.query('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)')
    await expect(migrate(db)).rejects.toThrow('unrecognized database')
    expect(await userVersion(db)).toBe(0)
    db.close()
  })

  it.skipIf(!process.env.CIBI_TEST_DB)('real database copy migrates to version 7 and gains the category column, the budget tables, the title rename and the links table', async () => {
    const raw = new DatabaseSync(process.env.CIBI_TEST_DB ?? '')
    const db = wrapDatabaseSync(raw)
    try {
      const versionBefore = await userVersion(db)
      const before = await schemaSnapshot(db)
      await migrate(db)
      expect(await userVersion(db)).toBe(10)
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
