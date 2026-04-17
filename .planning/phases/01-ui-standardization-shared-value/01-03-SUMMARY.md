---
phase: 01-ui-standardization-shared-value
plan: "03"
subsystem: ui
tags: [react, typescript, dashboard, money-value, formatting]
requires:
  - phase: 01-02
    provides: MoneyValue primitive and sign/tone formatting contract
provides:
  - Dashboard monetary rows/cards now render through MoneyValue
  - Manual sign concatenation removed from migrated dashboard widgets
  - Currency wiring remains explicit for account-scoped widgets
affects: [dashboard, projection, verdict, friend-ledger]
tech-stack:
  added: []
  patterns: [Shared MoneyValue for monetary UI rendering, explicit sign/tone via component props]
key-files:
  created: []
  modified:
    - web/src/components/StatCards.tsx
    - web/src/components/ObligationsList.tsx
    - web/src/components/PayScheduleList.tsx
    - web/src/components/ProjectionWidget.tsx
    - web/src/components/FriendLedgerWidget.tsx
    - web/src/components/CheckWidget.tsx
key-decisions:
  - "Dashboard widgets now use MoneyValue as the display primitive instead of direct formatMoney spans."
  - "Projection obligations render via amount={-nextObligations} + showSign='always' to remove string replace hacks."
  - "CheckWidget keeps fallback currency behavior by omitting currency prop (MoneyValue default)."
patterns-established:
  - "Use MoneyValue tone/showSign props instead of manual '+'/'-' concatenation."
  - "Keep account.currency explicit for account-scoped value rendering."
requirements-completed: [UI-STD-01, UI-STD-02, UI-STD-03, UI-STD-04, UI-STD-05]
duration: 3min
completed: 2026-04-17
---

# Phase 01 Plan 03: Dashboard MoneyValue migration Summary

**Dashboard cards, projection rows, friend ledger amounts, and verdict value lines now render with MoneyValue plus explicit tone/sign semantics.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-17T20:31:52Z
- **Completed:** 2026-04-17T20:33:15Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Migrated simple dashboard value surfaces (StatCards, ObligationsList, PayScheduleList) to MoneyValue.
- Migrated complex widgets (ProjectionWidget, FriendLedgerWidget, CheckWidget) to MoneyValue without changing calculations.
- Passed focused dashboard/verdict regression tests, grep guards, and production build.

## Task Commits

Each task was committed atomically:

1. **Task 1: Standardize simple dashboard value rows/cards** - `a1e8d4d` (feat)
2. **Task 2: Standardize complex dashboard widgets (projection, friend ledger, check)** - `7d4bd70` (feat)
3. **Task 3: Run focused regression + grep checks for dashboard scope** - `0fef7ab` (test)

## Files Created/Modified
- `web/src/components/StatCards.tsx` - Replaced Balance/Reserved/Liquid value rendering with MoneyValue.
- `web/src/components/ObligationsList.tsx` - Replaced per-row and total obligation amounts with MoneyValue.
- `web/src/components/PayScheduleList.tsx` - Replaced per-row and total incoming amounts with MoneyValue.
- `web/src/components/ProjectionWidget.tsx` - Replaced incoming/obligations rows with MoneyValue and removed string sign manipulation.
- `web/src/components/FriendLedgerWidget.tsx` - Migrated summary/net/breakdown amounts to MoneyValue.
- `web/src/components/CheckWidget.tsx` - Migrated purchasing power and buffer remaining lines to MoneyValue.

## Decisions Made
- Money display migration kept existing calculation paths untouched; only rendering changed.
- For projection obligations, used negative amount input + `showSign='always'` to express "-" cleanly.
- For check verdict values, retained fallback currency behavior through MoneyValue default currency.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard scope now standardized on MoneyValue primitives.
- Ready for remaining non-dashboard migrations in subsequent plans.

## Self-Check: PASSED
- Verified summary file exists.
- Verified task commits exist: `a1e8d4d`, `7d4bd70`, `0fef7ab`.
