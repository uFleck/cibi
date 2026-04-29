---
phase: 14
plan: 02
title: Recurring goal contribution workflow
subsystem: goals
tags: [goals, recurring, api]
requirements-completed: [P14-03, P14-05]
key-files:
  created:
    - internal/migrations/20260429000007_goal_recurring_contributions.go
    - internal/service/goals_recurring.go
    - internal/service/goals_recurring_test.go
    - internal/handler/goals_recurring.go
  modified:
    - internal/repo/sqlite/goals.go
    - internal/handler/goals.go
    - internal/handler/routes.go
    - internal/handler/docs/openapi.yaml
    - web/src/lib/api.ts
decisions:
  - Recurring dues remain manual confirm only; list calls never post ledger entries.
  - Confirm advances schedule by exactly one frequency period from previous next_due_utc.
duration: "~35 min"
completed_at: "2026-04-29"
---

# Phase 14 Plan 02: Recurring contributions summary

Implemented due/overdue recurring goal contributions with manual confirm posting (`source=recurring`) and API/client contracts.

## Tasks completed

1. Persistence + service logic
   - Added `GoalRecurringContribution` migration + indexes.
   - Extended goals repo with recurring CRUD/query methods.
   - Added `ListRecurringDue(accountID, now)` and `ConfirmRecurringDue(itemID, ts)`.
   - Added tests for overdue visibility, selective posting, and no auto-post on reads.

2. Endpoints + contracts + client
   - Added `GET /api/goals/recurring?account_id=...`.
   - Added `POST /api/goals/recurring/{id}/confirm`.
   - Expanded ledger source enum to include `recurring`.
   - Added `listGoalRecurring(accountId)` and `confirmGoalRecurring(id)` in web API client.

## Verification

- `go test ./internal/service -run "Goal.*Recurring|Recurring.*Due"` ✅
- `go test ./internal/handler -run "Recurring|Goal.*Ledger.*Source"` ✅
- `go test ./internal/service ./internal/handler -run "Recurring|Goal.*Ledger"` ✅

## Deviations from plan

- [Rule 3 - Blocking] `internal/repo/sqlite/migrations` path in plan did not exist; used `internal/migrations/` (active migration location).

## Known stubs

None.

## Self-Check: PASSED
- Summary file exists.
- Task commits exist: `682344d`, `76ef365`.
