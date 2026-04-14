---
phase: 08-friend-ledger
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - internal/app/app.go
  - internal/handler/friend.go
  - internal/handler/group_event.go
  - internal/handler/peer_debt.go
  - internal/handler/public.go
  - internal/handler/routes.go
  - internal/migrations/20260414000002_friend_ledger.go
  - internal/repo/sqlite/friend.go
  - internal/repo/sqlite/group_event.go
  - internal/repo/sqlite/peer_debt.go
  - internal/service/engine.go
  - internal/service/friend.go
  - internal/service/group_event.go
  - internal/service/peer_debt.go
  - internal/service/token.go
  - web/src/components/FriendLedgerWidget.tsx
  - web/src/components/SidebarNav.tsx
  - web/src/lib/api.ts
  - web/src/pages/friend-public.tsx
  - web/src/pages/friends.tsx
  - web/src/pages/group-public.tsx
  - web/src/router.tsx
findings:
  critical: 3
  warning: 9
  info: 4
  total: 16
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-04-14
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

The Friend Ledger implementation is well-structured with clean layering (repo → service → handler → frontend) and correct use of interface-based dependency injection. The migration, public-token generation, and overall wire-up are solid.

Three categories of recurring problems were found:

1. **Non-atomic partial updates in the repo layer.** All three `Update` methods (Friend, GroupEvent, PeerDebt) issue multiple independent `Exec` calls. A mid-flight error silently commits partial data.
2. **SQL division-by-zero / NULL-math in the engine obligation query**, which can silently corrupt the CanIBuyIt purchasing-power calculation.
3. **Frontend NaN/null propagation** — raw `parseFloat` / `parseInt` results are sent to the API without validation guards, creating invalid records on empty form submission.

---

## Critical Issues

### CR-01: Non-atomic Friend update — partial write on error

**File:** `internal/repo/sqlite/friend.go:123-135`
**Issue:** `Update` issues two independent `Exec` calls — one for `name`, one for `notes` — outside a transaction. If the second `Exec` fails (e.g. disk error, UNIQUE constraint on a future index) the first write is already committed. The row ends up with the new name and the old notes, with no error visible to the caller.

**Fix:**
```go
func (r *SqliteFriendRepo) Update(id uuid.UUID, name *string, notes *string) error {
    tx, err := r.db.Begin()
    if err != nil {
        return fmt.Errorf("friend.Update: begin: %w", err)
    }
    defer tx.Rollback() // no-op after Commit
    if name != nil {
        if _, err := tx.Exec(`UPDATE Friend SET name = ? WHERE id = ?`, *name, id.String()); err != nil {
            return fmt.Errorf("friend.Update: name: %w", err)
        }
    }
    if notes != nil {
        if _, err := tx.Exec(`UPDATE Friend SET notes = ? WHERE id = ?`, *notes, id.String()); err != nil {
            return fmt.Errorf("friend.Update: notes: %w", err)
        }
    }
    return tx.Commit()
}
```

Alternatively, build a single `UPDATE Friend SET name=COALESCE(?,name), notes=COALESCE(?,notes) WHERE id=?` query.

---

### CR-02: Non-atomic GroupEvent update — partial write on error

**File:** `internal/repo/sqlite/group_event.go:136-158`
**Issue:** `Update` runs up to four independent `Exec` calls (title, date, total_amount, notes) without a transaction. Any failure after the first statement leaves the event in an inconsistent state with no rollback.

**Fix:** Same transaction-wrapping pattern as CR-01 — begin a transaction, wrap all `Exec` calls, `defer tx.Rollback()`, commit at the end.

---

### CR-03: Non-atomic PeerDebt update — partial write on error

**File:** `internal/repo/sqlite/peer_debt.go:182-204`
**Issue:** `Update` runs up to four independent `Exec` calls (amount, description, is_confirmed, paid_installments) without a transaction. `ConfirmInstallment` in the service layer calls this method; if the write of `paid_installments` succeeds but a subsequent call errors, the count is off by one with no record of failure.

**Fix:** Same transaction-wrapping pattern as CR-01.

---

## Warnings

### WR-01: SQL division-by-zero / NULL-arithmetic corrupts engine obligations

**File:** `internal/repo/sqlite/peer_debt.go:256-261`
**Issue:** The installment branch of `SumUpcomingPeerObligations` executes:
```sql
SELECT COALESCE(SUM(amount / total_installments), 0) FROM PeerDebt
WHERE amount < 0 AND is_installment = 1 AND paid_installments < total_installments
```
There is no `NOT NULL` or `> 0` constraint on `total_installments` in the migration. SQLite integer division by zero returns `NULL` (not an error), so `COALESCE(SUM(...), 0)` silently returns 0 if any row has `total_installments = 0`. The debt obligation is then invisible to the engine, overstating purchasing power.

**Fix:**
```sql
SELECT COALESCE(SUM(amount / total_installments), 0) FROM PeerDebt
WHERE amount < 0
  AND is_installment = 1
  AND total_installments IS NOT NULL
  AND total_installments > 0
  AND paid_installments < total_installments
```
Also add a `CHECK(total_installments > 0)` constraint in the migration (or a `NOT NULL` + check constraint).

---

### WR-02: Confirmed installment debts still counted as upcoming obligations

**File:** `internal/repo/sqlite/peer_debt.go:256-261`
**Issue:** The installment query filters `paid_installments < total_installments` but does NOT filter `is_confirmed = 0`. For non-installment debts the lump-sum query (line 248) already includes `is_confirmed = 0`. If an installment is fully confirmed mid-stream, it continues to contribute to the engine's obligation sum until `paid_installments` reaches `total_installments`. This is a logic inconsistency: confirmed debts should reduce the obligation even before all installments are paid.

**Fix:** Add `AND is_confirmed = 0` to the installment query, or align the semantics consistently across both branches by documenting the intended behaviour and enforcing it in a test.

---

### WR-03: PATCH /friends/:id silently succeeds on non-existent ID

**File:** `internal/handler/friend.go:136`  
**Related file:** `internal/repo/sqlite/friend.go:123-135`
**Issue:** `SqliteFriendRepo.Update` never returns `sql.ErrNoRows` — `Exec` against a non-existent ID simply affects 0 rows and returns `nil`. The handler therefore falls through to `GetFriendByID`, which does return `sql.ErrNoRows` and produces a 404 — but only after a spurious successful update call. The `errors.Is(err, sql.ErrNoRows)` check at line 137 will never match for the Update error path.

**Fix:** Check `RowsAffected()` after `Exec` in the repo and return `sql.ErrNoRows` when 0 rows are affected:
```go
res, err := r.db.Exec(`UPDATE Friend SET name = ? WHERE id = ?`, *name, id.String())
if err != nil {
    return fmt.Errorf("friend.Update: name: %w", err)
}
if n, _ := res.RowsAffected(); n == 0 {
    return fmt.Errorf("friend.Update: %w", sql.ErrNoRows)
}
```

---

### WR-04: PATCH /group-events/:id silently succeeds on non-existent ID

**File:** `internal/handler/group_event.go:177`  
**Related file:** `internal/repo/sqlite/group_event.go:136-158`
**Issue:** Same root cause as WR-03. `GroupEventRepo.Update` never returns `sql.ErrNoRows`, so the `errors.Is(err, sql.ErrNoRows)` guard at handler line 178 never fires for the update step.

**Fix:** Add `RowsAffected()` checks in `SqliteGroupEventRepo.Update`, same pattern as WR-03.

---

### WR-05: Frontend sends NaN for amount on empty debt form submission

**File:** `web/src/pages/friends.tsx:79`
**Issue:** `parseFloat(debtForm.amount)` when `debtForm.amount` is `""` returns `NaN`. `JSON.stringify({ amount: NaN })` produces `{"amount":null}`, which the backend receives as a missing or zero amount. The Go `validate:"required"` tag on `CreatePeerDebtRequest.Amount` (a `float64`) considers 0.0 as failing required validation only in some validator versions; `null` from JSON binding sets the field to its zero value (0.0), which silently creates a zero-cent debt record.

**Fix:**
```tsx
const amount = parseFloat(debtForm.amount)
if (isNaN(amount)) {
  toast.error('Amount must be a number')
  return
}
// then pass `amount` to createPeerDebt
```

---

### WR-06: Frontend sends NaN for total_installments on empty installment form

**File:** `web/src/pages/friends.tsx:85`
**Issue:** `parseInt(debtForm.total_installments, 10)` when the field is empty returns `NaN`, serialised as `null`. The backend stores `null` in `total_installments`. The SQL installment query (WR-01) then hits `amount / NULL = NULL`, and `SumUpcomingPeerObligations` silently drops the obligation.

**Fix:** Validate before submission:
```tsx
const totalInstallments = parseInt(debtForm.total_installments, 10)
if (debtForm.is_installment && isNaN(totalInstallments)) {
  toast.error('Total installments must be a whole number')
  return
}
```

---

### WR-07: Frontend sends NaN for group event total_amount on empty form

**File:** `web/src/pages/friends.tsx:531`
**Issue:** `parseFloat(eventForm.total_amount)` returns `NaN` when the field is empty, producing a null total_amount in the API request. The backend `validate:"required"` tag on `CreateGroupEventRequest.TotalAmount` would catch this only if the binder properly sets the zero value; in practice `math.Round(NaN) = 0`, so a zero-amount event is created silently.

**Fix:** Same NaN guard as WR-05, applied to `total_amount` before calling `createGroupEvent`.

---

### WR-08: SetParticipants transaction does not rollback on Commit failure

**File:** `internal/repo/sqlite/group_event.go:168-193`
**Issue:** `SetParticipants` calls `tx.Rollback()` explicitly on `Exec` errors (lines 175, 188), but if `tx.Commit()` at line 193 fails (e.g. disk full during flush), there is no rollback call and the deferred rollback pattern is not used. In practice SQLite's WAL mode will roll back automatically on connection close, but the caller receives an error while the DB state is undefined until the connection is recycled.

**Fix:** Use `defer tx.Rollback()` at the top of the function (it is a no-op after a successful `Commit`) instead of explicit rollbacks:
```go
tx, err := r.db.Begin()
if err != nil { ... }
defer tx.Rollback()

// ... Exec calls without explicit Rollback ...

return tx.Commit()
```

---

### WR-09: ConfirmInstallment is not atomic — lost-update under concurrency

**File:** `internal/service/peer_debt.go:67-87`
**Issue:** `ConfirmInstallment` does a read-then-write: it fetches the debt, increments `PaidInstallments` in Go, then writes. Two concurrent confirms on the same debt will both read `PaidInstallments = N` and both write `N+1`, losing one increment. While this is a single-user app today, the HTTP handler has no concurrency guard.

**Fix:** Perform the increment atomically in SQL:
```sql
UPDATE PeerDebt
SET paid_installments = MIN(paid_installments + 1, total_installments)
WHERE id = ?
```
This removes the need to fetch the row first.

---

## Info

### IN-01: EqualSplitAmounts is dead interface surface

**File:** `internal/handler/group_event.go:25`
**Issue:** `EqualSplitAmounts` is declared in `GroupEventServiceIface` and verified at compile time, but it is never called anywhere in the handler. The frontend computes its own equal-split estimate (line 361 of `friends.tsx`). This exposes an unnecessary method on the interface.

**Fix:** Remove `EqualSplitAmounts` from `GroupEventServiceIface` if it will not be used by the handler. If an "auto-split" endpoint is planned, add it then.

---

### IN-02: Group public page hides participant identity

**File:** `web/src/pages/group-public.tsx:8-11`
**Issue:** `participantLabel` labels every non-host participant as `Participant N` (based on array index), discarding the `friend_id` entirely. From the public view, participants cannot distinguish themselves from others without external context.

**Fix:** This is an intentional privacy design choice (friend UUIDs are not meaningful to external viewers), but it should at minimum be consistent: consider passing friend names through the public API or documenting that participant names are intentionally omitted from the public payload.

---

### IN-03: updateFriend return type mismatch between API client and backend

**File:** `web/src/lib/api.ts:316-318`
**Issue:** `updateFriend` is typed `Promise<void>` and discards the response body, but the backend PATCH /friends/:id returns HTTP 200 with the updated `FriendResponse`. The caller must do a separate `listFriends` refetch to see the new data. All other PATCH handlers (e.g. `updateAccount`, `updateTransaction`) follow the same void pattern, so this is consistent — but the backend's 200-with-body response is wasted bandwidth.

**Fix:** Either type `updateFriend` as `Promise<FriendResponse>` and use the return value to update the cache directly, or change the backend to return 204 No Content (matching the peer-debt and group-event update handlers). The latter is the simpler fix:
```go
// handler/friend.go Update — replace the re-fetch + 200 with:
return c.NoContent(http.StatusNoContent)
```

---

### IN-04: PatchPeerDebtRequest frontend type includes fields the backend ignores

**File:** `web/src/lib/api.ts:273-281`
**Issue:** `PatchPeerDebtRequest` in the TypeScript client includes `date`, `is_installment`, `total_installments`, `frequency`, and `is_confirmed` — none of which are accepted by the backend `PatchPeerDebtRequest` struct (which only accepts `amount` and `description`). Sending these extra fields is silently ignored by the Go JSON binder, but it creates a false impression that they are patchable, which may cause future confusion.

**Fix:** Align the TypeScript type with the actual backend contract:
```ts
export interface PatchPeerDebtRequest {
  amount?: number
  description?: string
}
```

---

_Reviewed: 2026-04-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
