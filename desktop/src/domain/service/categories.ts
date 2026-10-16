// Category listing, suggestions and the backfill of uncategorized expenses.

import type { Db } from '../db'
import { wrapping } from '../errors'
import { categoryOptions, type CategoryOption } from '../categories'
import { getClassifier, suggestCategory, type Classification } from '../classifier'
import type { TransactionsRepo } from '../repo/transactions'

const WRITE_BATCH = 50

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

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
   * first, outside any transaction, and yields to the event loop between rows so the UI stays
   * responsive. The writes go in short transactions of WRITE_BATCH rows. A row a user categorizes
   * meanwhile is left as the user set it.
   */
  backfill(): Promise<BackfillResult> {
    return wrapping('service.BackfillCategories', async () => {
      getClassifier().warm?.()
      const options = await this.list()
      const rows = await this.txnsRepo.listUncategorized()
      const hits: { id: string; category: string }[] = []
      for (const row of rows) {
        const hit = await suggestCategory(row.description, options)
        if (hit !== null) hits.push({ id: row.id, category: hit.category })
        await yieldToEventLoop()
      }
      let categorized = 0
      for (let start = 0; start < hits.length; start += WRITE_BATCH) {
        await this.db.tx(async () => {
          for (const hit of hits.slice(start, start + WRITE_BATCH)) {
            if (await this.txnsRepo.setCategoryIfBlank(hit.id, hit.category)) categorized++
          }
        })
        await yieldToEventLoop()
      }
      return { scanned: rows.length, categorized, skipped: rows.length - categorized }
    })
  }
}
