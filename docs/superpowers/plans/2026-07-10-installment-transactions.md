# Installment Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add installment support to regular transactions so users can track fixed-amount purchases paid over N monthly/weekly periods, with manual per-installment confirmation and inclusion in the Reserved amount.

**Architecture:** Three new columns on the `Transaction` table (`is_installment`, `total_installments`, `paid_installments`) reuse the existing `anchor_date` (first due date), `frequency`, and `amount` (per-installment amount) fields. A new `POST /transactions/:id/confirm-installment` endpoint increments `paid_installments` and debits balance. The frontend adds an installment toggle to the transaction form and includes installment obligations in the Reserved stat card.

**Tech Stack:** Go (Echo, goose migrations, modernc/sqlite), React 18, TanStack Query, Vitest.

## Global Constraints

- Installment txns are mutually exclusive with `is_recurring=true` — reject both set to true.
- `amount` = per-installment amount (in cents on backend, dollars on frontend).
- `anchor_date` = first due date; `next_occurrence` in response is computed, not stored.
- `frequency` for installments: `monthly` or `weekly` only.
- Confirm is irreversible (no decrement), matching peer-debt pattern.
- No balance impact on create; each confirm-installment debits `amount` once.
- On delete: reverse `paid_installments * amount` from balance.
- Run `make upd` after shipping.

---

### Task 1: Migration — add installment columns to Transaction table

**Files:**
- Create: `internal/migrations/20260710000001_installment_transactions.go`

**Interfaces:**
- Produces: three new nullable-safe columns on `"Transaction"` table available to all subsequent tasks.

- [ ] **Step 1: Write the migration file**

```go
package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upInstallmentTransactions, downInstallmentTransactions)
}

func upInstallmentTransactions(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE "Transaction" ADD COLUMN is_installment BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE "Transaction" ADD COLUMN total_installments INTEGER`,
		`ALTER TABLE "Transaction" ADD COLUMN paid_installments INTEGER NOT NULL DEFAULT 0`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downInstallmentTransactions(ctx context.Context, tx *sql.Tx) error {
	// Additive-only migration; SQLite DROP COLUMN support varies.
	// Rollback is intentionally a no-op for this migration.
	return nil
}
```

- [ ] **Step 2: Run migration tests**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/migrations/... -v
```

Expected: all migration tests PASS (the new file is picked up by the `embed` glob).

- [ ] **Step 3: Commit**

```bash
git add internal/migrations/20260710000001_installment_transactions.go
git commit -m "feat: add installment columns to Transaction table"
```

---

### Task 2: Repo — extend Transaction struct and SQL to include installment columns

**Files:**
- Modify: `internal/repo/sqlite/transactions.go`
- Modify: `internal/repo/sqlite/transactions_test.go`

**Interfaces:**
- Consumes: migration from Task 1 (new columns exist).
- Produces:
  - `sqlite.Transaction` struct has `IsInstallment bool`, `TotalInstallments *int64`, `PaidInstallments int64`.
  - `sqlite.TransactionsRepo` interface has new method `IncrementPaidInstallments(id uuid.UUID, tx *sql.Tx) error`.
  - All existing repo methods read/write the new columns.

- [ ] **Step 1: Update `Transaction` struct and `TransactionsRepo` interface**

In `internal/repo/sqlite/transactions.go`, replace the `Transaction` struct and `TransactionsRepo` interface:

```go
// Transaction mirrors the Transaction schema row.
type Transaction struct {
	ID                   uuid.UUID
	AccountID            uuid.UUID
	Amount               int64 // cents; negative = debit, positive = credit
	Description          string
	Category             string
	Timestamp            time.Time // UTC
	IsRecurring          bool
	Frequency            *string    // nullable
	AnchorDate           *time.Time // UTC, nullable
	NextOccurrence       *time.Time // UTC, nullable
	RequiresConfirmation bool
	ConfirmedAt          *time.Time // UTC, nullable
	IsInstallment        bool
	TotalInstallments    *int64
	PaidInstallments     int64
}

// TransactionsRepo defines the data access contract for transactions.
type TransactionsRepo interface {
	Insert(t Transaction, tx *sql.Tx) error
	GetByAccount(accountID uuid.UUID) ([]Transaction, error)
	GetByID(id uuid.UUID) (Transaction, error)
	Update(id uuid.UUID, upd UpdateTransaction, tx *sql.Tx) error
	DeleteByID(id uuid.UUID, tx *sql.Tx) error
	AdvanceNextOccurrence(id uuid.UUID, next time.Time, tx *sql.Tx) error
	MarkConfirmed(id uuid.UUID, confirmedAt time.Time, tx *sql.Tx) error
	SumUpcomingObligations(accountID uuid.UUID, after, onOrBefore time.Time) (int64, error)
	IncrementPaidInstallments(id uuid.UUID, tx *sql.Tx) error
}
```

- [ ] **Step 2: Update `Insert` to write new columns**

Replace the `Insert` method body:

```go
func (r *SqliteTxnsRepo) Insert(t Transaction, tx *sql.Tx) error {
	var freq interface{}
	if t.Frequency != nil {
		freq = *t.Frequency
	}
	var anchorStr interface{}
	if t.AnchorDate != nil {
		anchorStr = t.AnchorDate.UTC().Format(time.RFC3339)
	}
	var nextStr interface{}
	if t.NextOccurrence != nil {
		nextStr = t.NextOccurrence.UTC().Format(time.RFC3339)
	}
	var totalInst interface{}
	if t.TotalInstallments != nil {
		totalInst = *t.TotalInstallments
	}
	var err error
	q := `INSERT INTO "Transaction"
			(id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at, is_installment, total_installments, paid_installments)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	args := []any{
		t.ID.String(), t.AccountID.String(), t.Amount, t.Description, t.Category,
		t.Timestamp.UTC().Format(time.RFC3339), t.IsRecurring, freq, anchorStr, nextStr,
		t.RequiresConfirmation, nil,
		t.IsInstallment, totalInst, t.PaidInstallments,
	}
	if tx != nil {
		_, err = tx.Exec(q, args...)
	} else {
		_, err = r.db.Exec(q, args...)
	}
	if err != nil {
		return fmt.Errorf("transactions.Insert: %w", err)
	}
	return nil
}
```

- [ ] **Step 3: Update `GetByAccount` and `GetByID` SELECT queries**

Replace the SELECT in `GetByAccount`:

```go
func (r *SqliteTxnsRepo) GetByAccount(accountID uuid.UUID) ([]Transaction, error) {
	rows, err := r.db.Query(`SELECT id, account_id, amount, description, category, timestamp,
			is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at,
			is_installment, total_installments, paid_installments
		FROM "Transaction" WHERE account_id = ?`, accountID.String())
	if err != nil {
		return nil, fmt.Errorf("transactions.GetByAccount: %w", err)
	}
	defer rows.Close()
	var txns []Transaction
	for rows.Next() {
		t, err := scanTransaction(rows)
		if err != nil {
			return nil, fmt.Errorf("transactions.GetByAccount: scan: %w", err)
		}
		txns = append(txns, t)
	}
	return txns, rows.Err()
}
```

Replace the SELECT in `GetByID`:

```go
func (r *SqliteTxnsRepo) GetByID(id uuid.UUID) (Transaction, error) {
	row := r.db.QueryRow(`SELECT id, account_id, amount, description, category, timestamp,
			is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at,
			is_installment, total_installments, paid_installments
		FROM "Transaction" WHERE id = ?`, id.String())
	t, err := scanTransactionRow(row)
	if err != nil {
		return t, fmt.Errorf("transactions.GetByID: %w", err)
	}
	return t, nil
}
```

- [ ] **Step 4: Update scan functions to read new columns**

Replace `scanTransaction`, `scanTransactionRow`, and `populateTransaction`:

```go
func scanTransaction(rows *sql.Rows) (Transaction, error) {
	var t Transaction
	var idStr, accIDStr, tsStr string
	var freq, anchorStr, nextStr, confirmedStr sql.NullString
	var totalInst sql.NullInt64
	err := rows.Scan(
		&idStr, &accIDStr, &t.Amount, &t.Description, &t.Category, &tsStr,
		&t.IsRecurring, &freq, &anchorStr, &nextStr, &t.RequiresConfirmation, &confirmedStr,
		&t.IsInstallment, &totalInst, &t.PaidInstallments,
	)
	if err != nil {
		return t, err
	}
	if totalInst.Valid {
		t.TotalInstallments = &totalInst.Int64
	}
	return populateTransaction(t, idStr, accIDStr, tsStr, freq, anchorStr, nextStr, confirmedStr)
}

func scanTransactionRow(row *sql.Row) (Transaction, error) {
	var t Transaction
	var idStr, accIDStr, tsStr string
	var freq, anchorStr, nextStr, confirmedStr sql.NullString
	var totalInst sql.NullInt64
	err := row.Scan(
		&idStr, &accIDStr, &t.Amount, &t.Description, &t.Category, &tsStr,
		&t.IsRecurring, &freq, &anchorStr, &nextStr, &t.RequiresConfirmation, &confirmedStr,
		&t.IsInstallment, &totalInst, &t.PaidInstallments,
	)
	if err != nil {
		return t, err
	}
	if totalInst.Valid {
		t.TotalInstallments = &totalInst.Int64
	}
	return populateTransaction(t, idStr, accIDStr, tsStr, freq, anchorStr, nextStr, confirmedStr)
}
```

(`populateTransaction` signature and body are unchanged — it only handles string/UUID/time fields.)

- [ ] **Step 5: Add `IncrementPaidInstallments` method**

Add after `MarkConfirmed`:

```go
func (r *SqliteTxnsRepo) IncrementPaidInstallments(id uuid.UUID, tx *sql.Tx) error {
	var err error
	q := `UPDATE "Transaction" SET paid_installments = paid_installments + 1 WHERE id = ?`
	if tx != nil {
		_, err = tx.Exec(q, id.String())
	} else {
		_, err = r.db.Exec(q, id.String())
	}
	if err != nil {
		return fmt.Errorf("transactions.IncrementPaidInstallments: %w", err)
	}
	return nil
}
```

- [ ] **Step 6: Update `txnSchema` in repo test to include new columns**

In `internal/repo/sqlite/transactions_test.go`, replace the `txnSchema` constant:

```go
const txnSchema = `
CREATE TABLE "Transaction" (
	id TEXT PRIMARY KEY,
	account_id TEXT NOT NULL,
	amount INTEGER NOT NULL,
	description TEXT NOT NULL,
	category TEXT NOT NULL,
	timestamp TEXT NOT NULL,
	is_recurring BOOLEAN NOT NULL,
	frequency TEXT,
	anchor_date TEXT,
	next_occurrence TEXT,
	requires_confirmation BOOLEAN NOT NULL DEFAULT 0,
	confirmed_at TEXT,
	is_installment BOOLEAN NOT NULL DEFAULT FALSE,
	total_installments INTEGER,
	paid_installments INTEGER NOT NULL DEFAULT 0
);
`
```

- [ ] **Step 7: Write a test for `IncrementPaidInstallments`**

Append to `internal/repo/sqlite/transactions_test.go`:

```go
func TestIncrementPaidInstallments(t *testing.T) {
	db := openSQLiteTestDB(t, txnSchema)
	repo := sqlite.NewSqliteTxnsRepo(db)

	accountID := uuid.New()
	id := uuid.New()
	total := int64(6)
	_, err := db.Exec(
		`INSERT INTO "Transaction" (id, account_id, amount, description, category, timestamp, is_recurring, requires_confirmation, is_installment, total_installments, paid_installments)
		 VALUES (?, ?, -5000, 'Phone', 'Electronics', '2026-07-10T00:00:00Z', 0, 0, 1, ?, 0)`,
		id.String(), accountID.String(), total,
	)
	requireNoErr(t, "insert", err)

	requireNoErr(t, "increment", repo.IncrementPaidInstallments(id, nil))

	var paid int64
	requireNoErr(t, "query", db.QueryRow(`SELECT paid_installments FROM "Transaction" WHERE id = ?`, id.String()).Scan(&paid))
	requireI64(t, "paid_installments", paid, 1)
}
```

- [ ] **Step 8: Run repo tests**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/repo/sqlite/... -v -run TestIncrementPaidInstallments
```

Expected: PASS.

- [ ] **Step 9: Run all repo tests to check for regressions**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/repo/sqlite/... -v
```

Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add internal/repo/sqlite/transactions.go internal/repo/sqlite/transactions_test.go
git commit -m "feat: extend Transaction repo with installment columns"
```

---

### Task 3: Service — add ConfirmInstallment method and update balance logic

**Files:**
- Modify: `internal/service/transactions.go`
- Modify: `internal/service/transactions_test.go`

**Interfaces:**
- Consumes: `sqlite.Transaction` with `IsInstallment`, `TotalInstallments`, `PaidInstallments` (Task 2); `TransactionsRepo.IncrementPaidInstallments` (Task 2).
- Produces: `TransactionsService.ConfirmInstallment(id uuid.UUID) error` (consumed by Task 4 handler).

- [ ] **Step 1: Update `shouldApplyBalanceOnCreate` to short-circuit for installments**

In `internal/service/transactions.go`, replace `shouldApplyBalanceOnCreate`:

```go
// shouldApplyBalanceOnCreate reports whether a transaction should impact the
// account balance immediately when created.
func shouldApplyBalanceOnCreate(t sqlite.Transaction, now time.Time) bool {
	if t.IsInstallment {
		return false // installment txns only debit balance on each confirm-installment
	}
	if t.RequiresConfirmation && t.ConfirmedAt == nil {
		return false
	}
	if t.IsRecurring && t.AnchorDate != nil && t.AnchorDate.UTC().After(now.UTC()) {
		return false
	}
	return true
}
```

- [ ] **Step 2: Update `hasAppliedToBalance` to handle installments**

Replace `hasAppliedToBalance`:

```go
// hasAppliedToBalance reports whether this stored transaction is currently
// represented in account balance.
func hasAppliedToBalance(t sqlite.Transaction, now time.Time) bool {
	if t.IsInstallment {
		return t.PaidInstallments > 0
	}
	if t.RequiresConfirmation && t.ConfirmedAt == nil {
		return false
	}
	if t.IsRecurring && t.AnchorDate != nil && t.AnchorDate.UTC().After(now.UTC()) {
		return false
	}
	return true
}
```

- [ ] **Step 3: Update `DeleteTransaction` to reverse `paid * amount` for installments**

Replace the `DeleteTransaction` method:

```go
// DeleteTransaction removes a transaction by ID and atomically reverses account balance.
func (s *TransactionsService) DeleteTransaction(id uuid.UUID) error {
	t, err := s.txnsRepo.GetByID(id)
	if err != nil {
		return fmt.Errorf("service.DeleteTransaction: get transaction: %w", err)
	}

	if !hasAppliedToBalance(t, time.Now().UTC()) {
		if err := s.txnsRepo.DeleteByID(id, nil); err != nil {
			return fmt.Errorf("service.DeleteTransaction: delete: %w", err)
		}
		return nil
	}

	acc, err := s.accRepo.GetByID(t.AccountID)
	if err != nil {
		return fmt.Errorf("service.DeleteTransaction: get account: %w", err)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.DeleteTransaction: begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.txnsRepo.DeleteByID(id, tx); err != nil {
		return fmt.Errorf("service.DeleteTransaction: delete: %w", err)
	}

	// For installments, reverse all paid installments (paid_installments * amount).
	// For all other txns, reverse the single balance impact (amount).
	var balanceDelta int64
	if t.IsInstallment {
		balanceDelta = t.Amount * t.PaidInstallments
	} else {
		balanceDelta = t.Amount
	}
	newBalance := acc.CurrentBalance - balanceDelta
	if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.DeleteTransaction: update balance: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("service.DeleteTransaction: commit: %w", err)
	}

	return nil
}
```

- [ ] **Step 4: Update `CreateTransaction` to validate installment fields**

In `CreateTransaction`, add installment validation after the existing `IsRecurring` block:

```go
func (s *TransactionsService) CreateTransaction(t sqlite.Transaction) error {
	if t.IsRecurring {
		if t.Frequency == nil || !sqlite.ValidFrequencies[*t.Frequency] {
			return fmt.Errorf("recurring transaction requires a valid frequency (weekly, bi-weekly, monthly, yearly)")
		}
		if t.AnchorDate == nil {
			return fmt.Errorf("recurring transaction requires anchor_date")
		}
		// Set initial next_occurrence = anchor_date if not provided.
		if t.NextOccurrence == nil {
			anchor := t.AnchorDate.UTC()
			t.NextOccurrence = &anchor
		}
	}

	if t.IsInstallment {
		if t.IsRecurring {
			return fmt.Errorf("is_installment and is_recurring are mutually exclusive")
		}
		if t.TotalInstallments == nil || *t.TotalInstallments <= 0 {
			return fmt.Errorf("installment transaction requires total_installments > 0")
		}
		if t.AnchorDate == nil {
			return fmt.Errorf("installment transaction requires anchor_date")
		}
		if t.Frequency == nil || (*t.Frequency != engine.FreqMonthly && *t.Frequency != engine.FreqWeekly) {
			return fmt.Errorf("installment transaction requires frequency of monthly or weekly")
		}
	}

	// ... rest of method unchanged ...
```

- [ ] **Step 5: Add `ConfirmInstallment` method**

Append to `internal/service/transactions.go`:

```go
// ConfirmInstallment confirms one installment payment: debits the per-installment
// amount from the account balance and increments paid_installments.
func (s *TransactionsService) ConfirmInstallment(transactionID uuid.UUID) error {
	t, err := s.txnsRepo.GetByID(transactionID)
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: get transaction: %w", err)
	}

	if !t.IsInstallment {
		return fmt.Errorf("service.ConfirmInstallment: transaction %v is not an installment", transactionID)
	}
	if t.TotalInstallments == nil || t.PaidInstallments >= *t.TotalInstallments {
		return fmt.Errorf("service.ConfirmInstallment: all installments already paid for transaction %v", transactionID)
	}

	acc, err := s.accRepo.GetByID(t.AccountID)
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: get account: %w", err)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: begin tx: %w", err)
	}
	defer tx.Rollback()

	newBalance := acc.CurrentBalance + t.Amount
	if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: update balance: %w", err)
	}

	if err := s.txnsRepo.IncrementPaidInstallments(transactionID, tx); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: increment paid: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: commit: %w", err)
	}

	return nil
}
```

- [ ] **Step 6: Add `IncrementPaidInstallments` to the mock repo in service tests**

In `internal/service/transactions_test.go`, update `mockTransactionsRepo` to add:

```go
type mockTransactionsRepo struct {
	insertFn                    func(t sqlite.Transaction, tx *sql.Tx) error
	getByAccountFn              func(accountID uuid.UUID) ([]sqlite.Transaction, error)
	getByIDFn                   func(id uuid.UUID) (sqlite.Transaction, error)
	updateFn                    func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error
	deleteByIDFn                func(id uuid.UUID, tx *sql.Tx) error
	advanceNextOccurrenceFn     func(id uuid.UUID, next time.Time, tx *sql.Tx) error
	markConfirmedFn             func(id uuid.UUID, confirmedAt time.Time, tx *sql.Tx) error
	sumUpcomingFn               func(accountID uuid.UUID, after, onOrBefore time.Time) (int64, error)
	incrementPaidInstallmentsFn func(id uuid.UUID, tx *sql.Tx) error
}

func (m *mockTransactionsRepo) IncrementPaidInstallments(id uuid.UUID, tx *sql.Tx) error {
	if m.incrementPaidInstallmentsFn != nil {
		return m.incrementPaidInstallmentsFn(id, tx)
	}
	return nil
}
```

- [ ] **Step 7: Write tests for `ConfirmInstallment`**

Append to `internal/service/transactions_test.go`:

```go
func TestConfirmInstallment_DebitsBalanceAndIncrementsCount(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(100000)
	amount := int64(-5000) // -$50.00 per installment
	total := int64(12)
	paid := int64(2)
	freq := engine.FreqMonthly

	var gotNewBalance int64
	var incrementCalled bool
	var incrementUsedTx bool

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				AccountID:         accountID,
				Amount:            amount,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
				Frequency:         &freq,
			}, nil
		},
		incrementPaidInstallmentsFn: func(id uuid.UUID, tx *sql.Tx) error {
			incrementCalled = true
			incrementUsedTx = tx != nil
			return nil
		},
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.ConfirmInstallment(txnID)
	if err != nil {
		t.Fatalf("ConfirmInstallment error: %v", err)
	}

	if !incrementCalled || !incrementUsedTx {
		t.Fatalf("expected IncrementPaidInstallments to be called in a tx")
	}
	if gotNewBalance != 95000 {
		t.Fatalf("expected new balance 95000, got %d", gotNewBalance)
	}
}

func TestConfirmInstallment_AlreadyComplete_ReturnsError(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	total := int64(3)
	paid := int64(3) // fully paid

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
			}, nil
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.ConfirmInstallment(txnID)
	if err == nil {
		t.Fatal("expected error for fully paid installment, got nil")
	}
}

func TestConfirmInstallment_NonInstallment_ReturnsError(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{ID: txnID, IsInstallment: false}, nil
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.ConfirmInstallment(txnID)
	if err == nil {
		t.Fatal("expected error for non-installment txn, got nil")
	}
}

func TestDeleteInstallment_ReversesAllPaidInstallments(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(100000)
	amount := int64(-5000) // -$50.00 per installment
	total := int64(12)
	paid := int64(3)

	var gotNewBalance int64

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				AccountID:         accountID,
				Amount:            amount,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
			}, nil
		},
		deleteByIDFn: func(id uuid.UUID, tx *sql.Tx) error { return nil },
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	if err := svc.DeleteTransaction(txnID); err != nil {
		t.Fatalf("DeleteTransaction error: %v", err)
	}

	// Reversed: 3 * (-$50) = -$150 removed from balance → balance goes up by $150
	if gotNewBalance != 115000 {
		t.Fatalf("expected new balance 115000 (reversed 3 installments), got %d", gotNewBalance)
	}
}
```

- [ ] **Step 8: Run service tests**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/service/... -v -run "TestConfirmInstallment|TestDeleteInstallment"
```

Expected: all 4 new tests PASS.

- [ ] **Step 9: Run all service tests for regressions**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/service/... -v
```

Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add internal/service/transactions.go internal/service/transactions_test.go
git commit -m "feat: add ConfirmInstallment service method and update balance logic"
```

---

### Task 4: Handler — TransactionResponse + ConfirmInstallment endpoint

**Files:**
- Modify: `internal/handler/transactions.go`
- Modify: `internal/handler/routes.go`
- Modify: `internal/handler/transactions_test.go`
- Modify: `internal/handler/testhelpers_test.go`

**Interfaces:**
- Consumes: `service.TransactionsService.ConfirmInstallment(id uuid.UUID) error` (Task 3).
- Produces:
  - `TransactionResponse` has `IsInstallment bool`, `TotalInstallments *int64`, `PaidInstallments int64`.
  - `POST /api/transactions/:id/confirm-installment` route returns 200 + updated `TransactionResponse`.
  - `next_occurrence` in response is computed for installment txns from `engine.NextInstallmentDue`.

- [ ] **Step 1: Update `TransactionsServiceIface` to include `ConfirmInstallment`**

In `internal/handler/transactions.go`, replace the interface:

```go
// TransactionsServiceIface defines the service contract used by TransactionsHandler.
type TransactionsServiceIface interface {
	ListTransactions(accountID uuid.UUID) ([]sqlite.Transaction, error)
	CreateTransaction(t sqlite.Transaction) error
	GetTransaction(id uuid.UUID) (sqlite.Transaction, error)
	UpdateTransaction(id uuid.UUID, upd sqlite.UpdateTransaction) error
	DeleteTransaction(id uuid.UUID) error
	ConfirmRecurring(transactionID uuid.UUID) (time.Time, error)
	ConfirmInstallment(transactionID uuid.UUID) error
}
```

- [ ] **Step 2: Update `TransactionResponse` struct**

```go
type TransactionResponse struct {
	ID                   string  `json:"id"`
	AccountID            string  `json:"account_id"`
	Amount               float64 `json:"amount"` // stored as dollars
	Description          string  `json:"description"`
	Category             string  `json:"category"`
	Timestamp            string  `json:"timestamp"` // RFC3339
	IsRecurring          bool    `json:"is_recurring"`
	Frequency            *string `json:"frequency"`
	AnchorDate           *string `json:"anchor_date"`
	NextOccurrence       *string `json:"next_occurrence"`
	RequiresConfirmation bool    `json:"requires_confirmation"`
	ConfirmedAt          *string `json:"confirmed_at"`
	IsInstallment        bool    `json:"is_installment"`
	TotalInstallments    *int64  `json:"total_installments"`
	PaidInstallments     int64   `json:"paid_installments"`
}
```

- [ ] **Step 3: Update `CreateTransactionRequest` to include installment fields**

```go
type CreateTransactionRequest struct {
	AccountID            string  `json:"account_id"  validate:"required"`
	Amount               float64 `json:"amount"      validate:"required"`
	Description          string  `json:"description" validate:"required"`
	Category             string  `json:"category"`
	IsRecurring          bool    `json:"is_recurring"`
	Frequency            *string `json:"frequency"`
	AnchorDate           *string `json:"anchor_date"`
	RequiresConfirmation bool    `json:"requires_confirmation"`
	IsInstallment        bool    `json:"is_installment"`
	TotalInstallments    *int64  `json:"total_installments"`
}
```

- [ ] **Step 4: Update `txnToResponse` to populate new fields and compute `next_occurrence` for installments**

Add `"github.com/ufleck/cibi/internal/engine"` to the import if not present. Then replace `txnToResponse`:

```go
// txnToResponse converts a sqlite.Transaction to TransactionResponse.
func txnToResponse(t sqlite.Transaction) TransactionResponse {
	resp := TransactionResponse{
		ID:                   t.ID.String(),
		AccountID:            t.AccountID.String(),
		Amount:               float64(t.Amount) / 100.0,
		Description:          t.Description,
		Category:             t.Category,
		Timestamp:            t.Timestamp.UTC().Format(time.RFC3339),
		IsRecurring:          t.IsRecurring,
		Frequency:            t.Frequency,
		RequiresConfirmation: t.RequiresConfirmation,
		IsInstallment:        t.IsInstallment,
		TotalInstallments:    t.TotalInstallments,
		PaidInstallments:     t.PaidInstallments,
	}
	if t.AnchorDate != nil {
		s := t.AnchorDate.UTC().Format(time.RFC3339)
		resp.AnchorDate = &s
	}
	if t.NextOccurrence != nil {
		s := t.NextOccurrence.UTC().Format(time.RFC3339)
		resp.NextOccurrence = &s
	}
	if t.ConfirmedAt != nil {
		s := t.ConfirmedAt.UTC().Format(time.RFC3339)
		resp.ConfirmedAt = &s
	}
	// For installment txns, compute next_occurrence from anchor + paid count.
	// Overrides stored next_occurrence (which is null for installments).
	if t.IsInstallment && t.AnchorDate != nil && t.Frequency != nil {
		if t.TotalInstallments == nil || t.PaidInstallments < *t.TotalInstallments {
			next := engine.NextInstallmentDue(*t.AnchorDate, t.PaidInstallments, *t.Frequency)
			s := next.UTC().Format(time.RFC3339)
			resp.NextOccurrence = &s
		}
		// When paid == total, next_occurrence stays nil (installment complete).
	}
	return resp
}
```

- [ ] **Step 5: Update `Create` handler to pass installment fields to Transaction struct**

In the `Create` handler, add installment field mapping after the `AnchorDate` block:

```go
t := sqlite.Transaction{
	ID:                   uuid.New(),
	AccountID:            accountID,
	Amount:               int64(math.Round(req.Amount * 100)),
	Description:          req.Description,
	Category:             req.Category,
	Timestamp:            time.Now().UTC(),
	IsRecurring:          req.IsRecurring,
	Frequency:            req.Frequency,
	RequiresConfirmation: req.RequiresConfirmation,
	IsInstallment:        req.IsInstallment,
	TotalInstallments:    req.TotalInstallments,
}
if req.AnchorDate != nil && *req.AnchorDate != "" {
	parsed, err := time.Parse(time.RFC3339, *req.AnchorDate)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid anchor_date: must be RFC3339")
	}
	utc := parsed.UTC()
	t.AnchorDate = &utc
}
```

- [ ] **Step 6: Add `ConfirmInstallment` handler method**

Add after the `Confirm` method:

```go
// ConfirmInstallment handles POST /transactions/:id/confirm-installment —
// confirms one installment payment, debits balance, increments paid count.
func (h *TransactionsHandler) ConfirmInstallment(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid transaction id")
	}

	if err := h.svc.ConfirmInstallment(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "transaction not found")
		}
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	txn, err := h.svc.GetTransaction(id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, txnToResponse(txn))
}
```

- [ ] **Step 7: Register the new route in `routes.go`**

In `internal/handler/routes.go`, add after the existing `txn.POST("/:id/confirm", ...)` line:

```go
txn.POST("/:id/confirm-installment", th.ConfirmInstallment)
```

- [ ] **Step 8: Add `ConfirmInstallment` to `mockTransactionsService` in test helpers**

In `internal/handler/testhelpers_test.go`, update `mockTransactionsService`:

```go
type mockTransactionsService struct {
	listFn                  func(accountID uuid.UUID) ([]sqlite.Transaction, error)
	createFn                func(t sqlite.Transaction) error
	getByIDFn               func(id uuid.UUID) (sqlite.Transaction, error)
	updateFn                func(id uuid.UUID, upd sqlite.UpdateTransaction) error
	deleteFn                func(id uuid.UUID) error
	confirmRecurringFn      func(id uuid.UUID) (time.Time, error)
	confirmInstallmentFn    func(id uuid.UUID) error
}

func (m *mockTransactionsService) ConfirmInstallment(id uuid.UUID) error {
	if m.confirmInstallmentFn != nil {
		return m.confirmInstallmentFn(id)
	}
	panic("not implemented")
}
```

- [ ] **Step 9: Write handler tests for `ConfirmInstallment`**

Append to `internal/handler/transactions_test.go`:

```go
func TestConfirmInstallment_HappyPath(t *testing.T) {
	id := uuid.New()
	accountID := uuid.New()
	now := time.Now().UTC()
	total := int64(6)
	paid := int64(1)
	freq := "monthly"
	anchor := now.AddDate(0, -1, 0) // one month ago
	anchorStr := anchor.UTC().Format(time.RFC3339)

	mock := &mockTransactionsService{
		confirmInstallmentFn: func(txnID uuid.UUID) error {
			if txnID != id {
				t.Fatalf("unexpected id: %v", txnID)
			}
			return nil
		},
		getByIDFn: func(_ uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                id,
				AccountID:         accountID,
				Amount:            -5000,
				Description:       "Phone",
				Category:          "Electronics",
				Timestamp:         now,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
				Frequency:         &freq,
				AnchorDate:        &anchor,
			}, nil
		},
	}
	h := &TransactionsHandler{svc: mock}
	rec, c := makeRequest(http.MethodPost, "/api/transactions/"+id.String()+"/confirm-installment", "")
	c.SetParamNames("id")
	c.SetParamValues(id.String())
	if err := h.ConfirmInstallment(c); err != nil {
		t.Fatalf("ConfirmInstallment returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var resp TransactionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !resp.IsInstallment {
		t.Errorf("expected is_installment=true")
	}
	if resp.PaidInstallments != 1 {
		t.Errorf("expected paid_installments=1, got %d", resp.PaidInstallments)
	}
	// next_occurrence should be computed (anchor + 1 month for paid=1)
	if resp.NextOccurrence == nil {
		t.Errorf("expected next_occurrence to be set for incomplete installment")
	}
	_ = anchorStr
}

func TestConfirmInstallment_InvalidID_Returns400(t *testing.T) {
	mock := &mockTransactionsService{}
	h := &TransactionsHandler{svc: mock}
	rec, c := makeRequest(http.MethodPost, "/api/transactions/not-a-uuid/confirm-installment", "")
	c.SetParamNames("id")
	c.SetParamValues("not-a-uuid")
	if err := h.ConfirmInstallment(c); err == nil {
		t.Fatal("expected error for invalid id")
	} else {
		_ = rec
	}
}
```

- [ ] **Step 10: Verify compile and run handler tests**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/handler/... -v -run "TestConfirmInstallment"
```

Expected: both tests PASS.

- [ ] **Step 11: Run all handler tests for regressions**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/handler/... -v
```

Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add internal/handler/transactions.go internal/handler/routes.go \
        internal/handler/transactions_test.go internal/handler/testhelpers_test.go
git commit -m "feat: add ConfirmInstallment handler and update TransactionResponse"
```

---

### Task 5: Frontend — update api.ts types and add `confirmInstallmentTransaction`

**Files:**
- Modify: `web/src/lib/api.ts`

**Interfaces:**
- Produces:
  - `TransactionResponse` has `is_installment: boolean`, `total_installments: number | null`, `paid_installments: number`.
  - `createTransaction` accepts `is_installment?: boolean`, `total_installments?: number`.
  - `confirmInstallmentTransaction(id: string): Promise<TransactionResponse>` exported function.

- [ ] **Step 1: Update `TransactionResponse` interface**

In `web/src/lib/api.ts`, replace the `TransactionResponse` interface (lines 10–23):

```ts
export interface TransactionResponse {
  id: string
  account_id: string
  amount: number
  description: string
  category: string
  timestamp: string
  is_recurring: boolean
  requires_confirmation: boolean
  confirmed_at: string | null
  frequency: string | null
  anchor_date: string | null
  next_occurrence: string | null
  is_installment: boolean
  total_installments: number | null
  paid_installments: number
}
```

- [ ] **Step 2: Update `createTransaction` to accept installment fields**

Replace the `createTransaction` function:

```ts
export function createTransaction(data: {
  account_id: string
  amount: number
  description: string
  category: string
  is_recurring?: boolean
  requires_confirmation?: boolean
  frequency?: string
  anchor_date?: string
  is_installment?: boolean
  total_installments?: number
}): Promise<TransactionResponse> {
  return apiFetch<TransactionResponse>('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
```

- [ ] **Step 3: Add `confirmInstallmentTransaction` function**

After the existing `confirmTransaction` function, add:

```ts
export function confirmInstallmentTransaction(id: string): Promise<TransactionResponse> {
  return apiFetch<TransactionResponse>(`/api/transactions/${id}/confirm-installment`, {
    method: 'POST',
  })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/fleck/Projects/cibi/web && npm run build 2>&1 | head -40
```

Expected: no TypeScript errors (may have other warnings; ignore non-error output).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat: extend TransactionResponse type with installment fields"
```

---

### Task 6: Frontend — add installment toggle to TransactionForm

**Files:**
- Modify: `web/src/components/TransactionForm.tsx`

**Interfaces:**
- Consumes: `TransactionFormValues` type (same file).
- Produces:
  - `TransactionFormValues` has `is_installment?: boolean`, `total_installments?: number`.
  - `TransactionFormErrors` automatically covers new keys via `keyof TransactionFormValues`.
  - Form renders installment toggle; when on: total_installments input + anchor_date + frequency (monthly/weekly); amount label reads "Per installment amount".
  - Installment toggle is mutually exclusive with recurring and requires_confirmation toggles.

- [ ] **Step 1: Extend `TransactionFormValues`**

Replace the interface:

```ts
export interface TransactionFormValues {
  account_id: string
  amount: number
  description: string
  category: string
  is_recurring?: boolean
  frequency?: string
  anchor_date?: string
  requires_confirmation?: boolean
  is_installment?: boolean
  total_installments?: number
}
```

- [ ] **Step 2: Update form rendering to add installment toggle and conditional fields**

Replace the entire `TransactionForm` function body. The key changes are:
- Amount label becomes "Per installment amount" when `is_installment` is true.
- Add installment toggle (mutually exclusive: turning it on clears `is_recurring` and `requires_confirmation`).
- When `is_installment` is on, show a `total_installments` number input, plus the existing anchor_date and frequency selects.
- Frequency select available for installments: monthly and weekly only (no bi-weekly).

```tsx
export function TransactionForm({
  editingId,
  formData,
  formErrors,
  amountText,
  isPending,
  categories,
  accounts,
  categoryAutofilled = false,
  onSubmit,
  onCancel,
  onChange,
  onAmountTextChange,
  onAmountParsedChange,
  onClearError,
}: TransactionFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {!editingId && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="txn-account" className="text-xs">Account *</Label>
          <Select
            value={formData.account_id}
            onValueChange={v => onChange({ account_id: v })}
          >
            <SelectTrigger id="txn-account" size="sm" className="w-full">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="txn-amount" className="text-xs">
            {formData.is_installment ? 'Per installment amount *' : 'Amount *'}
          </Label>
          <ValueInput
            id="txn-amount"
            value={amountText}
            onValueChange={raw => {
              onAmountTextChange(raw)
              if (formErrors.amount) onClearError('amount')
            }}
            onParsedValueChange={onAmountParsedChange}
            placeholder="-50.00"
            aria-invalid={!!formErrors.amount || undefined}
            aria-describedby={formErrors.amount ? 'txn-amount-error' : undefined}
            showSignToggle
          />
          {formErrors.amount && (
            <p id="txn-amount-error" className="text-xs text-destructive">
              {formErrors.amount}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="txn-description" className="text-xs">Description *</Label>
          <Input
            id="txn-description"
            value={formData.description}
            onChange={e => {
              onChange({ description: e.target.value })
              if (formErrors.description) onClearError('description')
            }}
            placeholder="Transaction description"
            aria-invalid={!!formErrors.description || undefined}
            aria-describedby={formErrors.description ? 'txn-description-error' : undefined}
          />
          {formErrors.description && (
            <p id="txn-description-error" className="text-xs text-destructive">
              {formErrors.description}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="txn-category" className="text-xs">Category *</Label>
          <Select
            value={formData.category}
            onValueChange={v => {
              onChange({ category: v })
              if (formErrors.category) onClearError('category')
            }}
          >
            <SelectTrigger id="txn-category" size="sm" className={cn('w-full', categoryAutofilled && 'ring-2 ring-primary/30 transition-all duration-300')} aria-invalid={!!formErrors.category || undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formErrors.category && (
            <p id="txn-category-error" className="text-xs text-destructive">
              {formErrors.category}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Switch
              id="txn-recurring"
              checked={!!formData.is_recurring}
              onCheckedChange={v => onChange({
                is_recurring: v,
                is_installment: v ? false : formData.is_installment,
                requires_confirmation: v ? false : formData.requires_confirmation,
              })}
            />
            <Label htmlFor="txn-recurring" className="text-xs cursor-pointer">Recurring</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="txn-pending-payment"
              checked={!formData.is_recurring && !formData.is_installment && !!formData.requires_confirmation}
              onCheckedChange={v => onChange({
                requires_confirmation: v,
                is_recurring: v ? false : formData.is_recurring,
                is_installment: v ? false : formData.is_installment,
              })}
            />
            <Label htmlFor="txn-pending-payment" className="text-xs cursor-pointer">Pending payment (confirm later)</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="txn-installment"
              checked={!!formData.is_installment}
              onCheckedChange={v => onChange({
                is_installment: v,
                is_recurring: v ? false : formData.is_recurring,
                requires_confirmation: v ? false : formData.requires_confirmation,
              })}
            />
            <Label htmlFor="txn-installment" className="text-xs cursor-pointer">Installment plan</Label>
          </div>
        </div>
      </div>
      {formData.is_installment && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-total-installments" className="text-xs">Total installments</Label>
            <Input
              id="txn-total-installments"
              type="number"
              min={1}
              value={formData.total_installments ?? ''}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                onChange({ total_installments: isNaN(v) ? undefined : v })
              }}
              placeholder="12"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-frequency" className="text-xs">Frequency</Label>
            <Select
              value={formData.frequency || 'monthly'}
              onValueChange={v => onChange({ frequency: v })}
            >
              <SelectTrigger id="txn-frequency" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-anchor" className="text-xs">First payment date</Label>
            <Input
              id="txn-anchor"
              type="date"
              value={formData.anchor_date || ''}
              onChange={e => onChange({ anchor_date: e.target.value })}
            />
          </div>
        </>
      )}
      {!formData.is_installment && (formData.is_recurring || formData.requires_confirmation) && (
        <>
          {formData.is_recurring && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="txn-frequency" className="text-xs">Frequency</Label>
              <Select
                value={formData.frequency || 'monthly'}
                onValueChange={v => onChange({ frequency: v })}
              >
                <SelectTrigger id="txn-frequency" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-anchor" className="text-xs">{formData.is_recurring ? 'Anchor Date' : 'Pending date'}</Label>
            <Input
              id="txn-anchor"
              type="date"
              value={formData.anchor_date || ''}
              onChange={e => onChange({ anchor_date: e.target.value })}
            />
          </div>
        </>
      )}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm flex gap-2 pt-4 pb-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending
            ? editingId ? 'Updating...' : 'Creating...'
            : editingId ? 'Update' : 'Create'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/fleck/Projects/cibi/web && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `TransactionForm.tsx`.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/TransactionForm.tsx
git commit -m "feat: add installment toggle to TransactionForm"
```

---

### Task 7: Frontend — wire installment state and confirm mutation in transactions.tsx

**Files:**
- Modify: `web/src/pages/transactions.tsx`

**Interfaces:**
- Consumes: `confirmInstallmentTransaction` from `api.ts` (Task 5); `TransactionFormValues.is_installment` / `total_installments` (Task 6).
- Produces: installment txns show progress in subtitle + status badge; confirm click dispatches correct mutation based on txn type.

- [ ] **Step 1: Import `confirmInstallmentTransaction`**

Find the existing API imports near the top of `transactions.tsx` and add `confirmInstallmentTransaction` to the destructured imports from `@/lib/api`.

- [ ] **Step 2: Extend local `FormData` type with installment fields**

Find the local `FormData` type (or the inline type on `useState`). Add `is_installment` and `total_installments`. The `formData` state shape should include:

```ts
is_installment: boolean
total_installments: number | undefined
```

Update the initial state in `useState` and all three reset locations (`handleCreateClick`, `handleCancel`, `createMutation.onSuccess`, `updateMutation.onSuccess`) to include:

```ts
is_installment: false,
total_installments: undefined,
```

- [ ] **Step 3: Update `handleEditClick` to populate installment fields**

In `handleEditClick`, add installment fields:

```ts
const handleEditClick = (txn: TransactionResponse) => {
  setEditingId(txn.id)
  setFormErrors({})
  setCategoryTouched(false)
  setCategoryAutofilled(false)
  setAmountText(txn.amount.toString())
  setFormData({
    account_id: txn.account_id,
    amount: txn.amount,
    description: txn.description,
    category: txn.category,
    is_recurring: txn.is_recurring,
    frequency: txn.frequency || 'monthly',
    anchor_date: toDateInputValue(txn.anchor_date),
    requires_confirmation: txn.requires_confirmation,
    is_installment: txn.is_installment,
    total_installments: txn.total_installments ?? undefined,
  })
}
```

- [ ] **Step 4: Update `handleSubmit` to include installment fields in the payload**

In `handleSubmit`, update the payload construction:

```ts
const payload = {
  ...formData,
  anchor_date: anchorDate,
  is_installment: formData.is_installment,
  total_installments: formData.total_installments,
}
```

(If `formData` is spread as-is, this may already be covered — just verify `is_installment` and `total_installments` are included in the spread.)

- [ ] **Step 5: Add `confirmInstallmentMutation`**

Add a new mutation after the existing `confirmMutation`:

```ts
const confirmInstallmentMutation = useMutation({
  mutationFn: (id: string) => confirmInstallmentTransaction(id),
  onSuccess: () => {
    toast.success('Installment confirmed')
  },
  onError: (error) => {
    toast.error((error as Error).message || 'Failed to confirm installment')
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
  },
})
```

- [ ] **Step 6: Update `handleConfirmClick` to dispatch to correct mutation**

Replace `handleConfirmClick`:

```ts
const handleConfirmClick = (id: string) => {
  const txn = transactions.find((t: TransactionResponse) => t.id === id)
  if (txn?.is_installment) {
    confirmInstallmentMutation.mutate(id)
  } else {
    confirmMutation.mutate(id)
  }
}
```

- [ ] **Step 7: Update the SharedDebtList item mapping to surface installment info**

In the `SharedDebtList` `items` map, update the lambda for each `txn`:

```ts
items={filteredAndSortedTxns.map((txn: TransactionResponse) => ({
  id: txn.id,
  title: txn.description,
  subtitle: txn.is_installment
    ? `${txn.category} · Installment · ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'} paid · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : '-'}`
    : txn.is_recurring
      ? `${txn.category} · ${txn.frequency} · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : (txn.anchor_date ? formatDate(txn.anchor_date) : '-')}`
      : txn.requires_confirmation
        ? (txn.confirmed_at ? `confirmed ${formatDate(txn.confirmed_at)}` : `pending ${formatDate(txn.anchor_date || txn.timestamp)}`)
        : formatDate(txn.timestamp),
  amount: txn.amount,
  total: txn.amount,
  perInstallment: null,
  currency: currentAccountCurrency,
  status: {
    label: txn.is_installment
      ? `Installment ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'}`
      : txn.is_recurring
        ? 'Recurring'
        : txn.requires_confirmation
          ? (txn.confirmed_at ? 'Pending payment · confirmed' : 'Pending payment')
          : 'One-time',
    tone: (txn.is_installment || txn.is_recurring || txn.requires_confirmation)
      ? 'default'
      : 'secondary',
  },
  type: 'transaction' as const,
  canConfirm: txn.is_installment
    ? (txn.paid_installments ?? 0) < (txn.total_installments ?? 0)
    : txn.is_recurring || (txn.requires_confirmation && !txn.confirmed_at),
  canDelete: true,
  canOpen: true,
}))}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /home/fleck/Projects/cibi/web && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `transactions.tsx`.

- [ ] **Step 9: Run frontend tests**

```bash
cd /home/fleck/Projects/cibi/web && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all existing tests pass (no regressions from type changes).

- [ ] **Step 10: Commit**

```bash
git add web/src/pages/transactions.tsx
git commit -m "feat: wire installment confirm mutation and form state in transactions page"
```

---

### Task 8: Frontend — add installmentObligations to StatCards reserved calc

**Files:**
- Modify: `web/src/components/StatCards.tsx`

**Interfaces:**
- Consumes: `TransactionResponse.is_installment`, `paid_installments`, `total_installments`, `next_occurrence` (Task 5).
- Produces: `reserved` includes `installmentObligations`; reserved popover shows "Installment obligations" row.

- [ ] **Step 1: Add `installmentObligations` calculation**

In `StatCards.tsx`, after the `peerObligations` calculation and before the `reserved` assignment, add:

```ts
const installmentObligations = recurringTxns
  .filter(t =>
    t.is_installment &&
    t.next_occurrence !== null &&
    (t.paid_installments ?? 0) < (t.total_installments ?? 0) &&
    isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
  )
  .reduce((sum, t) => sum + Math.abs(t.amount), 0)
```

- [ ] **Step 2: Include `installmentObligations` in `reserved`**

Replace:

```ts
const reserved = recurringReserved + peerObligations
```

With:

```ts
const reserved = recurringReserved + peerObligations + installmentObligations
```

- [ ] **Step 3: Add popover row for installment obligations**

In the reserved `PopoverContent`, add after the "Peer debts (owed)" row and before the "Safety buffer" row:

```tsx
<div className="flex items-center justify-between gap-2">
  <span className="text-muted-foreground">Installment obligations</span>
  <span className="tabular-nums font-medium">{formatMoney(installmentObligations, account.currency)}</span>
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/fleck/Projects/cibi/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `StatCards.tsx`.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/StatCards.tsx
git commit -m "feat: include installment obligations in Reserved stat card"
```

---

### Task 9: Frontend — include installment txns in ObligationsList

**Files:**
- Modify: `web/src/components/ObligationsList.tsx`

**Interfaces:**
- Consumes: `TransactionResponse.is_installment`, `paid_installments`, `total_installments`, `next_occurrence` (Task 5).
- Produces: `ObligationsList` displays active installment txns alongside recurring obligations; installment rows show `paid/total` progress badge.

- [ ] **Step 1: Update the `obligations` filter to include installment txns**

In `ObligationsList.tsx`, replace the `obligations` filter:

```ts
const obligations = transactions
  .filter(t => {
    if (t.is_installment) {
      return (
        t.next_occurrence !== null &&
        (t.paid_installments ?? 0) < (t.total_installments ?? 0) &&
        isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
      )
    }
    return (
      t.is_recurring &&
      t.next_occurrence !== null &&
      isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
    )
  })
  .sort((a, b) =>
    new Date(a.next_occurrence!).getTime() - new Date(b.next_occurrence!).getTime()
  )
```

- [ ] **Step 2: Add progress badge for installment rows**

In the obligations list item rendering, add a progress badge after the description span for installment txns:

```tsx
{obligations.map(t => (
  <div
    key={t.id}
    className="flex items-center px-5 py-2.5 gap-4 hover:bg-muted/30 transition-colors"
  >
    <span className="flex-1 text-sm">{t.description}</span>
    {t.is_installment && (
      <span className="text-xs text-muted-foreground tabular-nums">
        {t.paid_installments ?? 0}/{t.total_installments ?? '?'}
      </span>
    )}
    <MoneyValue
      amount={t.amount}
      currency={currency}
      tone="negative"
      showSign="auto"
      className="text-sm font-medium"
    />
    <span className="text-xs text-muted-foreground w-14 text-right tabular-nums">
      {formatDate(t.next_occurrence!)}
    </span>
  </div>
))}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/fleck/Projects/cibi/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Run all frontend tests**

```bash
cd /home/fleck/Projects/cibi/web && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ObligationsList.tsx
git commit -m "feat: show installment txns in ObligationsList with progress badge"
```

---

### Task 10: Integration verification and ship

**Files:** none (verification only)

- [ ] **Step 1: Run all Go tests**

```bash
cd /home/fleck/Projects/cibi && go test ./... 2>&1
```

Expected: all PASS.

- [ ] **Step 2: Run frontend tests**

```bash
cd /home/fleck/Projects/cibi/web && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 3: Build frontend**

```bash
cd /home/fleck/Projects/cibi/web && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Run make upd**

```bash
cd /home/fleck/Projects/cibi && make upd
```

Expected: runs without error.
