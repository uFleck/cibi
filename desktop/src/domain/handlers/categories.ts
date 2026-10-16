// Routes under /api/categories. Desktop only (no Go counterpart).
// - GET /api/categories: the categories in display order.
// - GET /api/categories/details: the same with the number of transactions that use each.
// - POST /api/categories {label, description}: adds one, answers 201 with it.
// - PUT /api/categories/:id {label, description}: edits one. A new label moves the category's
//   transactions and budget limit to it. Answers the edited category.
// - DELETE /api/categories/:id: removes one; its transactions become uncategorized and its
//   budget limit is removed. Answers 204.
// - GET /api/categories/suggest?title=&description=: the classifier's confident suggestion, or null.
// - POST /api/categories/backfill: categorizes uncategorized expenses and reports the counts.
// A bad body or text is 400, a name another category has is 409, an unknown id is 404.

import type { App } from '../app'
import { ErrNoRows, isErr, messageOf } from '../errors'
import { HttpError, route } from '../http'
import { ErrCategoryExists, type CategoriesService } from '../service/categories'
import { bindBody } from './bind'

export type CategoriesServiceIface = Pick<
  CategoriesService,
  'list' | 'listDetails' | 'create' | 'update' | 'delete' | 'suggest' | 'backfill'
>

const BODY_SCHEMA = { label: 'string', description: 'string' } as const

/** A taken name is a 409, an unknown id a 404, any other service error a 400 with its text. */
function categoryError(err: unknown): never {
  if (isErr(err, ErrCategoryExists)) throw new HttpError(409, messageOf(err))
  if (isErr(err, ErrNoRows)) throw new HttpError(404, 'category not found')
  throw new HttpError(400, messageOf(err))
}

export function registerCategoriesRoutes(app: App, svc: CategoriesServiceIface = app.categoriesSvc): void {
  route('GET', '/api/categories', async () => ({ body: await svc.list() }))

  route('GET', '/api/categories/details', async () => ({ body: await svc.listDetails() }))

  route('POST', '/api/categories', async ({ body }) => {
    const req = bindBody(body, BODY_SCHEMA)
    return { status: 201, body: await svc.create(req).catch(categoryError) }
  })

  route('GET', '/api/categories/suggest', async ({ query }) => {
    return { body: await svc.suggest(query.get('title') ?? '', query.get('description')) }
  })

  route('POST', '/api/categories/backfill', async () => ({ body: await svc.backfill() }))

  route('PUT', '/api/categories/:id', async ({ params, body }) => {
    const req = bindBody(body, BODY_SCHEMA)
    return { body: await svc.update(params.id, req).catch(categoryError) }
  })

  route('DELETE', '/api/categories/:id', async ({ params }) => {
    await svc.delete(params.id).catch(categoryError)
    return { status: 204 }
  })
}
