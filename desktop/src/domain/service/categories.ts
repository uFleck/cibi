// Category listing, suggestions and the backfill of uncategorized expenses.

import type { Db } from '../db'
import { wrapping } from '../errors'
import { categoryOptions, type CategoryOption } from '../categories'
import { suggestCategory, type Classification } from '../classifier'
import type { TransactionsRepo } from '../repo/transactions'

export interface BackfillResult {
  /** Uncategorized expenses the classifier looked at. */
  scanned: number
  categorized: number
  /** Scanned rows the classifier left uncategorized (no confident match). */
  skipped: number
}

export class CategoriesService {
  private readonly db: Db
  private readonly txnsRepo: TransactionsRepo

  constructor(db: Db, txnsRepo: TransactionsRepo) {
    this.db = db
    this.txnsRepo = txnsRepo
  }

  /** The default categories, then the custom values already in use. */
  list(): Promise<CategoryOption[]> {
    return wrapping('service.ListCategories', async () =>
      categoryOptions(await this.txnsRepo.distinctCategories()),
    )
  }

  suggest(description: string): Promise<Classification | null> {
    return wrapping('service.SuggestCategory', async () =>
      suggestCategory(description, await this.list()),
    )
  }

  /**
   * Categorizes the uncategorized expenses the classifier is confident about. The classifier runs
   * first, outside the transaction; the transaction only holds the writes. A row a user categorizes
   * meanwhile is left as the user set it.
   */
  backfill(): Promise<BackfillResult> {
    return wrapping('service.BackfillCategories', async () => {
      const options = await this.list()
      const rows = await this.txnsRepo.listUncategorized()
      const hits: { id: string; category: string }[] = []
      for (const row of rows) {
        const hit = await suggestCategory(row.description, options)
        if (hit !== null) hits.push({ id: row.id, category: hit.category })
      }
      let categorized = 0
      await this.db.tx(async () => {
        for (const hit of hits) {
          if (await this.txnsRepo.setCategoryIfBlank(hit.id, hit.category)) categorized++
        }
      })
      return { scanned: rows.length, categorized, skipped: rows.length - categorized }
    })
  }
}
