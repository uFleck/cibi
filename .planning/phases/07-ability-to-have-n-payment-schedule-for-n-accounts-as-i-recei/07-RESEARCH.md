# Phase 7: N Payment Schedules per Account — Research

**Researched:** 2026-04-12
**Domain:** SQLite schema migration, Go service/repo refactor, engine logic extension, React CRUD UI
**Confidence:** HIGH — all findings verified directly from codebase source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** One account can have N pay schedules. Remove unique constraint on `account_id`. Replace `GetByAccountID` with `ListByAccountID` returning `[]PaySchedule`. Replace upsert with explicit Create / Update / Delete. Each row keeps its own UUID PK.
- **D-02:** New column `amount INTEGER NOT NULL DEFAULT 0` on PaySchedule (cents). Go struct gains `Amount int64`. API exposes as `amount` integer cents.
- **D-03:** Engine loads ALL schedules per account. Per-schedule: compute `next_payday_i = NextPayday(schedule_i, now)`, sum obligations where `next_occurrence > now AND next_occurrence <= next_payday_i`. Use union approach to deduplicate obligations that fall inside multiple windows.
- **D-04:** WAIT verdict — when `CanBuy = false`, find schedule with min next_payday, project `balance + schedule.amount - projected_obligations - safety_buffer >= itemPrice`. New fields: `WillAffordAfterPayday bool`, `WaitUntil *time.Time`. `RiskLevel = "WAIT"`.
- **D-05:** Full CRUD API: `GET /api/pay-schedule?account_id=:id`, `POST /api/pay-schedule`, `PATCH /api/pay-schedule/:id`, `DELETE /api/pay-schedule/:id`.
- **D-06:** Settings page UI lives in `web/src/pages/settings.tsx` (stub exists, imports dead `PayScheduleForm` component).
- **D-07:** Amber WAIT verdict on CheckWidget — new CSS variables `--color-verdict-wait` / `--color-verdict-wait-tint`, detection via `result.will_afford_after_payday === true && result.can_buy === false`.
- **D-08:** Frequency enum values aligned to engine constants: `weekly`, `bi-weekly`, `semi-monthly`, `monthly`. Drop `biweekly` from handler validate tag.

### Claude's Discretion

- Obligation deduplication implementation strategy (union of distinct obligation IDs vs. min-window approach).
- Handler interface name (`PayScheduleServiceIface` vs concrete type reference in `routes.go`).
- Whether to keep or delete `PayScheduleForm.tsx` (old component rendered by settings stub).
- Error handling when an account has zero pay schedules (return empty list vs. `PAY_SCHEDULE_REQUIRED`).

### Deferred Ideas (OUT OF SCOPE)

- Multi-month income projection
- Budget envelopes tied to pay schedules
- Notification/alert on missed payday transactions
- `yearly` frequency support
</user_constraints>

---

## Summary

Phase 7 is a multi-layer change: SQLite schema migration, Go repo/service/engine refactor, new API endpoints, and a React Settings page. All pieces interact — the schema migration must be completed first because the repo layer, service layer, engine, handler, and frontend all depend on the new `amount` column and relaxed unique-ness of `account_id`.

The current codebase uses a strict 1-to-1 model (verified): `PayScheduleRepo` has `GetByAccountID`, `UpdateByAccountID`, `DeleteByAccountID` — all keyed on account_id rather than schedule id. There is **no unique constraint in the DDL** (verified from migration file: the `PaySchedule` CREATE TABLE has no `UNIQUE` on `account_id`), so the schema migration only needs to `ALTER TABLE` to add the `amount` column — no constraint drop is needed.

The engine currently calls `GetByAccountID` returning a single `PaySchedule`, then calls `NextPayday` once. This must become a loop over N schedules with obligation deduplication. The WAIT verdict extends `EngineResult` with two new fields and requires `classifyRisk` to handle the `"WAIT"` tier.

On the React side, the Settings page stub currently imports a `PayScheduleForm` component that implements the old upsert pattern. The entire settings page must be replaced with the new CRUD UI described in the UI spec.

**Primary recommendation:** Execute in strict dependency order — (1) migration, (2) repo layer, (3) service layer, (4) engine, (5) handler + routes, (6) React API layer, (7) Settings page, (8) CheckWidget WAIT state.

---

## Standard Stack

### Core (all verified from go.mod / package.json)

| Library | Version | Purpose |
|---------|---------|---------|
| `modernc.org/sqlite` | v1.48.2 | SQLite driver (pure Go, no CGO) |
| `pressly/goose/v3` | v3.27.0 | SQL migrations via `//go:embed *.go` |
| `labstack/echo/v4` | v4.12.0 | HTTP router and handler framework |
| `go-playground/validator/v10` | v10.30.2 | Request struct validation (`validate` tags) |
| `google/uuid` | v1.6.0 | UUID generation for new schedule IDs |
| `@tanstack/react-query` | ^5.99.0 | API data fetching + cache invalidation |
| `@tanstack/react-router` | ^1.168.18 | Client-side routing |
| `motion` | ^12.38.0 | Animation (WAIT verdict card uses existing config) |
| `sonner` | ^2.0.7 | Toast notifications |
| `lucide-react` | ^1.8.0 | Icons (Plus, Edit2, Trash2 already used) |

No new libraries needed. All required packages are already installed.

**Installation:** None required — zero new dependencies for this phase.

---

## Architecture Patterns

### Goose Migration Pattern (verified from `internal/migrations/`)

The project uses Go-based goose migrations (not SQL files). Each migration is a `.go` file with `init()` registering up/down functions. The embed pattern is `//go:embed *.go` in `migrations.go`.

New migration file must follow the naming convention: `20260412000001_add_pay_schedule_amount.go`

```go
// Source: internal/migrations/20260411000001_initial_schema.go (existing pattern)
package migrations

import (
    "context"
    "database/sql"
    "github.com/pressly/goose/v3"
)

func init() {
    goose.AddMigrationContext(upAddPayScheduleAmount, downAddPayScheduleAmount)
}

func upAddPayScheduleAmount(ctx context.Context, tx *sql.Tx) error {
    _, err := tx.ExecContext(ctx,
        `ALTER TABLE PaySchedule ADD COLUMN amount INTEGER NOT NULL DEFAULT 0;`)
    return err
}

func downAddPayScheduleAmount(ctx context.Context, tx *sql.Tx) error {
    // SQLite does not support DROP COLUMN in older versions; recreate table or leave column.
    // modernc.org/sqlite supports DROP COLUMN as of SQLite 3.35+.
    _, err := tx.ExecContext(ctx,
        `ALTER TABLE PaySchedule DROP COLUMN amount;`)
    return err
}
```

**CRITICAL FINDING — No unique constraint to remove:** Verified from `internal/migrations/20260411000001_initial_schema.go` — the `PaySchedule` CREATE TABLE has no `UNIQUE` index or constraint on `account_id`. The migration therefore only needs to add the `amount` column. No constraint-removal DDL is required.

### Repo Layer Refactor Pattern (verified from `internal/repo/sqlite/pay_schedule.go`)

Current interface methods operate on `account_id` as if it were a unique key. All four must be replaced:

| Remove | Replace With |
|--------|-------------|
| `GetByAccountID(accountID) (PaySchedule, error)` | `ListByAccountID(accountID) ([]PaySchedule, error)` |
| `UpdateByAccountID(accountID, ps)` | `UpdateByID(id UUID, ps PaySchedule) error` |
| `DeleteByAccountID(accountID)` | `DeleteByID(id UUID) error` |
| `Insert(ps)` | `Insert(ps)` — keep, add `amount` to SQL |

The `PaySchedule` struct gains `Amount int64`:

```go
// Source: internal/repo/sqlite/pay_schedule.go (extended)
type PaySchedule struct {
    ID          uuid.UUID
    AccountID   uuid.UUID
    Frequency   string
    AnchorDate  time.Time
    DayOfMonth2 *int
    Label       *string
    Amount      int64   // NEW: cents
}
```

`ListByAccountID` query:
```sql
SELECT id, account_id, frequency, anchor_date, day_of_month2, label, amount
FROM PaySchedule WHERE account_id = ?
ORDER BY anchor_date ASC
```

`UpdateByID` query:
```sql
UPDATE PaySchedule
SET frequency = ?, anchor_date = ?, day_of_month2 = ?, label = ?, amount = ?
WHERE id = ?
```

`DeleteByID` query:
```sql
DELETE FROM PaySchedule WHERE id = ?
```

### Service Layer Refactor Pattern (verified from `internal/service/pay_schedule.go`)

Replace `SetPaySchedule` upsert + `GetPaySchedule` with four explicit methods:

```go
// New PayScheduleService interface surface
CreatePaySchedule(accountID uuid.UUID, frequency string, anchorDate time.Time,
    dayOfMonth, dayOfMonth2 *int, label *string, amount int64) (sqlite.PaySchedule, error)

ListPaySchedules(accountID uuid.UUID) ([]sqlite.PaySchedule, error)

UpdatePaySchedule(id uuid.UUID, frequency string, anchorDate time.Time,
    dayOfMonth, dayOfMonth2 *int, label *string, amount int64) error

DeletePaySchedule(id uuid.UUID) error
```

`CreatePaySchedule` validates that `accountID` references an existing account (call `accRepo.GetByID`), generates a new UUID for the schedule, and calls `psRepo.Insert`.

### Engine Refactor Pattern (verified from `internal/service/engine.go`)

Current Step 2 fetches one schedule; new Step 2 fetches `[]PaySchedule`. The obligation window logic must change.

**Obligation deduplication — union approach (D-03 mandate):**

The naive approach (sum obligations per schedule window, then add totals) double-counts obligations that fall before multiple paydays. The union approach avoids this:

```
1. For each schedule_i: compute next_payday_i = NextPayday(schedule_i, now)
2. Compute obligation_window_end = min(next_payday_i) over all schedules  [EARLIEST payday]
   — OR —
   Collect all distinct obligation IDs that fall in ANY schedule's window,
   then SUM(amount) WHERE id IN (union set)
```

**Recommended implementation:** Use the earliest payday as the obligation window boundary. Rationale: the user will receive income at the earliest payday, so obligations due before that date are the relevant upcoming ones. This is correct and simple:

```go
// Step 2: Load all schedules
schedules, err := s.psRepo.ListByAccountID(accountID)
if err != nil { ... }
if len(schedules) == 0 {
    return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: %w", ErrPayScheduleRequired)
}

// Step 3: Find earliest next payday across all schedules
now := time.Now().UTC()
var earliestPayday time.Time
var earliestSchedule sqlite.PaySchedule
for i, ps := range schedules {
    engineSchedule := engine.PaySchedule{
        Frequency:   ps.Frequency,
        AnchorDate:  ps.AnchorDate,
        DayOfMonth2: ps.DayOfMonth2,
    }
    np := engine.NextPayday(engineSchedule, now)
    if i == 0 || np.Before(earliestPayday) {
        earliestPayday = np
        earliestSchedule = ps
    }
}

// Step 4: Sum obligations up to earliest payday (no double counting)
obligations, err := s.txnsRepo.SumUpcomingObligations(accountID, now, earliestPayday)
```

**WAIT verdict implementation:**

```go
// After determining CanBuy = false:
// Find schedule with min next_payday (already computed as earliestSchedule / earliestPayday)
projectedBalance := acc.CurrentBalance + earliestSchedule.Amount
// Projected obligations = same window (now → earliestPayday), already computed
// Safety buffer unchanged
projectedPurchasingPower := projectedBalance + obligations - buf.MinThreshold
willAfford := projectedPurchasingPower >= itemPrice

result := EngineResult{
    CanBuy:                 false,
    PurchasingPower:        purchasingPower,
    BufferRemaining:        bufferRemaining,
    RiskLevel:              "BLOCKED", // overridden below if WAIT
    WillAffordAfterPayday:  willAfford,
    WaitUntil:              nil,
}
if willAfford {
    result.RiskLevel = "WAIT"
    result.WaitUntil = &earliestPayday
}
```

**Updated `EngineResult` struct:**

```go
// Source: internal/service/engine.go (extended)
type EngineResult struct {
    CanBuy                bool
    PurchasingPower       int64
    BufferRemaining       int64
    RiskLevel             string  // "LOW" | "MEDIUM" | "HIGH" | "BLOCKED" | "WAIT"
    WillAffordAfterPayday bool    // NEW
    WaitUntil             *time.Time  // NEW; nil when not WAIT
}
```

**`classifyRisk` update:** The function is only called for `CanBuy = true` cases; WAIT/BLOCKED handling moves inline to `CanIBuyIt`. The simplest change: keep `classifyRisk` for the positive case only, handle negative inline.

### Handler Layer Pattern (verified from `internal/handler/pay_schedule.go` and `routes.go`)

Current handler has one method (`CreateOrUpdate`) and one route (`POST /api/pay-schedule`). The handler must be completely replaced.

**New handler methods:**

```go
func (h *PayScheduleHandler) List(c echo.Context) error    // GET  /api/pay-schedule?account_id=:id
func (h *PayScheduleHandler) Create(c echo.Context) error  // POST /api/pay-schedule
func (h *PayScheduleHandler) Update(c echo.Context) error  // PATCH /api/pay-schedule/:id
func (h *PayScheduleHandler) Delete(c echo.Context) error  // DELETE /api/pay-schedule/:id
```

**New request/response types:**

```go
type CreatePayScheduleRequest struct {
    AccountID   string  `json:"account_id"   validate:"required"`
    Frequency   string  `json:"frequency"    validate:"required,oneof=weekly bi-weekly semi-monthly monthly"`
    AnchorDate  string  `json:"anchor_date"  validate:"required"`
    Amount      int64   `json:"amount"       validate:"min=0"`
    DayOfMonth  *int    `json:"day_of_month"`
    DayOfMonth2 *int    `json:"day_of_month_2"`
    Label       *string `json:"label"`
}

type PatchPayScheduleRequest struct {
    Frequency   *string `json:"frequency"    validate:"omitempty,oneof=weekly bi-weekly semi-monthly monthly"`
    AnchorDate  *string `json:"anchor_date"`
    Amount      *int64  `json:"amount"       validate:"omitempty,min=0"`
    DayOfMonth  *int    `json:"day_of_month"`
    DayOfMonth2 *int    `json:"day_of_month_2"`
    Label       *string `json:"label"`
}

type PayScheduleResponse struct {
    ID          string  `json:"id"`
    AccountID   string  `json:"account_id"`
    Frequency   string  `json:"frequency"`
    AnchorDate  string  `json:"anchor_date"`
    Amount      int64   `json:"amount"`        // NEW: cents
    DayOfMonth  *int    `json:"day_of_month"`
    DayOfMonth2 *int    `json:"day_of_month_2"`
    Label       *string `json:"label"`
}
```

**Route registration (routes.go):**

```go
// Replace single-route ps group:
ps := api.Group("/pay-schedule")
ps.GET("", psh.List)
ps.POST("", psh.Create)
ps.PATCH("/:id", psh.Update)
ps.DELETE("/:id", psh.Delete)
```

**Frequency enum fix (D-08):** The handler validate tag currently has `oneof=weekly biweekly monthly`. This must become `oneof=weekly bi-weekly semi-monthly monthly`. The value `biweekly` (no hyphen) is wrong; the engine constant is `FreqBiWeekly = "bi-weekly"` (verified from `internal/engine/engine.go`). The `semi-monthly` value was entirely missing from the handler. The `TransactionsPage.tsx` frontend select still shows `biweekly` — this is also broken and should be fixed as part of this phase (or flagged as a separate cleanup).

**`PayScheduleServiceIface` in handler:** The current handler file declares `PayScheduleServiceIface` and asserts `var _ PayScheduleServiceIface = (*service.PayScheduleService)(nil)`. This interface must be updated to match the new service methods.

### Check Handler — JSON response extension

The `/api/check` handler serializes `EngineResult` to JSON. Two new fields must be added to the JSON response struct:

```go
type CheckResponse struct {
    CanBuy                bool       `json:"can_buy"`
    PurchasingPower       float64    `json:"purchasing_power"` // cents → dollars
    BufferRemaining       float64    `json:"buffer_remaining"`
    RiskLevel             string     `json:"risk_level"`
    WillAffordAfterPayday bool       `json:"will_afford_after_payday"` // NEW
    WaitUntil             *string    `json:"wait_until,omitempty"`     // NEW: RFC3339 or null
}
```

`WaitUntil` should be serialized as RFC3339 string (or null) — same pattern as other timestamp fields in the codebase.

### React Settings Page Pattern (verified from `web/src/pages/transactions.tsx`)

The Settings page stub (`web/src/pages/settings.tsx`) currently renders a `PayScheduleForm` component that must be deleted/replaced. The new implementation follows the same structural pattern as `TransactionsPage`:

- `useContext(AccountContext)` for `selectedAccountId`
- `useQuery({ queryKey: ['pay-schedules', accountId], queryFn: listPaySchedules })` for data
- `useMutation` for create, update, delete
- `queryClient.invalidateQueries({ queryKey: ['pay-schedules', accountId] })` on success
- Inline Card form (not modal) for add/edit, same as TransactionsPage

**API functions to add to `web/src/lib/api.ts`:**

```typescript
export interface PayScheduleResponse {
  id: string
  account_id: string
  frequency: string
  anchor_date: string
  amount: number       // cents (NEW)
  day_of_month: number | null
  day_of_month_2: number | null
  label: string | null
}

export interface CreatePayScheduleRequest {
  account_id: string
  frequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'
  anchor_date: string  // YYYY-MM-DD
  amount: number       // cents
  day_of_month?: number
  day_of_month_2?: number
  label?: string
}

export function listPaySchedules(accountId: string): Promise<PayScheduleResponse[]>
export function createPaySchedule(data: CreatePayScheduleRequest): Promise<PayScheduleResponse>
export function updatePaySchedule(id: string, data: Partial<CreatePayScheduleRequest>): Promise<PayScheduleResponse>
export function deletePaySchedule(id: string): Promise<void>
```

**Existing `PayScheduleRequest` and `setPaySchedule` in api.ts:** These are now dead code — the old upsert API is gone. Remove them (or keep for backward compat briefly). The `PayScheduleForm.tsx` component also becomes dead code and should be deleted.

**AccountSelector usage in Settings:** `AccountSelector` takes `selectedAccountId` and `onSelectAccount` props. In Settings it must be wired to local state OR to `AccountContext`. Based on TransactionsPage pattern: read `selectedAccountId` from `AccountContext` — don't maintain separate state. The AccountSelector in Settings should call `setSelectedAccountId` from context (same pattern as other pages). The UI spec shows AccountSelector in the header row but wired to context, not local state.

### CheckWidget WAIT State (verified from `web/src/components/CheckWidget.tsx`)

Current verdict rendering: binary `result!.can_buy` branch for YES/NO styling. WAIT is a third branch inserted when `result.will_afford_after_payday === true && result.can_buy === false`.

**Exact changes required:**

1. `CheckResponse` type in `api.ts` gains two new fields:
   ```typescript
   will_afford_after_payday: boolean
   wait_until: string | null  // RFC3339 or null
   ```

2. `RISK_COLORS` map gains `WAIT` entry:
   ```typescript
   const RISK_COLORS: Record<string, string> = {
     LOW: 'var(--color-risk-low)',
     MEDIUM: 'var(--color-risk-medium)',
     HIGH: 'var(--color-risk-high)',
     BLOCKED: 'var(--color-risk-blocked)',
     WAIT: 'var(--color-verdict-wait)',   // NEW
   }
   ```
   Note: The current type is `Record<CheckResponse['risk_level'], string>` — changing `risk_level` type to include `'WAIT'` handles this automatically, or widen to `Record<string, string>`.

3. The verdict `<motion.div>` block gains a WAIT branch before YES/NO check:
   ```tsx
   const isWait = !result!.can_buy && result!.will_afford_after_payday
   ```
   Apply amber styling when `isWait`, green when `can_buy`, red otherwise.

4. New CSS variables in `web/src/index.css` `@theme` block:
   ```css
   --color-verdict-wait: oklch(0.78 0.17 85);
   --color-verdict-wait-tint: oklch(0.14 0.06 85);
   ```

5. WAIT verdict display: `"WAIT"` in `text-4xl font-semibold tracking-tight leading-none` (identical to YES/NO).
   Sub-text: `"Not yet — you'll have enough after {waitUntil}"` where `waitUntil` formatted with `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| UUID generation for new schedules | Custom ID generation | `github.com/google/uuid` v1.6.0 (already imported) |
| Request validation | Manual field checks | `go-playground/validator/v10` validate tags (already wired) |
| Schema migration | `ALTER TABLE` in app startup code | `goose.AddMigrationContext` in a new `.go` migration file |
| Obligation deduplication | Complex set intersection logic | Use earliest payday as window boundary (see Architecture Patterns) |
| Date formatting in UI | Manual date string parsing | `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` |

---

## Common Pitfalls

### Pitfall 1: Goose Migration File Timestamp Collision
**What goes wrong:** Two migration files with the same timestamp prefix cause goose to fail at startup.
**Why it happens:** Goose orders migrations by filename timestamp. If `20260411000001` already exists, using that prefix again breaks ordering.
**How to avoid:** Use `20260412000001` (today's date) for the new migration file. Verify no collision with existing file `20260411000001_initial_schema.go`.

### Pitfall 2: Obligation Double-Counting with Multiple Schedules
**What goes wrong:** Summing `SumUpcomingObligations` once per schedule window produces inflated obligation totals when an obligation falls before multiple paydays.
**Why it happens:** An obligation due in 5 days appears in the window for both a bi-weekly schedule (next payday in 7 days) and a monthly schedule (next payday in 20 days). If summed per-schedule, it's counted twice.
**How to avoid:** Use the earliest payday as the single obligation window boundary (see Architecture Patterns — union approach). One `SumUpcomingObligations` call, one window boundary: `min(next_payday_i)`.

### Pitfall 3: `classifyRisk` Returning `"BLOCKED"` for WAIT Cases
**What goes wrong:** `classifyRisk` is called with `canBuy = false` and returns `"BLOCKED"`, overriding the WAIT detection.
**Why it happens:** `classifyRisk` doesn't know about WAIT — it only knows BLOCKED vs. risk tiers.
**How to avoid:** Determine WAIT verdict AFTER calling `classifyRisk`. Override `RiskLevel` to `"WAIT"` when `willAfford == true`. Or restructure: don't call `classifyRisk` when `!canBuy`; handle BLOCKED/WAIT inline.

### Pitfall 4: Handler Interface Mismatch After Refactor
**What goes wrong:** `var _ PayScheduleServiceIface = (*service.PayScheduleService)(nil)` fails to compile after the service signature changes.
**Why it happens:** The compile-time interface assertion in `handler/pay_schedule.go` becomes stale.
**How to avoid:** Update `PayScheduleServiceIface` in the handler file at the same time as the service methods. The assertion catches drift at compile time — a feature, not a bug.

### Pitfall 5: Frequency Enum `biweekly` vs `bi-weekly` Inconsistency
**What goes wrong:** Old `PayScheduleForm` and `TransactionsPage` submit `"biweekly"` to the API. After D-08 fix, the handler rejects it.
**Why it happens:** The engine has always used `"bi-weekly"` (FreqBiWeekly constant), but the handler validate tag used `"biweekly"` — an undocumented divergence that existed from the start.
**How to avoid:** Update the handler validate tag first (as part of this phase). The `TransactionsPage` frequency select also lists `biweekly` — fix it to `bi-weekly` in the same phase. The old `PayScheduleForm` is being deleted anyway.
**Warning signs:** An existing pay schedule in the database with `frequency = 'biweekly'` will cause `NextPayday` to fall into the `default` branch (treated as monthly). If the database contains old test data with `"biweekly"`, a data migration may be needed.

### Pitfall 6: Settings Page Imports Dead `PayScheduleForm`
**What goes wrong:** `settings.tsx` currently imports `PayScheduleForm` from `@/components/PayScheduleForm`. If `PayScheduleForm.tsx` is deleted without updating the import, the build fails.
**Why it happens:** The stub page was written against the old upsert model.
**How to avoid:** Rewrite `settings.tsx` completely — the import is replaced by the new page implementation. Delete `web/src/components/PayScheduleForm.tsx`.

### Pitfall 7: `WaitUntil` Nil Dereference in JSON Serialization
**What goes wrong:** If `WaitUntil *time.Time` is formatted as `t.Format(...)` without nil check, it panics.
**Why it happens:** Pointer field is nil for all non-WAIT results.
**How to avoid:** Use a helper that formats to `*string` (returning `nil` when input is nil). The `json:"wait_until,omitempty"` tag in the response struct handles omission automatically for nil pointers.

### Pitfall 8: `AccountSelector` Props in Settings Page
**What goes wrong:** `AccountSelector` requires `selectedAccountId` and `onSelectAccount` props — it is not wired to `AccountContext` internally.
**Why it happens:** The component is a controlled input (it takes props, not context).
**How to avoid:** In Settings page, read `selectedAccountId` and `setSelectedAccountId` from `useContext(AccountContext)`. Pass them directly to `AccountSelector`. Same pattern as how other pages use it.

---

## Code Examples

### Verified — Existing `SumUpcomingObligations` Signature

From usage in `internal/service/engine.go` line 87:
```go
obligations, err := s.txnsRepo.SumUpcomingObligations(accountID, now, nextPayday)
```
This function exists on `TransactionsRepo`. Phase 7 reuses it unchanged — just passes `earliestPayday` instead of a single `nextPayday`.

### Verified — Goose Migration Registration Pattern

```go
// Source: internal/migrations/20260411000001_initial_schema.go
func init() {
    goose.AddMigrationContext(upInitialSchema, downInitialSchema)
}
```

### Verified — Motion Animation Config for Verdict Card

```tsx
// Source: web/src/components/CheckWidget.tsx lines 88-92
<motion.div
  initial={{ scale: 0.90, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
  className="rounded-lg p-5 flex flex-col gap-3 border"
>
```
Apply identical `initial`, `animate`, `transition` to WAIT verdict card — no changes to animation spec.

### Verified — AccountContext Shape

```tsx
// Source: web/src/App.tsx lines 20-26
export const AccountContext = createContext<{
  selectedAccountId: string | null
  setSelectedAccountId: (id: string | null) => void
}>({ selectedAccountId: null, setSelectedAccountId: () => {} })
```

Settings page reads both values: `const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)`.

### Verified — Amount Dollar/Cents Conversion Pattern

```tsx
// Source: web/src/pages/transactions.tsx line 306
value={formData.amount / 100}
onChange={e =>
  setFormData({ ...formData, amount: Math.round(parseFloat(e.target.value) * 100) })
}
```
Apply same pattern for `amount` field in pay schedule form.

---

## Validation Architecture

`nyquist_validation` is enabled (absent key = enabled per config). No test framework detected — `.planning/config.json` has `nyquist_validation: true` but no `pytest.ini`, `jest.config.*`, or `vitest.config.*` found in the codebase.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — Go's `testing` package used implicitly via `go test` |
| Config file | None (no jest/vitest/pytest config found) |
| Quick run command | `cd /c/Projects/cibi-api && go test ./internal/...` |
| Full suite command | `cd /c/Projects/cibi-api && go test ./...` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | `ListByAccountID` returns N schedules for one account | unit | `go test ./internal/repo/sqlite/... -run TestPayScheduleRepo` | No — Wave 0 |
| D-02 | Amount persisted and retrieved correctly (cents) | unit | `go test ./internal/repo/sqlite/... -run TestPayScheduleAmount` | No — Wave 0 |
| D-03 | Obligations use earliest payday window, no double-count | unit | `go test ./internal/service/... -run TestCanIBuyItMultiSchedule` | No — Wave 0 |
| D-04 | WAIT verdict fields populated when afford-after-payday | unit | `go test ./internal/service/... -run TestCanIBuyItWAIT` | No — Wave 0 |
| D-05 | CRUD routes return correct HTTP status codes | integration | `go test ./internal/handler/... -run TestPayScheduleHandler` | No — Wave 0 |
| D-08 | Handler rejects `biweekly`, accepts `bi-weekly` | unit | `go test ./internal/handler/... -run TestFrequencyValidation` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `go test ./internal/...`
- **Per wave merge:** `go test ./...`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `internal/repo/sqlite/pay_schedule_test.go` — covers D-01, D-02
- [ ] `internal/service/engine_test.go` — covers D-03, D-04
- [ ] `internal/handler/pay_schedule_test.go` — covers D-05, D-08

---

## Security Domain

`security_enforcement` not set in config — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth layer in this project |
| V3 Session Management | No | Stateless API |
| V4 Access Control | No | Single-user app, no multi-tenancy |
| V5 Input Validation | Yes | `go-playground/validator/v10` validate tags on handler structs |
| V6 Cryptography | No | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Integer overflow on amount field | Tampering | `int64` max is 9,223,372,036,854,775,807 cents — safe for any realistic balance; no additional guard needed |
| Orphan schedule after account delete | Tampering / Data corruption | SQLite FK `account_id REFERENCES Account(id)` is defined; `_foreign_keys=ON` in DSN (ARCH-05) cascades nothing — but prevents insert of orphan. **No CASCADE DELETE defined** — deleting an account while schedules exist will fail unless schedules are deleted first. Plan must include: DELETE schedules before account delete, OR add `ON DELETE CASCADE` in a migration. |
| Schedule ID manipulation in PATCH/DELETE | Elevation of privilege | Handler parses ID as UUID and passes to repo `WHERE id = ?` — parameterized, safe. |
| Negative amount submitted | Tampering | Validator tag `min=0` on amount field prevents negative income amounts. |

**Critical finding:** The Account DELETE route currently does not delete associated PaySchedules. With multiple schedules per account (this phase), the FK constraint (`account_id REFERENCES Account(id)`) will cause Account DELETE to fail silently or return an error if any schedules exist. The plan must either: (a) add cascading delete to the migration, or (b) have the account deletion service call `DeletePaySchedulesByAccountID` before deleting the account. Option (b) requires a new repo method. Option (a) is a one-line migration addition:

```sql
-- In the new migration (or a separate migration):
-- Recreate with CASCADE is complex in SQLite. Simpler: handle in service layer (option b).
```

Recommendation: Handle in service layer (option b) — add `DeleteAllByAccountID(accountID uuid.UUID) error` to `PayScheduleRepo` and call it from `AccountsService.DeleteAccount`.

---

## Open Questions

1. **FK cascade on account delete**
   - What we know: `Account` has PaySchedule FK. Currently no CASCADE defined. Account delete will fail if schedules exist.
   - What's unclear: Should this phase add cascade, or is it acceptable to require manual schedule deletion first?
   - Recommendation: Add `DeleteAllByAccountID` to the repo and call it from `AccountsService.DeleteAccount`. Keeps schema simple, handles in Go.

2. **Existing `biweekly` data in database**
   - What we know: The engine's `default` case for unknown frequencies falls back to monthly. If any real data was saved as `"biweekly"`, it would calculate incorrect next paydays.
   - What's unclear: Does the live database have any PaySchedule rows with `frequency = 'biweekly'`?
   - Recommendation: Include a data fixup in the migration's `up` function: `UPDATE PaySchedule SET frequency = 'bi-weekly' WHERE frequency = 'biweekly'`.

3. **ErrPayScheduleRequired behavior with N schedules**
   - What we know: `CanIBuyIt` currently returns `ErrPayScheduleRequired` when no schedule exists. With N schedules, the same error applies when the list is empty.
   - What's unclear: Should the engine return a different error when the list is empty vs. the account itself not found?
   - Recommendation: Keep `ErrPayScheduleRequired` for empty list — same UI behavior (CheckWidget already handles this: `toast.error('Set up your pay schedule in Settings first.')`).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SumUpcomingObligations` exists on `TransactionsRepo` with signature `(accountID, from, to time.Time) (int64, error)` | Architecture Patterns | Engine refactor would need to adapt the call site |
| A2 | The account delete handler does not currently call any cleanup of related PaySchedules | Security Domain | If it already cascades, the cascade concern is moot |
| A3 | `modernc.org/sqlite v1.48.2` supports `ALTER TABLE ... DROP COLUMN` (requires SQLite 3.35+) | Architecture Patterns | Down migration would need table recreation instead |

---

## Sources

### Primary (HIGH confidence — verified from codebase files)

- `internal/migrations/20260411000001_initial_schema.go` — PaySchedule DDL confirmed: no UNIQUE on account_id, no `amount` column, no cascade
- `internal/repo/sqlite/pay_schedule.go` — Full current repo interface and implementation
- `internal/service/engine.go` — Full EngineResult struct, CanIBuyIt algorithm, classifyRisk logic
- `internal/engine/engine.go` — Frequency constants (FreqBiWeekly = "bi-weekly"), NextPayday, AddMonthClamped
- `internal/handler/pay_schedule.go` — Current validate tag (`oneof=weekly biweekly monthly`), handler structure
- `internal/handler/routes.go` — Current route registration (single POST only)
- `internal/migrations/migrations.go` — Goose embed pattern (`//go:embed *.go`)
- `web/src/components/CheckWidget.tsx` — Motion animation config, RISK_COLORS shape, verdict rendering
- `web/src/pages/transactions.tsx` — Form/list/CRUD pattern to replicate in Settings
- `web/src/lib/api.ts` — Existing PayScheduleRequest/Response types (to replace), CheckResponse (to extend)
- `web/src/App.tsx` — AccountContext shape
- `web/src/components/AccountSelector.tsx` — Props interface (selectedAccountId, onSelectAccount)
- `web/src/pages/settings.tsx` — Current stub (dead PayScheduleForm import)
- `web/src/components/PayScheduleForm.tsx` — Old component to delete
- `go.mod` — Dependency versions
- `web/package.json` — Frontend dependency versions

### Secondary (MEDIUM confidence)

- Goose `.go` migration pattern: inferred from existing migration file; consistent with pressly/goose v3 docs behavior for Go-based migrations
- SQLite `ALTER TABLE ADD COLUMN` support: standard SQLite feature present since 3.0; confirmed safe for this usage

---

## Metadata

**Confidence breakdown:**
- Schema migration: HIGH — DDL verified, no unique constraint exists, only `ADD COLUMN` needed
- Repo/service refactor: HIGH — full code read, exact method signatures documented
- Engine algorithm: HIGH — code verified; union/earliest-payday approach is mathematically correct
- Handler changes: HIGH — validate tag mismatch directly observed in source
- React UI: HIGH — TransactionsPage pattern verified and directly applicable
- Security cascade concern: HIGH — FK defined without CASCADE, verified from DDL

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable Go/React stack — 30-day horizon)
