---
phase: 08-friend-ledger
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - internal/migrations/20260414000002_friend_ledger.go
  - internal/repo/sqlite/friend.go
  - internal/repo/sqlite/peer_debt.go
  - internal/repo/sqlite/group_event.go
  - internal/service/token.go
  - internal/service/friend.go
  - internal/service/peer_debt.go
  - internal/service/group_event.go
  - internal/service/engine.go
  - internal/app/app.go
  - internal/handler/friend.go
  - internal/handler/peer_debt.go
  - internal/handler/group_event.go
  - internal/handler/public.go
  - internal/handler/routes.go
  - web/src/components/FriendLedgerWidget.tsx
  - web/src/pages/friends.tsx
  - web/src/pages/friend-public.tsx
  - web/src/pages/group-public.tsx
  - web/src/lib/api.ts
  - web/src/router.tsx
  - web/src/components/SidebarNav.tsx
  - web/tsconfig.json
findings:
  critical: 0
  warning: 9
  info: 4
  total: 13
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-04-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

The Friend Ledger feature is well-structured with clean layer separation (migration -> repo -> service -> handler -> frontend). The migration is correct and rolls back cleanly. Token generation uses `crypto/rand` with 128-bit entropy. Interface-based dependency injection and compile-time satisfaction checks are used throughout. The public endpoints are intentionally unauthenticated by design.

Four recurring problem areas were identified:

1. **Non-atomic partial updates** in all three repo `Update` methods — each field is committed in a separate SQL statement with no wrapping transaction, risking partial writes on failure.
2. **Integer division truncation and NULL-arithmetic in obligation math** — the installment obligation query uses integer division and has no guard against `total_installments` being NULL or zero, silently undercounting obligations fed into the CanIBuyIt engine.
3. **Missing server-side validation for installment debts** — `is_installment=true` can be submitted without a valid `total_installments`, creating a broken record that is excluded from obligation calculations.
4. **Frontend NaN propagation** — `parseFloat('')` and `parseInt('')` produce `NaN`, which serialises to `null` in JSON and can reach the API, creating zero-amount or partially-formed records.

---

## Warnings

### WR-01: Non-atomic partial updates in all three repo `Update` methods

**Files:**
- `internal/repo/sqlite/friend.go:123-135`
- `internal/repo/sqlite/peer_debt.go:182-203`
- `internal/repo/sqlite/group_event.go:136-158`

**Issue:** Each `Update` method issues a separate `db.Exec` call per field with no wrapping transaction. If the second or subsequent write fails (disk error, constraint violation on a future index, etc.) the earlier writes are already committed. For example, `PeerDebt.Update` can commit a new `amount` while leaving `description` unchanged, producing an inconsistent record with no error returned to the caller.

**Fix:** Wrap all `Exec` calls in a single transaction using `defer tx.Rollback()` (which is a no-op after `Commit`):

```go
func (r *SqliteFriendRepo) Update(id uuid.UUID, name *string, notes *string) error {
    tx, err := r.db.Begin()
    if err != nil {
        return fmt.Errorf("friend.Update: begin: %w", err)
    }
    defer tx.Rollback()
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

Apply the same pattern to `SqlitePeerDebtRepo.Update` and `SqliteGroupEventRepo.Update`.

---

### WR-02: Integer division truncation in `SumUpcomingPeerObligations`

**File:** `internal/repo/sqlite/peer_debt.go:256-261`

**Issue:** The installment branch of the query uses integer division:
```sql
SELECT COALESCE(SUM(amount / total_installments), 0) FROM PeerDebt
WHERE amount < 0 AND is_installment = 1 AND paid_installments < total_installments
```
SQLite performs integer division when both operands are integers. An installment debt of -100 cents over 3 installments returns -33 instead of -33.33. Across many debts this consistently underestimates the obligation passed to the CanIBuyIt engine, making purchasing power appear slightly higher than it is.

**Fix:** Cast to REAL before dividing and round at the Go layer:

```sql
SELECT COALESCE(SUM(CAST(amount AS REAL) / total_installments), 0) FROM PeerDebt
WHERE amount < 0
  AND is_installment = 1
  AND total_installments IS NOT NULL
  AND total_installments > 0
  AND paid_installments < total_installments
```

Scan into a `float64` and round to cents before returning:

```go
var installmentSum float64
// ... scan ...
return lumpSum + int64(math.Round(installmentSum)), nil
```

---

### WR-03: NULL-arithmetic silently drops installment obligations from engine query

**File:** `internal/repo/sqlite/peer_debt.go:256-261`

**Issue:** If `total_installments IS NULL`, `amount / NULL` evaluates to NULL in SQL. The `COALESCE(SUM(...), 0)` wrapper masks this — those rows are silently dropped from the obligation sum. If `total_installments = 0`, SQLite returns NULL for integer division by zero (no error), also silently dropped. Both cases overstate purchasing power. No constraint in the migration prevents these values from being stored (see WR-04).

**Fix:** Add `AND total_installments IS NOT NULL AND total_installments > 0` to the query (shown in WR-02 fix). Also add a database-level constraint:

```sql
-- in the migration, add to PeerDebt:
CHECK (NOT is_installment OR (total_installments IS NOT NULL AND total_installments > 0))
```

---

### WR-04: No server-side validation that installment debts have `total_installments`

**File:** `internal/handler/peer_debt.go:42-51`

**Issue:** `CreatePeerDebtRequest.TotalInstallments` is typed `*int64` with no `validate` tag. A caller can POST `{"is_installment": true, "total_installments": null, ...}` and the record is written with `is_installment=1, total_installments=NULL`. This record is excluded from obligation calculations (WR-03) and the `ConfirmInstallment` cap logic (`d.TotalInstallments != nil`) never fires, allowing `paid_installments` to grow without bound.

**Fix:** Add an explicit check in the handler before calling the service:

```go
if req.IsInstallment && (req.TotalInstallments == nil || *req.TotalInstallments <= 0) {
    return echo.NewHTTPError(http.StatusBadRequest,
        "total_installments must be a positive integer when is_installment is true")
}
```

---

### WR-05: PATCH update silently succeeds on non-existent friend or group event ID

**Files:**
- `internal/repo/sqlite/friend.go:123-135`
- `internal/handler/friend.go:127-150`
- `internal/repo/sqlite/group_event.go:136-158`
- `internal/handler/group_event.go:162-191`

**Issue:** SQLite `UPDATE` against a non-existent ID silently affects 0 rows and returns no error. Both `SqliteFriendRepo.Update` and `SqliteGroupEventRepo.Update` never return `sql.ErrNoRows`. The `errors.Is(err, sql.ErrNoRows)` guard in the handlers (friend.go:137, group_event.go:178) therefore never triggers for the update step. The handler only returns 404 because the subsequent `GetByID` call finds nothing — a fragile, indirect path.

**Fix:** Check `RowsAffected()` after the first `Exec` and return `sql.ErrNoRows` when 0 rows are updated:

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

### WR-06: `ConfirmInstallment` is not atomic — lost update under concurrency

**File:** `internal/service/peer_debt.go:67-87`

**Issue:** `ConfirmInstallment` performs a read-then-write: it fetches the current `PaidInstallments`, increments it in Go, then writes back. Two concurrent HTTP requests to `POST /peer-debts/:id/confirm` will both read `N` and both write `N+1`, losing one increment. While the app is single-user today, there is no concurrency guard at the HTTP layer.

**Fix:** Replace the read-modify-write with an atomic SQL update:

```sql
UPDATE PeerDebt
SET paid_installments = MIN(paid_installments + 1,
    COALESCE(total_installments, paid_installments + 1))
WHERE id = ?
```

This eliminates the need to fetch the row first and is race-condition-free.

---

### WR-07: Unsafe route param access via `useParams({ strict: false })` type assertion

**Files:**
- `web/src/pages/friend-public.tsx:17`
- `web/src/pages/group-public.tsx:14`

**Issue:** Both public pages obtain the route token with:
```ts
const { token } = useParams({ strict: false }) as { token: string }
```
The `as` cast bypasses TypeScript's type system. `strict: false` returns `Record<string, string>`, so if the route is matched without the `$token` segment, `token` is `undefined` at runtime but typed as `string`. The API call hits `/public/friend/undefined`, returning a 404 that manifests as a generic "Balance not found" error with no actionable diagnostic.

**Fix:** Use TanStack Router's typed route-specific `useParams()` by exporting the route objects from `router.tsx`:

```ts
// router.tsx — export the route instances
export { publicFriendRoute, publicGroupRoute }

// friend-public.tsx
import { publicFriendRoute } from '@/router'
const { token } = publicFriendRoute.useParams() // type-safe, guaranteed non-undefined
```

---

### WR-08: Frontend sends `NaN` / `null` when numeric form fields are empty

**File:** `web/src/pages/friends.tsx:79, 85, 531`

**Issue:**
- Line 79: `parseFloat(debtForm.amount)` returns `NaN` when `debtForm.amount` is `""`.
- Line 85: `parseInt(debtForm.total_installments, 10)` returns `NaN` when the field is empty.
- Line 531: `parseFloat(eventForm.total_amount)` returns `NaN` for an empty total amount field.

`JSON.stringify({ amount: NaN })` produces `{"amount":null}`. In Go, `null` JSON for a `float64` field binds to `0.0`. The backend `validate:"required"` tag does not reject 0.0 for `float64`, so zero-amount records can be silently created. HTML `required` attributes help in normal use but can be bypassed programmatically (e.g. rapid double-submit, automation).

**Fix:** Guard before mutating:

```ts
function handleAddDebt(e: React.FormEvent) {
  e.preventDefault()
  const amount = parseFloat(debtForm.amount)
  if (isNaN(amount)) {
    toast.error('Please enter a valid amount')
    return
  }
  addDebtMutation.mutate()
}
```

Apply the same check to `total_installments` and `total_amount`.

---

### WR-09: `SetParticipants` does not verify the event exists; FK enforcement may be off

**File:** `internal/repo/sqlite/group_event.go:168-193`

**Issue:** `SetParticipants` deletes existing participants and inserts new ones, but never checks whether `eventID` maps to an existing `GroupEvent`. The `REFERENCES GroupEvent(id)` FK constraint would reject orphaned inserts — but SQLite FK enforcement is disabled by default and requires `PRAGMA foreign_keys = ON` at connection time. If the pragma is not set, participants can be inserted for a non-existent event ID, and the handler's `errors.Is(err, sql.ErrNoRows)` guard at line 239 will never trigger (the function returns `nil`).

**Fix:** Either confirm `PRAGMA foreign_keys = ON` is set in DB initialisation, or add an explicit existence check:

```go
var exists int
if err := tx.QueryRow(`SELECT 1 FROM GroupEvent WHERE id = ?`, eventID.String()).Scan(&exists); err != nil {
    tx.Rollback()
    return fmt.Errorf("group_event.SetParticipants: %w", sql.ErrNoRows)
}
```

---

## Info

### IN-01: `EqualSplitAmounts` is declared in the handler interface but never called

**File:** `internal/handler/group_event.go:25`

**Issue:** `EqualSplitAmounts` appears in `GroupEventServiceIface` and is verified by the compile-time check at line 29, but no handler method ever calls it. The frontend computes its own equal-split estimate (`friends.tsx:361`). The method is dead surface in the interface.

**Fix:** Remove `EqualSplitAmounts` from `GroupEventServiceIface`. If a future "auto-split" endpoint is planned, add it at that time.

---

### IN-02: Public group page shows generic participant labels, not names

**File:** `web/src/pages/group-public.tsx:8-11`

**Issue:** `participantLabel` labels all non-host participants as `Participant N` (index-based). The public API response does not include friend names, so there is no client-side data to show. From a shared link, participants cannot identify themselves or others. The `friend_id` UUID is silently discarded.

**Fix:** Include a `name` field on the public participant response in `internal/handler/public.go` by joining the `Friend` table when fetching participants, or document the intentional privacy design (omitting friend names from public links) so future implementors know the behaviour is deliberate.

---

### IN-03: `PatchPeerDebtRequest` TypeScript type includes fields the backend ignores

**File:** `web/src/lib/api.ts:273-281`

**Issue:** The frontend `PatchPeerDebtRequest` interface declares `date`, `is_installment`, `total_installments`, `frequency`, and `is_confirmed` as patchable. The backend `PatchPeerDebtRequest` struct only accepts `amount` and `description`. Sending these extra fields is silently ignored by Go's JSON binder, but the mismatch creates a false impression that these fields are patchable through the PATCH endpoint, which may confuse future callers.

**Fix:** Align the TypeScript type with the actual backend contract:

```ts
export interface PatchPeerDebtRequest {
  amount?: number
  description?: string
}
```

---

### IN-04: `GroupEventParticipant` table has no unique constraint on `(event_id, friend_id)`

**File:** `internal/migrations/20260414000002_friend_ledger.go:44-51`

**Issue:** The partial unique index `idx_gep_host` enforces at most one host (NULL `friend_id`) per event, but there is no constraint preventing duplicate `(event_id, friend_id)` pairs for non-null friend rows. `SetParticipants` replaces all rows atomically so duplicates cannot arise through the current API. However, direct DB access or future code paths that bypass `SetParticipants` could insert duplicate rows, leading to inflated share totals.

**Fix:** Add a companion unique index for non-null participants:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_gep_friend
    ON GroupEventParticipant(event_id, friend_id)
    WHERE friend_id IS NOT NULL;
```

---

_Reviewed: 2026-04-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
