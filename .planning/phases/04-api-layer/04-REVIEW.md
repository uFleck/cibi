---
phase: 04-api-layer
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - internal/handler/errors.go
  - internal/handler/testhelpers_test.go
  - internal/handler/accounts_test.go
  - internal/handler/transactions_test.go
  - internal/handler/check_test.go
  - internal/handler/errors_test.go
  - internal/service/accounts.go
  - go.mod
  - internal/handler/accounts.go
  - internal/handler/transactions.go
  - internal/handler/check.go
  - internal/handler/routes.go
  - internal/handler/docs/openapi.yaml
  - internal/app/app.go
  - cmd/cibi-api/main.go
  - internal/migrations/20260411000001_initial_schema.go
  - internal/repo/sqlite/transactions.go
  - internal/repo/sqlite/accounts.go
  - internal/engine/engine.go
  - internal/service/engine.go
  - internal/service/transactions.go
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The API layer is well-structured. Handlers are thin, the interface-based injection pattern is consistent, dollar-to-cents conversion is applied at the HTTP boundary, and the error shape is uniform. The compile-time interface assertions (`var _ Iface = (*Concrete)(nil)`) are a good safety net.

Two critical bugs stand out: the `RecordDebit` double-debit guard is logically inverted (it blocks debiting when an occurrence is actually due), and all repo Update/Delete methods silently succeed on missing rows, making the handlers' 404 branches permanently dead code. These two classes of issue span service and repo layers and will produce wrong runtime behaviour.

---

## Critical Issues

### CR-01: `RecordDebit` double-debit guard is logically inverted

**File:** `internal/service/transactions.go:116`

**Issue:** The guard comment says "next_occurrence must be in the future to prevent double debit." The opposite is true: `RecordDebit` should execute **only when the transaction is due** (`next_occurrence <= now`). As written, the function refuses to record any debit whose occurrence is already due and happily advances future-dated occurrences that have not yet accrued. This means no recurring debit can ever actually be recorded through this path.

```go
// Current (wrong): blocks when next_occurrence is past — exactly when it should run.
if !t.NextOccurrence.After(now) {
    return fmt.Errorf("... possible double debit ...")
}
```

**Fix:**
```go
// Correct: only proceed when the occurrence is due (past or now).
if t.NextOccurrence.After(now) {
    return fmt.Errorf("service.RecordDebit: next_occurrence is still in the future — not yet due on %v", transactionID)
}
```

---

### CR-02: Repo Update and Delete never check `RowsAffected` — silent no-op on missing IDs

**Files:**
- `internal/repo/sqlite/transactions.go:136-159` (`Update`)
- `internal/repo/sqlite/transactions.go:161-167` (`DeleteByID`)
- `internal/repo/sqlite/accounts.go:150-155` (`UpdateName`)
- `internal/repo/sqlite/accounts.go:137-148` (`UpdateBalance`)

**Issue:** All four methods call `db.Exec` and ignore `sql.Result`. SQLite returns no error when a WHERE clause matches zero rows; `RowsAffected` stays 0. The callers in the service layer (and ultimately the handlers in `accounts.go:151-155` and `transactions.go:183-187`) rely on `errors.Is(err, sql.ErrNoRows)` to return a 404, but that error is never produced. Updating or deleting a non-existent ID always returns HTTP 200/204.

**Fix (example for `UpdateName`; same pattern for all others):**
```go
func (r *SqliteAccountsRepo) UpdateName(id uuid.UUID, name string) error {
    res, err := r.db.Exec(`UPDATE Account SET name = ? WHERE id = ?`, name, id.String())
    if err != nil {
        return fmt.Errorf("accounts.UpdateName: %w", err)
    }
    n, err := res.RowsAffected()
    if err != nil {
        return fmt.Errorf("accounts.UpdateName: rows affected: %w", err)
    }
    if n == 0 {
        return fmt.Errorf("accounts.UpdateName: %w", sql.ErrNoRows)
    }
    return nil
}
```

Apply the same pattern to `UpdateBalance`, `SqliteTxnsRepo.Update` (check after the last `Exec` that ran), and both `DeleteByID` implementations.

---

## Warnings

### WR-01: `CustomHTTPErrorHandler` writes a response even when already committed

**File:** `internal/handler/errors.go:43`

**Issue:** The comment "suppress error if response already committed" implies intent to guard against double-writes, but no such guard exists. If the response is already committed (e.g., streaming was started), calling `c.JSON(...)` will write a second response body, corrupting the wire stream. The discarded error (`_ = c.JSON(...)`) hides this failure.

**Fix:**
```go
func CustomHTTPErrorHandler(err error, c echo.Context) {
    // ... code ...
    if c.Response().Committed {
        return
    }
    _ = c.JSON(code, map[string]string{"error": msg})
}
```

---

### WR-02: Internal error messages are leaked to HTTP clients

**Files:** `internal/handler/accounts.go:76,89,103,114`, `internal/handler/transactions.go:105,121,187,196`, `internal/handler/check.go:54`

**Issue:** When a service call fails with a non-404 error, `err.Error()` is passed directly to `echo.NewHTTPError`, which surfaces it in the JSON response body. Internal error strings include DB file paths, table names, and query fragments (e.g., `"accounts.GetAll: query: ..."`, `"transactions.Insert: ..."`) — these are information disclosure.

**Fix:** Replace dynamic error messages with generic strings for 500 responses:
```go
// Instead of:
return echo.NewHTTPError(http.StatusInternalServerError, err.Error())

// Use:
return echo.NewHTTPError(http.StatusInternalServerError, "internal server error")
// Log the actual error via c.Logger().Error(err) or the app's logger.
```

---

### WR-03: `CreateTransaction` handler does not validate recurring-field consistency

**File:** `internal/handler/transactions.go:115-148`

**Issue:** When `is_recurring: true` is passed with no `frequency` or `anchor_date`, the handler happily calls `service.CreateTransaction` which returns a plain `fmt.Errorf` (not wrapping a sentinel). The handler maps all non-`sql.ErrNoRows` service errors to HTTP 500, so a client supplying an invalid recurring transaction gets a 500 instead of a 400. The validation logic lives at the service layer but the error classification is wrong at the handler layer.

**Fix:** Define a sentinel validation error in the service or return a typed error, and check it in the handler to return 400:
```go
// In service/transactions.go
var ErrInvalidInput = errors.New("invalid input")

// Wrap validation failures:
return fmt.Errorf("%w: recurring transaction requires a valid frequency", ErrInvalidInput)

// In handler:
if errors.Is(err, service.ErrInvalidInput) {
    return echo.NewHTTPError(http.StatusBadRequest, err.Error())
}
return echo.NewHTTPError(http.StatusInternalServerError, "internal server error")
```

---

### WR-04: `Update` (PATCH) handler for accounts and transactions has a TOCTOU window

**Files:** `internal/handler/accounts.go:136-165`, `internal/handler/transactions.go:152-198`

**Issue:** Both Update handlers call `svc.Update(...)` and then `svc.GetByID(...)` to build the response. Between the two calls, another request could mutate or delete the record, so the returned response may not reflect what the PATCH actually wrote. While this is a known limitation of non-atomic read-after-write, it can be surprising; more practically, if the record is deleted between the two calls, the handler returns a 500 (from `GetByID`) rather than 204/404.

**Fix:** The cleanest fix is to have the Update service method return the updated entity, or wrap both operations in a single DB transaction in the repo layer.

---

### WR-05: `go.mod` declares `go 1.25.0` — version does not exist

**File:** `go.mod:3`

**Issue:** Go 1.25.0 does not exist. The current stable series is 1.22/1.23/1.24. Depending on the toolchain installed, `go build` may succeed (the go directive is advisory) or the `go` line may cause unexpected behaviour with `toolchain` directives. Likely a typo for `1.23.0` or `1.24.0`.

**Fix:**
```
go 1.23.0
```
Run `go mod tidy` afterward to verify.

---

## Info

### IN-01: Migration schema has no NOT NULL constraints or indexes

**File:** `internal/migrations/20260411000001_initial_schema.go:16-43`

**Issue:** All columns in `Account`, `Transaction`, `PaySchedule`, and `SafetyBuffer` are nullable by default (SQLite's default). Columns like `Account.name`, `Account.currency`, `Transaction.account_id`, `Transaction.amount` should be `NOT NULL`. Additionally, `Transaction.account_id` has no index, which will cause a full table scan on every `GetByAccount` and `SumUpcomingObligations` query. `Account.is_default` also lacks an index and a partial unique index to enforce at most one default.

**Fix:** Add NOT NULL to mandatory columns and an index:
```sql
CREATE TABLE IF NOT EXISTS "Transaction" (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL REFERENCES Account(id),
    amount INTEGER NOT NULL,
    ...
);
CREATE INDEX IF NOT EXISTS idx_transaction_account_id ON "Transaction"(account_id);
CREATE INDEX IF NOT EXISTS idx_transaction_next_occurrence ON "Transaction"(account_id, next_occurrence)
    WHERE is_recurring = 1;
```

---

### IN-02: `ValidFrequencies` map in `repo/sqlite` does not include `"semi-monthly"`

**File:** `internal/repo/sqlite/transactions.go:12-17`

**Issue:** The engine package defines `FreqSemiMonthly = "semi-monthly"` and handles it in `NextPayday`. The `ValidFrequencies` map used by `service.CreateTransaction` to validate recurring transactions omits `"semi-monthly"`, so a semi-monthly transaction cannot be created through the API even though the engine supports it. This inconsistency will silently block valid input.

**Fix:**
```go
var ValidFrequencies = map[string]bool{
    "weekly":       true,
    "bi-weekly":    true,
    "semi-monthly": true,
    "monthly":      true,
    "yearly":       true,
}
```
Update the OpenAPI spec `frequency` enum and the `CreateTransactionRequest` comment to match.

---

### IN-03: `GET /transactions` test does not exercise the query-string parsing path

**File:** `internal/handler/transactions_test.go:35`

**Issue:** `TestListTransactions` passes `account_id` in the URL but uses `makeRequest` (not `serveRequest`), so the Echo routing layer is bypassed and `c.QueryParam("account_id")` will return an empty string. The handler then returns 400, but the test calls `h.List(c)` directly and the mock's `listFn` is never reached. The test passes vacuously because `h.List` returns a 400 error that the test silently accepts as no-error (it calls `t.Fatalf` only on `err != nil`, but `h.List` returns the `echo.HTTPError` not `nil`).

Wait — `echo.NewHTTPError` returns an error, so `h.List(c)` would return non-nil and `t.Fatalf` would fire. But the test passes in CI, which means `makeRequest` does preserve the query string in the `req.URL`. This is a lower-confidence note; the concern is that `makeRequest` creates a bare echo context that does not go through the router, so path/query params set in the URL may not be parsed by `c.QueryParam` through Echo's internal request reference. In practice `httptest.NewRequest` sets `req.URL` correctly and `c.QueryParam` delegates to `req.URL.Query()`, so it works. The observation is still useful: the test path is fragile and a future refactor to path-param tests should use `serveRequest` consistently.

**Suggestion:** Use `serveRequest` for list tests so the full routing + middleware pipeline is exercised, matching the pattern already used in `TestListTransactions_MissingAccountID`.

---

_Reviewed: 2026-04-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
