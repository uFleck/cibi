# Codebase Concerns

**Analysis Date:** 2026-04-16

---

## Technical Debt

**Massive page-level components (frontend):**
- Issue: `friends.tsx` is 1,342 lines and `accounts.tsx` is 835 lines. Each file holds multiple forms, modals, state machines, and render logic all inline — no component decomposition.
- Files: `web/src/pages/friends.tsx`, `web/src/pages/accounts.tsx`, `web/src/pages/transactions.tsx` (789 lines)
- Impact: High cognitive load when editing. Any new feature touching friends or accounts requires navigating a very large file. Bugs in one form can silently affect adjacent state.
- Fix approach: Extract sub-components (e.g., `FriendForm`, `DebtForm`, `GroupEventForm`, `ParticipantEditor`) into separate files under `web/src/components/`.

**Repetitive "with account" / "without account" method pairs (repo layer):**
- Issue: Every query that can be account-scoped has two nearly-identical implementations: one that scopes by `account_id` and one that does not. This affects `PeerDebtRepo`, `GroupEventRepo`, and their service wrappers. Approximately 20+ method pairs total.
- Files: `internal/repo/sqlite/peer_debt.go`, `internal/repo/sqlite/group_event.go`, `internal/service/peer_debt.go`, `internal/service/group_event.go`
- Impact: Any fix or change to a query must be applied in two places. Already visible in `SumUpcomingPeerObligations` / `SumUpcomingPeerObligationsByAccount` where the installment scheduling logic is duplicated verbatim.
- Fix approach: Make account-scoped the single code path; pass `*uuid.UUID` and filter when non-nil, or remove the legacy unscoped methods after confirming no callers remain.

**Multi-field Update pattern via separate SQL statements per field:**
- Issue: `peer_debt.Update` and `group_event.Update` perform one `UPDATE ... SET field = ?` per changed field, each inside a shared transaction. This is verbose (50+ lines each) and makes it easy to miss the `rowChecked` logic.
- Files: `internal/repo/sqlite/peer_debt.go` lines 245–298, `internal/repo/sqlite/group_event.go` lines 287–339
- Impact: Risk of partially-applied updates if logic branches are missed. Each new patchable field requires adding another conditional block.
- Fix approach: Build a dynamic `UPDATE` statement with a slice of `(column, value)` pairs, or use a dedicated patch struct.

**Installment next-due date computation duplicated in three places:**
- Issue: The logic for computing the next installment due date (advancing from `firstDue` by `(nextInstNum - 1)` periods) is copy-pasted across `internal/repo/sqlite/peer_debt.go` (lines 573–584, 636–647) and `internal/service/peer_debt.go` (lines 162–170, 215–222).
- Files: `internal/repo/sqlite/peer_debt.go`, `internal/service/peer_debt.go`
- Impact: A subtle bug would need to be fixed in four locations. The repo implementations silently `continue` on parse errors, while the service layer returns a nil date — inconsistent behavior.
- Fix approach: Extract a `nextInstallmentDue(firstDue time.Time, paidInstallments int64, frequency string) time.Time` helper in `internal/engine/` or `internal/service/`.

**`SafetyBuffer` config is not per-account:**
- Issue: `SafetyBuffer` is a global singleton (single-row table, no `account_id`). The engine always uses `bufferRepo.Get()` which returns one global threshold.
- Files: `internal/repo/sqlite/safety_buffer.go`, `internal/service/engine.go` line 124
- Impact: Users with multiple accounts cannot set different safety buffers per account. Any future per-account threshold feature requires a schema migration.
- Fix approach: Add an `account_id` column to `SafetyBuffer`, or introduce a per-account settings table.

---

## Known Issues / TODOs

No `TODO`, `FIXME`, or `HACK` comments were found in any `.go`, `.ts`, or `.tsx` file.

**`DeleteTransaction` does not reverse the account balance:**
- When a transaction is deleted via `service.DeleteTransaction`, the account's `current_balance` is not adjusted. Create and Update atomically maintain the balance, but Delete calls `txnsRepo.DeleteByID` directly without balance correction.
- Files: `internal/service/transactions.go` lines 153–158
- Impact: Deleting any transaction permanently corrupts the account balance. The balance becomes stale and directly affects the "Can I Buy It" engine output until the user manually corrects it.
- Fix approach: Fetch the transaction before deletion, then atomically delete it and reverse its amount from the balance, mirroring `CreateTransaction`.

**`PAY_SCHEDULE_REQUIRED` error code is detected via string scanning:**
- The custom error handler detects this sentinel by calling `strings.Index(errMsg, "PAY_SCHEDULE_REQUIRED")` on the full wrapped error string rather than using `errors.Is`. If error wrapping changes the message format, the code detection silently breaks.
- Files: `internal/handler/errors.go` line 46, `internal/service/engine.go`
- Fix approach: Use `errors.Is(err, service.ErrPayScheduleRequired)` after unwrapping with `errors.As`.

**`RecordDebit` double-debit guard condition is inverted:**
- `service.RecordDebit` (`internal/service/transactions.go` line 187) returns an error when `next_occurrence.After(now)` is false — i.e., when the occurrence is in the past. The guard is supposed to prevent debiting an already-passed occurrence, but the condition prevents the call when `next_occurrence` is in the future, which is the valid state.
- Files: `internal/service/transactions.go` lines 186–189
- Impact: `RecordDebit` is not called from any HTTP handler, so this is latent. Any future caller will be blocked from debiting future occurrences.

---

## Security Concerns

**No authentication or authorization on any `/api` route:**
- The entire `/api` surface (accounts, transactions, peer debts, group events, pay schedule, profile) has no authentication middleware. Any party with network access to the server port can read all financial data and perform any mutation.
- Files: `internal/handler/routes.go`, `cmd/cibi-api/main.go`
- Current mitigation: The application is designed as a personal self-hosted tool. Network exposure is expected to be limited to localhost/LAN.
- Recommendation: If exposed beyond localhost, add at minimum a shared-secret bearer token middleware on the `/api` group.

**Public endpoints expose financial data with no rate limiting or token expiry:**
- `/public/friend/:token` returns a friend's full debt list, balances, and group events. `/public/group/:token` returns all participant shares. There is no rate limiting, no token expiry, and no revocation mechanism.
- Files: `internal/handler/public.go`, `internal/handler/routes.go` lines 99–102
- Current mitigation: Tokens are UUIDs (128-bit random), providing adequate brute-force resistance for casual threat models.
- Recommendation: Add rate limiting middleware. Consider a token rotation endpoint.

**Internal error messages are leaked to HTTP clients:**
- Handlers call `echo.NewHTTPError(http.StatusInternalServerError, err.Error())` throughout (e.g., `internal/handler/public.go` lines 150–157, `internal/handler/friend.go` line 116). This exposes raw Go error strings including internal context to the caller.
- Files: All handler files
- Recommendation: Log the full error server-side and return a generic "internal server error" message. The `CustomHTTPErrorHandler` (`internal/handler/errors.go`) already does this separation for errors it constructs directly, but not for `err.Error()` pass-throughs.

**`account_id` columns added by migration lack `NOT NULL` constraint:**
- Migration `20260416000005` adds `account_id` as a nullable column to `PeerDebt` and `GroupEvent` with no `NOT NULL`. New rows inserted without `account_id` will store NULL and be invisible in all account-scoped queries.
- Files: `internal/migrations/20260416000005_account_scoped_friend_ledger.go`
- Fix approach: Add a follow-up migration that adds `CHECK (account_id IS NOT NULL)` or rebuilds the columns with `NOT NULL`.

**Core schema tables have minimal `NOT NULL` / `DEFAULT` constraints:**
- The initial migration defines `Account.current_balance`, `Account.is_default`, `Transaction.amount`, `Transaction.description`, etc., without `NOT NULL`. NULL values in numeric columns will silently produce `0` via `COALESCE` in aggregate queries rather than surfacing as errors.
- Files: `internal/migrations/20260411000001_initial_schema.go`

---

## Performance Risks

**Installment obligation calculation fetches all installment rows into Go for date filtering:**
- `SumUpcomingPeerObligationsByAccount` fetches every active installment debt into Go memory, then filters by date range in a loop. The same pattern exists for group event obligations.
- Files: `internal/repo/sqlite/peer_debt.go` lines 540–588 and 605–651, `internal/repo/sqlite/group_event.go` lines 477–511 and 516–548
- Impact: Negligible at personal-use scale (<100 debts), but the pattern is O(n) with no SQL-side filter.
- Fix approach: Push the date-range filter into SQL, or precompute a `next_due` column on the row.

**N+1 queries for participant friend names in `GetFriendByToken`:**
- For each hosted group event, `GetFriendByToken` calls `h.friendSvc.GetFriendByID` for each participant individually.
- Files: `internal/handler/public.go` lines 182–192
- Impact: O(events × participants) individual DB queries per public page load.
- Fix approach: Add a `GetParticipantsByEventWithNames` query that JOINs `Friend`, or batch-load friend names.

**Installment payment calculation truncates remainder cents:**
- The SQL `amount / total_installments` and Go-layer equivalent use integer division. Remainder cents are silently dropped. Example: a 100-cent debt in 3 installments returns 33 per installment, losing 1 cent.
- Files: `internal/repo/sqlite/peer_debt.go` lines 396–398, `internal/service/peer_debt.go` lines 151, 201

---

## Scalability Considerations

**SQLite with `SetMaxOpenConns(1)` is the sole storage layer:**
- All reads and writes share a single connection. WAL mode allows concurrent reads, but any write serializes all waiters. Hard limit for multi-user scenarios.
- Files: `db/sqlite.go`
- Impact: Acceptable for single-user personal use. Would be a ceiling for any multi-user deployment.

**No pagination on any list endpoint:**
- `GET /api/transactions`, `GET /api/peer-debts`, `GET /api/group-events`, `GET /api/friends` all return unbounded result sets.
- Files: `internal/handler/transactions.go`, `internal/handler/peer_debt.go`, `internal/handler/group_event.go`, `internal/handler/friend.go`
- Impact: Negligible at personal use scale. Can become a concern if thousands of transactions accumulate over years.

---

## Areas Needing Refactor

**`public.go` handler contains business logic that belongs in the service layer:**
- `GetFriendByToken` (lines 137–208) iterates events, finds participant rows, determines `viewerIsHost`, and builds `hostedGroups`. This logic is untested and difficult to test without HTTP scaffolding.
- Files: `internal/handler/public.go`

**`friends.tsx` mixes all friend ledger features into one file:**
- Handles friend CRUD, peer debt CRUD, group event CRUD, participant management, and all their modal UIs in a single 1,342-line file.
- Files: `web/src/pages/friends.tsx`

**Repo-layer `Update` methods (field-at-a-time pattern):**
- Both `PeerDebt.Update` and `GroupEvent.Update` open a transaction and issue individual `UPDATE ... SET field = ?` queries per field. A single dynamic `UPDATE` statement would be cleaner.
- Files: `internal/repo/sqlite/peer_debt.go` lines 245–298, `internal/repo/sqlite/group_event.go` lines 287–339

---

## Missing Features / Gaps

**No balance reversal on transaction delete:**
- Deleting a transaction does not restore the account balance. This is a correctness gap that directly affects the engine's purchasing power calculation. See Known Issues for full detail.
- Files: `internal/service/transactions.go`

**No HTTP endpoint to set the safety buffer:**
- `SafetyBufferRepo.Set` exists but there is no route or handler that calls it. The buffer can only be changed via the `CIBI_SAFETY_BUFFER` environment variable, requiring a server restart.
- Files: `internal/repo/sqlite/safety_buffer.go`, `internal/handler/routes.go`
- Impact: Users cannot change their safety buffer threshold at runtime through the UI.

**No public token revocation endpoint:**
- Once a friend or group event is created, its public token is permanent. There is no "rotate token" endpoint. A leaked link can only be invalidated by deleting and recreating the record.
- Files: `internal/handler/routes.go`, `internal/repo/sqlite/friend.go`

**No test coverage for the service layer:**
- Handler tests exist (`internal/handler/`) and engine tests exist (`internal/engine/engine_test.go`). The service layer has only `pay_schedule_test.go`. Core methods including `CreateTransaction`, `ConfirmRecurring`, `GetFriendDebtBreakdown`, and all of `group_event.go` service have no tests.
- Files: `internal/service/` (most files lack a `_test.go` counterpart)
- Impact: The `DeleteTransaction` balance-corruption bug has no test catching it. Service-layer regressions can go unnoticed.

**No test coverage for public endpoints:**
- `internal/handler/public.go` (276 lines, most complex handler file) has no corresponding test file.
- Files: `internal/handler/public.go`

**`RecordDebit` is dead code:**
- `TransactionsService.RecordDebit` is implemented but called from no HTTP handler. `ConfirmRecurring` is the live path. `RecordDebit` also has the inverted guard bug described in Known Issues.
- Files: `internal/service/transactions.go`

---

*Concerns audit: 2026-04-16*
