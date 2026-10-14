// Port of internal/handler/ledger.go (routes under /api/ledger).
//
// Errors (Go):
// - Service errors are returned raw, so the error handler sends 500 "internal server error".
// - RecordIncome's validation error is returned raw too: 500 "internal server error", not 400.
//   The validator text is still computed as in Go, and then thrown as a plain Error.

import type { App } from '../app'
import { HttpError, route } from '../http'
import type { LedgerEntry } from '../repo/ledger'
import type { LedgerService } from '../service/ledger'
import { parseUuid } from '../uuid'
import { validateStruct, type FieldSpec } from '../validate'
import { bindBody } from './bind'
import { formatDbTime } from '../dates'

/** The service methods the handlers use (Go: the concrete *service.LedgerService). */
export type LedgerServiceIface = Pick<LedgerService, 'list' | 'delete' | 'recordIncome'>

/** JSON shape of a ledger entry (Go: LedgerEntryResponse). Amounts are dollars. */
export interface LedgerEntryResponse {
  id: string
  account_id: string
  transaction_id: string | null
  pay_schedule_id: string | null
  entry_type: string
  amount: number
  description: string
  posted_at: string
}

const INCOME_SCHEMA = {
  account_id: 'string',
  pay_schedule_id: 'string',
  amount: 'int',
  description: 'string',
} as const

const INCOME_FIELDS: FieldSpec[] = [
  { goName: 'AccountID', jsonName: 'account_id', rules: 'required' },
  { goName: 'PayScheduleID', jsonName: 'pay_schedule_id', rules: 'required' },
  { goName: 'Amount', jsonName: 'amount', rules: 'required' },
  { goName: 'Description', jsonName: 'description', rules: 'required' },
]

export function toLedgerEntryResponse(e: LedgerEntry): LedgerEntryResponse {
  return {
    id: e.id,
    account_id: e.accountId,
    transaction_id: e.transactionId,
    pay_schedule_id: e.payScheduleId,
    entry_type: e.entryType,
    amount: e.amount / 100,
    description: e.description,
    posted_at: formatDbTime(e.postedAt),
  }
}

function parseIdOr400(raw: string, message: string): string {
  try {
    return parseUuid(raw)
  } catch {
    throw new HttpError(400, message)
  }
}

export function registerLedgerRoutes(app: App, svc: LedgerServiceIface = app.ledgerSvc): void {
  route('GET', '/api/ledger', async ({ query }) => {
    // A missing parameter is "" in Go (c.QueryParam), which fails to parse.
    const accountId = parseIdOr400(query.get('account_id') ?? '', 'invalid account_id')
    const entries = await svc.list(accountId)
    return { body: entries.map(toLedgerEntryResponse) }
  })

  route('DELETE', '/api/ledger/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid id')
    await svc.delete(id)
    return { status: 204 }
  })

  route('POST', '/api/ledger/income', async ({ body }) => {
    const req = bindBody(body, INCOME_SCHEMA)
    const failure = validateStruct('RecordIncomeRequest', req, INCOME_FIELDS)
    if (failure !== null) throw new Error(failure)
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    const payScheduleId = parseIdOr400(req.pay_schedule_id, 'invalid pay_schedule_id')
    await svc.recordIncome(accountId, payScheduleId, req.amount, req.description)
    return { status: 201 }
  })
}
