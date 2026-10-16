// Port of internal/handler/check.go (route POST /api/check, the can-I-buy-it check).
//
// Money: the dollars in go through goRound(amount * 100) (Go int64(math.Round(req.Amount * 100))); the
// cents out are divided by 100. A value outside the int64 range becomes MinInt64, which is what Go's
// conversion gives on amd64 (goInt64).
// Errors (Go's echo.NewHTTPError calls):
// - a bind error (invalid request body) and a validation error: 400 with the text;
// - an account_id that is set but is not a UUID: 400 "invalid account_id";
// - a service error: 500 with the error text (so PAY_SCHEDULE_REQUIRED reaches the error handler with its code).
// - an empty or missing account_id: 400 "account_id is required".
// Dates: wait_until is the YYYY-MM-DD of the payday (UTC), or null.

import type { App } from '../app'
import { formatYmd } from '../dates'
import { HttpError, route } from '../http'
import { goRound } from '../num'
import type { EngineResult, EngineService, GoalImpact, GoalWindowCoverage } from '../service/engine'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'
import { parseIdOr400, rethrow500 } from './common'

/** The service methods the handler uses (Go: EngineServiceIface, so tests can inject fakes). */
export type CheckServiceIface = Pick<EngineService, 'canIBuyIt'>

/** JSON shape of a goal impact (Go CheckGoalImpact). Money is dollars. */
export interface CheckGoalImpactResponse {
  goal_id: string
  goal_name: string
  remaining_before: number
  remaining_after: number
  progress_before_pct: number
  progress_after_pct: number
  min_contribution_per_window: number
  severity: string
}

/** JSON shape of a goal covered this window (Go CheckGoalWindowCoverage). Money is dollars. */
export interface CheckGoalWindowCoverageResponse {
  goal_id: string
  goal_name: string
  contributed_this_window: number
  min_contribution_per_window: number
}

/** JSON shape of the check (Go CheckResponse). */
export interface CheckResponse {
  can_buy: boolean
  purchasing_power: number
  buffer_remaining: number
  risk_level: string
  will_afford_after_payday: boolean
  wait_until: string | null
  goal_impacts: CheckGoalImpactResponse[]
  goals_covered_this_window: CheckGoalWindowCoverageResponse[]
}

const CHECK_SCHEMA = {
  amount: 'float',
  account_id: 'stringPtr',
} as const

const CHECK_FIELDS: FieldSpec[] = [{ goName: 'Amount', jsonName: 'amount', rules: 'required,gt=0' }]

const INT64_LIMIT = 2 ** 63

/** Go int64(f) for a float64 that is already rounded: NaN and values out of the int64 range give MinInt64 (amd64). */
function goInt64(x: number): number {
  if (!Number.isFinite(x) || x >= INT64_LIMIT || x < -INT64_LIMIT) return -INT64_LIMIT
  return x
}

function impactResponse(impact: GoalImpact): CheckGoalImpactResponse {
  return {
    goal_id: impact.goalId,
    goal_name: impact.goalName,
    remaining_before: impact.remainingBefore / 100,
    remaining_after: impact.remainingAfter / 100,
    progress_before_pct: impact.progressBeforePct,
    progress_after_pct: impact.progressAfterPct,
    min_contribution_per_window: impact.minContributionPerWindowCents / 100,
    severity: impact.severity,
  }
}

function coverageResponse(goal: GoalWindowCoverage): CheckGoalWindowCoverageResponse {
  return {
    goal_id: goal.goalId,
    goal_name: goal.goalName,
    contributed_this_window: goal.contributedThisWindowCents / 100,
    min_contribution_per_window: goal.minContributionPerWindowCents / 100,
  }
}

/** Go's CheckResponse built from the engine result. */
export function checkResponse(result: EngineResult): CheckResponse {
  return {
    can_buy: result.canBuy,
    purchasing_power: result.purchasingPower / 100,
    buffer_remaining: result.bufferRemaining / 100,
    risk_level: result.riskLevel,
    will_afford_after_payday: result.willAffordAfterPayday,
    wait_until: result.waitUntil === null ? null : formatYmd(result.waitUntil),
    goal_impacts: result.goalImpacts.map(impactResponse),
    goals_covered_this_window: result.goalsCoveredThisWindow.map(coverageResponse),
  }
}

export function registerCheckRoutes(app: App, svc: CheckServiceIface = app.engineSvc): void {
  route('POST', '/api/check', async ({ body }) => {
    const req = bindBody(body, CHECK_SCHEMA)
    validateOrThrow('CheckRequest', req, CHECK_FIELDS)
    const cents = goInt64(goRound(req.amount * 100))

    if (req.account_id === null || req.account_id === '') throw new HttpError(400, 'account_id is required')
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    const result: EngineResult = await svc.canIBuyIt(accountId, cents).catch(rethrow500)
    return { body: checkResponse(result) }
  })
}
