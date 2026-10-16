// Routes under /api/reserve. Money in is dollars (goRound(dollars * 100)); money out is cents / 100.
//
// - GET    /api/reserve?account_id=             the settings, balance, target, next contribution, ETA and recent entries
// - PUT    /api/reserve/config                  { account_id, enabled, target_months, start_amount, step_amount, cap_percent }
// - POST   /api/reserve/withdraw                { account_id, amount, note }: a note is required
// - POST   /api/reserve/entries/:id/moved       the contribution was also moved to a real place
// Errors: a bad id or a rule broken by the request is 400; a missing contribution is 404; anything else 500.

import type { App } from '../app'
import { formatYmd } from '../dates'
import { AppError, ErrNoRows, isErr, messageOf } from '../errors'
import { HttpError, route } from '../http'
import { goRound } from '../num'
import type { ReserveEntry } from '../repo/reserve'
import type { ReserveService, ReserveState } from '../service/reserve'
import { bindBody } from './bind'
import { parseIdOr400, rethrow500 } from './common'

export type ReserveServiceIface = Pick<ReserveService, 'state' | 'saveConfig' | 'withdraw' | 'markMoved'>

export interface ReserveEntryResponse {
  id: string
  amount: number
  kind: 'contribution' | 'withdrawal'
  note: string | null
  payday: string | null
  posted_at: string
  moved_at: string | null
}

export interface ReserveResponse {
  enabled: boolean
  target_months: number
  start_amount: number
  step_amount: number
  cap_percent: number
  balance: number
  target: number
  monthly_obligations: number
  months_covered: number | null
  progress: number
  next_contribution: { amount: number; payday: string; label: string | null } | null
  eta: string | null
  pending_transfers: ReserveEntryResponse[]
  entries: ReserveEntryResponse[]
}

const CONFIG_SCHEMA = {
  account_id: 'string',
  enabled: 'bool',
  target_months: 'float',
  start_amount: 'float',
  step_amount: 'float',
  cap_percent: 'float',
} as const

const WITHDRAW_SCHEMA = {
  account_id: 'string',
  amount: 'float',
  note: 'string',
} as const

function entryResponse(e: ReserveEntry): ReserveEntryResponse {
  return {
    id: e.id,
    amount: e.amount / 100,
    kind: e.kind,
    note: e.note,
    payday: e.payday,
    posted_at: e.postedAt.toISOString(),
    moved_at: e.movedAt === null ? null : e.movedAt.toISOString(),
  }
}

export function reserveResponse(s: ReserveState): ReserveResponse {
  return {
    enabled: s.config.enabled,
    target_months: s.config.targetMonths,
    start_amount: s.config.startCents / 100,
    step_amount: s.config.stepCents / 100,
    cap_percent: s.config.capPercent,
    balance: s.balance / 100,
    target: s.target / 100,
    monthly_obligations: s.monthlyObligations / 100,
    months_covered: s.monthsCovered,
    progress: s.progress,
    next_contribution:
      s.nextContribution === null
        ? null
        : {
            amount: s.nextContribution.amount / 100,
            payday: formatYmd(s.nextContribution.payday),
            label: s.nextContribution.label,
          },
    eta: s.eta === null ? null : formatYmd(s.eta),
    pending_transfers: s.pendingTransfers.map(entryResponse),
    entries: s.entries.map(entryResponse),
  }
}

/** A rule the request broke is the caller's to fix (400); anything else is a 500. */
function badRequestOr500(err: unknown): never {
  if (err instanceof AppError && !isErr(err, ErrNoRows)) throw new HttpError(400, messageOf(err))
  throw new HttpError(500, messageOf(err))
}

export function registerReserveRoutes(app: App, svc: ReserveServiceIface = app.reserveSvc): void {
  route('GET', '/api/reserve', async ({ query }) => {
    const raw = query.get('account_id') ?? ''
    if (raw === '') throw new HttpError(400, 'account_id query parameter is required')
    const accountId = parseIdOr400(raw, 'invalid account_id')
    return { body: reserveResponse(await svc.state(accountId).catch(rethrow500)) }
  })

  route('PUT', '/api/reserve/config', async ({ body }) => {
    const req = bindBody(body, CONFIG_SCHEMA)
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    await svc
      .saveConfig(accountId, {
        enabled: req.enabled,
        targetMonths: req.target_months,
        startCents: goRound(req.start_amount * 100),
        stepCents: goRound(req.step_amount * 100),
        capPercent: req.cap_percent,
      })
      .catch(badRequestOr500)
    return { body: reserveResponse(await svc.state(accountId).catch(rethrow500)) }
  })

  route('POST', '/api/reserve/withdraw', async ({ body }) => {
    const req = bindBody(body, WITHDRAW_SCHEMA)
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    await svc.withdraw(accountId, goRound(req.amount * 100), req.note).catch(badRequestOr500)
    return { body: reserveResponse(await svc.state(accountId).catch(rethrow500)) }
  })

  route('POST', '/api/reserve/entries/:id/moved', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid entry id')
    await svc.markMoved(id).catch((err: unknown) => {
      if (isErr(err, ErrNoRows)) throw new HttpError(404, 'contribution not found')
      throw new HttpError(500, messageOf(err))
    })
    return { status: 204 }
  })
}
