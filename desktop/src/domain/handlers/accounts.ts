// Port of internal/handler/accounts.go (routes under /api/accounts).
//
// Money: dollars in are converted with goRound(dollars * 100); cents out are divided by 100.
// Errors (Go's echo.NewHTTPError calls):
// - a service error that is sql.ErrNoRows -> 404 with the route's not-found text;
// - any other service error -> 500 whose message is the error text itself (not the generic
//   "internal server error": these handlers send err.Error()).

import type { App } from '../app'
import { ErrNoRows, isErr, messageOf } from '../errors'
import { HttpError, route } from '../http'
import { goRound } from '../num'
import type { NewAccount } from '../repo/accounts'
import type { AccountsService } from '../service/accounts'
import { parseUuid } from '../uuid'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'

/** The service methods the handlers use (Go: AccountsServiceIface, so tests can inject fakes). */
export type AccountsServiceIface = Pick<
  AccountsService,
  | 'listAccounts'
  | 'createAccount'
  | 'getById'
  | 'updateAccount'
  | 'deleteAccount'
>

/** JSON shape of an account (Go: AccountResponse). */
export interface AccountResponse {
  id: string
  name: string
  current_balance: number
  currency: string
  safety_buffer: number
}

const CREATE_SCHEMA = {
  name: 'string',
  current_balance: 'float',
  currency: 'string',
  safety_buffer: 'float',
} as const

const CREATE_FIELDS: FieldSpec[] = [
  { goName: 'Name', jsonName: 'name', rules: 'required' },
  { goName: 'Currency', jsonName: 'currency', rules: 'required' },
]

const PATCH_SCHEMA = {
  name: 'stringPtr',
  current_balance: 'floatPtr',
  safety_buffer: 'floatPtr',
} as const

export function toAccountResponse(a: NewAccount): AccountResponse {
  return {
    id: a.id,
    name: a.name,
    current_balance: a.currentBalance / 100,
    currency: a.currency,
    safety_buffer: a.safetyBuffer / 100,
  }
}

/** Go: echo.NewHTTPError(500, err.Error()). */
function serverError(err: unknown): HttpError {
  return new HttpError(500, messageOf(err))
}

function rethrow500(err: unknown): never {
  throw serverError(err)
}

/** Maps sql.ErrNoRows to 404 with the given text, anything else to a 500. */
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

export function registerAccountsRoutes(app: App, svc: AccountsServiceIface = app.accountsSvc): void {
  route('GET', '/api/accounts', async () => {
    const accs = await svc.listAccounts().catch(rethrow500)
    return { body: accs.map(toAccountResponse) }
  })

  route('POST', '/api/accounts', async ({ body }) => {
    const req = bindBody(body, CREATE_SCHEMA)
    validateOrThrow('CreateAccountRequest', req, CREATE_FIELDS)
    // The response is built from the request values, not from the stored row: the service
    // replaces a safety buffer of 0 in the row, but the response still shows 0 (as in Go).
    const acc: NewAccount = {
      id: crypto.randomUUID(),
      name: req.name,
      currentBalance: goRound(req.current_balance * 100),
      currency: req.currency,
      safetyBuffer: goRound(req.safety_buffer * 100),
    }
    await svc.createAccount(acc).catch(rethrow500)
    return { status: 201, body: toAccountResponse(acc) }
  })

  route('GET', '/api/accounts/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid account id')
    const acc = await svc.getById(id).catch(notFoundOr500('account not found'))
    return { body: toAccountResponse(acc) }
  })

  route('PATCH', '/api/accounts/:id', async ({ params, body }) => {
    const id = parseIdOr400(params.id, 'invalid account id')
    const req = bindBody(body, PATCH_SCHEMA)
    // A null (or absent) field is nil in Go: no change.
    const balance = req.current_balance === null ? undefined : goRound(req.current_balance * 100)
    const safetyBuffer = req.safety_buffer === null ? undefined : goRound(req.safety_buffer * 100)
    await svc
      .updateAccount(id, req.name ?? undefined, balance, safetyBuffer)
      .catch(notFoundOr500('account not found'))
    // Returns the account as it is after the update.
    const acc = await svc.getById(id).catch(notFoundOr500('account not found'))
    return { body: toAccountResponse(acc) }
  })

  route('DELETE', '/api/accounts/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid account id')
    await svc.deleteAccount(id).catch(notFoundOr500('account not found'))
    return { status: 204 }
  })
}
