---
phase: 08-friend-ledger
fixed_at: 2026-04-14T00:00:00Z
review_path: .planning/phases/08-friend-ledger/08-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-04-14T00:00:00Z
**Source review:** .planning/phases/08-friend-ledger/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9
- Fixed: 9
- Skipped: 0

## Fixed Issues

### WR-01 + WR-05: Non-atomic partial updates and missing RowsAffected check

**Files modified:** `internal/repo/sqlite/friend.go`, `internal/repo/sqlite/peer_debt.go`, `internal/repo/sqlite/group_event.go`
**Commit:** 569f5b6
**Applied fix:** Wrapped all `Exec` calls in each `Update` method inside a single `db.Begin()` transaction with `defer tx.Rollback()`. Added `RowsAffected()` check on the first updated field in each method — returns `sql.ErrNoRows` when 0 rows are affected, making the handler's 404 path reliable without relying on a subsequent `GetByID` call.

---

### WR-02 + WR-03: Integer division truncation and NULL-arithmetic in installment obligations

**Files modified:** `internal/repo/sqlite/peer_debt.go`
**Commit:** 3e0684f
**Applied fix:** Changed the installment branch of `SumUpcomingPeerObligations` to use `CAST(amount AS REAL) / total_installments` (avoiding integer truncation), added `AND total_installments IS NOT NULL AND total_installments > 0` guards to the WHERE clause (preventing NULL-arithmetic silent drops), scanned result into `float64` and rounded to cents with `int64(math.Round(installmentSum))`. Added `math` to imports.

---

### WR-04: No server-side validation that installment debts have `total_installments`

**Files modified:** `internal/handler/peer_debt.go`
**Commit:** 5e3fc00
**Applied fix:** Added an explicit guard in `PeerDebtHandler.Create` after the validate call: if `req.IsInstallment` is true and `req.TotalInstallments` is nil or <= 0, returns HTTP 400 with a descriptive message before the record is written.

---

### WR-06: `ConfirmInstallment` is not atomic — lost update under concurrency

**Files modified:** `internal/repo/sqlite/peer_debt.go`, `internal/service/peer_debt.go`
**Commit:** 7150971
**Applied fix:** Added `ConfirmInstallment(id uuid.UUID) error` to the `PeerDebtRepo` interface and implemented it in `SqlitePeerDebtRepo` using a single atomic SQL `UPDATE` statement that uses `CASE WHEN` to handle both installment (increment `paid_installments`, capped via `MIN`) and non-installment (set `is_confirmed = 1`) cases. Simplified `PeerDebtService.ConfirmInstallment` to delegate directly to the new repo method, eliminating the read-modify-write race.

---

### WR-07: Unsafe route param access via `useParams({ strict: false })` type assertion

**Files modified:** `web/src/router.tsx`, `web/src/pages/friend-public.tsx`, `web/src/pages/group-public.tsx`
**Commit:** 68ed53a
**Applied fix:** Exported `publicFriendRoute` and `publicGroupRoute` from `router.tsx`. Updated `FriendPublicPage` to use `publicFriendRoute.useParams()` and `GroupPublicPage` to use `publicGroupRoute.useParams()`, replacing the `useParams({ strict: false }) as { token: string }` unsafe cast. The token is now guaranteed non-undefined by TanStack Router's type system.

---

### WR-08: Frontend sends `NaN` / `null` when numeric form fields are empty

**Files modified:** `web/src/pages/friends.tsx`
**Commit:** 7318baf
**Applied fix:** Added NaN validation in `handleAddDebt` before calling `addDebtMutation.mutate()`: validates `parseFloat(debtForm.amount)` and, when `is_installment` is true, validates `parseInt(debtForm.total_installments, 10)` — showing a toast error and returning early if either is NaN or non-positive. Added a `handleCreateEvent` function for the group event form that validates `parseFloat(eventForm.total_amount)` before calling `createEventMutation.mutate()`, replacing the inline `onSubmit` lambda.

---

### WR-09: `SetParticipants` does not verify the event exists

**Files modified:** `internal/repo/sqlite/group_event.go`
**Commit:** cf35a3e
**Applied fix:** Added an explicit existence check at the top of `SetParticipants` (inside the transaction): `SELECT 1 FROM GroupEvent WHERE id = ?` — returns `sql.ErrNoRows` if not found. Added `defer tx.Rollback()` and removed the now-redundant manual `tx.Rollback()` call inside the insert loop.

---

_Fixed: 2026-04-14T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
