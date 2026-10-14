// Port of internal/handler/pay_schedule.go (routes under /api/pay-schedule).
//
// Money: dollars in are converted with goRound(dollars * 100); cents out are divided by 100.
// Dates: anchor_date is YYYY-MM-DD (parsed as UTC midnight). anchor_date and next_payday in the
// response are formatted as YYYY-MM-DD in UTC.
// Errors (Go's echo.NewHTTPError calls):
// - a bad account_id or schedule id: 400 with the route's text;
// - a bad anchor_date: 400 "invalid anchor_date format, use YYYY-MM-DD";
// - a service error is 500 with the error text itself (not the generic message), except that
//   Confirm maps sql.ErrNoRows to 404 "schedule not found".
// The Go handler also holds an account service, which none of its methods use: it is not ported.

import type { App } from '../app'
import { formatYmd, parseYmd } from '../dates'
import { nextPayday } from '../engine/engine'
import { ErrNoRows, isErr, messageOf } from '../errors'
import { HttpError, route } from '../http'
import { goRound } from '../num'
import type { PaySchedule } from '../repo/paySchedule'
import type { PayScheduleService } from '../service/paySchedule'
import { parseUuid } from '../uuid'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'

/** The service methods the handlers use (Go: PayScheduleServiceIface, so tests can inject fakes). */
export type PayScheduleServiceIface = Pick<
  PayScheduleService,
  'createPaySchedule' | 'listPaySchedules' | 'updatePaySchedule' | 'deletePaySchedule' | 'confirmPayday'
>

/** JSON shape of a pay schedule (Go: PayScheduleResponse). Amount is dollars. */
export interface PayScheduleResponse {
  id: string
  account_id: string
  frequency: string
  anchor_date: string
  next_payday: string
  amount: number
  day_of_month_2: number | null
  label: string | null
}

const CREATE_SCHEMA = {
  account_id: 'string',
  frequency: 'string',
  anchor_date: 'string',
  day_of_month_2: 'intPtr',
  label: 'stringPtr',
  amount: 'float',
} as const

const CREATE_FIELDS: FieldSpec[] = [
  { goName: 'AccountID', jsonName: 'account_id', rules: 'required' },
  { goName: 'Frequency', jsonName: 'frequency', rules: 'required,oneof=weekly bi-weekly semi-monthly monthly' },
  { goName: 'AnchorDate', jsonName: 'anchor_date', rules: 'required' },
  { goName: 'Amount', jsonName: 'amount', rules: 'min=0' },
]

const PATCH_SCHEMA = {
  frequency: 'string',
  anchor_date: 'string',
  day_of_month_2: 'intPtr',
  label: 'stringPtr',
  amount: 'float',
} as const

const PATCH_FIELDS: FieldSpec[] = [
  { goName: 'Frequency', jsonName: 'frequency', rules: 'required,oneof=weekly bi-weekly semi-monthly monthly' },
  { goName: 'AnchorDate', jsonName: 'anchor_date', rules: 'required' },
  { goName: 'Amount', jsonName: 'amount', rules: 'min=0' },
]

const INVALID_ANCHOR = 'invalid anchor_date format, use YYYY-MM-DD'

/** Go payScheduleToResponse: next_payday is the next occurrence after now. */
export function toPayScheduleResponse(ps: PaySchedule): PayScheduleResponse {
  const next = nextPayday(
    { frequency: ps.frequency, anchorDate: ps.anchorDate, dayOfMonth2: ps.dayOfMonth2 },
    new Date(),
  )
  return {
    id: ps.id,
    account_id: ps.accountId,
    frequency: ps.frequency,
    anchor_date: formatYmd(ps.anchorDate),
    next_payday: formatYmd(next),
    amount: ps.amount / 100,
    day_of_month_2: ps.dayOfMonth2,
    label: ps.label,
  }
}

/** Go: echo.NewHTTPError(500, err.Error()). */
function serverError(err: unknown): HttpError {
  return new HttpError(500, messageOf(err))
}

function rethrow500(err: unknown): never {
  throw serverError(err)
}

/** Parses a path or query id; a malformed id is a 400 with the route's text. */
function parseIdOr400(raw: string, message: string): string {
  try {
    return parseUuid(raw)
  } catch {
    throw new HttpError(400, message)
  }
}

/** Parses a YYYY-MM-DD anchor date; any failure is a 400 with the route's text. */
function parseAnchorOr400(raw: string): Date {
  try {
    return parseYmd(raw)
  } catch {
    throw new HttpError(400, INVALID_ANCHOR)
  }
}

export function registerPayScheduleRoutes(app: App, svc: PayScheduleServiceIface = app.payScheduleSvc): void {
  route('GET', '/api/pay-schedule', async ({ query }) => {
    // A missing parameter is "" in Go (c.QueryParam), which is rejected as missing.
    const raw = query.get('account_id') ?? ''
    if (raw === '') throw new HttpError(400, 'account_id query param required')
    const accountId = parseIdOr400(raw, 'invalid account_id')
    const schedules = await svc.listPaySchedules(accountId).catch(rethrow500)
    return { body: schedules.map(toPayScheduleResponse) }
  })

  route('POST', '/api/pay-schedule', async ({ body }) => {
    const req = bindBody(body, CREATE_SCHEMA)
    validateOrThrow('CreatePayScheduleRequest', req, CREATE_FIELDS)
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    const anchorDate = parseAnchorOr400(req.anchor_date)
    const ps = await svc
      .createPaySchedule(accountId, req.frequency, anchorDate, req.day_of_month_2, req.label, goRound(req.amount * 100))
      .catch(rethrow500)
    return { status: 201, body: toPayScheduleResponse(ps) }
  })

  route('PATCH', '/api/pay-schedule/:id', async ({ params, body }) => {
    const id = parseIdOr400(params.id, 'invalid schedule id')
    const req = bindBody(body, PATCH_SCHEMA)
    validateOrThrow('PatchPayScheduleRequest', req, PATCH_FIELDS)
    const anchorDate = parseAnchorOr400(req.anchor_date)
    await svc
      .updatePaySchedule(id, req.frequency, anchorDate, req.day_of_month_2, req.label, goRound(req.amount * 100))
      .catch(rethrow500)
    return { status: 204 }
  })

  route('DELETE', '/api/pay-schedule/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid schedule id')
    await svc.deletePaySchedule(id).catch(rethrow500)
    return { status: 204 }
  })

  route('POST', '/api/pay-schedule/:id/confirm', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid schedule id')
    const ps = await svc.confirmPayday(id).catch((err: unknown) => {
      if (isErr(err, ErrNoRows)) throw new HttpError(404, 'schedule not found')
      throw serverError(err)
    })
    return { body: toPayScheduleResponse(ps) }
  })
}
