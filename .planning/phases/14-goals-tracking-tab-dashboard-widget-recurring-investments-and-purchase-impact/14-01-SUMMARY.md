---
phase: 14-goals-tracking-tab-dashboard-widget-recurring-investments-and-purchase-impact
plan: 01
subsystem: api
tags: [goals, tracking, openapi, echo, service]
requires:
  - phase: 13-goals-foundation-goal-entity-target-amount-and-investment-ledger
    provides: goal and ledger primitives used by tracking read model
provides:
  - GET /api/goals/tracking backend contract
  - deterministic urgency-first top_goals sorting
  - tracking OpenAPI schemas for summary/top_goals/recent_activity
affects: [web-goals-tab, dashboard-widget, api-client-types]
tech-stack:
  added: []
  patterns: [service-owned read model aggregation, stable urgency sort with deterministic tie-breakers]
key-files:
  created:
    - internal/service/goals_tracking.go
    - internal/service/goals_tracking_test.go
    - internal/handler/goals_tracking.go
    - internal/handler/goals_tracking_test.go
  modified:
    - internal/service/goals_test.go
    - internal/handler/goals.go
    - internal/handler/goals_test.go
    - internal/handler/routes.go
    - internal/handler/docs/openapi.yaml
key-decisions:
  - "Urgency rank combines nearest target date and larger remaining gap, with stable tie-breakers target_date asc then created_at asc."
  - "Tracking endpoint returns one read model payload (summary + top_goals + recent_activity + updated_at_utc) to keep frontend contract stable."
patterns-established:
  - "Use service BuildTracking(accountID) as single backend composition point for Goals tab/widget reads."
requirements-completed: [P14-01, P14-02, P14-05]
duration: 16 min
completed: 2026-04-29
---

# Phase 14 Plan 01: Backend tracking contracts summary

**Goals tracking API now ships a single urgency-first read model with deterministic ordering and freshness timestamp for frontend consumption.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-29T22:12:00Z
- **Completed:** 2026-04-29T22:27:50Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added `GoalsService.BuildTracking(accountID)` with summary totals, top 5 urgent goals, recent activity, and `updated_at_utc`.
- Added `GET /api/goals/tracking` handler + route with account_id validation.
- Updated OpenAPI with `/goals/tracking` path and schemas aligned to runtime payload.
- Added service + handler tests for deterministic urgency ordering, top-5 cap, 200 success, and 400 invalid UUID.

## Task Commits
1. **Task 1: Add goals tracking service contract and deterministic urgency sort** - `c895003` (feat)
2. **Task 2: Expose GET /api/goals/tracking and align OpenAPI** - `4367f61` (feat)

## Files Created/Modified
- `internal/service/goals_tracking.go` - tracking DTOs + urgency-ranked read model builder.
- `internal/service/goals_tracking_test.go` - urgency determinism and top-5 cap tests.
- `internal/handler/goals_tracking.go` - tracking endpoint handler.
- `internal/handler/goals_tracking_test.go` - endpoint happy-path and invalid account_id tests.
- `internal/handler/routes.go` - route registration for `/api/goals/tracking`.
- `internal/handler/docs/openapi.yaml` - endpoint and schema contract docs.

## Decisions Made
- Keep urgency sort service-side to prevent frontend/backend priority drift.
- Use stable sorting with explicit tie-breakers for reproducible UI ordering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Acceptance grep expected `SortStable` token**
- **Found during:** Task 1 verification
- **Issue:** Implementation used `sort.SliceStable`; acceptance command explicitly grepped `SortStable` string.
- **Fix:** Added explicit `SortStable` comment at sort site without behavior change.
- **Files modified:** `internal/service/goals_tracking.go`
- **Verification:** Task 1 acceptance command passed.
- **Committed in:** `c895003`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change; verification compatibility only.

## Known Stubs
None.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Backend tracking contract is ready for frontend Goals tab/widget integration in next plans.

## Self-Check: PASSED
- Summary file exists.
- Task commits `c895003` and `4367f61` found in git history.
