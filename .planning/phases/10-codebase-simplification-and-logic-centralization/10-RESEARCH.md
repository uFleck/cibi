# Phase 10: Codebase Simplification and Logic Centralization — Research

**Researched:** 2026-04-16
**Domain:** Go refactoring patterns, React component decomposition, SQLite migration patterns, Go testing
**Confidence:** HIGH

---

## Summary

Phase 10 is a pure refactoring phase with no new features. The codebase has accumulated four categories of accidental complexity across phases 7–9: duplicate "with/without account" repo method pairs (~20 methods each having two near-identical implementations), field-at-a-time UPDATE patterns (50+ lines each in peer_debt and group_event repos), duplicated installment next-due date logic (4 verbatim copies), and business logic in the HTTP handler layer. The frontend has three massive page files (1,342 / 835 / 789 lines) with all form/modal/state logic inline.

All decisions are locked in CONTEXT.md. This research confirms the technical approach, validates the exact code locations, and documents patterns the implementor must follow. There is no ambiguity about what framework or library to use — the project's existing stack handles everything needed.

The primary risk in this phase is interface contract breakage during repo consolidation. Removing unscoped methods from `PeerDebtRepo` and `GroupEventRepo` interfaces will cascade to `PeerDebtServiceIface` and `GroupEventServiceIface` in the handler layer, to mock objects in `testhelpers_test.go`, and to any call sites in the service layer. The implementor must update all four layers atomically per method pair removed — not iteratively by method.

**Primary recommendation:** Execute consolidation in dependency order: (1) confirm callers, (2) update repo interface + implementation, (3) update service interface + method, (4) update handler interface + mock, (5) compile to verify zero regressions before committing.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Repo Consolidation:**
- D-01: Remove unscoped repo methods entirely — account-scoped is the only code path. Methods accept `*uuid.UUID` for account ID; filter when non-nil. Verify no callers pass nil before removal.
- D-02: Consolidate both the repo implementations AND the service interfaces (`PeerDebtServiceIface`, `GroupEventServiceIface`). Handlers depend on service interfaces — removing unscoped service methods eliminates the actual callers.
- D-03: Replace field-at-a-time UPDATE pattern with a dynamic UPDATE statement using a slice of `(column, value)` pairs. Applies to `PeerDebtRepo.Update` and `GroupEventRepo.Update` (currently 50+ lines each).
- D-04: Add a follow-up migration to enforce `NOT NULL` on the `account_id` columns added by migration `20260416000005`.

**Frontend Decomposition:**
- D-05: Full component extraction on all three large page files:
  - `friends.tsx` (1,342 lines) → extract `FriendForm`, `DebtForm`, `GroupEventForm`, `ParticipantEditor`
  - `accounts.tsx` (835 lines) → extract inline form/modal components
  - `transactions.tsx` (789 lines) → extract inline form/modal components
  - Extracted components land in `web/src/components/`
  - Page files become orchestrators that import components

**Logic Centralization:**
- D-06: Extract installment next-due date computation into `internal/engine/` as `NextInstallmentDue(firstDue time.Time, paidInstallments int64, frequency string) time.Time`. Currently duplicated verbatim in 4 places across `internal/repo/sqlite/peer_debt.go` (lines 573–584, 636–647) and `internal/service/peer_debt.go` (lines 162–170, 215–222).
- D-07: Move business logic out of `public.go` handler into the service layer. Specifically: event iteration, `viewerIsHost` determination, and `hostedGroups` assembly currently in `GetFriendByToken` (lines 137–208). Handler becomes a thin HTTP adapter.

**Bug Fixes:**
- D-08: Fix `DeleteTransaction` balance reversal: fetch transaction before deletion, then atomically delete it and reverse its amount from `current_balance` — mirroring the `CreateTransaction` pattern.
- D-09: Fix `RecordDebit` inverted guard or remove entirely. Assess callers — if none exist outside tests, remove. If needed elsewhere, fix the guard.

**Test Coverage:**
- D-10: Full service-layer test coverage push covering `transactions.go`, `peer_debt.go`, `group_event.go` service methods, extracted `NextInstallmentDue` helper, and `internal/handler/public.go` endpoints.

### Claude's Discretion
- Exact component names/file layout for extracted frontend components (beyond the names listed in D-05)
- Whether to use a struct or variadic approach for the dynamic UPDATE builder
- Order of operations within the service-layer test coverage push
- N+1 query fix for `GetFriendByToken` (include if low-effort alongside the public.go refactor, defer if complex)

### Deferred Ideas (OUT OF SCOPE)
- Per-account `SafetyBuffer` — schema change + new feature, not simplification
- Installment payment remainder cents fix — correctness but not duplication/complexity
- Public token revocation endpoint — new feature
- Pagination on list endpoints — performance, not simplification
- `CIBI_SAFETY_BUFFER` env-only limitation (no HTTP endpoint) — missing feature
</user_constraints>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Repo method consolidation (D-01) | Database / Repo | — | Interface lives in `internal/repo/sqlite/`, implementation is `SqlitePeerDebtRepo` / `SqliteGroupEventRepo` |
| Service interface consolidation (D-02) | API / Service | Handler | Service interfaces defined in handler layer per codebase convention; concrete impl in `internal/service/` |
| Dynamic UPDATE builder (D-03) | Database / Repo | — | SQL construction belongs exclusively in `internal/repo/sqlite/` per TXN-03 |
| Migration: NOT NULL constraint (D-04) | Database / Storage | — | Schema change via goose migration in `internal/migrations/` |
| Frontend component extraction (D-05) | Browser / Client | — | React components in `web/src/components/`; page files remain in `web/src/pages/` as orchestrators |
| NextInstallmentDue helper (D-06) | API / Engine | Repo + Service | `internal/engine/` owns pure date logic per ENGINE-01/02 precedent |
| public.go logic extraction (D-07) | API / Service | Handler | Business logic (event iteration, host determination) belongs in service layer per ARCH-03 |
| DeleteTransaction bug fix (D-08) | API / Service | — | Atomic balance update pattern lives in service layer per CreateTransaction precedent |
| RecordDebit cleanup (D-09) | API / Service | — | Dead code removal / guard fix in `internal/service/transactions.go` |
| Service-layer test coverage (D-10) | API / Service | Handler | Tests live alongside the layer they verify: `internal/service/*_test.go`, `internal/handler/public_test.go` |

---

## Standard Stack

### Core (all verified in go.mod and existing source)

| Component | Version | Purpose | Source |
|-----------|---------|---------|--------|
| Go | 1.25.0 | Backend language | [VERIFIED: go.mod] |
| `modernc.org/sqlite` | v1.48.2 | SQLite driver (pure Go, no CGO) | [VERIFIED: go.mod] |
| `github.com/pressly/goose/v3` | v3.27.0 | SQL migrations | [VERIFIED: go.mod] |
| `github.com/labstack/echo/v4` | v4.12.0 | HTTP framework | [VERIFIED: go.mod] |
| `github.com/google/uuid` | v1.6.0 | UUID generation | [VERIFIED: go.mod] |
| `github.com/go-playground/validator/v10` | v10.30.2 | Request validation | [VERIFIED: go.mod] |
| React + TypeScript | 19 / 6 | Frontend | [VERIFIED: CONVENTIONS.md] |
| TanStack Query v5 | — | API data fetching | [VERIFIED: web/src/pages/friends.tsx imports] |
| shadcn/ui | — | Component library | [VERIFIED: existing component imports] |
| lucide-react | — | SVG icons | [VERIFIED: friends.tsx line 4] |

### No New Dependencies

This phase installs no new packages. All work uses the existing stack. The dynamic UPDATE builder is a Go pattern using `strings.Builder` or string concatenation — no ORM or query builder library needed.

---

## Architecture Patterns

### Data Flow — Current vs. Target

```
CURRENT (broken layering example — public.go):
  HTTP Request
    → PublicHandler.GetFriendByToken()
        → friendSvc.GetFriendByToken()
        → peerDebtSvc.GetBalanceByFriend()
        → peerDebtSvc.ListByFriend()
        → groupSvc.ListEventsByFriend()
        → [FOR EACH event] groupSvc.GetParticipants()    ← business logic in handler
        → [FOR EACH participant] friendSvc.GetFriendByID() ← N+1 query in handler
        → [inline] assemble hostedGroups                  ← view logic in handler
    → c.JSON(200, ...)

TARGET (thin handler — post D-07):
  HTTP Request
    → PublicHandler.GetFriendByToken()
        → friendSvc.GetPublicFriendView(token)            ← single service call
            [inside service]:
            → friendRepo.GetByToken()
            → peerDebtRepo.GetBalanceByFriend()
            → peerDebtRepo.GetByFriend()
            → groupRepo.ListEventsByFriend()
            → [per event] groupRepo.GetParticipants()
            → [inline] assemble PublicFriendView struct
    → c.JSON(200, ...)
```

```
CURRENT (duplicate pair example — PeerDebtRepo):
  SumUpcomingPeerObligationsByAccount(accountID, after, onOrBefore) — scoped
  SumUpcomingPeerObligations(after, onOrBefore)                     — unscoped (same body)

TARGET (single method — post D-01):
  SumUpcomingPeerObligations(accountID *uuid.UUID, after, onOrBefore)
    → if accountID != nil: WHERE account_id = ?
    → else: no account filter
```

```
CURRENT (field-at-a-time UPDATE — PeerDebtRepo.Update, ~50 lines):
  tx.Exec("UPDATE PeerDebt SET amount = ? WHERE id = ?", *amount, id)
  tx.Exec("UPDATE PeerDebt SET description = ? WHERE id = ?", *desc, id)
  ... one Exec per field ...

TARGET (dynamic UPDATE — post D-03, ~15 lines):
  type updatePair struct { col string; val any }
  pairs := []updatePair{}
  if amount != nil   { pairs = append(pairs, updatePair{"amount", *amount}) }
  if desc != nil     { pairs = append(pairs, updatePair{"description", *desc}) }
  // build: UPDATE PeerDebt SET col1=?,col2=? WHERE id=?
  // single Exec with flattened args
```

### Recommended Project Structure (no changes to layout)

```
internal/
├── engine/
│   ├── engine.go           # NextPayday, AddMonthClamped (existing)
│   └── engine_test.go      # (existing)
│   └── installment.go      # NEW: NextInstallmentDue (D-06)
├── repo/sqlite/
│   ├── peer_debt.go        # consolidated: unscoped methods removed (D-01, D-03)
│   └── group_event.go      # consolidated: unscoped methods removed (D-01, D-03)
├── service/
│   ├── transactions.go     # DeleteTransaction fix (D-08), RecordDebit fix (D-09)
│   ├── peer_debt.go        # service interface consolidated (D-02)
│   ├── group_event.go      # service interface consolidated (D-02)
│   ├── transactions_test.go # NEW (D-10)
│   ├── peer_debt_test.go   # NEW (D-10)
│   └── group_event_test.go # NEW (D-10)
├── handler/
│   ├── public.go           # thinned: business logic moved to service (D-07)
│   └── public_test.go      # NEW (D-10)
├── migrations/
│   └── 20260416000006_account_id_not_null.go  # NEW (D-04)
web/src/
├── components/
│   ├── FriendForm.tsx         # NEW — extracted from friends.tsx (D-05)
│   ├── DebtForm.tsx           # NEW — extracted from friends.tsx (D-05)
│   ├── GroupEventForm.tsx     # NEW — extracted from friends.tsx (D-05)
│   ├── ParticipantEditor.tsx  # NEW — extracted from friends.tsx (D-05)
│   └── [accounts + transactions extracted components] # NEW (D-05)
└── pages/
    ├── friends.tsx       # reduced to orchestrator (~200-300 lines target)
    ├── accounts.tsx      # reduced to orchestrator
    └── transactions.tsx  # reduced to orchestrator
```

### Pattern 1: Nullable Account ID Filter (D-01)

**What:** Replace scoped/unscoped method pairs with a single method accepting `*uuid.UUID`.

**When to use:** Any repo method currently duplicated as `Foo()` and `FooByAccount(accountID uuid.UUID)`.

```go
// Source: existing codebase pattern — *uuid.UUID already used for FK nullability

// Before (two methods):
func (r *SqlitePeerDebtRepo) GetAll() ([]PeerDebt, error) {
    rows, err := r.db.Query(`SELECT ... FROM PeerDebt`)
    ...
}
func (r *SqlitePeerDebtRepo) GetAllByAccount(accountID uuid.UUID) ([]PeerDebt, error) {
    rows, err := r.db.Query(`SELECT ... FROM PeerDebt WHERE account_id = ?`, accountID.String())
    ...
}

// After (one method):
func (r *SqlitePeerDebtRepo) GetAll(accountID *uuid.UUID) ([]PeerDebt, error) {
    query := `SELECT ... FROM PeerDebt`
    args := []any{}
    if accountID != nil {
        query += ` WHERE account_id = ?`
        args = append(args, accountID.String())
    }
    rows, err := r.db.Query(query, args...)
    ...
}
```

**Cascade to interfaces:** `PeerDebtRepo` interface, `PeerDebtServiceIface` in handler, service methods, mock objects in `testhelpers_test.go`.

### Pattern 2: Dynamic UPDATE Builder (D-03)

**What:** Build a single `UPDATE` statement from a slice of `(column, value)` pairs.

**When to use:** `PeerDebtRepo.Update` and `GroupEventRepo.Update`.

Two valid approaches (Claude's discretion):

**Option A — slice of pairs (recommended for simplicity):**
```go
// Source: [ASSUMED] — standard Go pattern, no external library

type updateCol struct {
    col string
    val any
}

func buildUpdate(table string, id uuid.UUID, cols []updateCol) (string, []any, error) {
    if len(cols) == 0 {
        return "", nil, fmt.Errorf("no fields to update")
    }
    setClauses := make([]string, len(cols))
    args := make([]any, 0, len(cols)+1)
    for i, c := range cols {
        setClauses[i] = c.col + " = ?"
        args = append(args, c.val)
    }
    args = append(args, id.String())
    query := "UPDATE " + table + " SET " + strings.Join(setClauses, ", ") + " WHERE id = ?"
    return query, args, nil
}
```

**Option B — variadic func-options:** More flexible but higher complexity. Prefer Option A for this codebase's style.

**Rows-affected check:** The consolidated Update must still verify `RowsAffected == 0` returns `sql.ErrNoRows`. Single statement means a single check at the end — no `rowChecked` tracking variable needed.

### Pattern 3: Engine Helper Extraction (D-06)

**What:** Extract `NextInstallmentDue` into `internal/engine/installment.go` following exact `AddMonthClamped` function signature pattern.

```go
// Source: engine.go pattern — AddMonthClamped as model

// NextInstallmentDue computes the due date for the next installment payment.
// firstDue is the RFC3339-parsed original start date.
// paidInstallments is the number of installments already paid (0-indexed advancement).
// frequency is "monthly" or "weekly"; defaults to monthly.
//
// Example: firstDue=Jan1, paidInstallments=2, frequency="monthly" → Apr1 (installment #3)
func NextInstallmentDue(firstDue time.Time, paidInstallments int64, frequency string) time.Time {
    nextInstNum := paidInstallments + 1
    switch frequency {
    case FreqWeekly:
        return firstDue.AddDate(0, 0, int(nextInstNum-1)*7)
    default: // monthly and fallback
        return firstDue.AddDate(0, int(nextInstNum-1), 0)
    }
}
```

**Callers after extraction:**
- `internal/repo/sqlite/peer_debt.go` lines 573–584 and 636–647: replace inline block with `engine.NextInstallmentDue(firstDue, paidInst, freq)`
- `internal/service/peer_debt.go` lines 162–170 and 215–222: replace inline block with `engine.NextInstallmentDue(firstDue, nextInstNum-1, r.Frequency)` — note: service currently uses `nextInstNum - 1` as `paidInstallments` equivalent

**Error handling delta:** The repo implementations `continue` on parse error; service returns nil date. The extracted helper should accept a pre-parsed `time.Time` — callers retain their own error handling for the parse step. This preserves the behavioral difference explicitly.

### Pattern 4: Service Method for public.go Logic (D-07)

**What:** Extract `GetFriendByToken` business logic into a new service method, making the handler a thin adapter.

The new service method signature (recommended):

```go
// In internal/service/friend.go or a new internal/service/public.go:
type PublicFriendView struct {
    Friend       sqlite.Friend
    Balance      sqlite.PeerDebtBalance
    Debts        []sqlite.PeerDebt
    Groups       []PublicGroupEvent
    HostedGroups []HostedGroup
}

func (s *FriendService) GetPublicFriendView(token string) (PublicFriendView, error)
```

The handler then reduces to:
```go
func (h *PublicHandler) GetFriendByToken(c echo.Context) error {
    token := c.Param("token")
    if h.wantsHTML(c) && len(indexHTML) > 0 {
        return c.HTML(http.StatusOK, string(indexHTML))
    }
    view, err := h.friendSvc.GetPublicFriendView(token)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) { return echo.NewHTTPError(http.StatusNotFound, "friend not found") }
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, mapPublicFriendViewToResponse(view))
}
```

**N+1 consideration (Claude's discretion):** The N+1 query loop in `GetFriendByToken` (lines 182–192, calls `GetFriendByID` per participant) can be fixed during this extraction if the service layer adds a `GetParticipantsByEventWithNames` query that JOINs Friend. Include only if the JOIN is straightforward — defer if it requires schema restructuring.

### Pattern 5: DeleteTransaction Fix (D-08)

**What:** Mirror `CreateTransaction`'s atomic pattern for deletion.

```go
// Before (broken):
func (s *TransactionsService) DeleteTransaction(id uuid.UUID) error {
    if err := s.txnsRepo.DeleteByID(id); err != nil {
        return fmt.Errorf("service.DeleteTransaction: %w", err)
    }
    return nil
}

// After (fixed):
func (s *TransactionsService) DeleteTransaction(id uuid.UUID) error {
    // Step 1: Fetch transaction to get amount and accountID.
    t, err := s.txnsRepo.GetByID(id)
    if err != nil {
        return fmt.Errorf("service.DeleteTransaction: get transaction: %w", err)
    }
    // Step 2: Fetch account to get current balance.
    acc, err := s.accRepo.GetByID(t.AccountID)
    if err != nil {
        return fmt.Errorf("service.DeleteTransaction: get account: %w", err)
    }
    // Step 3: Begin atomic transaction.
    tx, err := s.db.Begin()
    if err != nil {
        return fmt.Errorf("service.DeleteTransaction: begin tx: %w", err)
    }
    defer tx.Rollback()
    // Step 4: Delete transaction.
    if err := s.txnsRepo.DeleteByID(id, tx); err != nil {
        return fmt.Errorf("service.DeleteTransaction: delete: %w", err)
    }
    // Step 5: Reverse amount from balance.
    newBalance := acc.CurrentBalance - t.Amount
    if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
        return fmt.Errorf("service.DeleteTransaction: update balance: %w", err)
    }
    return tx.Commit()
}
```

**Note:** `txnsRepo.DeleteByID` currently does not accept a `*sql.Tx` parameter. The repo method signature must be updated to match the tx/no-tx duality pattern established in CONVENTIONS.md (optional `*sql.Tx` parameter). [VERIFIED: existing pattern in `TransactionsRepo.Insert(t Transaction, tx *sql.Tx)`]

### Pattern 6: Service-Layer Tests (D-10)

**What:** Service-layer tests must use mock repo implementations — not a real SQLite instance.

**Test file placement:** `internal/service/transactions_test.go` with `package service_test` (external test package, matching existing `pay_schedule_test.go`).

**Mock strategy:** Func-field mocks, same pattern as handler `testhelpers_test.go`:

```go
// Source: internal/handler/testhelpers_test.go — established pattern [VERIFIED]

type mockTransactionsRepo struct {
    insertFn                 func(t sqlite.Transaction, tx *sql.Tx) error
    getByIDFn                func(id uuid.UUID) (sqlite.Transaction, error)
    deleteByIDFn             func(id uuid.UUID, tx *sql.Tx) error
    advanceNextOccurrenceFn  func(id uuid.UUID, next time.Time, tx *sql.Tx) error
    getByAccountFn           func(accountID uuid.UUID) ([]sqlite.Transaction, error)
    updateFn                 func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error
}
// Methods: implement TransactionsRepo interface, delegate to fn fields, panic if nil.

type mockAccountsRepo struct {
    getByIDFn      func(id uuid.UUID) (sqlite.Account, error)
    updateBalanceFn func(id uuid.UUID, newBalance int64, tx *sql.Tx) error
}
```

**Test for DeleteTransaction (critical test per D-08):**
```go
func TestDeleteTransaction_ReversesBalance(t *testing.T) {
    txnID := uuid.New()
    accID := uuid.New()
    // Transaction amount: -5000 cents (debit)
    // Account balance: 10000 cents
    // After deletion: balance = 10000 - (-5000) = 15000
    ...
}
```

**Handler test pattern (public.go, D-10):**
```go
// internal/handler/public_test.go — package handler
// Uses serveRequest() from testhelpers_test.go
// Mocks: PublicGroupServiceIface, FriendServiceIface, PeerDebtSummaryIface
```

### Pattern 7: goose Migration (D-04)

**What:** Add NOT NULL constraint on `account_id` columns in PeerDebt and GroupEvent.

**SQLite constraint:** SQLite cannot add `NOT NULL` to existing columns via `ALTER TABLE`. The standard approach for SQLite is table rebuild: rename, create new with constraint, copy data, drop old.

```go
// Source: [ASSUMED] — SQLite ALTER TABLE limitation is well-documented

// In internal/migrations/20260416000006_account_id_not_null.go:
// Pattern: For each table:
// 1. CREATE TABLE PeerDebt_new (..., account_id TEXT NOT NULL REFERENCES Account(id))
// 2. INSERT INTO PeerDebt_new SELECT ... FROM PeerDebt
// 3. DROP TABLE PeerDebt
// 4. ALTER TABLE PeerDebt_new RENAME TO PeerDebt
// 5. Recreate indexes
// Alternative: CHECK (account_id IS NOT NULL) — simpler but weaker than true NOT NULL
```

**CHECK vs NOT NULL:** A `CHECK (account_id IS NOT NULL)` constraint can be added via `ALTER TABLE ADD COLUMN` but the column already exists. Since the column was added nullable, the only way to enforce true `NOT NULL` in SQLite is the table-rebuild approach. The CONTEXT.md decision D-04 accepts either `CHECK (account_id IS NOT NULL)` or rebuilding the columns with `NOT NULL` — prefer the table rebuild for true schema integrity.

### Frontend Component Extraction (D-05)

**Component extraction rules (from CONVENTIONS.md and ui-ux-pro-max skill):**

1. Each extracted component is a `.tsx` file in `web/src/components/`
2. Components receive props for their data and callbacks — no direct `useQuery` inside extracted form components (query state lives in the page orchestrator)
3. Pass mutation functions as prop callbacks: `onSubmit: (data: FormData) => Promise<void>`
4. Preserve `AccountContext` consumption — extracted components that need the active account receive `accountId` as a prop from the page, they do not read context directly
5. Use named exports, not default exports (matches existing component pattern)
6. lucide-react for icons, `formatMoney()` from `@/lib/format` for display

**Extraction candidates in `friends.tsx` (1,342 lines):**

| Component | What It Contains | Props Needed |
|-----------|-----------------|--------------|
| `FriendForm` | Create/edit friend fields (name, notes, pix_key) | `onSubmit`, `initialValues?`, `isLoading` |
| `DebtForm` | Add debt form (amount, description, date, installment fields) | `friendId`, `accountId`, `onSubmit`, `isLoading` |
| `GroupEventForm` | Create group event form (title, date, total_amount, notes) | `accountId`, `onSubmit`, `isLoading` |
| `ParticipantEditor` | Participant list with share amounts and host selector | `participants`, `friends`, `onChange`, `totalAmount` |

**Page file target state:** The page imports the extracted components, owns query/mutation state, and passes data + callbacks down. The page retains modal open/close state since that is coordination logic.

### Anti-Patterns to Avoid

- **Partial interface consolidation:** If `GetAll(accountID *uuid.UUID)` is added to `PeerDebtRepo` but `GetAll()` is not removed, the old method remains callable and the duplication persists. Remove both the old method from the interface AND the old implementation simultaneously.
- **Skipping the compile-time assertion:** Every handler file uses `var _ Interface = (*Impl)(nil)`. When service interfaces change (D-02), this assertion will catch mismatches at compile time — do not suppress it.
- **SQL outside repo layer:** The dynamic UPDATE builder's SQL string must stay inside `internal/repo/sqlite/`. Do not construct SQL in service methods even for "simple" cases (TXN-03 requirement).
- **Test mocks that panic on all methods:** The func-field mock pattern panics only when a method is called unexpectedly. Tests should set only the functions they need — this is the established pattern.
- **React state in extracted components:** Extracted form components should be mostly controlled — state lives in the parent page. Avoid adding `useState` inside extracted components for data that the page also needs to read.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL query building | Custom string builder beyond simple concatenation | Go `strings.Join` + `[]any` args | Phase scope doesn't need a query builder library; the pattern is 15 lines |
| Test mocking | Code generation (mockgen, moq) | Func-field structs (existing pattern) | Established in testhelpers_test.go; adding a code generator is out of scope |
| SQLite schema migration | Hand-crafted ALTER TABLE | goose migration file in `internal/migrations/` | Existing migration infrastructure handles table rebuilds |
| React form validation | Custom validation logic | React controlled inputs + existing TypeScript types | Validation at creation is already handled server-side; client forms are simple |
| Interface verification | Runtime type checks | `var _ Interface = (*Impl)(nil)` compile-time assertion | Established pattern in every handler file |

---

## Common Pitfalls

### Pitfall 1: Partial Caller Audit Before Removing Unscoped Methods

**What goes wrong:** Developer removes `GetAll()` from `PeerDebtRepo` interface and implementation, but misses that `PeerDebtService.ListAll()` is still calling the unscoped repo method internally (through the interface). The service layer compiles because it was calling the method via the repo interface, which was updated, but the service method itself is now dead code that was the actual caller of the unscoped repo path.

**Why it happens:** The service layer wraps repo calls — `PeerDebtService.ListAll()` calls `s.repo.GetAll()`. Removing `GetAll()` from the repo interface breaks the service method. But `PeerDebtServiceIface` in the handler still exposes `ListAll()` and `ListAllByAccount()` as two separate methods. Both the repo AND service interface pairs must be consolidated together.

**How to avoid:** Per D-02, treat repo + service consolidation as a single atomic unit. For each pair: (a) confirm no handler calls the unscoped service method, (b) update repo interface → remove unscoped, (c) update service method to use consolidated repo, (d) update service interface in handler file → merge or remove unscoped, (e) update mock in testhelpers_test.go, (f) compile check.

**Warning signs:** Compile errors cascade rather than appearing only in the repo file. If handler or service files error after a repo interface change, it indicates a missed caller chain.

### Pitfall 2: Missing tx Parameter on DeleteByID

**What goes wrong:** `DeleteTransaction` fix (D-08) requires calling `txnsRepo.DeleteByID(id, tx)` with a transaction. Currently `DeleteByID(id uuid.UUID) error` — no `tx` parameter. If the implementor adds the atomic balance update without updating the repo method signature, the transaction cannot be passed to the DELETE operation.

**Why it happens:** The tx/no-tx duality pattern requires updating both the repo interface and implementation. `DeleteByID` is in `TransactionsRepo` interface and `SqliteTxnsRepo` implementation.

**How to avoid:** Update `TransactionsRepo.DeleteByID(id uuid.UUID, tx *sql.Tx) error` in both the interface definition and the `SqliteTxnsRepo` implementation before writing the service-layer fix. The handler calling `DeleteTransaction` does not pass `tx` — that is correct (handler calls service, service manages its own tx).

**Warning signs:** Service method compiles but there is no `tx.Exec` for the DELETE — the delete and balance update run in separate transactions, leaving a corruption window.

### Pitfall 3: NextInstallmentDue Behavioral Difference Between Repo and Service Callers

**What goes wrong:** The repo copies (`continue` on parse error) and service copies (nil NextPaymentDate on parse error) have different error behaviors. Extracting `NextInstallmentDue` as a pure function that accepts `time.Time` (already parsed) moves the error handling to the caller — which is correct. But if the implementor changes `NextInstallmentDue` to accept a string and parse internally, both callers get the same error behavior, which may silently suppress repo-layer errors.

**Why it happens:** The function signature determines where parse errors surface.

**How to avoid:** Signature must accept `time.Time`, not `string`. Callers do their own `time.Parse` and handle errors with their existing strategies (`continue` vs. skip).

**Warning signs:** Test for `NextInstallmentDue` passes with a `string` parameter. The function signature is the indicator.

### Pitfall 4: React Component Props vs. Context

**What goes wrong:** An extracted component like `DebtForm` internally calls `useContext(AccountContext)` because friends.tsx used to do it inline. This works initially but breaks testability and reusability — the component now has an implicit dependency on global state.

**Why it happens:** The original monolithic page can use context freely. Extracted components should be pure in the sense that their dependencies are explicit via props.

**How to avoid:** All extracted form components receive `accountId: string` as a prop. Only the page-level orchestrator reads `AccountContext`. This mirrors the existing pattern where `CheckWidget`, `StatCards`, etc. receive data as props.

**Warning signs:** An extracted component file contains `import { AccountContext } from '@/App'`.

### Pitfall 5: SQLite Table Rebuild Migration Order

**What goes wrong:** The NOT NULL migration (D-04) rebuilds PeerDebt and GroupEvent tables. If indexes, foreign keys, or views reference the old table name during the window between DROP and RENAME, the migration fails mid-way and leaves the database in an inconsistent state.

**Why it happens:** SQLite `ALTER TABLE ... RENAME` is atomic, but the sequence (create new, copy, drop old, rename) is not a single SQLite statement. goose wraps it in a transaction, but SQLite's transaction support for DDL is limited.

**How to avoid:** Use the goose migration's `ctx *sql.Tx` parameter — execute all DDL within the single migration transaction. SQLite supports transactional DDL for table create/drop/rename. Recreate all indexes after the rename inside the same transaction.

---

## Code Examples

### Dynamic UPDATE Builder (D-03)

```go
// Source: [ASSUMED] standard Go pattern — verified against existing codebase style

import "strings"

type updateField struct {
    col string
    val any
}

// buildDynamicUpdate constructs a parameterized UPDATE statement.
// Returns the SQL string, ordered args slice (values then id), and error if no fields.
func buildDynamicUpdate(table string, id string, fields []updateField) (string, []any, error) {
    if len(fields) == 0 {
        return "", nil, fmt.Errorf("%s.Update: no fields provided", table)
    }
    setClauses := make([]string, len(fields))
    args := make([]any, 0, len(fields)+1)
    for i, f := range fields {
        setClauses[i] = f.col + " = ?"
        args = append(args, f.val)
    }
    args = append(args, id) // WHERE id = ? — last arg
    sql := "UPDATE " + table + " SET " + strings.Join(setClauses, ", ") + " WHERE id = ?"
    return sql, args, nil
}

// Usage in PeerDebtRepo.Update:
func (r *SqlitePeerDebtRepo) Update(id uuid.UUID, amount *int64, description *string, isConfirmed *bool, paidInstallments *int64) error {
    var fields []updateField
    if amount != nil          { fields = append(fields, updateField{"amount", *amount}) }
    if description != nil     { fields = append(fields, updateField{"description", *description}) }
    if isConfirmed != nil     { fields = append(fields, updateField{"is_confirmed", *isConfirmed}) }
    if paidInstallments != nil { fields = append(fields, updateField{"paid_installments", *paidInstallments}) }

    sql, args, err := buildDynamicUpdate("PeerDebt", id.String(), fields)
    if err != nil {
        return fmt.Errorf("peer_debt.Update: %w", err)
    }
    res, err := r.db.Exec(sql, args...)
    if err != nil {
        return fmt.Errorf("peer_debt.Update: %w", err)
    }
    if n, _ := res.RowsAffected(); n == 0 {
        return fmt.Errorf("peer_debt.Update: %w", sql.ErrNoRows)
    }
    return nil
}
```

### Service Test with Mock Repo (D-10)

```go
// Source: established pattern from internal/handler/testhelpers_test.go [VERIFIED]
// File: internal/service/transactions_test.go

package service_test

import (
    "database/sql"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/ufleck/cibi/internal/repo/sqlite"
    "github.com/ufleck/cibi/internal/service"
)

type mockTxnsRepo struct {
    getByIDFn   func(uuid.UUID) (sqlite.Transaction, error)
    deleteByIDFn func(uuid.UUID, *sql.Tx) error
}
func (m *mockTxnsRepo) GetByID(id uuid.UUID) (sqlite.Transaction, error) {
    if m.getByIDFn != nil { return m.getByIDFn(id) }
    panic("not implemented")
}
func (m *mockTxnsRepo) DeleteByID(id uuid.UUID, tx *sql.Tx) error {
    if m.deleteByIDFn != nil { return m.deleteByIDFn(id, tx) }
    panic("not implemented")
}
// ... other interface methods

func TestDeleteTransaction_ReversesBalance(t *testing.T) {
    txnID := uuid.New()
    accID := uuid.New()
    txn := sqlite.Transaction{ID: txnID, AccountID: accID, Amount: -5000}
    acc := sqlite.Account{ID: accID, CurrentBalance: 10000}

    var capturedNewBalance int64
    txnsRepo := &mockTxnsRepo{
        getByIDFn:    func(id uuid.UUID) (sqlite.Transaction, error) { return txn, nil },
        deleteByIDFn: func(id uuid.UUID, tx *sql.Tx) error { return nil },
    }
    accRepo := &mockAccountsRepo{
        getByIDFn:       func(id uuid.UUID) (sqlite.Account, error) { return acc, nil },
        updateBalanceFn: func(id uuid.UUID, bal int64, tx *sql.Tx) error {
            capturedNewBalance = bal
            return nil
        },
    }
    // NOTE: service needs a real *sql.DB for tx.Begin() — use sqltest or in-memory SQLite
    // Alternative: inject a txStarter interface to avoid requiring real DB in service tests

    // ... assert capturedNewBalance == 15000 (10000 - (-5000))
}
```

**Note:** Service methods that call `s.db.Begin()` require a real `*sql.DB` for unit tests, or the DB dependency must be abstracted behind an interface (`TxStarter`). The simplest approach for this phase: use `modernc.org/sqlite` in-memory database (`file::memory:?cache=shared`) in service tests, mirroring how the repo layer would be tested. This avoids adding a new interface abstraction (Claude's discretion).

---

## Runtime State Inventory

This is a refactor/consolidation phase — no renames or data migrations other than D-04.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `account_id` column exists as nullable in PeerDebt and GroupEvent. Data was backfilled by migration 20260416000005 (set to default account). No NULL rows expected in practice. | Schema migration D-04: add NOT NULL constraint via table rebuild |
| Live service config | None — no external service configuration references code structure | None |
| OS-registered state | None — no OS-level registrations | None |
| Secrets/env vars | None — no env vars reference code structure names | None |
| Build artifacts | None — Go compiles fresh; React Vite build is clean after source changes | None |

**Nothing found in categories 2-5:** Verified by inspection of the codebase — this is a pure code refactor.

---

## Open Questions

1. **Service test DB dependency for atomic methods**
   - What we know: `TransactionsService` holds `s.db *sql.DB` and calls `s.db.Begin()` in `CreateTransaction`, `UpdateTransaction`, `DeleteTransaction`, `ConfirmRecurring`.
   - What's unclear: Whether to use in-memory SQLite in service tests (requires repo setup overhead) or inject a `TxStarter` interface (requires adding abstraction).
   - Recommendation: Use in-memory SQLite with a minimal schema setup in `TestMain` or per-test setup. Keeps test isolation simple and does not add new abstractions. Claude's discretion per D-10.

2. **N+1 fix scope for GetFriendByToken**
   - What we know: `GetFriendByToken` calls `GetFriendByID` per participant in a loop (lines 182–192). The fix requires a JOIN query: `GetParticipantsByEventWithNames` joining `GroupEventParticipant` and `Friend`.
   - What's unclear: Whether adding this JOIN is low-effort (new repo method + SQL) or requires API response shape changes.
   - Recommendation: The JOIN itself is straightforward SQL. The API response already carries `FriendName` strings (no shape change needed). Include in D-07 implementation if the service extraction is already being done — it's the same code path.

3. **Migration 20260416000006 numbering**
   - What we know: Last migration is `20260416000005`. Migrations are goose-managed with sequential numeric prefixes.
   - What's unclear: Whether the planner should use `20260416000006` or a future date (e.g., `20260417000001`).
   - Recommendation: Use `20260416000006` — same date, next sequence number. goose orders by timestamp value, not wall-clock date.

---

## Environment Availability

This phase is purely code/config changes. No external service dependencies beyond the existing development environment (Go toolchain, npm, SQLite file). Step 2.6: SKIPPED (no new external dependencies).

---

## Validation Architecture

nyquist_validation is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Go standard `testing` package (backend); Vitest (frontend) |
| Backend config | No explicit config — `go test ./...` from project root |
| Frontend config | `web/vite.config.ts` (existing Vitest config) |
| Quick run command (Go) | `go test ./internal/...` |
| Full suite command | `go test ./... && cd web && npm test -- --run` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| DeleteTransaction reverses balance | unit | `go test ./internal/service/ -run TestDeleteTransaction` | No — Wave 0 |
| CreateTransaction still works after refactor | unit | `go test ./internal/service/ -run TestCreateTransaction` | No — Wave 0 |
| ConfirmRecurring debits and advances | unit | `go test ./internal/service/ -run TestConfirmRecurring` | No — Wave 0 |
| NextInstallmentDue correct for monthly/weekly | unit | `go test ./internal/engine/ -run TestNextInstallmentDue` | No — Wave 0 |
| PeerDebt repo GetAll with nil accountID returns all | unit | `go test ./internal/repo/sqlite/ -run TestPeerDebtRepo` | No — Wave 0 |
| PeerDebt repo GetAll with non-nil accountID filters | unit | `go test ./internal/repo/sqlite/ -run TestPeerDebtRepo` | No — Wave 0 |
| PeerDebt Update dynamic builder updates correct fields | unit | `go test ./internal/repo/sqlite/ -run TestPeerDebtUpdate` | No — Wave 0 |
| GetFriendByToken public endpoint returns 200 | unit | `go test ./internal/handler/ -run TestGetFriendByToken` | No — Wave 0 |
| GetFriendByToken with bad token returns 404 | unit | `go test ./internal/handler/ -run TestGetFriendByToken` | No — Wave 0 |
| Migration 20260416000006 applies cleanly | manual | goose up on empty schema | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `go test ./internal/...`
- **Per wave merge:** `go test ./... && cd web && npm run build` (build ensures no TS errors in extracted components)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `internal/service/transactions_test.go` — TestDeleteTransaction_ReversesBalance, TestCreateTransaction, TestConfirmRecurring
- [ ] `internal/service/peer_debt_test.go` — TestGetFriendDebtBreakdown, TestGetFriendDebtBreakdownByAccount
- [ ] `internal/service/group_event_test.go` — TestListEvents, TestCreateEvent
- [ ] `internal/engine/installment_test.go` — TestNextInstallmentDue (monthly, weekly, zero paid, all paid)
- [ ] `internal/handler/public_test.go` — TestGetFriendByToken, TestGetGroupByToken, TestConfirmHostedGroupPayment

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — no auth added | — |
| V3 Session Management | No | — |
| V4 Access Control | No — public endpoints remain unauthenticated (existing design decision per CONCERNS.md) | — |
| V5 Input Validation | Partial — existing `go-playground/validator` validation unchanged | No new validation surface added |
| V6 Cryptography | No | — |

### Known Threat Patterns Relevant to This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Internal error leakage via `err.Error()` in handlers | Information Disclosure | Phase does not fix this (CONCERNS.md security note — out of scope for simplification phase) |
| Public endpoints with no rate limiting | DoS | Out of scope for this phase |
| NOT NULL migration: if data migration fails partway | Tampering | Wrap entire migration in goose transaction |

**Security posture:** This phase does not change the security surface. The existing design decisions (no auth, UUID tokens for public endpoints) are unchanged. The `NOT NULL` migration (D-04) improves data integrity but is not a security control.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `strings.Join` + `[]any` args is the standard Go approach for dynamic UPDATE builders (no library needed) | Pattern 2 | Low — alternative is a query builder library, which would be over-engineering for this scope |
| A2 | SQLite requires table-rebuild pattern to add NOT NULL to existing nullable column | Pattern 7 | Medium — if SQLite supports CHECK constraint via ALTER TABLE ADD CONSTRAINT, the migration is simpler; table rebuild remains safe regardless |
| A3 | Service tests using in-memory SQLite are the right approach for methods that call `s.db.Begin()` | Open Questions #1 | Low — alternative is TxStarter interface injection; both are valid patterns |
| A4 | `20260416000006` is the correct migration filename for D-04 | Open Questions #3 | Very low — goose ordering is by embedded timestamp, not filename date |

---

## Sources

### Primary (HIGH confidence)

- `internal/repo/sqlite/peer_debt.go` — verified exact line locations of duplicate method pairs (lines 525–652)
- `internal/repo/sqlite/group_event.go` — verified field-at-a-time UPDATE pattern (lines 287–339)
- `internal/service/peer_debt.go` — verified duplicated date logic (lines 162–170, 215–222)
- `internal/service/transactions.go` — verified DeleteTransaction bug (lines 153–158), RecordDebit guard (lines 186–189)
- `internal/handler/public.go` — verified business logic in handler (lines 137–208)
- `internal/handler/testhelpers_test.go` — verified func-field mock pattern
- `internal/engine/engine.go` — verified NextPayday/AddMonthClamped signature pattern for D-06
- `go.mod` — verified all dependency versions
- `.planning/codebase/CONCERNS.md` — verified all issue descriptions and line references
- `.planning/codebase/CONVENTIONS.md` — verified naming, error handling, and import patterns
- `.planning/phases/10-codebase-simplification-and-logic-centralization/10-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)

- `.planning/PROJECT.md` — architectural constraints (layered arch, no SQL outside repo/sqlite/)
- `.planning/REQUIREMENTS.md` — TXN-03 (no SQL outside repo layer)

### Tertiary (LOW confidence — flagged as ASSUMED)

- SQLite NOT NULL migration pattern (A2) — standard SQLite limitation, not verified against a current SQLite changelog

---

## Metadata

**Confidence breakdown:**
- Code locations: HIGH — verified by reading actual source files at specified line numbers
- Standard stack: HIGH — all verified in go.mod and existing imports
- Architecture patterns: HIGH — derived from existing code, not assumed
- Pitfalls: HIGH — derived from analysis of actual code structure
- SQLite NOT NULL migration approach: MEDIUM — standard SQLite limitation, one assumption logged

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable Go codebase — no fast-moving dependencies involved)
