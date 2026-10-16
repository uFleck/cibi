// Port-style repo for the Category table (desktop only, migration 0007).

import type { CategoryOption } from '../categories'
import type { Db } from '../db'
import { wrap } from '../errors'
import { intCol, type Row, textCol } from './scan'

export interface CategoriesRepo {
  /** Every category in display order. */
  list(): Promise<CategoryOption[]>
  /** Adds a category at the end. */
  insert(category: CategoryOption): Promise<void>
  /**
   * Adds a custom category for every label stored on a transaction or a budget limit that has no
   * row yet (compared ignoring case). Resolves true when it added any.
   */
  adoptStrays(newId: () => string): Promise<boolean>
  /** Sets the label and description of one category. */
  update(id: string, label: string, description: string): Promise<void>
  /** Moves every transaction and budget limit from one label to another. */
  renameUsages(from: string, to: string): Promise<void>
  /** Clears the category of every transaction and removes the budget limit that use the label. */
  clearUsages(label: string): Promise<void>
  delete(id: string): Promise<void>
  /** How many transactions use each label, keyed by the lowercased, trimmed label. */
  usageCounts(): Promise<Map<string, number>>
}

export class SqliteCategoriesRepo implements CategoriesRepo {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async list(): Promise<CategoryOption[]> {
    let rows: Row[]
    try {
      rows = await this.db.query(`SELECT id, label, description FROM Category ORDER BY position, label`)
    } catch (err) {
      throw wrap('categories.List', err)
    }
    try {
      return rows.map((row) => ({
        id: textCol(row, 'id'),
        label: textCol(row, 'label'),
        description: textCol(row, 'description'),
      }))
    } catch (err) {
      throw wrap('categories.List: scan', err)
    }
  }

  async insert(category: CategoryOption): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO Category (id, label, description, position)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM Category))`,
        [category.id, category.label, category.description],
      )
    } catch (err) {
      throw wrap('categories.Insert', err)
    }
  }

  async adoptStrays(newId: () => string): Promise<boolean> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT label FROM (
           SELECT TRIM(category) AS label FROM "Transaction" WHERE category IS NOT NULL
           UNION
           SELECT TRIM(category) AS label FROM Budget
         )
         WHERE label <> '' AND LOWER(label) NOT IN (SELECT LOWER(label) FROM Category)
         ORDER BY label`,
      )
    } catch (err) {
      throw wrap('categories.AdoptStrays', err)
    }
    let adopted = false
    for (const row of rows) {
      const label = textCol(row, 'label')
      try {
        // OR IGNORE: two strays that differ only in case share one row.
        await this.db.query(
          `INSERT OR IGNORE INTO Category (id, label, description, position)
           VALUES (?, ?, '', (SELECT COALESCE(MAX(position), 0) + 1 FROM Category))`,
          [newId(), label],
        )
        adopted = true
      } catch (err) {
        throw wrap('categories.AdoptStrays', err)
      }
    }
    return adopted
  }

  async update(id: string, label: string, description: string): Promise<void> {
    try {
      await this.db.query(`UPDATE Category SET label = ?, description = ? WHERE id = ?`, [label, description, id])
    } catch (err) {
      throw wrap('categories.Update', err)
    }
  }

  async renameUsages(from: string, to: string): Promise<void> {
    try {
      await this.db.query(`UPDATE "Transaction" SET category = ? WHERE TRIM(category) = ? COLLATE NOCASE`, [to, from])
      await this.db.query(`UPDATE Budget SET category = ? WHERE TRIM(category) = ? COLLATE NOCASE`, [to, from])
    } catch (err) {
      throw wrap('categories.RenameUsages', err)
    }
  }

  async clearUsages(label: string): Promise<void> {
    try {
      await this.db.query(`UPDATE "Transaction" SET category = NULL WHERE TRIM(category) = ? COLLATE NOCASE`, [label])
      await this.db.query(`DELETE FROM Budget WHERE TRIM(category) = ? COLLATE NOCASE`, [label])
    } catch (err) {
      throw wrap('categories.ClearUsages', err)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.query(`DELETE FROM Category WHERE id = ?`, [id])
    } catch (err) {
      throw wrap('categories.Delete', err)
    }
  }

  async usageCounts(): Promise<Map<string, number>> {
    let rows: Row[]
    try {
      rows = await this.db.query(
        `SELECT LOWER(TRIM(category)) AS label, COUNT(*) AS n FROM "Transaction"
         WHERE category IS NOT NULL AND TRIM(category) <> '' GROUP BY LOWER(TRIM(category))`,
      )
    } catch (err) {
      throw wrap('categories.UsageCounts', err)
    }
    try {
      return new Map(rows.map((row) => [textCol(row, 'label'), intCol(row, 'n')]))
    } catch (err) {
      throw wrap('categories.UsageCounts: scan', err)
    }
  }
}
