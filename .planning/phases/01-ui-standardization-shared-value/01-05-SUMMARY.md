---
phase: 01-ui-standardization-shared-value
plan: "05"
subsystem: ui
tags: [react, typescript, money-value, friends, public-pages]
requires:
  - phase: 01-ui-standardization-shared-value/01-02
    provides: MoneyValue component and shared sign/tone contract
provides:
  - CompactEntityTable now accepts rich ReactNode secondary content
  - Friends and public share surfaces render money via MoneyValue
  - Explicit BRL fallback used where API does not provide currency
affects: [friends-page, friend-public-page, group-public-page, participant-editor]
tech-stack:
  added: []
  patterns: [ReactNode secondary contract, MoneyValue-first amount rendering, explicit public currency fallback]
key-files:
  created: []
  modified:
    - web/src/components/CompactEntityTable.tsx
    - web/src/components/ParticipantEditor.tsx
    - web/src/pages/friends.tsx
    - web/src/pages/friend-public.tsx
    - web/src/pages/group-public.tsx
key-decisions:
  - "CompactEntityTable secondary field upgraded from string to ReactNode to prevent formatter regressions."
  - "Public/friends views use currency='BRL' explicitly until API exposes currency fields."
  - "Signed balances use MoneyValue tone='auto'; neutral share rows use showSign='never'."
patterns-established:
  - "List/table secondaries can pass JSX fragments with MoneyValue + copy text."
  - "Amount color/sign logic lives in MoneyValue, not ad-hoc ternary classes."
requirements-completed: [UI-STD-01, UI-STD-03, UI-STD-04, UI-STD-05]
duration: 3min
completed: 2026-04-17
---

# Phase 01 Plan 05: Friends/public MoneyValue standardization Summary

**Friends and public debt/share views now render through MoneyValue with explicit BRL fallback and rich CompactEntityTable secondary nodes.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-17T20:41:30Z
- **Completed:** 2026-04-17T20:45:22Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Upgraded compact table API to accept ReactNode secondary content (`secondary: React.ReactNode`).
- Migrated friends + friend-public + group-public + participant-editor amount rendering to MoneyValue.
- Removed remaining `formatMoney(...)` usage and ad-hoc red/green amount classes in target friends/public scope.

## Task Commits

1. **Task 1: Enable rich value nodes in compact table API** - `6f36917` (feat)
2. **Task 2: Migrate friend/public/participant amount fields to MoneyValue** - `7021362` (feat)
3. **Task 3: Remove leftover ad-hoc tone/sign code in friends/public scope** - `0b83c95` (chore)

## Files Created/Modified
- `web/src/components/CompactEntityTable.tsx` - secondary contract changed to `React.ReactNode`.
- `web/src/components/ParticipantEditor.tsx` - equal-share values now render via MoneyValue in mobile/desktop.
- `web/src/pages/friends.tsx` - compact rows + debt/event amount displays migrated to MoneyValue.
- `web/src/pages/friend-public.tsx` - group shares, debt totals, installment tooltip values, payment history migrated.
- `web/src/pages/group-public.tsx` - event total + participant share/status rows migrated.

## Decisions Made
- Keep copy strings unchanged (`open`, `total`, `Confirmed`, `Pending`) while swapping rendering primitive.
- Use explicit `currency="BRL"` for friends/public because payload currently lacks currency.
- Use `showSign="never"` for neutral shares and `showSign="auto"` for signed balances.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Friends/public rendering contract now aligned with authenticated surfaces.
- Ready for final phase verification / milestone-level UI audit.

## Self-Check: PASSED
- FOUND: .planning/phases/01-ui-standardization-shared-value/01-05-SUMMARY.md
- FOUND: 6f36917
- FOUND: 7021362
- FOUND: 0b83c95
