# Codebase Concerns

**Analysis Date:** 2026-04-11

---

## Tech Debt

**Spec/Implementation Language Mismatch:**
- Issue: `CIBI_SPEC.md` prescribes Python 3.11+, FastAPI, and Pydantic. The actual implementation is Go with Echo. The spec also references a "Decision Engine" and `SafetyBuffer` entity — neither exists in the codebase yet.
- Files: `CIBI_SPEC.md`, `main.go`, `go.mod`
- Impact: The spec is not usable as a reference without constant mental translation. Future contributors may be confused about the intended direction.
- Fix approach: Either update `CIBI_SPEC.md` to reflect the Go/Echo stack, or explicitly note the tech change at the top of the spec.

**Recurring Transaction Logic Entirely Missing:**
- Issue: `CIBI_SPEC.md` defines `is_recurring`, `recurrence_rule` (RRULE), and `next_occurrence` as core schema fields. The actual `transactions` table and `data.Transaction` struct have none of these fields. The "Can I Buy It?" engine depends entirely on projecting recurring transactions forward.
- Files: `db/sqlite.go`, `data/transactions.go`, `types/types.go`
- Impact: The central product feature cannot be built until this schema gap is closed. Any data inserted now will require a migration.
- Fix approach: Add `is_recurring BOOLEAN`, `recurrence_rule TEXT`, `next_occurrence TIMESTAMP` to the `transactions` table and matching fields to `data.Transaction` and `types.NewTransaction`.

**`SafetyBuffer` / Decision Engine Not Implemented:**
- Issue: The spec defines `SafetyBuffer` as a global config entity and describes the full "Can I Buy It?" calculation. No endpoint, service, data model, or DB table for this exists.
- Files: None — entirely absent
- Impact: The core product value (FR2) is unimplemented. All current work is CRUD scaffolding only.
- Fix approach: Implement as a Phase 1 priority after the recurring transaction schema is in place.

**`UpdateTransaction` in Repo Has No Exposed Route:**
- Issue: `repos/transactions.go` defines `UpdateTransaction` and a `Update()` method, but there is no handler or route wired up for it. The method is also broken (see Known Bugs).
- Files: `repos/transactions.go`, `handlers/routes.go`
- Impact: Dead code. Updating a transaction is impossible through the API.
- Fix approach: Either wire up a `PATCH /transactions/:id` route or remove the stub until it is properly implemented.

**`data.Account.AddTransaction()` Is Unused:**
- Issue: `data/accounts.go` defines `AddTransaction()` on `Account`, but it is never called anywhere in the codebase. Balance mutation is handled instead through `repos.SqliteTxnsRepo.Insert()`.
- Files: `data/accounts.go`
- Impact: Dead code creates confusion about the intended mutation path.
- Fix approach: Remove `AddTransaction()` or integrate it into the actual flow.

---

## Known Bugs

**SQL Injection in `Update()` (Critical):**
- Symptoms: The `Update` method in `repos/transactions.go` builds a raw SQL query by string-concatenating user-controlled values (`newt.Name`, `newt.Description`, `tId.String()`) without using parameterized queries or any escaping.
- Files: `repos/transactions.go` lines 98–128
- Trigger: Any call to `Update()` with a crafted `Name` or `Description` value.
- Workaround: The route is not currently exposed, so this is not exploitable via the API today — but the method exists and could be wired up accidentally.

**`Update()` Logic Bug — Wrong Field Written:**
- Symptoms: When `newt.EvaluatesAt` is zero (its zero value), the code writes `set value = <EvaluatesAt>` instead of `set evaluates_at = <EvaluatesAt>`. This is a copy-paste error.
- Files: `repos/transactions.go` lines 114–116
- Trigger: Any call where `EvaluatesAt` is not set.
- Workaround: None — the function is broken by design.

**`Update()` Produces Invalid SQL for Multiple Fields:**
- Symptoms: Each field appends `set field = value` separately, resulting in SQL like `update transactions set name = foo set description = bar` which is invalid. Only one `SET` keyword is allowed, fields must be comma-separated.
- Files: `repos/transactions.go` lines 98–128
- Trigger: Calling `Update()` with more than one field populated.
- Workaround: None — the function will always error when more than one field is provided.

**`DeleteById()` Does Not Commit After First Error:**
- Symptoms: In `repos/accounts.go` line 174, `tx.Commit()` is called without checking its return error. If the `delete from transactions` exec fails and `Rollback()` is called, the function returns — but if only the first `delete from accounts` exec succeeds and the second fails, the rollback is correct. However, if `Commit()` itself fails, the error is silently swallowed.
- Files: `repos/accounts.go` lines 157–177
- Trigger: Disk full or connection failure at commit time.
- Workaround: None — commit errors are invisible.

**`Insert()` in `repos/accounts.go` Does Not Check Commit Error:**
- Symptoms: `tx.Commit()` on line 46 is called but its error is not checked or returned. A failed commit is silently ignored.
- Files: `repos/accounts.go` line 46
- Trigger: Disk full or SQLite locking at commit time.
- Workaround: None.

**Foreign Key in `transactions` Table References Wrong Column:**
- Symptoms: `db/sqlite.go` line 38 declares `foreign key (account_id) references accounts(account_id)`. The `accounts` table has no column named `account_id` — its primary key column is named `id`. SQLite does not enforce foreign keys by default, so this silently does nothing. If `PRAGMA foreign_keys = ON` is ever enabled, all transaction inserts will fail.
- Files: `db/sqlite.go` line 38
- Trigger: Enabling `PRAGMA foreign_keys = ON`.
- Workaround: Foreign key enforcement is off by default in SQLite, so it is currently inert.

**`HandleUpdateAcc` Uses `PATCH /` Without ID in Path:**
- Symptoms: `PATCH /accounts/` takes `id` as a query param (`?id=...`) while all other account routes use `/:id` path params. This is inconsistent and makes the update endpoint harder to call correctly.
- Files: `handlers/accounts.go` lines 68–89, `handlers/routes.go` line 11
- Trigger: Any PATCH call.
- Workaround: Callers must remember to use `?id=` instead of the path parameter pattern.

---

## Security Considerations

**No Authentication or Authorization:**
- Risk: All endpoints are fully open. Any client on the network can read balances, create/delete accounts, or manipulate transactions.
- Files: `handlers/routes.go`, `main.go`
- Current mitigation: None. The spec mentions Tailscale as the network boundary — but no middleware enforces any identity.
- Recommendations: Add at minimum a static bearer token middleware in Echo before exposing over Tailscale. For multi-user scenarios, use proper auth.

**SQL Injection via String Concatenation:**
- Risk: `repos/transactions.go` `Update()` builds raw SQL from unsanitized user input.
- Files: `repos/transactions.go` lines 98–128
- Current mitigation: The route is not yet exposed via the API.
- Recommendations: Rewrite using parameterized queries (`db.Conn.Exec("... where id = ?", tId)`) before the route is wired up.

**Debug Logging of Sensitive Financial Data:**
- Risk: `fmt.Println(txn)` in `handlers/transactions.go` line 27 and `fmt.Println(tx)` in `repos/transactions.go` line 83 print full transaction data (names, values, timestamps) to stdout on every request. In production this leaks financial data to logs.
- Files: `handlers/transactions.go` line 27, `repos/transactions.go` line 83, `services/transactions.go` lines 27–28
- Current mitigation: None.
- Recommendations: Remove all `fmt.Println` debug statements before any production or Tailscale deployment. Use structured logging if observability is needed.

**Hardcoded Port:**
- Risk: Server always starts on `:42069` with no way to override via environment variable or config.
- Files: `main.go` line 36
- Current mitigation: Not a security issue per se, but reduces operational flexibility.
- Recommendations: Read port from an environment variable with a fallback default.

**DB File Path is Relative:**
- Risk: `db/sqlite.go` uses `./db/cibi-api.db` — a relative path. The database location depends on the working directory at process start. Running the binary from a different directory silently creates a new empty DB.
- Files: `db/sqlite.go` line 15
- Current mitigation: None.
- Recommendations: Accept DB path via environment variable or config flag.

---

## Performance Bottlenecks

**No Database Connection Pooling Configuration:**
- Problem: `sql.Open` is called once but `MaxOpenConns`, `MaxIdleConns`, and `ConnMaxLifetime` are never set. For SQLite this is less critical, but concurrent requests can queue up indefinitely.
- Files: `db/sqlite.go`
- Cause: Default Go `database/sql` pool settings.
- Improvement path: Set `db.Conn.SetMaxOpenConns(1)` for SQLite (which is single-writer) to make locking behavior explicit.

---

## Fragile Areas

**Global `db.Conn` Singleton:**
- Files: `db/sqlite.go` line 10, all `repos/` files
- Why fragile: All repository functions access `db.Conn` as a package-level global. If `Init()` is not called before any repo operation (e.g., in tests), all DB calls will panic with a nil pointer dereference. There is no guard or lazy initialization.
- Safe modification: Always call `db.Init()` before any repo operation. Never import `db` in tests without calling `Init()` first.
- Test coverage: No tests exist anywhere in the codebase.

**`UpdateIsDefault` Transaction Ordering Bug:**
- Files: `repos/accounts.go` lines 132–155
- Why fragile: `UpdateIsDefault` first sets the new account's `is_default` to the provided value, then calls `UnsetDefaults` which sets ALL accounts to 0. If `isDefault` is `true`, the newly set account is immediately unset. The intent appears to be "set this one as default and clear others," but the order of operations achieves the opposite.
- Safe modification: Call `UnsetDefaults` first, then set the new default account.
- Test coverage: None.

**`HandleGetAllAccs` and `HandleGetDefaultAcc` Return 404 for Server Errors:**
- Files: `handlers/accounts.go` lines 58–66, 48–56
- Why fragile: Both handlers return `http.StatusNotFound` (404) when the service layer returns an error. A DB failure or empty result set both surface as 404, making it impossible for clients to distinguish "no accounts" from "server broke."
- Safe modification: Return 500 for unexpected errors, reserve 404 for "not found" semantics.
- Test coverage: None.

---

## Test Coverage Gaps

**No Tests Exist:**
- What's not tested: The entire codebase — all handlers, services, repos, and data models.
- Files: All files under `handlers/`, `services/`, `repos/`, `data/`
- Risk: Every bug listed above went undetected because there is no test harness. Regressions during future development will be invisible until they hit the running server.
- Priority: High

**No Test Infrastructure:**
- What's not tested: There is no `*_test.go` file, no test helper, no mock implementations of `AccountsRepo` or `TransactionsRepo` interfaces.
- Files: None exist
- Risk: Adding tests later will require retrofitting mocks for every interface.
- Priority: High — the repo interfaces (`AccountsRepo`, `TransactionsRepo`) are already defined, which makes mocking feasible without major refactoring.

---

## Missing Critical Features

**No `GET /transactions` or `GET /transactions/:id` Endpoint:**
- Problem: Transactions can be created but not listed or retrieved individually. They are only visible as a nested field when fetching an account.
- Blocks: Any client that needs to display a standalone transaction list or edit a specific transaction.

**No "Can I Buy It?" Endpoint:**
- Problem: The product's core query (`FR2` in spec) does not exist. There is no route, service, or logic for computing purchasing power.
- Blocks: The entire product value proposition.

**No `SafetyBuffer` Config:**
- Problem: The `SafetyBuffer` entity from the spec has no table, model, or API surface.
- Blocks: The Decision Engine calculation.

**No `PATCH /transactions/:id` Route:**
- Problem: The `UpdateTransaction` struct and `Update()` repo method exist but are not wired to any route.
- Blocks: Editing existing transactions via the API.

---

*Concerns audit: 2026-04-11*
