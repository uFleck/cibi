# Ledger + Custom Projection — Implementation Spec

**Date**: 2026-09-11
**Status**: Approved, ready to implement
**Branch**: implement from `main`

---

## Context

Two problems to solve together:

1. **Projection "This month" mode is wrong.** `computeMonthlyProjection` adds full-month income to `current_balance` (which already includes received paychecks), double-counting. Already-paid bills drop out because `next_occurrence` advances on payment.

2. **No payment history.** Recurring bills vanish from calculations once paid. Need a ledger to track every money movement for accurate projections and auditability.

**Solution**: Full ledger table that tracks all payments. `current_balance` becomes a cached field recomputed on every ledger write (not SUM query on read — too slow over time). Projection widget gets a "Custom" mode with paycheck range picker and exclude-balance toggle, replacing "This month".

---

## Design decisions (all settled, do not re-ask)

- `LedgerService` is the single seam: owns `RecordEntry(entry, outerTx *sql.Tx)` which inserts ledger row + updates cached balance atomically. All services call this instead of `accRepo.UpdateBalance` for payment/income events.
- Balance: incremental `+= amount` on insert; full SUM recompute on delete (for correctness after removal).
- Migration seeds one `opening_balance` entry per account so `SUM(ledger) = current_balance` from day one.
- Backfill script (`cmd/backfill/`) creates payment entries for historical transactions.
- Old transactions (pre-ledger, no linked ledger entry) fall back to old balance math in Delete/Update paths.
- Projection: "Next window" stays unchanged. "This month" replaced by "Custom" (offcanvas: start/end paycheck pickers from pay schedules, exclude-balance toggle).
- Custom projection formula: `projected_end = (current_balance OR 0) + future_income[now, end) - future_obligations[now, end)`. Future income = pay schedule occurrences; future obligations = `next_occurrence` in window (not-yet-paid). Already-paid obligations are in the ledger and already baked into current_balance.
- Income entry: manual, via new home widget "payday received" (appears on payday, calls `POST /api/ledger/income`). Removes confirm button from pay schedule list.
- Ledger UI: new "Ledger" tab on transactions page (list + delete). Last 5 entries widget on accounts (home) page.

---

## Phase 1 — DB + Backend

### 1a. Migration

**File**: `internal/migrations/20260911000001_ledger.go`

```go
package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upLedger, downLedger)
}

func upLedger(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS ledger (
			id              TEXT PRIMARY KEY,
			account_id      TEXT NOT NULL REFERENCES Account(id) ON DELETE CASCADE,
			transaction_id  TEXT REFERENCES "Transaction"(id),
			pay_schedule_id TEXT REFERENCES PaySchedule(id),
			entry_type      TEXT NOT NULL CHECK(entry_type IN (
				'payment', 'income', 'opening_balance', 'manual_adjustment'
			)),
			amount          INTEGER NOT NULL,
			description     TEXT NOT NULL,
			posted_at       TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_ledger_account_id ON ledger(account_id)`,
		`CREATE INDEX IF NOT EXISTS idx_ledger_posted_at  ON ledger(posted_at)`,
		// Seed one opening_balance entry per account so SUM(ledger) = current_balance.
		// Use hex(randomblob(16)) for UUID-like IDs (matches existing pattern).
		`INSERT INTO ledger (id, account_id, entry_type, amount, description, posted_at)
		 SELECT lower(hex(randomblob(16))), id, 'opening_balance', current_balance,
		        'Opening balance', datetime('now')
		 FROM Account`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downLedger(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP INDEX IF EXISTS idx_ledger_posted_at`,
		`DROP INDEX IF EXISTS idx_ledger_account_id`,
		`DROP TABLE IF EXISTS ledger`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
```

### 1b. Repo

**File**: `internal/repo/sqlite/ledger.go`

```go
package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// LedgerEntry mirrors the ledger schema row.
type LedgerEntry struct {
	ID            uuid.UUID
	AccountID     uuid.UUID
	TransactionID *uuid.UUID // nullable
	PayScheduleID *uuid.UUID // nullable
	// EntryType is one of: payment, income, opening_balance, manual_adjustment
	EntryType   string
	Amount      int64  // cents; negative = debit, positive = credit
	Description string
	PostedAt    time.Time
}

// LedgerRepo defines the data access contract for the account ledger.
type LedgerRepo interface {
	Insert(e LedgerEntry, tx *sql.Tx) error
	ListByAccount(accountID uuid.UUID) ([]LedgerEntry, error)
	DeleteByID(id uuid.UUID, tx *sql.Tx) error
	FindByTransactionID(txnID uuid.UUID) (*LedgerEntry, error)
	SumByAccount(accountID uuid.UUID, tx *sql.Tx) (int64, error)
}

// SqliteLedgerRepo implements LedgerRepo.
type SqliteLedgerRepo struct{ db *sql.DB }

func NewSqliteLedgerRepo(db *sql.DB) *SqliteLedgerRepo { return &SqliteLedgerRepo{db: db} }

func (r *SqliteLedgerRepo) Insert(e LedgerEntry, tx *sql.Tx) error {
	var txnID, psID interface{}
	if e.TransactionID != nil {
		txnID = e.TransactionID.String()
	}
	if e.PayScheduleID != nil {
		psID = e.PayScheduleID.String()
	}
	q := `INSERT INTO ledger (id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at)
	      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	args := []any{
		e.ID.String(), e.AccountID.String(), txnID, psID,
		e.EntryType, e.Amount, e.Description,
		e.PostedAt.UTC().Format(time.RFC3339),
	}
	var err error
	if tx != nil {
		_, err = tx.Exec(q, args...)
	} else {
		_, err = r.db.Exec(q, args...)
	}
	if err != nil {
		return fmt.Errorf("ledger.Insert: %w", err)
	}
	return nil
}

func (r *SqliteLedgerRepo) ListByAccount(accountID uuid.UUID) ([]LedgerEntry, error) {
	rows, err := r.db.Query(
		`SELECT id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at
		 FROM ledger WHERE account_id = ? ORDER BY posted_at DESC`,
		accountID.String(),
	)
	if err != nil {
		return nil, fmt.Errorf("ledger.ListByAccount: %w", err)
	}
	defer rows.Close()
	var entries []LedgerEntry
	for rows.Next() {
		e, err := scanLedgerEntry(rows)
		if err != nil {
			return nil, fmt.Errorf("ledger.ListByAccount: scan: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func (r *SqliteLedgerRepo) DeleteByID(id uuid.UUID, tx *sql.Tx) error {
	q := `DELETE FROM ledger WHERE id = ?`
	var err error
	if tx != nil {
		_, err = tx.Exec(q, id.String())
	} else {
		_, err = r.db.Exec(q, id.String())
	}
	if err != nil {
		return fmt.Errorf("ledger.DeleteByID: %w", err)
	}
	return nil
}

func (r *SqliteLedgerRepo) FindByTransactionID(txnID uuid.UUID) (*LedgerEntry, error) {
	row := r.db.QueryRow(
		`SELECT id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at
		 FROM ledger WHERE transaction_id = ? LIMIT 1`,
		txnID.String(),
	)
	e, err := scanLedgerEntryRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ledger.FindByTransactionID: %w", err)
	}
	return &e, nil
}

func (r *SqliteLedgerRepo) SumByAccount(accountID uuid.UUID, tx *sql.Tx) (int64, error) {
	q := `SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE account_id = ?`
	var sum int64
	var err error
	if tx != nil {
		err = tx.QueryRow(q, accountID.String()).Scan(&sum)
	} else {
		err = r.db.QueryRow(q, accountID.String()).Scan(&sum)
	}
	if err != nil {
		return 0, fmt.Errorf("ledger.SumByAccount: %w", err)
	}
	return sum, nil
}

// scanLedgerEntry scans a *sql.Rows into LedgerEntry.
func scanLedgerEntry(rows *sql.Rows) (LedgerEntry, error) {
	var e LedgerEntry
	var idStr, accountIDStr string
	var txnIDStr, psIDStr *string
	var postedAtStr string

	err := rows.Scan(&idStr, &accountIDStr, &txnIDStr, &psIDStr, &e.EntryType, &e.Amount, &e.Description, &postedAtStr)
	if err != nil {
		return e, err
	}
	return parseLedgerEntry(e, idStr, accountIDStr, txnIDStr, psIDStr, postedAtStr)
}

func scanLedgerEntryRow(row *sql.Row) (LedgerEntry, error) {
	var e LedgerEntry
	var idStr, accountIDStr string
	var txnIDStr, psIDStr *string
	var postedAtStr string

	err := row.Scan(&idStr, &accountIDStr, &txnIDStr, &psIDStr, &e.EntryType, &e.Amount, &e.Description, &postedAtStr)
	if err != nil {
		return e, err
	}
	return parseLedgerEntry(e, idStr, accountIDStr, txnIDStr, psIDStr, postedAtStr)
}

func parseLedgerEntry(e LedgerEntry, idStr, accountIDStr string, txnIDStr, psIDStr *string, postedAtStr string) (LedgerEntry, error) {
	id, err := uuid.Parse(idStr)
	if err != nil {
		return e, err
	}
	e.ID = id

	accID, err := uuid.Parse(accountIDStr)
	if err != nil {
		return e, err
	}
	e.AccountID = accID

	if txnIDStr != nil {
		txnID, err := uuid.Parse(*txnIDStr)
		if err != nil {
			return e, err
		}
		e.TransactionID = &txnID
	}
	if psIDStr != nil {
		psID, err := uuid.Parse(*psIDStr)
		if err != nil {
			return e, err
		}
		e.PayScheduleID = &psID
	}

	postedAt, err := time.Parse(time.RFC3339, postedAtStr)
	if err != nil {
		return e, err
	}
	e.PostedAt = postedAt
	return e, nil
}
```

### 1c. LedgerService

**File**: `internal/service/ledger.go`

```go
package service

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// LedgerService manages account ledger entries and keeps current_balance in sync.
// It is the single authority for balance mutations. All services that create a
// payment or income event must call RecordEntry instead of accRepo.UpdateBalance.
type LedgerService struct {
	db         *sql.DB
	ledgerRepo sqlite.LedgerRepo
	accRepo    sqlite.AccountsRepo
}

func NewLedgerService(db *sql.DB, ledgerRepo sqlite.LedgerRepo, accRepo sqlite.AccountsRepo) *LedgerService {
	return &LedgerService{db: db, ledgerRepo: ledgerRepo, accRepo: accRepo}
}

// RecordEntry inserts a ledger entry and increments cached account balance atomically.
// If outerTx is non-nil the operation participates in that transaction.
// If outerTx is nil, RecordEntry opens and commits its own transaction.
//
// IMPORTANT (SQLite MaxOpenConns=1): read current_balance BEFORE calling this if
// you need it for other calculations — opening a tx while the connection is in use
// deadlocks.
func (s *LedgerService) RecordEntry(entry sqlite.LedgerEntry, outerTx *sql.Tx) error {
	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	if entry.PostedAt.IsZero() {
		entry.PostedAt = time.Now().UTC()
	}

	run := func(tx *sql.Tx) error {
		if err := s.ledgerRepo.Insert(entry, tx); err != nil {
			return err
		}
		// Incremental balance update — safe because inserts are serialized through
		// the single SQLite connection.
		acc, err := s.accRepo.GetByID(entry.AccountID)
		// Note: cannot use s.accRepo.GetByID inside tx with SQLite MaxOpenConns=1.
		// Caller must have read account balance before opening outerTx if needed.
		// Here we query outside tx scope using the raw db connection is not possible
		// when outerTx is already holding the connection.
		// Resolution: accept the balance from the caller via entry or recompute via SUM.
		// Use SumByAccount (runs inside same tx, on same connection) — safe.
		_ = acc // unused, use sum instead
		newBalance, err := s.ledgerRepo.SumByAccount(entry.AccountID, tx)
		if err != nil {
			return fmt.Errorf("ledger.RecordEntry: sum: %w", err)
		}
		return s.accRepo.UpdateBalance(entry.AccountID, newBalance, tx)
	}

	if outerTx != nil {
		return run(outerTx)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("ledger.RecordEntry: begin: %w", err)
	}
	defer tx.Rollback()
	if err := run(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// Delete removes a ledger entry and recomputes cached balance from SUM(ledger).
func (s *LedgerService) Delete(id uuid.UUID) error {
	entry, err := s.ledgerRepo.FindByID(id)
	if err != nil {
		return fmt.Errorf("ledger.Delete: find: %w", err)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("ledger.Delete: begin: %w", err)
	}
	defer tx.Rollback()

	if err := s.ledgerRepo.DeleteByID(id, tx); err != nil {
		return fmt.Errorf("ledger.Delete: delete: %w", err)
	}

	newBalance, err := s.ledgerRepo.SumByAccount(entry.AccountID, tx)
	if err != nil {
		return fmt.Errorf("ledger.Delete: sum: %w", err)
	}

	if err := s.accRepo.UpdateBalance(entry.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("ledger.Delete: update balance: %w", err)
	}

	return tx.Commit()
}

// DeleteByTransactionID removes the ledger entry linked to a transaction (if any)
// and recomputes balance. Silently no-ops if no entry exists.
func (s *LedgerService) DeleteByTransactionID(txnID uuid.UUID) error {
	entry, err := s.ledgerRepo.FindByTransactionID(txnID)
	if err != nil {
		return fmt.Errorf("ledger.DeleteByTransactionID: find: %w", err)
	}
	if entry == nil {
		return nil // no ledger entry for this transaction (legacy)
	}
	return s.Delete(entry.ID)
}

// List returns all ledger entries for an account, newest first.
func (s *LedgerService) List(accountID uuid.UUID) ([]sqlite.LedgerEntry, error) {
	entries, err := s.ledgerRepo.ListByAccount(accountID)
	if err != nil {
		return nil, fmt.Errorf("ledger.List: %w", err)
	}
	return entries, nil
}

// RecordIncome inserts an income entry for a payday received.
func (s *LedgerService) RecordIncome(accountID, payScheduleID uuid.UUID, amount int64, description string) error {
	psID := payScheduleID
	return s.RecordEntry(sqlite.LedgerEntry{
		AccountID:     accountID,
		PayScheduleID: &psID,
		EntryType:     "income",
		Amount:        amount,
		Description:   description,
		PostedAt:      time.Now().UTC(),
	}, nil)
}
```

**IMPORTANT NOTE on `FindByID`**: Add `FindByID(id uuid.UUID) (*LedgerEntry, error)` to `LedgerRepo` interface and `SqliteLedgerRepo`. Implementation follows same pattern as `FindByTransactionID` but queries `WHERE id = ?`.

**IMPORTANT NOTE on SQLite MaxOpenConns(1)**: The `SumByAccount` inside `RecordEntry` runs inside the same `*sql.Tx`, which uses the same connection — this is safe. The `accRepo.GetByID` call was removed; balance is derived from SUM which is always correct. However, `accRepo.UpdateBalance` also runs inside the tx. Verify that `AccountsRepo.UpdateBalance` accepts `*sql.Tx` (it does, per existing code).

### 1d. Modify TransactionsService

**File**: `internal/service/transactions.go`

Add `ledgerSvc *LedgerService` field. Update constructor:

```go
func NewTransactionsService(db *sql.DB, txnsRepo sqlite.TransactionsRepo, accRepo sqlite.AccountsRepo, ledgerSvc *LedgerService) *TransactionsService {
    return &TransactionsService{db: db, txnsRepo: txnsRepo, accRepo: accRepo, ledgerSvc: ledgerSvc}
}
```

**In `CreateTransaction`** — where `applyToBalance` is true, replace:
```go
// OLD:
newBalance := currentBalance + t.Amount
if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil { ... }
```
with:
```go
// NEW: balance managed by LedgerService
if err := s.ledgerSvc.RecordEntry(sqlite.LedgerEntry{
    AccountID:     t.AccountID,
    TransactionID: &t.ID,
    EntryType:     "payment",
    Amount:        t.Amount,
    Description:   t.Description,
    PostedAt:      t.Timestamp,
}, tx); err != nil {
    return fmt.Errorf("service.CreateTransaction: record ledger: %w", err)
}
```

Remove the `currentBalance` pre-read (no longer needed since LedgerService uses SUM). Keep the `applyToBalance` check logic unchanged.

**In `ConfirmRecurring`** — replace `accRepo.UpdateBalance` call with `ledgerSvc.RecordEntry`:
```go
// Remove: newBalance := acc.CurrentBalance + t.Amount
// Remove: s.accRepo.UpdateBalance(t.AccountID, newBalance, tx)
// Remove: acc, err := s.accRepo.GetByID(t.AccountID)
// Add:
if err := s.ledgerSvc.RecordEntry(sqlite.LedgerEntry{
    AccountID:     t.AccountID,
    TransactionID: &t.ID,
    EntryType:     "payment",
    Amount:        t.Amount,
    Description:   t.Description,
    PostedAt:      time.Now().UTC(),
}, tx); err != nil {
    return time.Time{}, fmt.Errorf("service.ConfirmRecurring: record ledger: %w", err)
}
```

**In `ConfirmInstallment`** — same pattern: replace `accRepo.UpdateBalance` with `ledgerSvc.RecordEntry`. Use `Amount: t.Amount` (per-installment amount).

**In `DeleteTransaction`** — after finding the transaction but before the existing balance reversal:
```go
// Try to remove ledger entry first (for post-ledger transactions).
// DeleteByTransactionID is a no-op if no entry exists (legacy transactions).
if err := s.ledgerSvc.DeleteByTransactionID(id, nil); err != nil {
    return fmt.Errorf("service.DeleteTransaction: delete ledger: %w", err)
}
// Check if balance was already recomputed by ledger delete.
// Only apply old balance math for legacy transactions (no ledger entry).
entry, _ := s.ledgerRepo.FindByTransactionID(id) // already deleted above, so this returns nil
hasLedger := (entry == nil && ...) // simpler: peek BEFORE deleting
```

**Simpler approach for DeleteTransaction**:
```go
// 1. Check if ledger entry exists before deleting transaction.
ledgerEntry, err := s.ledgerSvc.FindByTransactionID(id)
// ... if err return

// 2. Delete transaction (existing logic: in a tx if needed for balance).
// 3a. If ledgerEntry != nil: delete ledger entry (which recomputes balance via SUM).
//     Do NOT call accRepo.UpdateBalance separately.
// 3b. If ledgerEntry == nil (legacy): use existing balance math (accRepo.UpdateBalance).
```

Add `FindByTransactionID(id uuid.UUID) (*sqlite.LedgerEntry, error)` method to `LedgerService` (delegates to `ledgerRepo.FindByTransactionID`).

**In `UpdateTransaction` (amount change)** — check for ledger entry, update it if found, then recompute balance:
```go
// If ledger entry exists for this transaction, update its amount.
ledgerEntry, _ := s.ledgerSvc.FindByTransactionID(id)
if ledgerEntry != nil {
    // Update ledger entry amount, then recompute balance via SUM.
    // Requires: LedgerRepo.UpdateAmount(id uuid.UUID, amount int64, tx *sql.Tx) error
    // Then: LedgerService.RecomputeBalance(accountID) — deletes and recomputes from SUM.
} else {
    // Legacy path: existing balance math.
}
```

Add `LedgerRepo.UpdateAmount(id uuid.UUID, amount int64, tx *sql.Tx) error` and `LedgerService.RecomputeBalance(accountID uuid.UUID) error` (runs `UPDATE Account SET current_balance = (SELECT SUM...) WHERE id = ?`).

### 1e. Handler

**File**: `internal/handler/ledger.go`

```go
package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

type LedgerHandler struct{ svc *service.LedgerService }

func NewLedgerHandler(svc *service.LedgerService) *LedgerHandler {
	return &LedgerHandler{svc: svc}
}

type LedgerEntryResponse struct {
	ID            string  `json:"id"`
	AccountID     string  `json:"account_id"`
	TransactionID *string `json:"transaction_id"`
	PayScheduleID *string `json:"pay_schedule_id"`
	EntryType     string  `json:"entry_type"`
	Amount        int64   `json:"amount"`
	Description   string  `json:"description"`
	PostedAt      string  `json:"posted_at"`
}

// List returns ledger entries for an account. Requires ?account_id= query param.
func (h *LedgerHandler) List(c echo.Context) error {
	accountIDStr := c.QueryParam("account_id")
	accountID, err := uuid.Parse(accountIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	entries, err := h.svc.List(accountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]LedgerEntryResponse, 0, len(entries))
	for _, e := range entries {
		resp = append(resp, toLedgerEntryResponse(e))
	}
	return c.JSON(http.StatusOK, resp)
}

// Delete removes a ledger entry and recomputes balance.
func (h *LedgerHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	if err := h.svc.Delete(id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

type RecordIncomeRequest struct {
	AccountID     string `json:"account_id" validate:"required"`
	PayScheduleID string `json:"pay_schedule_id" validate:"required"`
	Amount        int64  `json:"amount" validate:"required"`
	Description   string `json:"description" validate:"required"`
}

// RecordIncome posts an income entry (payday received).
func (h *LedgerHandler) RecordIncome(c echo.Context) error {
	var req RecordIncomeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	accountID, err := uuid.Parse(req.AccountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	psID, err := uuid.Parse(req.PayScheduleID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid pay_schedule_id")
	}
	if err := h.svc.RecordIncome(accountID, psID, req.Amount, req.Description); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusCreated)
}

func toLedgerEntryResponse(e sqlite.LedgerEntry) LedgerEntryResponse {
	r := LedgerEntryResponse{
		ID:          e.ID.String(),
		AccountID:   e.AccountID.String(),
		EntryType:   e.EntryType,
		Amount:      e.Amount,
		Description: e.Description,
		PostedAt:    e.PostedAt.UTC().Format(time.RFC3339),
	}
	if e.TransactionID != nil {
		s := e.TransactionID.String()
		r.TransactionID = &s
	}
	if e.PayScheduleID != nil {
		s := e.PayScheduleID.String()
		r.PayScheduleID = &s
	}
	return r
}
```

### 1f. Routes

**File**: `internal/handler/routes.go` — add `ledgerSvc *service.LedgerService` param to `SetupRoutes`, wire handler, add routes:

```go
lh := NewLedgerHandler(ledgerSvc)
ledger := api.Group("/ledger")
ledger.GET("", lh.List)
ledger.DELETE("/:id", lh.Delete)
ledger.POST("/income", lh.RecordIncome)
```

### 1g. App wiring

**File**: `internal/app/app.go`

```go
iLedgerRepo := reposqlite.NewSqliteLedgerRepo(database)
ledgerSvc := service.NewLedgerService(database, iLedgerRepo, iAccRepo)
txnsSvc := service.NewTransactionsService(database, iTxnsRepo, iAccRepo, ledgerSvc) // updated constructor
```

Add `LedgerSvc *service.LedgerService` to `App` struct. Pass `ledgerSvc` to `SetupRoutes`.

---

## Phase 2 — Backfill script

**File**: `cmd/backfill/main.go`

Logic:
1. Open the same database.
2. For each `Transaction` WHERE `type = 'personal'` AND has applied to balance (non-recurring, non-installment, not requires_confirmation OR confirmed_at IS NOT NULL; OR installment with paid_installments > 0):
   - If no `ledger` row already exists with `transaction_id = txn.id`:
     - For non-installment: insert one `payment` entry with `amount = txn.amount`, `posted_at = txn.timestamp`.
     - For installment: insert `paid_installments` payment entries each with `amount = txn.amount`, spaced by frequency from `anchor_date`.
3. Adjust the existing `opening_balance` entry for each account so that `SUM(ledger WHERE account_id = ?) = account.current_balance`. Set `opening_balance.amount = current_balance - SUM(payment + income entries)`.

Run with: `go run ./cmd/backfill/ -db path/to/cibi.db`

---

## Phase 3 — Frontend: Ledger tab on transactions page

### 3a. API types

**File**: `web/src/lib/api.ts` — add:

```typescript
export interface LedgerEntryResponse {
  id: string
  account_id: string
  transaction_id: string | null
  pay_schedule_id: string | null
  entry_type: 'payment' | 'income' | 'opening_balance' | 'manual_adjustment'
  amount: number
  description: string
  posted_at: string
}

export async function fetchLedger(accountId: string): Promise<LedgerEntryResponse[]> {
  const res = await fetch(`/api/ledger?account_id=${accountId}`)
  if (!res.ok) throw new Error('Failed to fetch ledger')
  return res.json()
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  const res = await fetch(`/api/ledger/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete ledger entry')
}

export async function recordIncome(payload: {
  account_id: string
  pay_schedule_id: string
  amount: number
  description: string
}): Promise<void> {
  const res = await fetch('/api/ledger/income', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to record income')
}
```

### 3b. Ledger tab

**File**: `web/src/pages/transactions.tsx`

The page already has tabs (transactions, friend txns). Add a third "Ledger" tab using the same tab pattern already in the file. The tab renders a `<LedgerList>` component.

**File**: `web/src/components/LedgerList.tsx` (new)

```tsx
// Props: account: AccountResponse
// Queries: fetchLedger(account.id) via useQuery
// Renders: table of entries sorted newest-first
// Columns: date, description, type badge, amount (colored: green for positive, red for negative)
// Each row: delete button → ConfirmDialog → deleteLedgerEntry(id) → invalidate query + toast
// Empty state: "No ledger entries yet."
```

Use `formatMoney`, `formatDate`, existing `MoneyValue`, `ConfirmDialog`, `Badge` components.

---

## Phase 4 — Frontend: Home widgets

### 4a. Recent ledger widget

**File**: `web/src/components/LedgerRecentWidget.tsx` (new)

```tsx
// Props: account: AccountResponse
// Queries: fetchLedger(account.id), takes first 5 entries
// Renders: Card with "Recent payments" title, list of 5 rows (date, description, amount)
// "View all" link → /transactions (Ledger tab)
// Skip render if no entries.
```

### 4b. Payday widget

**File**: `web/src/components/PaydayWidget.tsx` (new)

```tsx
// Props: account: AccountResponse, paySchedules: PayScheduleResponse[]
// Logic:
//   - Find pay schedules where nextPayday is today (within same UTC date as now)
//   - If none: return null (widget hidden)
//   - Render Card: "Payday! 🎉" or just "Payday received?" without emoji per caveman mode
//   - Shows schedule label + amount
//   - Button "Mark as received" → calls recordIncome({ account_id, pay_schedule_id, amount, description: schedule.label }) → invalidate accounts + ledger queries + toast
//   - One "Mark as received" button per due schedule
// Helper: use parseDateOnlyUTC + nextPaydayAfter from pay-schedule.ts to determine if today is a payday.
```

### 4c. Integrate into accounts page

**File**: `web/src/pages/accounts.tsx`

Below the existing account cards (or after the ProjectionWidget), render:
```tsx
<PaydayWidget account={defaultAccount} paySchedules={paySchedules} />
<LedgerRecentWidget account={defaultAccount} />
```

Remove confirm button from pay schedule list once `PaydayWidget` is in place. The confirm button is currently in the pay schedule list rendered on the accounts page. Find it (look for `ps.POST("/:id/confirm"` → `psh.Confirm`) and remove or hide it.

---

## Phase 5 — Frontend: Custom projection

### 5a. Custom projection sheet

**File**: `web/src/components/CustomProjectionSheet.tsx` (new)

```tsx
// Uses EditSheet or a Sheet component (see web/src/components/EditSheet.tsx for pattern)
// Props:
//   paySchedules: PayScheduleResponse[]
//   onApply: (config: CustomProjectionConfig) => void
//   onClose: () => void
//   open: boolean

export interface CustomProjectionConfig {
  windowStart: Date   // selected start paycheck date
  windowEnd: Date     // selected end paycheck date (exclusive)
  excludeBalance: boolean
}

// UI:
// 1. "Start paycheck" — list of upcoming paydates from all pay schedules (next 6 months,
//    computed via nextPaydayAfter), displayed as date buttons/chips. User picks one.
// 2. "End paycheck" — same list, filtered to dates after selected start. User picks one.
// 3. "Exclude current balance" — toggle/checkbox.
//    Label: "Start from zero (ignore current balance)"
// 4. "Apply" button → calls onApply(config).

// Compute upcoming paydates:
// For each PayScheduleResponse, walk nextPaydayAfter from today for ~6 months.
// Merge, deduplicate, sort ascending.
```

### 5b. Custom projection formula

**File**: `web/src/lib/monthly-projection.ts`

Replace `computeMonthlyProjection` with:

```typescript
export interface CustomProjection {
  windowStart: Date
  windowEnd: Date
  income: number
  obligations: number
  net: number
  projectedEndBalance: number
}

export function computeCustomProjection(
  account: AccountResponse,
  transactions: TransactionResponse[],
  paySchedules: PayScheduleResponse[],
  friendBreakdown: FriendDebtBreakdownItem[],
  windowStart: Date,
  windowEnd: Date,
  excludeBalance: boolean,
): CustomProjection {
  const now = new Date()

  // Future income: pay schedule occurrences ∈ [max(now, windowStart), windowEnd)
  const incomeStart = now > windowStart ? now : windowStart
  let income = 0
  for (const schedule of paySchedules) {
    let occurrence = nextPaydayAfter(schedule, new Date(incomeStart.getTime() - 1))
    let safety = 0
    while (occurrence.getTime() < windowEnd.getTime() && safety < 52) {
      if (occurrence.getTime() >= incomeStart.getTime()) income += schedule.amount
      occurrence = nextPaydayAfter(schedule, occurrence)
      safety++
    }
  }

  // Future obligations: next_occurrence ∈ [now, windowEnd) (not-yet-paid)
  const obStart = now > windowStart ? now : windowStart
  const recurringObligations = transactions
    .filter(t => t.is_recurring && !t.is_installment && t.next_occurrence !== null
      && isInWindow(t.next_occurrence, obStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const installmentObligations = transactions
    .filter(t => t.is_installment && t.next_occurrence !== null && t.amount < 0
      && isInWindow(t.next_occurrence, obStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const peerObligations = friendBreakdown
    .filter(d => d.next_payment_date !== null && isInWindow(d.next_payment_date, obStart, windowEnd))
    .reduce((sum, d) => sum + d.next_payment, 0)

  const obligations = recurringObligations + installmentObligations + peerObligations
  const net = income - obligations
  const startBalance = excludeBalance ? 0 : account.current_balance
  const projectedEndBalance = startBalance + net

  return { windowStart, windowEnd, income, obligations, net, projectedEndBalance }
}

function isInWindow(occurrence: string, start: Date, end: Date): boolean {
  const date = new Date(occurrence)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime()
}
```

### 5c. Update ProjectionWidget

**File**: `web/src/components/ProjectionWidget.tsx`

Changes:
1. Replace `useState<'window' | 'month'>('window')` with `useState<'window' | 'custom'>('window')`.
2. Remove "This month" button, add "Custom" button that opens `CustomProjectionSheet`.
3. Add `useState<CustomProjectionConfig | null>(null)` for selected config.
4. When mode is `'custom'` and config is set: call `computeCustomProjection(...)` with config params.
5. When mode is `'custom'` but config is null: show "Configure" prompt or open sheet immediately.
6. Remove import and usage of `computeMonthlyProjection`.
7. In the display: show `projectedStartBalance` row only for `'window'` mode (unchanged).

Button label for custom when configured: show "Custom: {formatDate(start)} → {formatDate(end)}" or just "Custom ✎" with a settings icon to re-open the sheet.

---

## Verification checklist (run after implementation)

```bash
# Backend
cd /home/fleck/Projects/cibi
go build ./...
go test ./internal/...

# Frontend
cd web
npm test -- --run
npm run build

# Manual smoke test
make upd  # mandatory per CLAUDE.md
```

Verify:
- [ ] Migration runs clean on existing DB
- [ ] `POST /api/transactions/:id/confirm` → ledger entry appears in `GET /api/ledger?account_id=`
- [ ] `DELETE /api/ledger/:id` → balance recomputed correctly
- [ ] `POST /api/ledger/income` → income entry created, balance updated
- [ ] Transactions page shows "Ledger" tab with entries
- [ ] Accounts page shows last 5 entries widget and payday widget on payday
- [ ] Projection "Custom" mode with paycheck range shows correct forward-looking projection
- [ ] "Exclude balance" toggle zeroes out starting balance in projection

---

## Files created/modified summary

| File | Action |
|---|---|
| `internal/migrations/20260911000001_ledger.go` | Create |
| `internal/repo/sqlite/ledger.go` | Create |
| `internal/service/ledger.go` | Create |
| `internal/service/transactions.go` | Modify (inject LedgerService, replace UpdateBalance calls) |
| `internal/handler/ledger.go` | Create |
| `internal/handler/routes.go` | Modify (add ledger routes, ledgerSvc param) |
| `internal/app/app.go` | Modify (wire LedgerRepo, LedgerService) |
| `cmd/backfill/main.go` | Create |
| `web/src/lib/api.ts` | Modify (add LedgerEntryResponse + 3 API functions) |
| `web/src/lib/monthly-projection.ts` | Modify (replace with computeCustomProjection) |
| `web/src/components/LedgerList.tsx` | Create |
| `web/src/components/LedgerRecentWidget.tsx` | Create |
| `web/src/components/PaydayWidget.tsx` | Create |
| `web/src/components/CustomProjectionSheet.tsx` | Create |
| `web/src/components/ProjectionWidget.tsx` | Modify (custom mode) |
| `web/src/pages/transactions.tsx` | Modify (Ledger tab) |
| `web/src/pages/accounts.tsx` | Modify (new widgets, remove pay schedule confirm button) |
