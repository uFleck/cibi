// Category management, suggestions and the backfill of uncategorized expenses.

import type { Db } from '../db'
import { AppError, ErrNoRows, wrap, wrapping } from '../errors'
import { normalizeCategory, type CategoryOption } from '../categories'
import { classificationText, getClassifier, suggestCategory, type Classification } from '../classifier'
import type { CategoriesRepo } from '../repo/categories'
import type { TransactionsRepo } from '../repo/transactions'
import { UNCATEGORIZED } from '../budget'

export const MAX_LABEL_LENGTH = 60
export const MAX_DESCRIPTION_LENGTH = 500

/** A category with the label already taken (ignoring case), or the reserved Uncategorized label. */
export const ErrCategoryExists = new AppError('a category with this name already exists')

/** A category as the management page shows it. */
export interface CategoryDetails extends CategoryOption {
  /** How many transactions use it. */
  usage: number
}

export interface CategoryInput {
  label: string
  description: string
}

const WRITE_BATCH = 50

function newCustomId(): string {
  return `custom-${crypto.randomUUID()}`
}

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
  private readonly repo: CategoriesRepo
  private readonly txnsRepo: TransactionsRepo

  constructor(db: Db, repo: CategoriesRepo, txnsRepo: TransactionsRepo) {
    this.db = db
    this.repo = repo
    this.txnsRepo = txnsRepo
  }

  /** The categories in display order. A label already on a transaction or budget limit gets a row. */
  list(): Promise<CategoryOption[]> {
    return wrapping('service.ListCategories', () => this.listOptions())
  }

  /** The categories with the number of transactions that use each. */
  listDetails(): Promise<CategoryDetails[]> {
    return wrapping('service.ListCategoryDetails', async () => {
      const options = await this.listOptions()
      const usage = await this.repo.usageCounts()
      return options.map((o) => ({ ...o, usage: usage.get(o.label.toLowerCase()) ?? 0 }))
    })
  }

  create(input: CategoryInput): Promise<CategoryOption> {
    return wrapping('service.CreateCategory', () =>
      this.db.tx(async () => {
        await this.repo.adoptStrays(newCustomId)
        const next = await this.validated(input, null)
        const category = { id: newCustomId(), ...next }
        await this.repo.insert(category)
        return category
      }),
    )
  }

  /** Renaming moves the category's transactions and budget limit to the new name. Rejects with ErrNoRows for an unknown id. */
  update(id: string, input: CategoryInput): Promise<CategoryOption> {
    return wrapping('service.UpdateCategory', () =>
      this.db.tx(async () => {
        await this.repo.adoptStrays(newCustomId)
        const current = (await this.repo.list()).find((c) => c.id === id)
        if (current === undefined) throw ErrNoRows
        const next = await this.validated(input, current)
        await this.repo.update(id, next.label, next.description)
        if (next.label !== current.label) await this.repo.renameUsages(current.label, next.label)
        return { id, ...next }
      }),
    )
  }

  /** Its transactions become uncategorized and its budget limit is removed. Rejects with ErrNoRows for an unknown id. */
  delete(id: string): Promise<void> {
    return wrapping('service.DeleteCategory', () =>
      this.db.tx(async () => {
        const current = (await this.repo.list()).find((c) => c.id === id)
        if (current === undefined) throw ErrNoRows
        await this.repo.clearUsages(current.label)
        await this.repo.delete(id)
      }),
    )
  }

  private async listOptions(): Promise<CategoryOption[]> {
    await this.repo.adoptStrays(newCustomId)
    return this.repo.list()
  }

  /** The trimmed input, or an error for a blank or long text and a name another category has. */
  private async validated(input: CategoryInput, current: CategoryOption | null): Promise<CategoryInput> {
    const label = normalizeCategory(input.label)
    if (label === null) throw new AppError('category name is required')
    if (label.length > MAX_LABEL_LENGTH) throw new AppError(`category name must be at most ${MAX_LABEL_LENGTH} characters`)
    const description = input.description.trim()
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new AppError(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`)
    }
    const key = label.toLowerCase()
    const taken =
      key === UNCATEGORIZED.toLowerCase() ||
      (await this.repo.list()).some((c) => c.id !== current?.id && c.label.toLowerCase() === key)
    if (taken) throw wrap(`"${label}"`, ErrCategoryExists)
    return { label, description }
  }

  suggest(title: string, description?: string | null): Promise<Classification | null> {
    return wrapping('service.SuggestCategory', async () =>
      suggestCategory(classificationText(title, description), await this.listOptions()),
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
      const options = await this.listOptions()
      const rows = await this.txnsRepo.listUncategorized()
      const hits: { id: string; category: string }[] = []
      for (const row of rows) {
        const hit = await suggestCategory(classificationText(row.title, row.description), options)
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
