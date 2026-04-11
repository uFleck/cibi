---
phase: 4
plan: 2
subsystem: api-layer
tags: [handler, routes, openapi, app-rewire, legacy-cleanup, testing]
requires: [04-01]
provides: [AccountsHandler, TransactionsHandler, CheckHandler, SetupRoutes, openapi.yaml, rewired app.go]
affects: [internal/handler/, internal/app/app.go]
tech-stack:
  added: []
  patterns: [service interfaces for mock injection, embed openapi.yaml via go:embed, errors.Is(sql.ErrNoRows) 404 guard, int64(math.Round(x*100)) cents conversion]
key-files:
  created:
    - internal/handler/accounts.go
    - internal/handler/transactions.go
    - internal/handler/check.go
    - internal/handler/routes.go
    - internal/handler/docs/openapi.yaml
  modified:
    - internal/app/app.go
    - internal/handler/accounts_test.go
    - internal/handler/transactions_test.go
    - internal/handler/check_test.go
    - internal/handler/errors_test.go
    - internal/handler/testhelpers_test.go
  deleted:
    - handlers/ (entire directory)
    - repos/ (entire directory)
    - services/ (entire directory)
    - main.go (root legacy entry point)
decisions:
  - AccountsServiceIface/TransactionsServiceIface/EngineServiceIface defined in handler package to enable mock injection without circular deps
  - GetDefault and GetTransaction methods added to mock structs in testhelpers_test.go (they were missing from Plan 01 stubs)
  - root main.go deleted alongside handlers/repos/services — it was the pre-Phase-1 legacy entry point using github.com/ufleck/cibi-api imports; cmd/cibi-api/main.go is the canonical entry point
  - serveRequest helper used for tests where Echo error handler must fire (error shape tests, MissingAccountID test)
metrics:
  duration: ~25m
  completed: "2026-04-11"
  tasks: 4
  files: 15
---

# Phase 4 Plan 02: Handler Implementation + App Rewiring Summary

**One-liner:** Full handler layer (accounts, transactions, check), route registration, embedded OpenAPI doc, app.go rewired to internal packages only, legacy root packages deleted, all 17 tests passing.

## What Was Built

### Wave 1: Handler Files + Test Implementation

**Task 1-01 — AccountsHandler** (`internal/handler/accounts.go`):

- `AccountsServiceIface` interface for mock injection
- `AccountsHandler` with six methods: List, Create, GetDefault, GetByID, Update, Delete
- `CreateAccountRequest` with `validate:"required"` on name and currency (T-4-05 mitigation)
- `PatchAccountRequest` with nullable `*float64` balance field
- `AccountResponse` with cents→dollars conversion (`float64(balance) / 100.0`)
- `errors.Is(err, sql.ErrNoRows)` guards on GetByID, Update (before and after update), GetDefault, Delete (T-4-06 mitigation)
- All money conversions use `int64(math.Round(req.CurrentBalance * 100))` (T-4-08 mitigation)
- All errors returned as `echo.NewHTTPError` — never bare `return err` (D-04)

**Task 1-02 — TransactionsHandler** (`internal/handler/transactions.go`):

- `TransactionsServiceIface` interface with GetTransaction method
- `TransactionsHandler` with four methods: List, Create, Update, Delete
- List requires `?account_id=` query param — returns 400 if missing (T-4-05 mitigation)
- `CreateTransactionRequest` with `validate:"required"` on account_id, amount, description
- RFC3339 parsing for anchor_date and next_occurrence
- `errors.Is(sql.ErrNoRows)` guards on Update and Delete

**Task 1-03 — CheckHandler** (`internal/handler/check.go`):

- `EngineServiceIface` interface
- `CheckRequest` with `validate:"required,gt=0"` on Amount (T-4-04 mitigation)
- `int64(math.Round(req.Amount * 100))` conversion (D-06)
- Returns `CheckResponse` with cents→dollars for PurchasingPower and BufferRemaining

**Test files filled (17 tests, all PASS):**

| File | Tests |
|------|-------|
| accounts_test.go | TestListAccounts, TestCreateAccount, TestGetAccountByID, TestGetAccountByID_NotFound, TestUpdateAccount, TestDeleteAccount |
| transactions_test.go | TestListTransactions, TestListTransactions_MissingAccountID, TestCreateTransaction, TestUpdateTransaction, TestDeleteTransaction |
| check_test.go | TestCheck, TestCheck_NegativeAmount, TestCheck_MalformedBody |
| errors_test.go | TestBadRequest, TestErrorShape, TestNotFound |

### Wave 2: Routes + OpenAPI + App Rewire + Legacy Cleanup

**Task 2-01 — Atomic rewire** (single commit):

- `internal/handler/routes.go`: `SetupRoutes` registers 11 routes including `GET /accounts/default` and `GET /docs`; openapi.yaml embedded via `//go:embed docs/openapi.yaml`
- `internal/handler/docs/openapi.yaml`: OpenAPI 3.0.3 covering all routes with components schemas for Account, CreateAccountRequest, PatchAccountRequest, CreateTransactionRequest, CheckRequest, CheckResponse and an Error response component
- `internal/app/app.go`: Fully rewritten — no imports of legacy `handlers/`, `repos/`, `services/` packages; `CustomHTTPErrorHandler` and `NewCustomValidator()` wired; `Shutdown(ctx)` method added
- `handlers/`, `repos/`, `services/` directories: deleted
- `main.go` (root): deleted (legacy entry point using `github.com/ufleck/cibi-api` module path)

## Verification Results

```
go build ./...  → success (zero legacy imports, all routes compile)
go test ./...   → ok github.com/ufleck/cibi/internal/engine
                  ok github.com/ufleck/cibi/internal/handler (17 PASS)
```

## Acceptance Criteria

- [x] `internal/handler/accounts.go` implements List, Create, GetDefault, GetByID, Update, Delete
- [x] `internal/handler/transactions.go` implements List, Create, Update, Delete
- [x] `internal/handler/check.go` implements Check with `int64(math.Round(amount * 100))` conversion
- [x] `internal/handler/routes.go` registers all 11 routes including GET /accounts/default and GET /docs
- [x] `internal/handler/docs/openapi.yaml` exists and is served at GET /docs
- [x] `internal/app/app.go` has no imports of `handlers/`, `repos/`, `services/` root packages
- [x] `handlers/`, `repos/`, `services/` directories are deleted
- [x] All error responses use `echo.NewHTTPError` — never bare `return err`
- [x] `errors.Is(err, sql.ErrNoRows)` guard present in GetByID, Update, Delete handlers
- [x] All handler test files have real assertions (no remaining `t.Skip`)
- [x] `go test ./...` exits 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing prerequisite] Added GetDefault/GetTransaction to mock structs**
- **Found during:** Task 1-01
- **Issue:** `testhelpers_test.go` mock structs from Plan 01 lacked `GetDefault` (mockAccountsService) and `GetTransaction` (mockTransactionsService) methods, which are required by the handler interfaces defined in this plan.
- **Fix:** Added `getDefaultFn` field and `GetDefault()` method to `mockAccountsService`; added `getByIDFn` field and `GetTransaction()` method to `mockTransactionsService`.
- **Files modified:** `internal/handler/testhelpers_test.go`
- **Commit:** 1d178c3

**2. [Rule 3 - Blocking issue] Restored go.mod/go.sum and internal/ from git HEAD**
- **Found during:** Pre-task setup
- **Issue:** Worktree working directory had stale files from before Plan 01 (missing validator dependency, missing internal/ directory content). Git tracked the correct state in HEAD but files weren't checked out.
- **Fix:** `git checkout HEAD -- go.mod go.sum internal/ db/sqlite.go` to restore tracked file content to worktree.
- **Files modified:** go.mod, go.sum, db/sqlite.go, all internal/ files
- **Commit:** part of task 1-01 commit

**3. [Rule 1 - Bug] Deleted root main.go alongside legacy packages**
- **Found during:** Task 2-01 (Step D)
- **Issue:** After deleting `handlers/`, `repos/`, `services/`, `go build ./...` still failed because root `main.go` imported them via the old `github.com/ufleck/cibi-api` module path. The root `main.go` was a pre-Phase-1 artifact superseded by `cmd/cibi-api/main.go`.
- **Fix:** Deleted `main.go` from repo root.
- **Files modified:** `main.go` (deleted)
- **Commit:** f415972

## Known Stubs

None — all test stubs from Plan 01 have been replaced with real assertions.

## Threat Surface Scan

No new network endpoints beyond what the plan intended. All 11 routes were planned in D-05. The threat mitigations called for in the plan's threat model were applied:

| Threat | Mitigation Applied |
|--------|-------------------|
| T-4-04 | `validate:"required,gt=0"` on CheckRequest.Amount |
| T-4-05 | `validate:"required"` on name/currency/account_id/amount/description |
| T-4-06 | `errors.Is(err, sql.ErrNoRows)` → 404 in all by-ID handlers |
| T-4-07 | Atomic task: handler written → app.go rewritten → legacy deleted → build verified |
| T-4-08 | `int64(math.Round(amount * 100))` used throughout |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| internal/handler/accounts.go | FOUND |
| internal/handler/transactions.go | FOUND |
| internal/handler/check.go | FOUND |
| internal/handler/routes.go | FOUND |
| internal/handler/docs/openapi.yaml | FOUND |
| internal/app/app.go (no legacy imports) | VERIFIED |
| handlers/ directory deleted | VERIFIED |
| repos/ directory deleted | VERIFIED |
| services/ directory deleted | VERIFIED |
| commit 1d178c3 (accounts handler) | FOUND |
| commit a49694b (transactions handler) | FOUND |
| commit 3b6272b (check + error tests) | FOUND |
| commit f415972 (routes + app rewire + cleanup) | FOUND |
| go build ./... exit 0 | VERIFIED |
| go test ./... exit 0 (17 PASS) | VERIFIED |
