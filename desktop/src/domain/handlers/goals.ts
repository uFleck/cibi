// Port of internal/handler/goals.go, goals_recurring.go and goals_tracking.go (routes under /api/goals).
//
// Money: dollars in are converted with goRound(dollars * 100) / 100 (Create's rounding of the
// amounts happens here, the service rounds again); cents out are divided by 100.
// Dates: request dates are RFC3339 (strict, as Go's time.Parse(time.RFC3339)). Response dates are
// RFC3339 in UTC with whole seconds.
// Errors (Go's echo.NewHTTPError calls):
// - a bad id, a missing or bad account_id, a bad date, a bad type or source: 400 with the route's text.
//   A missing account_id is "invalid account_id" on the goals routes (Go parses "" with uuid.Parse).
// - a service error: 400 with the error text (Create, Update, AddLedger, Reverse, Confirm); 500 with the
//   error text for the list reads (List, ListLedger, Tracking, ListRecurring).
// - Create's and AddLedger's validation errors are 400 with the validator text.
// - an unknown goal id (Update) or an unknown goal or entry id (Reverse): 404 "goal not found" /
//   "goal or ledger entry not found". Reversing an entry that is already reversed is 409
//   "ledger entry already reversed" (deliberate fix; Go refunded twice). Go answered 400 with the sql error text, and Update on a known goal
//   is unchanged. A malformed id stays 400.
// - there is no DELETE route for goals: DELETE /api/goals/:id is 405, as in Go.
// - ReverseLedger ignores a body that does not bind (Go `_ = c.Bind(&req)`).

import type { App } from '../app'
import { formatDbTime, parseRfc3339 } from '../dates'
import { ErrNoRows, isErr, messageOf } from '../errors'
import { HttpError, route } from '../http'
import { goRound } from '../num'
import { VALID_GOAL_LEDGER_TYPES, type Goal, type GoalLedgerEntry } from '../repo/goals'
import type { GoalRecurringDueItem } from '../service/goalsRecurring'
import type { GoalsTrackingResponse } from '../service/goalsTracking'
import { ErrLedgerEntryAlreadyReversed } from '../service/goals'
import type { AddGoalLedgerInput, CreateGoalInput, GoalsService, UpdateGoalInput } from '../service/goals'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'
import { parseIdOr400, rethrow500 } from './common'

/** The service methods the handlers use (Go: GoalsServiceIface, so tests can inject fakes). */
export type GoalsServiceIface = Pick<
  GoalsService,
  | 'createGoal'
  | 'listGoals'
  | 'updateGoal'
  | 'addLedgerEntry'
  | 'reverseLedgerEntry'
  | 'listLedger'
  | 'buildTracking'
  | 'listRecurringDue'
  | 'confirmRecurringDue'
>

/** JSON shape of a goal (Go GoalResponse). Money is dollars. */
export interface GoalResponse {
  id: string
  account_id: string
  name: string
  status: string
  target_amount: number
  invested_total: number
  min_contribution_per_window: number
  start_date_utc: string
  target_date_utc: string | null
  notes: string | null
  currency: string
}

/** JSON shape of a goal ledger entry (Go GoalLedgerEntryResponse). Amount is dollars. */
export interface GoalLedgerEntryResponse {
  id: string
  goal_id: string
  amount: number
  type: string
  source: string
  note: string | null
  reverses_entry_id: string | null
  timestamp_utc: string
}

const CREATE_SCHEMA = {
  account_id: 'string',
  name: 'string',
  target_amount: 'float',
  min_contribution_per_window: 'float',
  start_date_utc: 'string',
  target_date_utc: 'stringPtr',
  notes: 'stringPtr',
} as const

const CREATE_FIELDS: FieldSpec[] = [
  { goName: 'AccountID', jsonName: 'account_id', rules: 'required' },
  { goName: 'Name', jsonName: 'name', rules: 'required' },
  { goName: 'TargetAmount', jsonName: 'target_amount', rules: 'required,gt=0' },
  { goName: 'StartDateUTC', jsonName: 'start_date_utc', rules: 'required' },
]

const UPDATE_SCHEMA = {
  name: 'stringPtr',
  target_amount: 'floatPtr',
  target_date_utc: 'stringPtr',
  notes: 'stringPtr',
  min_contribution_per_window: 'floatPtr',
} as const

const ADD_LEDGER_SCHEMA = {
  amount: 'float',
  type: 'string',
  source: 'string',
  timestamp_utc: 'stringPtr',
  note: 'stringPtr',
} as const

const ADD_LEDGER_FIELDS: FieldSpec[] = [
  { goName: 'Amount', jsonName: 'amount', rules: 'required,gt=0' },
  { goName: 'Type', jsonName: 'type', rules: 'required' },
]

/** Go goalResp. */
export function goalResponse(g: Goal): GoalResponse {
  return {
    id: g.id,
    account_id: g.accountId,
    name: g.name,
    status: g.status,
    target_amount: g.targetAmountCents / 100,
    invested_total: g.investedTotalCents / 100,
    min_contribution_per_window: g.minContributionPerWindowCents / 100,
    start_date_utc: formatDbTime(g.startDateUtc),
    target_date_utc: g.targetDateUtc === null ? null : formatDbTime(g.targetDateUtc),
    notes: g.notes,
    currency: g.currency,
  }
}

/** Go ledgerResp. */
export function ledgerResponse(e: GoalLedgerEntry): GoalLedgerEntryResponse {
  return {
    id: e.id,
    goal_id: e.goalId,
    amount: e.amountCents / 100,
    type: e.type,
    source: e.source,
    note: e.note,
    reverses_entry_id: e.reversesEntryId,
    timestamp_utc: formatDbTime(e.timestampUtc),
  }
}

/** Go's tracking response as JSON (the service returns camelCase; the field names here are the wire names). */
function trackingResponse(t: GoalsTrackingResponse) {
  return {
    summary: {
      goals_count: t.summary.goalsCount,
      completed_count: t.summary.completedCount,
      total_target: t.summary.totalTarget,
      total_invested: t.summary.totalInvested,
      total_remaining: t.summary.totalRemaining,
    },
    top_goals: t.topGoals.map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      target_amount: g.targetAmount,
      invested_total: g.investedTotal,
      remaining_amount: g.remainingAmount,
      progress_pct: g.progressPct,
      min_contribution_per_window: g.minContributionPerWindow,
      target_date_utc: g.targetDateUtc,
      created_at_utc: g.createdAtUtc,
    })),
    recent_activity: t.recentActivity.map((a) => ({
      goal_id: a.goalId,
      goal_name: a.goalName,
      entry_id: a.entryId,
      amount: a.amount,
      type: a.type,
      source: a.source,
      timestamp_utc: a.timestampUtc,
    })),
    updated_at_utc: t.updatedAtUtc,
  }
}

/** Go GoalRecurringDueItem as JSON. */
function recurringItemResponse(i: GoalRecurringDueItem) {
  return {
    id: i.id,
    goal_id: i.goalId,
    goal_name: i.goalName,
    amount: i.amount,
    frequency: i.frequency,
    anchor_date_utc: i.anchorDateUtc,
    next_due_utc: i.nextDueUtc,
    is_overdue: i.isOverdue,
    last_entry_id: i.lastEntryId,
    last_posted_at_utc: i.lastPostedAtUtc,
  }
}

/**
 * Go ReverseRequest.Note (a *string) after `_ = c.Bind(&req)`. encoding/json fills the fields key by key
 * and keeps going after a type error: a null note is nil, a string is itself, and any other JSON value
 * leaves the pointer allocated to "" (the type error is dropped). A body that is not an object sets
 * nothing. A malformed body never gets here (ignoreMalformedBody), and leaves the note nil.
 */
function reverseNote(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  let note: string | null = null
  for (const [key, value] of Object.entries(body)) {
    if (key.toLowerCase() !== 'note') continue
    if (value === null) note = null
    else if (typeof value === 'string') note = value
    else note = ''
  }
  return note
}

/** A service error on a write: 400 with the error text. */
function badRequestOf(err: unknown): never {
  throw new HttpError(400, messageOf(err))
}

/** sql.ErrNoRows is a 404 with the route's not-found text; any other service error is a 400 with its text. */
function notFoundOr400(notFound: string): (err: unknown) => never {
  return (err: unknown): never => {
    if (isErr(err, ErrNoRows)) throw new HttpError(404, notFound)
    throw new HttpError(400, messageOf(err))
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

export function registerGoalsRoutes(app: App, svc: GoalsServiceIface = app.goalsSvc): void {
  // List the goals of an account.
  route('GET', '/api/goals', async ({ query }) => {
    const accountId = parseIdOr400(query.get('account_id') ?? '', 'invalid account_id')
    const goals = await svc.listGoals(accountId).catch(rethrow500)
    return { body: goals.map(goalResponse) }
  })

  // Summary, top goals (by urgency) and recent activity.
  route('GET', '/api/goals/tracking', async ({ query }) => {
    const accountId = parseIdOr400(query.get('account_id') ?? '', 'invalid account_id')
    const tracking = await svc.buildTracking(accountId).catch(rethrow500)
    return { body: trackingResponse(tracking) }
  })

  // The active recurring rows that are due now. Lists post nothing.
  route('GET', '/api/goals/recurring', async ({ query }) => {
    const accountId = parseIdOr400(query.get('account_id') ?? '', 'invalid account_id')
    const items = await svc.listRecurringDue(accountId).catch(rethrow500)
    return { body: items.map(recurringItemResponse) }
  })

  // Posts the due contribution of a recurring row (one period).
  route('POST', '/api/goals/recurring/:id/confirm', async ({ params }) => {
    const id = parseIdOr400(params.id, 'invalid recurring id')
    await svc.confirmRecurringDue(id).catch(badRequestOf)
    return { status: 204 }
  })

  route('POST', '/api/goals', async ({ body }) => {
    const req = bindBody(body, CREATE_SCHEMA)
    validateOrThrow('CreateGoalRequest', req, CREATE_FIELDS)
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    const start = parseDateOr400(req.start_date_utc, 'invalid start_date_utc')
    // An empty target date is no target date (Go: != "").
    let target: Date | null = null
    if (req.target_date_utc !== null && req.target_date_utc !== '') {
      target = parseDateOr400(req.target_date_utc, 'invalid target_date_utc')
    }
    const input: CreateGoalInput = {
      accountId,
      name: req.name,
      targetAmount: goRound(req.target_amount * 100) / 100,
      minContributionPerWindow: goRound(req.min_contribution_per_window * 100) / 100,
      startDateUtc: start,
      targetDateUtc: target,
      notes: req.notes,
    }
    const goal = await svc.createGoal(input).catch(badRequestOf)
    return { status: 201, body: goalResponse(goal) }
  })

  route('PATCH', '/api/goals/:id', async ({ params, body }) => {
    const goalId = parseIdOr400(params.id, 'invalid goal id')
    const req = bindBody(body, UPDATE_SCHEMA)
    // An empty target date is no change (Go: != "").
    let targetDate: Date | undefined
    if (req.target_date_utc !== null && req.target_date_utc !== '') {
      targetDate = parseDateOr400(req.target_date_utc, 'invalid target_date_utc')
    }
    const input: UpdateGoalInput = {
      name: req.name ?? undefined,
      targetAmount: req.target_amount ?? undefined,
      targetDateUtc: targetDate,
      notes: req.notes ?? undefined,
      minContributionPerWindow: req.min_contribution_per_window ?? undefined,
    }
    await svc.updateGoal(goalId, input).catch(notFoundOr400('goal not found'))
    return { status: 204 }
  })

  route('GET', '/api/goals/:id/ledger', async ({ params }) => {
    const goalId = parseIdOr400(params.id, 'invalid goal id')
    const entries = await svc.listLedger(goalId).catch(rethrow500)
    return { body: entries.map(ledgerResponse) }
  })

  route('POST', '/api/goals/:id/ledger', async ({ params, body }) => {
    const goalId = parseIdOr400(params.id, 'invalid goal id')
    const req = bindBody(body, ADD_LEDGER_SCHEMA)
    validateOrThrow('AddLedgerRequest', req, ADD_LEDGER_FIELDS)
    if (!VALID_GOAL_LEDGER_TYPES.has(req.type)) {
      throw new HttpError(400, 'invalid ledger type')
    }
    // An empty source is manual (Go: == "").
    const source = req.source === '' ? 'manual' : req.source
    if (source !== 'manual' && source !== 'system' && source !== 'recurring') {
      throw new HttpError(400, 'invalid ledger source')
    }
    let timestampUtc = new Date()
    if (req.timestamp_utc !== null && req.timestamp_utc !== '') {
      timestampUtc = parseDateOr400(req.timestamp_utc, 'invalid timestamp_utc')
    }
    const input: AddGoalLedgerInput = {
      goalId,
      amount: req.amount,
      type: req.type,
      source,
      timestampUtc,
      note: req.note,
    }
    const entry = await svc.addLedgerEntry(input).catch(badRequestOf)
    return { status: 201, body: ledgerResponse(entry) }
  })

  route(
    'POST',
    '/api/goals/:id/ledger/:entryId/reverse',
    async ({ params, body }) => {
      const goalId = parseIdOr400(params.id, 'invalid goal id')
      const entryId = parseIdOr400(params.entryId, 'invalid entry id')
      const notFound = notFoundOr400('goal or ledger entry not found')
      const entry = await svc.reverseLedgerEntry(goalId, entryId, reverseNote(body)).catch((err: unknown) => {
        if (isErr(err, ErrLedgerEntryAlreadyReversed)) throw new HttpError(409, ErrLedgerEntryAlreadyReversed.message)
        return notFound(err)
      })
      return { status: 201, body: ledgerResponse(entry) }
    },
    { ignoreMalformedBody: true },
  )
}
