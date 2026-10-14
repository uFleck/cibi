// Helpers shared by the friend, peer debt and group event handlers. Each one is the Go code
// that the handlers repeat: an id parsed from the path or query, the account_id query check, and
// the two error mappings (a service error is a 500 with its text; sql.ErrNoRows is a 404).

import { isErr, messageOf, ErrNoRows } from '../errors'
import { HttpError } from '../http'
import { parseUuid } from '../uuid'

/** Go: echo.NewHTTPError(500, err.Error()). */
export function serverError(err: unknown): HttpError {
  return new HttpError(500, messageOf(err))
}

/** Rethrows a service error as a 500 with its text. */
export function rethrow500(err: unknown): never {
  throw serverError(err)
}

/** Maps sql.ErrNoRows to 404 with the given text, anything else to a 500 with the error text. */
export function notFoundOr500(notFound: string): (err: unknown) => never {
  return (err: unknown): never => {
    if (isErr(err, ErrNoRows)) throw new HttpError(404, notFound)
    throw serverError(err)
  }
}

/** Parses a path or query id; a malformed id is a 400 with the route's text. */
export function parseIdOr400(raw: string, message: string): string {
  try {
    return parseUuid(raw)
  } catch {
    throw new HttpError(400, message)
  }
}

/**
 * The required account_id query parameter. A missing parameter is "" in Go (c.QueryParam), and
 * both a missing and an empty one are rejected as missing.
 */
export function queryAccountId(query: URLSearchParams): string {
  const raw = query.get('account_id') ?? ''
  if (raw === '') throw new HttpError(400, 'account_id query parameter is required')
  return parseIdOr400(raw, 'invalid account_id')
}
