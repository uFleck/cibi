---
phase: 02-shared-debt-list-components
plan: "03"
subsystem: api+web
tags: [public-pages, toggle, rollback, permissions]
provides:
  - Confirm-toggle endpoints for owner and public-host flows
  - Reversible confirmation semantics in service/repo layers
  - Public pages integrated with shared debt list where applicable
key-files:
  modified:
    - internal/handler/peer_debt.go
    - internal/handler/public.go
    - internal/handler/routes.go
    - internal/repo/sqlite/peer_debt.go
    - internal/repo/sqlite/group_event.go
    - internal/service/peer_debt.go
    - internal/service/group_event.go
    - web/src/lib/api.ts
    - web/src/pages/friend-public.tsx
    - web/src/pages/group-public.tsx
requirements-completed: [PH2-SDL-06, PH2-SDL-07]
completed: 2026-04-18
---

# Phase 02 Plan 03 Summary

**Public/owner confirmation paths now support reversible toggle semantics, and public list surfaces use shared list patterns.**

## Accomplishments
- Added `confirm-toggle` API routes for peer debts and public friend-host participant confirmations.
- Added repo/service toggle methods (`ToggleInstallmentConfirmation`, `ToggleParticipantConfirmed`) with rollback behavior.
- Updated public frontend API wrappers and friend-public host actions to use toggle endpoint.
- Migrated group-public participants rendering to `SharedDebtList`.

## Verification
- `go test ./...` passed.
- `cd web && npm test -- --run src/__tests__/shared-debt-list.test.tsx` passed.
- `cd web && npm run build` passed.

## Self-Check: PASSED
