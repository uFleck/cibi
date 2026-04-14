---
phase: 07-n-payment-schedules
plan: "01"
subsystem: backend
tags: [repo, service, engine, migration, sqlite, go]
dependency_graph:
  requires: []
  provides:
    - PayScheduleRepo.ListByAccountID/Insert/UpdateByID/DeleteByID
    - PayScheduleService.CreatePaySchedule/ListPaySchedules/UpdatePaySchedule/DeletePaySchedule
    - EngineResult.WillAffordAfterPayday + WaitUntil
    - EngineService.CanIBuyIt multi-schedule loop
  affects:
    - internal/handler/pay_schedule.go (updated to new service interface)
    - cmd/cibi/account.go (updated CLI call site)
    - cmd/seed/main.go (updated seed call site)
tech_stack:
  added: []
  patterns:
    - Goose migration for schema evolution
    - ID-keyed CRUD repo replacing account-keyed upsert
    - Union window approach: earliest payday across N schedules
    - WAIT verdict: projected balance after payday covers item
key_files:
  created:
    - internal/migrations/20260412000001_add_pay_schedule_amount.go
    - internal/repo/sqlite/pay_schedule_test.go
    - internal/service/pay_schedule_test.go
  modified:
    - internal/repo/sqlite/pay_schedule.go
    - internal/service/pay_schedule.go
    - internal/service/engine.go
    - internal/handler/pay_schedule.go
    - internal/handler/routes.go
    - internal/handler/testhelpers_test.go
    - cmd/seed/main.go
    - cmd/cibi/account.go
decisions:
  - Union window approach: use earliest payday across all N schedules as the obligation window boundary (no double counting)
  - WAIT verdict added to RiskLevel enum: when canBuy=false but projected_balance + earliest_schedule.Amount covers item
  - classifyRisk simplified: removed canBuy param since BLOCKED/WAIT are handled inline before classifyRisk is called
  - Handler fully rewritten to CRUD endpoints (POST/GET/PATCH/DELETE on /pay-schedules) replacing single upsert POST
metrics:
  duration: "~25 minutes"
  completed_date: "2026-04-14"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 8
---

# Phase 07 Plan 01: N Payment Schedules — Go Backend Foundation Summary

**One-liner:** Goose migration adds `amount` column; PayScheduleRepo/Service refactored to full CRUD with ID-keyed methods; EngineService loops over N schedules using union-window + WAIT verdict with `WillAffordAfterPayday` and `WaitUntil` fields.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migration + repo/service refactor | 4e6f106 | migrations/20260412000001_add_pay_schedule_amount.go, repo/sqlite/pay_schedule.go, service/pay_schedule.go, handler/pay_schedule.go, handler/routes.go, cmd/seed/main.go, cmd/cibi/account.go |
| 2 | Engine refactor — multi-schedule loop + WAIT verdict | fef0da1 | service/engine.go, handler/testhelpers_test.go |

## Verification Results

```
go build ./...          → exit 0
go test ./internal/...  → all packages pass
grep ListByAccountID    → found in repo interface + impl
grep WillAffordAfterPayday → found in EngineResult struct
grep "amount INTEGER NOT NULL DEFAULT 0" → found in migration
grep GetByAccountID in service/handler → no results (CLEAN)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated handler/pay_schedule.go to new service interface**
- **Found during:** Task 1 — after rewriting service, handler still referenced SetPaySchedule/GetPaySchedule
- **Fix:** Rewrote handler with Create/List/Update/Delete methods matching new service API; updated routes.go to register new CRUD endpoints on /pay-schedules
- **Files modified:** internal/handler/pay_schedule.go, internal/handler/routes.go
- **Commit:** 4e6f106

**2. [Rule 3 - Blocking] Fixed cmd/seed/main.go using old repo/service methods**
- **Found during:** Task 1 — psRepo.GetByAccountID and psSvc.SetPaySchedule no longer exist
- **Fix:** Updated seed to use ListByAccountID check + CreatePaySchedule; changed frequency from "biweekly" to "semi-monthly" to match engine frequency constants
- **Files modified:** cmd/seed/main.go
- **Commit:** 4e6f106

**3. [Rule 3 - Blocking] Fixed cmd/cibi/account.go using old SetPaySchedule method**
- **Found during:** Task 1 — psSvc.SetPaySchedule no longer exists
- **Fix:** Updated CLI set-pay-schedule command to use CreatePaySchedule with amount=0
- **Files modified:** cmd/cibi/account.go
- **Commit:** 4e6f106

**4. [Rule 1 - Bug] Fixed pre-existing missing SetDefault method on mockAccountsService**
- **Found during:** Task 2 verification — go test ./internal/... failed because mockAccountsService did not implement AccountsServiceIface (missing SetDefault)
- **Fix:** Added setDefaultFn field and SetDefault method to mock in testhelpers_test.go
- **Files modified:** internal/handler/testhelpers_test.go
- **Commit:** fef0da1

## Known Stubs

- `internal/repo/sqlite/pay_schedule_test.go`: TestPayScheduleRepo_Stub — skipped (Wave 0 placeholder)
- `internal/service/pay_schedule_test.go`: TestPayScheduleService_Stub, TestCanIBuyIt_Stub, TestWaitVerdict_Stub — skipped (Wave 0 placeholders)

These stubs are intentional per the plan's action step. Real integration tests will replace them in a follow-on plan.

## Threat Flags

No new network endpoints or auth paths introduced. Handler routes updated from single POST to CRUD endpoints (GET/POST/PATCH/DELETE on `/pay-schedules`) — surface is consistent with existing handler patterns. T-07-01 mitigation implemented: `accRepo.GetByID(accountID)` called in `CreatePaySchedule` before insert.

## Self-Check: PASSED

- internal/migrations/20260412000001_add_pay_schedule_amount.go — FOUND
- internal/repo/sqlite/pay_schedule.go — FOUND (ListByAccountID, Amount int64)
- internal/service/pay_schedule.go — FOUND (CreatePaySchedule, no SetPaySchedule)
- internal/service/engine.go — FOUND (WillAffordAfterPayday, WaitUntil, WAIT verdict)
- Commit 4e6f106 — FOUND
- Commit fef0da1 — FOUND
