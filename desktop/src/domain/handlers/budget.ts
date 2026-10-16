// Routes under /api/budget. Desktop only (no Go counterpart).
// - GET /api/budget?month=YYYY-MM: the month's budget (an absent or empty month is the current one).
// - PUT /api/budget/limits: replaces the whole limits set, answers 204.
// - POST /api/budget/exclusions: excludes a scheduled bill for one month, answers 204.
// - DELETE /api/budget/exclusions/:transactionId/:month: removes the exclusion, answers 204.
// A bad month or id is 400; a missing transaction on POST is 404; a service error is 500.

import { isValidMonth, validateLimits, type BudgetLimit } from '../budget'
import type { App } from '../app'
import { HttpError, route } from '../http'
import type { BudgetService } from '../service/budget'
import { notFoundOr500, parseIdOr400, rethrow500 } from './common'

/** The service methods the handlers use (so tests can inject fakes). */
export type BudgetServiceIface = Pick<BudgetService, 'getBudget' | 'replaceLimits' | 'addExclusion' | 'removeExclusion'>

const INVALID_MONTH = 'invalid month: use YYYY-MM'

/** Maps one element of the limits body. Never throws: validateLimits reports the bad values. */
function toLimit(raw: unknown): BudgetLimit {
  const item: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    category: typeof item.category === 'string' ? item.category : '',
    monthlyLimit: typeof item.monthlyLimit === 'number' ? item.monthlyLimit : NaN,
    isFixed: item.isFixed === undefined ? false : (item.isFixed as boolean),
  }
}

export function registerBudgetRoutes(app: App, svc: BudgetServiceIface = app.budgetSvc): void {
  route('GET', '/api/budget', async ({ query }) => {
    const raw = query.get('month') ?? ''
    const month = raw === '' ? undefined : raw
    if (month !== undefined && !isValidMonth(month)) throw new HttpError(400, INVALID_MONTH)
    return { body: await svc.getBudget(month).catch(rethrow500) }
  })

  route('PUT', '/api/budget/limits', async ({ body }) => {
    if (!Array.isArray(body)) throw new HttpError(400, 'limits must be an array')
    const limits = body.map(toLimit)
    const message = validateLimits(limits)
    if (message !== null) throw new HttpError(400, message)
    await svc.replaceLimits(limits).catch(rethrow500)
    return { status: 204 }
  })

  route('POST', '/api/budget/exclusions', async ({ body }) => {
    const req: Record<string, unknown> =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const raw = req.transactionId
    if (typeof raw !== 'string' || raw === '') throw new HttpError(400, 'transactionId is required')
    const transactionId = parseIdOr400(raw, 'invalid transactionId')
    const month = req.month
    if (typeof month !== 'string' || !isValidMonth(month)) throw new HttpError(400, INVALID_MONTH)
    await svc.addExclusion(transactionId, month).catch(notFoundOr500('transaction not found'))
    return { status: 204 }
  })

  route('DELETE', '/api/budget/exclusions/:transactionId/:month', async ({ params }) => {
    const transactionId = parseIdOr400(params.transactionId, 'invalid transactionId')
    if (!isValidMonth(params.month)) throw new HttpError(400, INVALID_MONTH)
    await svc.removeExclusion(transactionId, params.month).catch(rethrow500)
    return { status: 204 }
  })
}
