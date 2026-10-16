// Routes under /api/categories. Desktop only (no Go counterpart).
// - GET /api/categories: the default categories, then the custom values already in use.
// - GET /api/categories/suggest?title=&description=: the classifier's confident suggestion, or null.
// - POST /api/categories/backfill: categorizes uncategorized expenses and reports the counts.

import type { App } from '../app'
import { route } from '../http'
import type { CategoriesService } from '../service/categories'

export type CategoriesServiceIface = Pick<CategoriesService, 'list' | 'suggest' | 'backfill'>

export function registerCategoriesRoutes(app: App, svc: CategoriesServiceIface = app.categoriesSvc): void {
  route('GET', '/api/categories', async () => ({ body: await svc.list() }))

  route('GET', '/api/categories/suggest', async ({ query }) => {
    return { body: await svc.suggest(query.get('title') ?? '', query.get('description')) }
  })

  route('POST', '/api/categories/backfill', async () => ({ body: await svc.backfill() }))
}
