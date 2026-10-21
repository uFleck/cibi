// Port of internal/handler/transactions.go (routes under /api/transactions).
//
// Money: dollars in are converted with goRound(dollars * 100); cents out are divided by 100.
// Dates: request dates are RFC3339 (strict, as Go's time.Parse(time.RFC3339)). Response dates are
// RFC3339 in UTC with whole seconds. For an installment that is not complete, next_occurrence is
// computed from anchor_date and paid_installments (engine.NextInstallmentDue), overriding the stored value.
// Errors (Go's echo.NewHTTPError calls):
// - a bad id, a bad account_id, a missing account_id, a bad date: 400 with the route's text;
// - a repo ErrNoRows: 404 "transaction not found" (Update, Delete, Confirm, ConfirmInstallment);
// - a service error: 500 with the error text (Create, Update, Delete, Confirm, List);
// - Delete of a transaction that has a ledger row: 409 (deliberate fix; Go returned 500 on the FK error);
//   ConfirmInstallment maps a service error other than ErrNoRows to 400 with the error text.
// - Create's validation errors are 400 with the validator text.

import type { App } from '../app'
import { formatDbTime, parseRfc3339 } from '../dates'
import { nextInstallmentDue } from '../engine/installment'
import { ErrNoRows, isErr, messageOf } from '../errors'
import { HttpError, route } from '../http'
import { goRound } from '../num'
import type { Transaction, TransactionLink, UpdateTransaction } from '../repo/transactions'
import type { EstimateService } from '../service/estimate'
import type { TransactionsService } from '../service/transactions'
import { parseUuid } from '../uuid'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'

/** The service methods the handlers use (Go: TransactionsServiceIface, so tests can inject fakes). */
export type TransactionsServiceIface = Pick<
  TransactionsService,
  | 'listTransactions'
  | 'createTransaction'
  | 'getTransaction'
  | 'updateTransaction'
  | 'deleteTransaction'
  | 'confirmRecurring'
  | 'confirmInstallment'
  | 'postponeRecurring'
  | 'skipInstallment'
>

/** JSON shape of a transaction (Go: TransactionResponse). Amount is dollars. */
export interface TransactionResponse {
  id: string
  account_id: string
  type: string
  /** Present only for a transaction with a friend (Go omitempty). */
  friend_id?: string
  amount: number
  title: string
  description: string | null
  links: TransactionLink[]
  timestamp: string
  is_recurring: boolean
  frequency: string | null
  anchor_date: string | null
  next_occurrence: string | null
  requires_confirmation: boolean
  confirmed_at: string | null
  is_installment: boolean
  total_installments: number | null
  paid_installments: number
  category: string | null
  /** 'category' or 'keyword' for an amount estimated from history; null for a fixed amount. */
  estimate_source: string | null
  estimate_key: string | null
  /** Dollars. The current estimate of a variable transaction (its stored amount while there is no history); null when fixed. */
  estimated_amount: number | null
  /** How many past payments the estimate comes from; null when fixed. */
  estimate_samples: number | null
  /** Not sure it will be paid: left out of every forecast. */
  is_uncertain: boolean
  /** Bought as needed, with a budget per calendar month. */
  is_as_needed: boolean
  /** Dollars, negative. An as-needed bill's budget for this month; null for other bills. */
  month_budget: number | null
  /** Dollars, negative or 0. What an as-needed bill was paid this month; null for other bills. */
  month_spent: number | null
}

/** The estimator the handlers use to fill in estimated_amount and the month budget (so tests can inject a fake). */
export type EstimatorIface = Pick<EstimateService, 'estimate' | 'monthBudget'>

const CREATE_SCHEMA = {
  account_id: 'string',
  amount: 'float',
  title: 'string',
  description: 'stringPtr',
  links: 'array',
  category: 'stringPtr',
  is_recurring: 'bool',
  frequency: 'stringPtr',
  anchor_date: 'stringPtr',
  requires_confirmation: 'bool',
  is_installment: 'bool',
  total_installments: 'intPtr',
  estimate_source: 'stringPtr',
  estimate_key: 'stringPtr',
  is_uncertain: 'bool',
  is_as_needed: 'bool',
} as const

const CREATE_FIELDS: FieldSpec[] = [
  { goName: 'AccountID', jsonName: 'account_id', rules: 'required' },
  { goName: 'Amount', jsonName: 'amount', rules: 'required' },
  { goName: 'Title', jsonName: 'title', rules: 'required' },
]

const PATCH_SCHEMA = {
  title: 'stringPtr',
  description: 'stringPtr',
  links: 'array',
  category: 'stringPtr',
  amount: 'floatPtr',
  next_occurrence: 'stringPtr',
  total_installments: 'intPtr',
  is_installment: 'boolPtr',
  is_recurring: 'boolPtr',
  frequency: 'stringPtr',
  anchor_date: 'stringPtr',
  estimate_source: 'stringPtr',
  estimate_key: 'stringPtr',
  is_uncertain: 'boolPtr',
  is_as_needed: 'boolPtr',
} as const

const CONFIRM_SCHEMA = {
  amount: 'floatPtr',
} as const

/** Go txnToResponse. A new transaction's in-memory type is '' and is reported as 'personal'. */
export function toTransactionResponse(t: Transaction): TransactionResponse {
  const response: TransactionResponse = {
    id: t.id,
    account_id: t.accountId,
    type: t.type === '' ? 'personal' : t.type,
    amount: t.amount / 100,
    title: t.title,
    description: t.description,
    links: t.links.map((link) => ({ url: link.url, label: link.label })),
    category: t.category,
    timestamp: formatDbTime(t.timestamp),
    is_recurring: t.isRecurring,
    frequency: t.frequency,
    anchor_date: t.anchorDate === null ? null : formatDbTime(t.anchorDate),
    next_occurrence: t.nextOccurrence === null ? null : formatDbTime(t.nextOccurrence),
    requires_confirmation: t.requiresConfirmation,
    confirmed_at: t.confirmedAt === null ? null : formatDbTime(t.confirmedAt),
    is_installment: t.isInstallment,
    total_installments: t.totalInstallments,
    paid_installments: t.paidInstallments,
    estimate_source: t.estimateSource,
    estimate_key: t.estimateKey,
    estimated_amount: null,
    estimate_samples: null,
    is_uncertain: t.isUncertain,
    is_as_needed: t.isAsNeeded,
    month_budget: null,
    month_spent: null,
  }
  if (t.friendId !== null) {
    response.friend_id = t.friendId
  }
  // For installment txns, compute next_occurrence from anchor + paid count.
  // Overrides stored next_occurrence (which is null for installments).
  if (t.isInstallment && t.anchorDate !== null && t.frequency !== null) {
    if (t.totalInstallments === null || t.paidInstallments < t.totalInstallments) {
      response.next_occurrence = formatDbTime(nextInstallmentDue(t.anchorDate, t.paidInstallments + t.skippedInstallments, t.frequency))
    }
    // When paid == total, next_occurrence stays as stored (installment complete).
  }
  return response
}

/** The response for a transaction, with the current estimate filled in when its amount is variable. */
async function withEstimate(t: Transaction, estimator: EstimatorIface): Promise<TransactionResponse> {
  const response = toTransactionResponse(t)
  const estimate = await estimator.estimate(t)
  if (estimate !== null) {
    response.estimated_amount = estimate.amount / 100
    response.estimate_samples = estimate.samples
  }
  if (t.isAsNeeded) {
    const month = await estimator.monthBudget(t)
    response.month_budget = month.budget / 100
    response.month_spent = month.spent / 100
    response.estimate_samples = month.samples
  }
  return response
}

/** The links of a request body. Each needs an http or https url; a label is optional. Null when the key is absent. */
function parseLinks(raw: unknown[] | null): TransactionLink[] | null {
  if (raw === null) return null
  return raw.map((item) => {
    const entry = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
    const url = typeof entry.url === 'string' ? entry.url.trim() : ''
    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    let valid = false
    try {
      const protocol = new URL(url).protocol
      valid = protocol === 'http:' || protocol === 'https:'
    } catch {
      valid = false
    }
    if (!valid) throw new HttpError(400, 'invalid link: url must start with http:// or https://')
    return { url, label: label === '' ? null : label }
  })
}

/** Go: echo.NewHTTPError(500, err.Error()). */
function serverError(err: unknown): HttpError {
  return new HttpError(500, messageOf(err))
}

function rethrow500(err: unknown): never {
  throw serverError(err)
}

/** Maps sql.ErrNoRows to 404 with the given text, anything else to a 500 with the error text. */
function notFoundOr500(notFound: string): (err: unknown) => never {
  return (err: unknown): never => {
    if (isErr(err, ErrNoRows)) throw new HttpError(404, notFound)
    throw serverError(err)
  }
}

/** Parses a path or query id; a malformed id is a 400 with the route's text. */
function parseIdOr400(raw: string, message: string): string {
  try {
    return parseUuid(raw)
  } catch {
    throw new HttpError(400, message)
  }
}

/** Parses an RFC3339 date from the body; any failure is a 400 with the route's text. */
function parseDateOr400(raw: string, message: string): Date {
  try {
    return parseRfc3339(raw)
  } catch {
    throw new HttpError(400, message)
  }
}

const NOT_FOUND = 'transaction not found'

export function registerTransactionsRoutes(
  app: App,
  svc: TransactionsServiceIface = app.txnsSvc,
  estimator: EstimatorIface = app.estimateSvc,
): void {
  route('GET', '/api/transactions', async ({ query }) => {
    // A missing parameter is "" in Go (c.QueryParam), which is rejected as missing.
    const raw = query.get('account_id') ?? ''
    if (raw === '') throw new HttpError(400, 'account_id query parameter is required')
    const accountId = parseIdOr400(raw, 'invalid account_id')
    const txns = await svc.listTransactions(accountId).catch(rethrow500)
    return { body: await Promise.all(txns.map((t) => withEstimate(t, estimator))).catch(rethrow500) }
  })

  route('POST', '/api/transactions', async ({ body }) => {
    const req = bindBody(body, CREATE_SCHEMA)
    validateOrThrow('CreateTransactionRequest', req, CREATE_FIELDS)
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    const t: Transaction = {
      id: crypto.randomUUID(),
      accountId,
      type: '',
      friendId: null,
      amount: goRound(req.amount * 100),
      title: req.title,
      description: req.description,
      links: parseLinks(req.links) ?? [],
      category: req.category,
      timestamp: new Date(),
      isRecurring: req.is_recurring,
      frequency: req.frequency,
      anchorDate: null,
      nextOccurrence: null,
      requiresConfirmation: req.requires_confirmation,
      confirmedAt: null,
      isInstallment: req.is_installment,
      totalInstallments: req.total_installments,
      paidInstallments: 0,
      skippedInstallments: 0,
      estimateSource: req.estimate_source,
      estimateKey: req.estimate_key,
      isUncertain: req.is_uncertain,
      isAsNeeded: req.is_as_needed,
    }
    // An empty anchor_date is no anchor (Go: != "").
    if (req.anchor_date !== null && req.anchor_date !== '') {
      t.anchorDate = parseDateOr400(req.anchor_date, 'invalid anchor_date: must be RFC3339')
    }
    const created = await svc.createTransaction(t).catch(rethrow500)
    return { status: 201, body: await withEstimate(created, estimator).catch(rethrow500) }
  })

  route('PATCH', '/api/transactions/:id', async ({ params, body }) => {
    const id = parseIdOr400(params.id, 'invalid transaction id')
    const req = bindBody(body, PATCH_SCHEMA)

    // A null pointer field is nil in Go: no change.
    const upd: UpdateTransaction = {
      title: req.title ?? undefined,
      description: req.description ?? undefined,
      links: parseLinks(req.links) ?? undefined,
      category: req.category ?? undefined,
      totalInstallments: req.total_installments ?? undefined,
      isInstallment: req.is_installment ?? undefined,
      isRecurring: req.is_recurring ?? undefined,
      frequency: req.frequency ?? undefined,
      isUncertain: req.is_uncertain ?? undefined,
      isAsNeeded: req.is_as_needed ?? undefined,
    }
    // An empty source and key make the amount fixed again.
    if (req.estimate_source !== null || req.estimate_key !== null) {
      upd.estimateSource = req.estimate_source ?? ''
      upd.estimateKey = req.estimate_key ?? ''
    }
    // Convert dollars to stored value if provided.
    if (req.amount !== null) {
      upd.amount = goRound(req.amount * 100)
    }
    if (req.next_occurrence !== null) {
      upd.nextOccurrence = parseDateOr400(req.next_occurrence, 'invalid next_occurrence: must be RFC3339')
    }
    if (req.anchor_date !== null) {
      upd.anchorDate = parseDateOr400(req.anchor_date, 'invalid anchor_date: must be RFC3339')
    }

    await svc.updateTransaction(id, upd).catch(notFoundOr500(NOT_FOUND))

    // Return updated transaction.
    const txn = await svc.getTransaction(id).catch(notFoundOr500(NOT_FOUND))
    return { body: await withEstimate(txn, estimator).catch(rethrow500) }
  })

  route('DELETE', '/api/transactions/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid transaction id')
    await svc.deleteTransaction(id).catch(notFoundOr500(NOT_FOUND))
    return { status: 204 }
  })

  route('POST', '/api/transactions/:id/confirm', async ({ params, body }) => {
    const id = parseIdOr400(params.id, 'invalid transaction id')
    const req = bindBody(body, CONFIRM_SCHEMA)
    // The amount is what a variable transaction really cost, in signed dollars like every amount.
    const cents = req.amount === null ? undefined : goRound(req.amount * 100)
    await svc.confirmRecurring(id, cents).catch(notFoundOr500(NOT_FOUND))

    // Return updated transaction with new next_occurrence.
    const txn = await svc.getTransaction(id).catch(rethrow500)
    return { body: await withEstimate(txn, estimator).catch(rethrow500) }
  })

  // Skips one occurrence of a recurring bill: next_occurrence moves on, the balance stays.
  route('POST', '/api/transactions/:id/skip', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid transaction id')
    const current = await svc.getTransaction(id).catch(notFoundOr500(NOT_FOUND))
    await (current.isInstallment ? svc.skipInstallment(id) : svc.postponeRecurring(id)).catch((err: unknown) => {
      if (isErr(err, ErrNoRows)) throw new HttpError(404, NOT_FOUND)
      throw new HttpError(400, messageOf(err))
    })
    const txn = await svc.getTransaction(id).catch(rethrow500)
    return { body: await withEstimate(txn, estimator).catch(rethrow500) }
  })

  route('POST', '/api/transactions/:id/confirm-installment', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid transaction id')
    await svc.confirmInstallment(id).catch((err: unknown) => {
      if (isErr(err, ErrNoRows)) throw new HttpError(404, NOT_FOUND)
      throw new HttpError(400, messageOf(err))
    })

    const txn = await svc.getTransaction(id).catch(rethrow500)
    return { body: toTransactionResponse(txn) }
  })
}
