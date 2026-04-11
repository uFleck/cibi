---
phase: 4
plan: 1
subsystem: api-layer
tags: [handler, service, validator, testing, foundation]
requires: []
provides: [internal/handler package skeleton, CustomValidator, CustomHTTPErrorHandler, AccountsService.GetByID, AccountsService.UpdateAccount, Wave 0 test stubs]
affects: [internal/service/accounts.go, internal/handler/]
tech-stack:
  added: [github.com/go-playground/validator/v10 v10.30.2]
  patterns: [echo.Validator interface, uniform JSON error shape, mock service interfaces, skip-first test stubs]
key-files:
  created:
    - internal/handler/errors.go
    - internal/handler/testhelpers_test.go
    - internal/handler/accounts_test.go
    - internal/handler/transactions_test.go
    - internal/handler/check_test.go
    - internal/handler/errors_test.go
  modified:
    - internal/service/accounts.go
    - go.mod
    - go.sum
decisions:
  - testhelpers_test.go uses package handler (not package handler_test) so mocks have access to unexported types
  - mock structs use nil-check dispatch pattern instead of function fields for cleaner test code
  - serveRequest helper added beyond plan spec to enable end-to-end error handler testing in Plan 02
  - engine, repo, and service packages from phase 2/3 were uncommitted WIP on main — copied and committed to worktree branch as prerequisite
metrics:
  duration: ~15m
  completed: "2026-04-11"
  tasks: 8
  files: 9
---

# Phase 4 Plan 01: Service Gap + Handler Scaffold Summary

**One-liner:** Handler package skeleton with CustomValidator, uniform error handler, GetByID/UpdateAccount service gap fills, and 17 skip-first test stubs.

## What Was Built

### Wave 0: Test Stubs (Tasks 0-01 through 0-05)

Five test files in `internal/handler/` covering all route behaviors from 04-VALIDATION.md. All 17 tests compile cleanly and produce `--- SKIP: ... not implemented` output. No test failures.

| File | Tests |
|------|-------|
| testhelpers_test.go | mockAccountsService, mockTransactionsService, mockEngineService, newTestEcho, makeRequest, serveRequest |
| accounts_test.go | TestListAccounts, TestCreateAccount, TestGetAccountByID, TestGetAccountByID_NotFound, TestUpdateAccount, TestDeleteAccount |
| transactions_test.go | TestListTransactions, TestListTransactions_MissingAccountID, TestCreateTransaction, TestUpdateTransaction, TestDeleteTransaction |
| check_test.go | TestCheck, TestCheck_NegativeAmount, TestCheck_MalformedBody |
| errors_test.go | TestBadRequest, TestErrorShape, TestNotFound |

### Wave 1: Service Gap + Handler Package Foundation

**Task 1-01 — AccountsService.GetByID and UpdateAccount** (`internal/service/accounts.go`):

```go
func (s *AccountsService) GetByID(id uuid.UUID) (sqlite.Account, error)
func (s *AccountsService) UpdateAccount(id uuid.UUID, name *string, balance *int64) error
```

**Task 1-02 — go-playground/validator + errors.go** (`internal/handler/errors.go`):

- `CustomValidator` — implements `echo.Validator` wrapping `validator.New()`
- `NewCustomValidator()` — constructor
- `CustomHTTPErrorHandler(err error, c echo.Context)` — uniform `{"error":"..."}` JSON response for all error codes (mitigates T-4-02)

**Task 1-03** — Full test suite verified: 17 tests SKIP, exit 0, no compile errors.

## Verification Results

```
go build ./internal/... ./cmd/...  → success
go test ./internal/handler/... -v  → 17 SKIP, ok exit 0
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing prerequisite] Committed untracked engine/repo/service files**
- **Found during:** Pre-task setup
- **Issue:** `internal/repo/sqlite/`, `internal/engine/`, `internal/service/engine.go`, and `internal/service/transactions.go` were untracked WIP files on the main checkout. The worktree branch (70d3b57) didn't have them, causing `internal/service/accounts.go` to fail to compile (`no required module provides github.com/ufleck/cibi/internal/repo/sqlite`).
- **Fix:** Copied the untracked files from the main working tree into the worktree and committed them as a prerequisite commit.
- **Files modified:** internal/engine/engine.go, internal/engine/engine_test.go, internal/repo/sqlite/accounts.go, internal/repo/sqlite/pay_schedule.go, internal/repo/sqlite/safety_buffer.go, internal/repo/sqlite/transactions.go, internal/service/engine.go, internal/service/transactions.go
- **Commit:** 1eea82c

**2. [Rule 2 - Enhancement] Added serveRequest helper beyond plan spec**
- **Found during:** Task 0-01
- **Issue:** Tests for error shape (TestErrorShape, TestBadRequest, TestNotFound in errors_test.go) require the Echo HTTPErrorHandler to run end-to-end, which means routing through `e.ServeHTTP`. The `makeRequest` helper alone only creates a context without triggering the error handler middleware.
- **Fix:** Added `serveRequest(handler, method, path, body)` helper that registers a route and fires through `e.ServeHTTP` so error handler runs correctly in Plan 02 tests.
- **Files modified:** internal/handler/testhelpers_test.go

## Known Stubs

None — this plan intentionally creates test stubs (all `t.Skip`) as the Wave 0 foundation for Plan 02. The stubs are not wiring gaps; they are the planned output.

## Threat Surface Scan

No new network endpoints or auth paths introduced. This plan creates internal packages only. CustomHTTPErrorHandler mitigates T-4-02 (raw service errors leaking internals). No new threat flags.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| internal/handler/errors.go | FOUND |
| internal/handler/testhelpers_test.go | FOUND |
| internal/handler/accounts_test.go | FOUND |
| internal/handler/transactions_test.go | FOUND |
| internal/handler/check_test.go | FOUND |
| internal/handler/errors_test.go | FOUND |
| internal/service/accounts.go (GetByID, UpdateAccount) | FOUND |
| go.mod (validator dependency) | FOUND |
| commit 2382eea (errors.go) | FOUND |
| commit 4bb0f06 (service gap) | FOUND |
| commit f376f1c (test stubs) | FOUND |
| commit 1eea82c (prerequisite packages) | FOUND |
