---
phase: 14-goals-tracking-tab-dashboard-widget-recurring-investments-and-purchase-impact
plan: 04
subsystem: api-ui
tags: [check, goals, impact, wait, openapi]
requires:
  - phase: 14-01
    provides: goals tracking baseline
  - phase: 14-03
    provides: recurring + goals surface flow
provides:
  - /check goal_impacts payload with WAIT parity fields
  - CheckWidget goal impact preview rendering
  - Goals page latest purchase impact summary block
affects: [purchase-check, goals-tab, api-contract]
tech-stack:
  added: []
  patterns: [contract-first check response mapping, sessionStorage handoff between flows]
key-files:
  created:
    - internal/service/engine_test.go
    - web/src/components/CheckWidget.test.tsx
    - web/src/pages/goals.test.tsx
  modified:
    - internal/service/engine.go
    - internal/handler/check.go
    - internal/handler/check_test.go
    - internal/handler/docs/openapi.yaml
    - web/src/components/CheckWidget.tsx
    - web/src/lib/api.ts
    - web/src/pages/goals.tsx
key-decisions:
  - "Goal impact severity is derived from purchase amount vs remaining goal amount using low/medium/high thresholds."
  - "Latest check payload is persisted in sessionStorage to surface impact context in Goals page."
patterns-established:
  - "Check response contract includes explicit WAIT compatibility + impact projection fields."
requirements-completed: [P14-04, P14-05]
duration: 44 min
completed: 2026-04-29
---

# Phase 14 Plan 04: Purchase impact projection in check + goals surfaces Summary

**/check now returns WAIT-compatible per-goal impact projections, and frontend renders the same payload in both CheckWidget and Goals context panels.**

## Performance
- **Duration:** 44 min
- **Tasks:** 2/2
- **Files modified:** 10

## Accomplishments
- Added `goal_impacts` projection to engine result and mapped it through `/check` handler.
- Updated OpenAPI contract to include WAIT enum + `will_afford_after_payday`, `wait_until`, and `goal_impacts` schema.
- Rendered "Goal impact preview" in CheckWidget and "Latest purchase impact" summary in Goals page.
- Added backend/frontend regression tests for WAIT + impact payload compatibility.

## Task Commits
1. **Task 1: Extend engine/check response with per-goal impact projection** - `ae78e1f` (feat)
2. **Task 2: Render impact preview in CheckWidget and Goals tab context panels** - `fb7d677` (feat)

## Files Created/Modified
- `internal/service/engine.go` - goal impact projection model + generation.
- `internal/handler/check.go` - `/check` response mapping for goal impacts.
- `internal/handler/docs/openapi.yaml` - contract parity for WAIT + goal impacts.
- `web/src/components/CheckWidget.tsx` - goal impact preview UI.
- `web/src/pages/goals.tsx` - latest impact summary panel.

## Decisions Made
- Severity labels use lowercase contract (`low|medium|high`) while risk level remains uppercase (`LOW|...|WAIT`).
- Goals surface pulls latest check result from session storage for cross-surface continuity.

## Deviations from Plan

### Auto-fixed Issues
1. **[Rule 3 - Blocking] Existing test-interface drift blocked targeted Go test execution**
- **Found during:** Task 1 verification
- **Issue:** handler/service tests had interface/method drift unrelated to new logic, causing package compile failure.
- **Fix:** adjusted affected test helper signatures to satisfy current interfaces so targeted checks can run.
- **Files modified:** `internal/handler/goals_test.go`
- **Verification:** `go test ./internal/service ./internal/handler -run "Check|Impact|WAIT"`
- **Committed in:** `ae78e1f`

**Total deviations:** 1 auto-fixed (blocking)

## Issues Encountered
- None after blocking test drift fix.

## User Setup Required
- None.

## Next Phase Readiness
- Impact contract and UI surfaces are aligned and test-covered.
- Ready for broader phase verification/end-to-end UX checks.

## Self-Check: PASSED
- FOUND: commits `ae78e1f`, `fb7d677`
- FOUND: summary file `.planning/phases/14-goals-tracking-tab-dashboard-widget-recurring-investments-and-purchase-impact/14-04-SUMMARY.md`
