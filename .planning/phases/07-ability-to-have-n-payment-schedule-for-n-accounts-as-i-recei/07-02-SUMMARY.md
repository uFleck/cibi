---
phase: 07-n-payment-schedules
plan: "02"
subsystem: handler
tags: [api, crud, pay-schedule, check, handler]
dependency_graph:
  requires: [07-01]
  provides: [pay-schedule-api-endpoints, check-wait-fields]
  affects: [internal/handler/pay_schedule.go, internal/handler/routes.go, internal/handler/transactions.go, internal/handler/check.go]
tech_stack:
  added: []
  patterns: [interface-based handler, echo route group, compile-time interface assertion]
key_files:
  created:
    - internal/handler/pay_schedule_test.go
  modified:
    - internal/handler/pay_schedule.go
    - internal/handler/routes.go
    - internal/handler/transactions.go
    - internal/handler/check.go
decisions:
  - PayScheduleHandler.svc typed as PayScheduleServiceIface (interface) not *service.PayScheduleService — allows test injection
  - List returns 400 when account_id missing — no default account fallback (per threat model T-07-09)
  - Update returns 204 NoContent — consistent with Delete; no body needed for PATCH
  - Route group uses /pay-schedule (singular) to match plan must_haves truths
metrics:
  duration: ~10m
  completed: "2026-04-14T14:08:34Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 07 Plan 02: Handler CRUD + Check WAIT Fields Summary

Full CRUD handler rewrite for pay-schedule endpoints with frequency enum fix and CheckResponse extended with WAIT verdict fields.

## What Was Built

**Task 1 — Rewrite pay_schedule handler + frequency fix**

- `internal/handler/pay_schedule.go`: Full rewrite with List/Create/Update/Delete handlers
  - `PayScheduleServiceIface` updated to match new service methods (CreatePaySchedule, ListPaySchedules, UpdatePaySchedule, DeletePaySchedule)
  - Compile-time assertion: `var _ PayScheduleServiceIface = (*service.PayScheduleService)(nil)`
  - `CreatePayScheduleRequest.account_id` has `validate:"required"` — no default account fallback
  - `List` returns 400 immediately when `account_id` query param absent (T-07-09 mitigated)
  - Frequency validate tag: `oneof=weekly bi-weekly semi-monthly monthly` (yearly removed)
  - `Amount` field has `validate:"min=0"` (T-07-06 mitigated)
  - `Update` returns 204 NoContent
  - `Delete` returns 204 NoContent

- `internal/handler/routes.go`: Route group changed from `/pay-schedules` to `/pay-schedule`; all 4 routes registered: GET, POST, PATCH/:id, DELETE/:id

- `internal/handler/transactions.go`: `CreateTransactionRequest.Frequency` gets validate tag `omitempty,oneof=weekly bi-weekly semi-monthly monthly`

- `internal/handler/pay_schedule_test.go`: Stub test created (skipped)

**Task 2 — Extend CheckResponse with WAIT fields**

- `internal/handler/check.go`: `CheckResponse` struct gains two new fields:
  - `WillAffordAfterPayday bool json:"will_afford_after_payday"` — true when engine returns WAIT verdict
  - `WaitUntil *string json:"wait_until,omitempty"` — RFC3339 timestamp or null
  - Both fields populated from `EngineResult` in the `Check` handler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Handler svc field typed as interface**
- **Found during:** Task 1
- **Issue:** Plan 07-01 left `PayScheduleHandler.svc` as `*service.PayScheduleService` (concrete type), which prevents test injection.
- **Fix:** Changed field type to `PayScheduleServiceIface` (the interface already defined in the same file), keeping compile-time assertion. `NewPayScheduleHandler` still accepts `*service.PayScheduleService` as the parameter type for wiring.
- **Files modified:** internal/handler/pay_schedule.go
- **Commit:** 5ded01b

**2. [Rule 1 - Bug] Plan 07-01 used /pay-schedules (plural) but plan 07-02 must_haves require /pay-schedule (singular)**
- **Found during:** Task 1 verification
- **Issue:** routes.go used `/pay-schedules` group; must_haves truth says `GET /api/pay-schedule?account_id=X`
- **Fix:** Changed group path from `/pay-schedules` to `/pay-schedule`
- **Files modified:** internal/handler/routes.go
- **Commit:** 5ded01b

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-07-06 | `validate:"min=0"` on amount fields | Implemented |
| T-07-07 | `validate:"required,oneof=weekly bi-weekly semi-monthly monthly"` | Implemented |
| T-07-09 | List returns 400 when account_id absent | Implemented |

## Self-Check: PASSED

- internal/handler/pay_schedule.go: FOUND
- internal/handler/routes.go: FOUND (contains `psh.List`)
- internal/handler/check.go: FOUND (contains `will_afford_after_payday`)
- internal/handler/pay_schedule_test.go: FOUND
- Commit 5ded01b: FOUND
- Commit f8de0f4: FOUND
- `go build ./...`: exits 0
- `go test ./internal/...`: all pass
