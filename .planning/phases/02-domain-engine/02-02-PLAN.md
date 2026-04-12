---
plan: "02-02"
title: "Repo Layer — internal/repo/sqlite/"
phase: 2
wave: 1
depends_on: []
files_modified:
  - internal/repo/sqlite/accounts.go
  - internal/repo/sqlite/transactions.go
  - internal/repo/sqlite/pay_schedule.go
  - internal/repo/sqlite/safety_buffer.go
autonomous: true
requirements:
  - TXN-01
  - TXN-02
must_haves:
  - All SQL lives exclusively in internal/repo/sqlite/ — no SQL strings outside this package
  - Column names match Phase 1 schema exactly (current_balance, next_occurrence, anchor_date, etc.)
  - All time values use UTC RFC3339 when persisting to or reading from TEXT columns
---

# Plan 02-02: Repo Layer — internal/repo/sqlite/

## Goal

Create `internal/repo/sqlite/` with four repository implementations that match the Phase 1 migration schema exactly. These repos are the only place SQL strings appear in the codebase. All money is `int64` cents. All timestamps are scanned as `string` and parsed as UTC RFC3339.

The legacy `repos/` directory is NOT modified — the new internal repos are wired independently in `app.go`.

---

## Wave 1

### Task 02-02-01: Create `internal/repo/sqlite/accounts.go`

<read_first>
- `internal/migrations/20260411000001_initial_schema.go` — exact column names: `id TEXT, name TEXT, current_balance INTEGER, currency TEXT, is_default BOOLEAN`
- `repos/accounts.go` — existing interface pattern (use as reference for method signatures only, do NOT copy SQL — column names differ)
- `.planning/REQUIREMENTS.md` — SCHEMA-01, SCHEMA-05
</read_first>

<action>
Create `internal/repo/sqlite/accounts.go` with the following exact content:

```go
package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Account mirrors the Account schema row.
type Account struct {
	ID             uuid.UUID
	Name           string
	CurrentBalance int64  // cents
	Currency       string
	IsDefault      bool
}

// AccountsRepo defines the data access contract for accounts.
type AccountsRepo interface {
	Insert(a Account) error
	GetAll() ([]Account, error)
	GetDefault() (Account, error)
	GetByID(id uuid.UUID) (Account, error)
	UpdateBalance(id uuid.UUID, balance int64, tx *sql.Tx) error
	UpdateName(id uuid.UUID, name string) error
	UpdateIsDefault(id uuid.UUID, isDefault bool) error
	DeleteByID(id uuid.UUID) error
	UnsetDefaults(tx *sql.Tx) error
}

// SqliteAccountsRepo implements AccountsRepo against modernc SQLite.
type SqliteAccountsRepo struct {
	db *sql.DB
}

// NewSqliteAccountsRepo creates a new SqliteAccountsRepo.
func NewSqliteAccountsRepo(db *sql.DB) *SqliteAccountsRepo {
	return &SqliteAccountsRepo{db: db}
}

func (r *SqliteAccountsRepo) Insert(a Account) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("accounts.Insert: begin tx: %w", err)
	}

	if a.IsDefault {
		if err := r.UnsetDefaults(tx); err != nil {
			tx.Rollback()
			return fmt.Errorf("accounts.Insert: unset defaults: %w", err)
		}
	}

	_, err = tx.Exec(
		`INSERT INTO Account (id, name, current_balance, currency, is_default) VALUES (?, ?, ?, ?, ?)`,
		a.ID.String(), a.Name, a.CurrentBalance, a.Currency, a.IsDefault,
	)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("accounts.Insert: exec: %w", err)
	}

	return tx.Commit()
}

func (r *SqliteAccountsRepo) UnsetDefaults(tx *sql.Tx) error {
	var err error
	if tx != nil {
		_, err = tx.Exec(`UPDATE Account SET is_default = 0 WHERE is_default = 1`)
	} else {
		_, err = r.db.Exec(`UPDATE Account SET is_default = 0 WHERE is_default = 1`)
	}
	if err != nil {
		return fmt.Errorf("accounts.UnsetDefaults: %w", err)
	}
	return nil
}

func (r *SqliteAccountsRepo) GetAll() ([]Account, error) {
	rows, err := r.db.Query(`SELECT id, name, current_balance, currency, is_default FROM Account`)
	if err != nil {
		return nil, fmt.Errorf("accounts.GetAll: query: %w", err)
	}
	defer rows.Close()

	var accounts []Account
	for rows.Next() {
		var a Account
		var idStr string
		if err := rows.Scan(&idStr, &a.Name, &a.CurrentBalance, &a.Currency, &a.IsDefault); err != nil {
			return nil, fmt.Errorf("accounts.GetAll: scan: %w", err)
		}
		a.ID, err = uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("accounts.GetAll: parse uuid: %w", err)
		}
		accounts = append(accounts, a)
	}
	return accounts, rows.Err()
}

func (r *SqliteAccountsRepo) GetDefault() (Account, error) {
	var a Account
	var idStr string
	err := r.db.QueryRow(
		`SELECT id, name, current_balance, currency, is_default FROM Account WHERE is_default = 1`,
	).Scan(&idStr, &a.Name, &a.CurrentBalance, &a.Currency, &a.IsDefault)
	if err != nil {
		return a, fmt.Errorf("accounts.GetDefault: %w", err)
	}
	a.ID, err = uuid.Parse(idStr)
	if err != nil {
		return a, fmt.Errorf("accounts.GetDefault: parse uuid: %w", err)
	}
	return a, nil
}

func (r *SqliteAccountsRepo) GetByID(id uuid.UUID) (Account, error) {
	var a Account
	var idStr string
	err := r.db.QueryRow(
		`SELECT id, name, current_balance, currency, is_default FROM Account WHERE id = ?`,
		id.String(),
	).Scan(&idStr, &a.Name, &a.CurrentBalance, &a.Currency, &a.IsDefault)
	if err != nil {
		return a, fmt.Errorf("accounts.GetByID: %w", err)
	}
	a.ID, err = uuid.Parse(idStr)
	if err != nil {
		return a, fmt.Errorf("accounts.GetByID: parse uuid: %w", err)
	}
	return a, nil
}

func (r *SqliteAccountsRepo) UpdateBalance(id uuid.UUID, balance int64, tx *sql.Tx) error {
	var err error
	if tx != nil {
		_, err = tx.Exec(`UPDATE Account SET current_balance = ? WHERE id = ?`, balance, id.String())
	} else {
		_, err = r.db.Exec(`UPDATE Account SET current_balance = ? WHERE id = ?`, balance, id.String())
	}
	if err != nil {
		return fmt.Errorf("accounts.UpdateBalance: %w", err)
	}
	return nil
}

func (r *SqliteAccountsRepo) UpdateName(id uuid.UUID, name string) error {
	_, err := r.db.Exec(`UPDATE Account SET name = ? WHERE id = ?`, name, id.String())
	if err != nil {
		return fmt.Errorf("accounts.UpdateName: %w", err)
	}
	return nil
}

func (r *SqliteAccountsRepo) UpdateIsDefault(id uuid.UUID, isDefault bool) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("accounts.UpdateIsDefault: begin: %w", err)
	}
	if err := r.UnsetDefaults(tx); err != nil {
		tx.Rollback()
		return fmt.Errorf("accounts.UpdateIsDefault: unset: %w", err)
	}
	_, err = tx.Exec(`UPDATE Account SET is_default = ? WHERE id = ?`, isDefault, id.String())
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("accounts.UpdateIsDefault: exec: %w", err)
	}
	return tx.Commit()
}

func (r *SqliteAccountsRepo) DeleteByID(id uuid.UUID) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("accounts.DeleteByID: begin: %w", err)
	}
	if _, err = tx.Exec(`DELETE FROM Transaction WHERE account_id = ?`, id.String()); err != nil {
		tx.Rollback()
		return fmt.Errorf("accounts.DeleteByID: delete txns: %w", err)
	}
	if _, err = tx.Exec(`DELETE FROM Account WHERE id = ?`, id.String()); err != nil {
		tx.Rollback()
		return fmt.Errorf("accounts.DeleteByID: delete account: %w", err)
	}
	return tx.Commit()
}

// Ensure time import is used (UTC formatting utility for other repos to import).
var _ = time.UTC
```
</action>

<acceptance_criteria>
- `internal/repo/sqlite/accounts.go` exists with `package sqlite`
- File contains `type AccountsRepo interface`
- File contains `type SqliteAccountsRepo struct`
- File contains `func NewSqliteAccountsRepo`
- SQL uses `current_balance` (not `balance`) — `grep "current_balance" internal/repo/sqlite/accounts.go` returns matches
- SQL uses `Account` table name (capital A) — `grep "FROM Account" internal/repo/sqlite/accounts.go` returns matches
- `go build ./internal/repo/sqlite/...` exits 0
</acceptance_criteria>

---

### Task 02-02-02: Create `internal/repo/sqlite/transactions.go`

<read_first>
- `internal/migrations/20260411000001_initial_schema.go` — exact Transaction columns: `id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence`
- `.planning/REQUIREMENTS.md` — TXN-01, TXN-02 (atomic advance of next_occurrence)
- `.planning/phases/02-domain-engine/02-RESEARCH.md` — Section 6 (UTC time handling in Go+SQLite)
</read_first>

<action>
Create `internal/repo/sqlite/transactions.go` with the following exact content:

```go
package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ValidFrequencies is the allowed set of frequency values for recurring transactions.
var ValidFrequencies = map[string]bool{
	"weekly":    true,
	"bi-weekly": true,
	"monthly":   true,
	"yearly":    true,
}

// Transaction mirrors the Transaction schema row.
type Transaction struct {
	ID            uuid.UUID
	AccountID     uuid.UUID
	Amount        int64   // cents; negative = debit, positive = credit
	Description   string
	Category      string
	Timestamp     time.Time // UTC
	IsRecurring   bool
	Frequency     *string   // nullable
	AnchorDate    *time.Time // UTC, nullable
	NextOccurrence *time.Time // UTC, nullable
}

// TransactionsRepo defines the data access contract for transactions.
type TransactionsRepo interface {
	Insert(t Transaction) error
	GetByAccount(accountID uuid.UUID) ([]Transaction, error)
	GetByID(id uuid.UUID) (Transaction, error)
	Update(id uuid.UUID, upd UpdateTransaction) error
	DeleteByID(id uuid.UUID) error
	AdvanceNextOccurrence(id uuid.UUID, next time.Time, tx *sql.Tx) error
	SumUpcomingObligations(accountID uuid.UUID, after, onOrBefore time.Time) (int64, error)
}

// UpdateTransaction holds the fields that can be updated on a transaction.
type UpdateTransaction struct {
	Description    *string
	Category       *string
	Amount         *int64
	NextOccurrence *time.Time
}

// SqliteTxnsRepo implements TransactionsRepo.
type SqliteTxnsRepo struct {
	db *sql.DB
}

// NewSqliteTxnsRepo creates a new SqliteTxnsRepo.
func NewSqliteTxnsRepo(db *sql.DB) *SqliteTxnsRepo {
	return &SqliteTxnsRepo{db: db}
}

func (r *SqliteTxnsRepo) Insert(t Transaction) error {
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

	_, err := r.db.Exec(
		`INSERT INTO Transaction
		(id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID.String(),
		t.AccountID.String(),
		t.Amount,
		t.Description,
		t.Category,
		t.Timestamp.UTC().Format(time.RFC3339),
		t.IsRecurring,
		freq,
		anchorStr,
		nextStr,
	)
	if err != nil {
		return fmt.Errorf("transactions.Insert: %w", err)
	}
	return nil
}

func (r *SqliteTxnsRepo) GetByAccount(accountID uuid.UUID) ([]Transaction, error) {
	rows, err := r.db.Query(
		`SELECT id, account_id, amount, description, category, timestamp,
		        is_recurring, frequency, anchor_date, next_occurrence
		 FROM Transaction WHERE account_id = ?`,
		accountID.String(),
	)
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

func (r *SqliteTxnsRepo) GetByID(id uuid.UUID) (Transaction, error) {
	row := r.db.QueryRow(
		`SELECT id, account_id, amount, description, category, timestamp,
		        is_recurring, frequency, anchor_date, next_occurrence
		 FROM Transaction WHERE id = ?`,
		id.String(),
	)
	t, err := scanTransactionRow(row)
	if err != nil {
		return t, fmt.Errorf("transactions.GetByID: %w", err)
	}
	return t, nil
}

func (r *SqliteTxnsRepo) Update(id uuid.UUID, upd UpdateTransaction) error {
	if upd.Description != nil {
		if _, err := r.db.Exec(`UPDATE Transaction SET description = ? WHERE id = ?`, *upd.Description, id.String()); err != nil {
			return fmt.Errorf("transactions.Update description: %w", err)
		}
	}
	if upd.Category != nil {
		if _, err := r.db.Exec(`UPDATE Transaction SET category = ? WHERE id = ?`, *upd.Category, id.String()); err != nil {
			return fmt.Errorf("transactions.Update category: %w", err)
		}
	}
	if upd.Amount != nil {
		if _, err := r.db.Exec(`UPDATE Transaction SET amount = ? WHERE id = ?`, *upd.Amount, id.String()); err != nil {
			return fmt.Errorf("transactions.Update amount: %w", err)
		}
	}
	if upd.NextOccurrence != nil {
		nextStr := upd.NextOccurrence.UTC().Format(time.RFC3339)
		if _, err := r.db.Exec(`UPDATE Transaction SET next_occurrence = ? WHERE id = ?`, nextStr, id.String()); err != nil {
			return fmt.Errorf("transactions.Update next_occurrence: %w", err)
		}
	}
	return nil
}

func (r *SqliteTxnsRepo) DeleteByID(id uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM Transaction WHERE id = ?`, id.String())
	if err != nil {
		return fmt.Errorf("transactions.DeleteByID: %w", err)
	}
	return nil
}

// AdvanceNextOccurrence atomically updates next_occurrence for a single
// recurring transaction. If tx is non-nil, uses the existing transaction.
func (r *SqliteTxnsRepo) AdvanceNextOccurrence(id uuid.UUID, next time.Time, tx *sql.Tx) error {
	nextStr := next.UTC().Format(time.RFC3339)
	var err error
	if tx != nil {
		_, err = tx.Exec(`UPDATE Transaction SET next_occurrence = ? WHERE id = ?`, nextStr, id.String())
	} else {
		_, err = r.db.Exec(`UPDATE Transaction SET next_occurrence = ? WHERE id = ?`, nextStr, id.String())
	}
	if err != nil {
		return fmt.Errorf("transactions.AdvanceNextOccurrence: %w", err)
	}
	return nil
}

// SumUpcomingObligations returns the sum of amounts (cents) for recurring
// transactions where next_occurrence is strictly after `after` and on or before
// `onOrBefore`. This is the obligation window for the CanIBuyIt engine.
func (r *SqliteTxnsRepo) SumUpcomingObligations(accountID uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	afterStr := after.UTC().Format(time.RFC3339)
	onOrBeforeStr := onOrBefore.UTC().Format(time.RFC3339)

	var sum int64
	err := r.db.QueryRow(
		`SELECT COALESCE(SUM(amount), 0)
		 FROM Transaction
		 WHERE account_id = ?
		   AND is_recurring = 1
		   AND next_occurrence > ?
		   AND next_occurrence <= ?`,
		accountID.String(),
		afterStr,
		onOrBeforeStr,
	).Scan(&sum)
	if err != nil {
		return 0, fmt.Errorf("transactions.SumUpcomingObligations: %w", err)
	}
	return sum, nil
}

// scanTransaction scans a *sql.Rows into a Transaction.
func scanTransaction(rows *sql.Rows) (Transaction, error) {
	var t Transaction
	var idStr, accIDStr, tsStr string
	var freq, anchorStr, nextStr sql.NullString

	err := rows.Scan(
		&idStr, &accIDStr, &t.Amount, &t.Description, &t.Category,
		&tsStr, &t.IsRecurring, &freq, &anchorStr, &nextStr,
	)
	if err != nil {
		return t, err
	}
	return populateTransaction(t, idStr, accIDStr, tsStr, freq, anchorStr, nextStr)
}

// scanTransactionRow scans a *sql.Row into a Transaction.
func scanTransactionRow(row *sql.Row) (Transaction, error) {
	var t Transaction
	var idStr, accIDStr, tsStr string
	var freq, anchorStr, nextStr sql.NullString

	err := row.Scan(
		&idStr, &accIDStr, &t.Amount, &t.Description, &t.Category,
		&tsStr, &t.IsRecurring, &freq, &anchorStr, &nextStr,
	)
	if err != nil {
		return t, err
	}
	return populateTransaction(t, idStr, accIDStr, tsStr, freq, anchorStr, nextStr)
}

func populateTransaction(t Transaction, idStr, accIDStr, tsStr string, freq, anchorStr, nextStr sql.NullString) (Transaction, error) {
	var err error
	t.ID, err = uuid.Parse(idStr)
	if err != nil {
		return t, fmt.Errorf("parse id: %w", err)
	}
	t.AccountID, err = uuid.Parse(accIDStr)
	if err != nil {
		return t, fmt.Errorf("parse account_id: %w", err)
	}
	t.Timestamp, err = time.Parse(time.RFC3339, tsStr)
	if err != nil {
		return t, fmt.Errorf("parse timestamp: %w", err)
	}
	if freq.Valid {
		t.Frequency = &freq.String
	}
	if anchorStr.Valid {
		ts, err := time.Parse(time.RFC3339, anchorStr.String)
		if err != nil {
			return t, fmt.Errorf("parse anchor_date: %w", err)
		}
		t.AnchorDate = &ts
	}
	if nextStr.Valid {
		ts, err := time.Parse(time.RFC3339, nextStr.String)
		if err != nil {
			return t, fmt.Errorf("parse next_occurrence: %w", err)
		}
		t.NextOccurrence = &ts
	}
	return t, nil
}
```
</action>

<acceptance_criteria>
- `internal/repo/sqlite/transactions.go` exists with `package sqlite`
- File contains `type TransactionsRepo interface`
- File contains `func (r *SqliteTxnsRepo) SumUpcomingObligations`
- File contains `func (r *SqliteTxnsRepo) AdvanceNextOccurrence`
- SQL uses `Transaction` table name (capital T) — `grep "FROM Transaction" internal/repo/sqlite/transactions.go` returns matches
- All time.Parse uses `time.RFC3339` — `grep "time.RFC3339" internal/repo/sqlite/transactions.go` returns multiple matches
- `go build ./internal/repo/sqlite/...` exits 0
</acceptance_criteria>

---

### Task 02-02-03: Create `internal/repo/sqlite/pay_schedule.go`

<read_first>
- `internal/migrations/20260411000001_initial_schema.go` — PaySchedule columns: `id, account_id, frequency, anchor_date, day_of_month2, label`
- `internal/engine/engine.go` — PaySchedule struct (the engine type mirrors the repo type)
</read_first>

<action>
Create `internal/repo/sqlite/pay_schedule.go`:

```go
package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PaySchedule mirrors the PaySchedule schema row.
type PaySchedule struct {
	ID          uuid.UUID
	AccountID   uuid.UUID
	Frequency   string
	AnchorDate  time.Time // UTC
	DayOfMonth2 *int      // nullable
	Label       *string   // nullable
}

// PayScheduleRepo defines the data access contract for pay schedules.
type PayScheduleRepo interface {
	Insert(ps PaySchedule) error
	GetByAccountID(accountID uuid.UUID) (PaySchedule, error)
	UpdateByAccountID(accountID uuid.UUID, ps PaySchedule) error
	DeleteByAccountID(accountID uuid.UUID) error
}

// SqlitePayScheduleRepo implements PayScheduleRepo.
type SqlitePayScheduleRepo struct {
	db *sql.DB
}

// NewSqlitePayScheduleRepo creates a new SqlitePayScheduleRepo.
func NewSqlitePayScheduleRepo(db *sql.DB) *SqlitePayScheduleRepo {
	return &SqlitePayScheduleRepo{db: db}
}

func (r *SqlitePayScheduleRepo) Insert(ps PaySchedule) error {
	var label interface{}
	if ps.Label != nil {
		label = *ps.Label
	}
	var dom2 interface{}
	if ps.DayOfMonth2 != nil {
		dom2 = *ps.DayOfMonth2
	}

	_, err := r.db.Exec(
		`INSERT INTO PaySchedule (id, account_id, frequency, anchor_date, day_of_month2, label)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		ps.ID.String(),
		ps.AccountID.String(),
		ps.Frequency,
		ps.AnchorDate.UTC().Format(time.RFC3339),
		dom2,
		label,
	)
	if err != nil {
		return fmt.Errorf("pay_schedule.Insert: %w", err)
	}
	return nil
}

func (r *SqlitePayScheduleRepo) GetByAccountID(accountID uuid.UUID) (PaySchedule, error) {
	var ps PaySchedule
	var idStr, accIDStr, anchorStr string
	var dom2 sql.NullInt64
	var label sql.NullString

	err := r.db.QueryRow(
		`SELECT id, account_id, frequency, anchor_date, day_of_month2, label
		 FROM PaySchedule WHERE account_id = ?`,
		accountID.String(),
	).Scan(&idStr, &accIDStr, &ps.Frequency, &anchorStr, &dom2, &label)
	if err != nil {
		return ps, fmt.Errorf("pay_schedule.GetByAccountID: %w", err)
	}

	ps.ID, err = uuid.Parse(idStr)
	if err != nil {
		return ps, fmt.Errorf("pay_schedule.GetByAccountID: parse id: %w", err)
	}
	ps.AccountID, err = uuid.Parse(accIDStr)
	if err != nil {
		return ps, fmt.Errorf("pay_schedule.GetByAccountID: parse account_id: %w", err)
	}
	ps.AnchorDate, err = time.Parse(time.RFC3339, anchorStr)
	if err != nil {
		return ps, fmt.Errorf("pay_schedule.GetByAccountID: parse anchor_date: %w", err)
	}
	if dom2.Valid {
		d := int(dom2.Int64)
		ps.DayOfMonth2 = &d
	}
	if label.Valid {
		ps.Label = &label.String
	}
	return ps, nil
}

func (r *SqlitePayScheduleRepo) UpdateByAccountID(accountID uuid.UUID, ps PaySchedule) error {
	var dom2 interface{}
	if ps.DayOfMonth2 != nil {
		dom2 = *ps.DayOfMonth2
	}
	var label interface{}
	if ps.Label != nil {
		label = *ps.Label
	}

	_, err := r.db.Exec(
		`UPDATE PaySchedule
		 SET frequency = ?, anchor_date = ?, day_of_month2 = ?, label = ?
		 WHERE account_id = ?`,
		ps.Frequency,
		ps.AnchorDate.UTC().Format(time.RFC3339),
		dom2,
		label,
		accountID.String(),
	)
	if err != nil {
		return fmt.Errorf("pay_schedule.UpdateByAccountID: %w", err)
	}
	return nil
}

func (r *SqlitePayScheduleRepo) DeleteByAccountID(accountID uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM PaySchedule WHERE account_id = ?`, accountID.String())
	if err != nil {
		return fmt.Errorf("pay_schedule.DeleteByAccountID: %w", err)
	}
	return nil
}
```
</action>

<acceptance_criteria>
- `internal/repo/sqlite/pay_schedule.go` exists
- Contains `type PayScheduleRepo interface` with `GetByAccountID` method
- SQL uses `PaySchedule` table name — `grep "FROM PaySchedule" internal/repo/sqlite/pay_schedule.go` returns match
- `go build ./internal/repo/sqlite/...` exits 0
</acceptance_criteria>

---

### Task 02-02-04: Create `internal/repo/sqlite/safety_buffer.go`

<read_first>
- `internal/migrations/20260411000001_initial_schema.go` — SafetyBuffer schema: `min_threshold INTEGER` (single row, no id)
- `.planning/REQUIREMENTS.md` — SCHEMA-04: a value of 0 is valid and disables the buffer
</read_first>

<action>
Create `internal/repo/sqlite/safety_buffer.go`:

```go
package sqlite

import (
	"database/sql"
	"fmt"
)

// SafetyBuffer mirrors the SafetyBuffer schema row.
type SafetyBuffer struct {
	MinThreshold int64 // cents; 0 = buffer disabled
}

// SafetyBufferRepo defines the data access contract for the safety buffer global config.
type SafetyBufferRepo interface {
	Get() (SafetyBuffer, error)
	Set(threshold int64) error
}

// SqliteSafetyBufferRepo implements SafetyBufferRepo.
type SqliteSafetyBufferRepo struct {
	db *sql.DB
}

// NewSqliteSafetyBufferRepo creates a new SqliteSafetyBufferRepo.
func NewSqliteSafetyBufferRepo(db *sql.DB) *SqliteSafetyBufferRepo {
	return &SqliteSafetyBufferRepo{db: db}
}

// Get returns the current SafetyBuffer. Returns a default of 0 if no row exists.
func (r *SqliteSafetyBufferRepo) Get() (SafetyBuffer, error) {
	var sb SafetyBuffer
	err := r.db.QueryRow(`SELECT min_threshold FROM SafetyBuffer LIMIT 1`).Scan(&sb.MinThreshold)
	if err == sql.ErrNoRows {
		// No row exists — buffer is 0 (disabled), which is valid per SCHEMA-04.
		return SafetyBuffer{MinThreshold: 0}, nil
	}
	if err != nil {
		return sb, fmt.Errorf("safety_buffer.Get: %w", err)
	}
	return sb, nil
}

// Set upserts the min_threshold value. Replaces any existing row.
func (r *SqliteSafetyBufferRepo) Set(threshold int64) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("safety_buffer.Set: begin: %w", err)
	}
	_, err = tx.Exec(`DELETE FROM SafetyBuffer`)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("safety_buffer.Set: delete: %w", err)
	}
	_, err = tx.Exec(`INSERT INTO SafetyBuffer (min_threshold) VALUES (?)`, threshold)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("safety_buffer.Set: insert: %w", err)
	}
	return tx.Commit()
}
```
</action>

<acceptance_criteria>
- `internal/repo/sqlite/safety_buffer.go` exists
- Contains `func (r *SqliteSafetyBufferRepo) Get() (SafetyBuffer, error)`
- Handles `sql.ErrNoRows` by returning `MinThreshold: 0` — `grep "ErrNoRows" internal/repo/sqlite/safety_buffer.go` returns match
- `go build ./internal/repo/sqlite/...` exits 0
</acceptance_criteria>

---

## Verification

```bash
go build ./internal/repo/sqlite/...
```

Expected: exits 0, no errors.

**must_haves:**
- [ ] All four repo files created in `internal/repo/sqlite/`
- [ ] Column names match schema: `current_balance`, `next_occurrence`, `anchor_date`
- [ ] `SumUpcomingObligations` uses `next_occurrence > ?` AND `next_occurrence <= ?`
- [ ] All time formatting uses `time.RFC3339`
