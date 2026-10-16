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
import type { Transaction, UpdateTransaction } from '../repo/transactions'
import { ErrTransactionHasLedger, type TransactionsService } from '../service/transactions'
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
>

/** JSON shape of a transaction (Go: TransactionResponse). Amount is dollars. */
export interface TransactionResponse {
  id: string
  account_id: string
  type: string
  /** Present only for a transaction with a friend (Go omitempty). */
  friend_id?: string
  amount: number
  description: string
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
}

const CREATE_SCHEMA = {
  account_id: 'string',
  amount: 'float',
  description: 'string',
  category: 'stringPtr',
  is_recurring: 'bool',
  frequency: 'stringPtr',
  anchor_date: 'stringPtr',
  requires_confirmation: 'bool',
  is_installment: 'bool',
  total_installments: 'intPtr',
} as const

const CREATE_FIELDS: FieldSpec[] = [
  { goName: 'AccountID', jsonName: 'account_id', rules: 'required' },
  { goName: 'Amount', jsonName: 'amount', rules: 'required' },
  { goName: 'Description', jsonName: 'description', rules: 'required' },
]

const PATCH_SCHEMA = {
  description: 'stringPtr',
  category: 'stringPtr',
  amount: 'floatPtr',
  next_occurrence: 'stringPtr',
  total_installments: 'intPtr',
  is_installment: 'boolPtr',
  is_recurring: 'boolPtr',
  frequency: 'stringPtr',
  anchor_date: 'stringPtr',
} as const

/** Go txnToResponse. A new transaction's in-memory type is '' and is reported as 'personal'. */
export function toTransactionResponse(t: Transaction): TransactionResponse {
  const response: TransactionResponse = {
    id: t.id,
    account_id: t.accountId,
    type: t.type === '' ? 'personal' : t.type,
    amount: t.amount / 100,
    description: t.description,
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
  }
  if (t.friendId !== null) {
    response.friend_id = t.friendId
  }
  // For installment txns, compute next_occurrence from anchor + paid count.
  // Overrides stored next_occurrence (which is null for installments).
  if (t.isInstallment && t.anchorDate !== null && t.frequency !== null) {
    if (t.totalInstallments === null || t.paidInstallments < t.totalInstallments) {
      response.next_occurrence = formatDbTime(nextInstallmentDue(t.anchorDate, t.paidInstallments, t.frequency))
    }
    // When paid == total, next_occurrence stays as stored (installment complete).
  }
  return response
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

export function registerTransactionsRoutes(app: App, svc: TransactionsServiceIface = app.txnsSvc): void {
  route('GET', '/api/transactions', async ({ query }) => {
    // A missing parameter is "" in Go (c.QueryParam), which is rejected as missing.
    const raw = query.get('account_id') ?? ''
    if (raw === '') throw new HttpError(400, 'account_id query parameter is required')
    const accountId = parseIdOr400(raw, 'invalid account_id')
    const txns = await svc.listTransactions(accountId).catch(rethrow500)
    return { body: txns.map(toTransactionResponse) }
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
      description: req.description,
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
    }
    // An empty anchor_date is no anchor (Go: != "").
    if (req.anchor_date !== null && req.anchor_date !== '') {
      t.anchorDate = parseDateOr400(req.anchor_date, 'invalid anchor_date: must be RFC3339')
    }
    const created = await svc.createTransaction(t).catch(rethrow500)
    return { status: 201, body: toTransactionResponse(created) }
  })

  route('PATCH', '/api/transactions/:id', async ({ params, body }) => {
    const id = parseIdOr400(params.id, 'invalid transaction id')
    const req = bindBody(body, PATCH_SCHEMA)

    // A null pointer field is nil in Go: no change.
    const upd: UpdateTransaction = {
      description: req.description ?? undefined,
      category: req.category ?? undefined,
      totalInstallments: req.total_installments ?? undefined,
      isInstallment: req.is_installment ?? undefined,
      isRecurring: req.is_recurring ?? undefined,
      frequency: req.frequency ?? undefined,
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
    return { body: toTransactionResponse(txn) }
  })

  route('DELETE', '/api/transactions/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid transaction id')
    await svc.deleteTransaction(id).catch((err: unknown) => {
      if (isErr(err, ErrTransactionHasLedger)) throw new HttpError(409, ErrTransactionHasLedger.message)
      return notFoundOr500(NOT_FOUND)(err)
    })
    return { status: 204 }
  })

  route('POST', '/api/transactions/:id/confirm', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid transaction id')
    await svc.confirmRecurring(id).catch(notFoundOr500(NOT_FOUND))

    // Return updated transaction with new next_occurrence.
    const txn = await svc.getTransaction(id).catch(rethrow500)
    return { body: toTransactionResponse(txn) }
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
