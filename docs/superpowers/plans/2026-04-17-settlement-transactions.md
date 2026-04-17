# Settlement Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When confirming a peer debt or group event participant payment, atomically create a settlement `Transaction` and update the account balance; un-confirming reverses both.

**Architecture:** New `origin` + `source_id` columns on `Transaction` enable settlement tracking. Both `PeerDebtService` and `GroupEventService` gain db/repo dependencies to orchestrate atomic DB transactions (confirm + insert settlement txn + update balance). Un-confirm queries back by `source_id` to delete the settlement txn and reverse the balance.

**Tech Stack:** Go, SQLite (modernc), goose migrations, Echo v4

---

## File Map

| File | Change |
|------|--------|
| `internal/migrations/20260417000001_settlement_origin.go` | Create — adds `origin`, `source_id` columns to Transaction |
| `internal/repo/sqlite/transactions.go` | Modify — add origin constants, struct fields, insert/scan/select, `FindBySourceID` |
| `internal/repo/sqlite/transactions_test.go` | Create — test `FindBySourceID` |
| `internal/repo/sqlite/peer_debt.go` | Modify — `ConfirmInstallment` tx param, add `UnconfirmInstallment` |
| `internal/repo/sqlite/peer_debt_test.go` | Modify — update schema, add unconfirm tests |
| `internal/repo/sqlite/group_event.go` | Modify — `SetParticipantConfirmed` tx param |
| `internal/repo/sqlite/group_event_test.go` | Modify — update mock + add tx test |
| `internal/service/peer_debt.go` | Modify — inject deps, update `ConfirmInstallment`, add `UnconfirmInstallment` |
| `internal/service/peer_debt_test.go` | Modify — update mocks, add service tests |
| `internal/service/group_event.go` | Modify — inject deps, update `SetParticipantConfirmed`, add `ConfirmParticipant`/`UnconfirmParticipant` |
| `internal/service/group_event_test.go` | Modify — update mocks, add service tests |
| `internal/service/transactions_test.go` | Modify — add `FindBySourceID` to mockTransactionsRepo |
| `internal/app/app.go` | Modify — update service constructors |
| `internal/handler/peer_debt.go` | Modify — add `Unconfirm` handler, update service interface |
| `internal/handler/group_event.go` | Modify — add `ConfirmParticipant`/`UnconfirmParticipant` handlers, update service interface |
| `internal/handler/routes.go` | Modify — register new routes |

---

## Task 1: Migration — add `origin` and `source_id` to Transaction

**Files:**
- Create: `internal/migrations/20260417000001_settlement_origin.go`

- [ ] **Step 1: Write the migration file**

```go
package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upSettlementOrigin, downSettlementOrigin)
}

func upSettlementOrigin(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE "Transaction" ADD COLUMN origin TEXT;`,
		`ALTER TABLE "Transaction" ADD COLUMN source_id TEXT;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downSettlementOrigin(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE "Transaction" RENAME TO Transaction_old;`,
		`CREATE TABLE "Transaction" (
			id TEXT PRIMARY KEY,
			account_id TEXT REFERENCES Account(id),
			amount INTEGER,
			description TEXT,
			category TEXT,
			timestamp TEXT,
			is_recurring BOOLEAN,
			frequency TEXT,
			anchor_date TEXT,
			next_occurrence TEXT
		);`,
		`INSERT INTO "Transaction"
		 (id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence)
		 SELECT id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence
		 FROM Transaction_old;`,
		`DROP TABLE Transaction_old;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
```

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/migrations/...
```
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add internal/migrations/20260417000001_settlement_origin.go
git commit -m "feat: migration — add origin and source_id columns to Transaction"
```

---

## Task 2: Update Transaction struct, repo, and add `FindBySourceID`

**Files:**
- Modify: `internal/repo/sqlite/transactions.go`
- Create: `internal/repo/sqlite/transactions_test.go`

- [ ] **Step 1: Write the failing test for `FindBySourceID`**

Create `internal/repo/sqlite/transactions_test.go`:

```go
package sqlite_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

const transactionSchema = `
CREATE TABLE "Transaction" (
	id TEXT PRIMARY KEY,
	account_id TEXT,
	amount INTEGER,
	description TEXT,
	category TEXT,
	timestamp TEXT,
	is_recurring BOOLEAN,
	frequency TEXT,
	anchor_date TEXT,
	next_occurrence TEXT,
	origin TEXT,
	source_id TEXT
);
`

func TestTransactionsRepo_FindBySourceID(t *testing.T) {
	db := openSQLiteTestDB(t, transactionSchema)
	repo := sqlite.NewSqliteTxnsRepo(db)
	accountID := uuid.New()
	sourceID := uuid.New().String()
	origin := sqlite.TxnOriginPeerDebt

	// Insert two settlement txns with same source_id, and one unrelated txn.
	t1 := sqlite.Transaction{
		ID:        uuid.New(),
		AccountID: accountID,
		Amount:    5000,
		Description: "settlement 1",
		Timestamp: time.Now().UTC().Add(-time.Minute),
		Origin:    &origin,
		SourceID:  &sourceID,
	}
	t2 := sqlite.Transaction{
		ID:        uuid.New(),
		AccountID: accountID,
		Amount:    5000,
		Description: "settlement 2",
		Timestamp: time.Now().UTC(),
		Origin:    &origin,
		SourceID:  &sourceID,
	}
	otherOrigin := sqlite.TxnOriginGroupEvent
	otherSourceID := uuid.New().String()
	t3 := sqlite.Transaction{
		ID:        uuid.New(),
		AccountID: accountID,
		Amount:    1000,
		Description: "unrelated",
		Timestamp: time.Now().UTC(),
		Origin:    &otherOrigin,
		SourceID:  &otherSourceID,
	}

	requireNoErr(t, "insert t1", repo.Insert(t1, nil))
	requireNoErr(t, "insert t2", repo.Insert(t2, nil))
	requireNoErr(t, "insert t3", repo.Insert(t3, nil))

	results, err := repo.FindBySourceID(sourceID, origin)
	requireNoErr(t, "FindBySourceID", err)
	requireLen(t, "results", len(results), 2)

	// First result should be the most recent (t2).
	if results[0].ID != t2.ID {
		t.Fatalf("expected most recent txn first, got %v", results[0].ID)
	}
}
```

- [ ] **Step 2: Run test — expect compilation failure**

```bash
go test ./internal/repo/sqlite/... 2>&1 | head -20
```
Expected: `undefined: sqlite.TxnOriginPeerDebt` or similar compile error.

- [ ] **Step 3: Update `internal/repo/sqlite/transactions.go`**

**3a. Add origin constants after `ValidFrequencies`:**

```go
// TxnOriginPeerDebt identifies a transaction created by confirming a peer debt payment.
const TxnOriginPeerDebt = "peer_debt_settlement"

// TxnOriginGroupEvent identifies a transaction created by confirming a group event participant payment.
const TxnOriginGroupEvent = "group_event_settlement"
```

**3b. Add `Origin` and `SourceID` fields to `Transaction` struct** (after `NextOccurrence`):

```go
Origin   *string    // nil = manual entry; "peer_debt_settlement" | "group_event_settlement"
SourceID *string    // nil = manual; peer_debt.id or "<event_id>:<friend_id>"
```

**3c. Update `TransactionsRepo` interface** — add `FindBySourceID` after `SumUpcomingObligations`:

```go
// FindBySourceID returns all settlement transactions with the given source_id and origin,
// ordered by timestamp DESC (most recent first).
FindBySourceID(sourceID, origin string) ([]Transaction, error)
```

**3d. Update `Insert` method** — change both INSERT SQL statements to include `origin, source_id`:

Replace both occurrences of:
```go
`INSERT INTO "Transaction"
(id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
```
with:
```go
`INSERT INTO "Transaction"
(id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence, origin, source_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
```

Add nullable origin/source_id marshalling before the tx/db Exec calls:
```go
var originVal interface{}
if t.Origin != nil {
    originVal = *t.Origin
}
var sourceIDVal interface{}
if t.SourceID != nil {
    sourceIDVal = *t.SourceID
}
```

Append `originVal, sourceIDVal` to both Exec argument lists.

**3e. Update SELECT queries** in `GetByAccount` and `GetByID` — add `origin, source_id` to the column list:

```sql
SELECT id, account_id, amount, description, category, timestamp,
       is_recurring, frequency, anchor_date, next_occurrence, origin, source_id
FROM "Transaction" WHERE account_id = ?
```

```sql
SELECT id, account_id, amount, description, category, timestamp,
       is_recurring, frequency, anchor_date, next_occurrence, origin, source_id
FROM "Transaction" WHERE id = ?
```

**3f. Update `scanTransaction` and `scanTransactionRow`** — add `origin, sourceID sql.NullString` and scan them:

In `scanTransaction`, replace:
```go
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
```
with:
```go
var idStr, accIDStr, tsStr string
var freq, anchorStr, nextStr, origin, sourceID sql.NullString

err := rows.Scan(
    &idStr, &accIDStr, &t.Amount, &t.Description, &t.Category,
    &tsStr, &t.IsRecurring, &freq, &anchorStr, &nextStr, &origin, &sourceID,
)
if err != nil {
    return t, err
}
return populateTransaction(t, idStr, accIDStr, tsStr, freq, anchorStr, nextStr, origin, sourceID)
```

In `scanTransactionRow`, make the same change.

**3g. Update `populateTransaction` signature and body** — add `origin, sourceID sql.NullString` params and populate the new fields:

```go
func populateTransaction(t Transaction, idStr, accIDStr, tsStr string, freq, anchorStr, nextStr, origin, sourceID sql.NullString) (Transaction, error) {
    // ... existing parse logic unchanged ...
    if origin.Valid {
        t.Origin = &origin.String
    }
    if sourceID.Valid {
        t.SourceID = &sourceID.String
    }
    return t, nil
}
```

**3h. Add `FindBySourceID` implementation** at the end of the file:

```go
func (r *SqliteTxnsRepo) FindBySourceID(sourceID, origin string) ([]Transaction, error) {
    rows, err := r.db.Query(
        `SELECT id, account_id, amount, description, category, timestamp,
                is_recurring, frequency, anchor_date, next_occurrence, origin, source_id
         FROM "Transaction"
         WHERE source_id = ? AND origin = ?
         ORDER BY timestamp DESC`,
        sourceID, origin,
    )
    if err != nil {
        return nil, fmt.Errorf("transactions.FindBySourceID: %w", err)
    }
    defer rows.Close()

    var txns []Transaction
    for rows.Next() {
        t, err := scanTransaction(rows)
        if err != nil {
            return nil, fmt.Errorf("transactions.FindBySourceID: scan: %w", err)
        }
        txns = append(txns, t)
    }
    return txns, rows.Err()
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
go test ./internal/repo/sqlite/... -run TestTransactionsRepo_FindBySourceID -v
```
Expected: `PASS`.

- [ ] **Step 5: Run all repo tests**

```bash
go test ./internal/repo/sqlite/...
```
Expected: `ok`.

- [ ] **Step 6: Add `FindBySourceID` to `mockTransactionsRepo` in `internal/service/transactions_test.go`**

Add the field to `mockTransactionsRepo` struct:
```go
findBySourceIDFn func(sourceID, origin string) ([]sqlite.Transaction, error)
```

Add the method:
```go
func (m *mockTransactionsRepo) FindBySourceID(sourceID, origin string) ([]sqlite.Transaction, error) {
    if m.findBySourceIDFn != nil {
        return m.findBySourceIDFn(sourceID, origin)
    }
    return nil, nil
}
```

- [ ] **Step 7: Verify service tests still pass**

```bash
go test ./internal/service/...
```
Expected: `ok`.

- [ ] **Step 8: Commit**

```bash
git add internal/repo/sqlite/transactions.go internal/repo/sqlite/transactions_test.go internal/service/transactions_test.go
git commit -m "feat: add origin/source_id to Transaction and FindBySourceID repo method"
```

---

## Task 3: Update PeerDebtRepo — tx param for `ConfirmInstallment`, add `UnconfirmInstallment`

**Files:**
- Modify: `internal/repo/sqlite/peer_debt.go`
- Modify: `internal/repo/sqlite/peer_debt_test.go`

- [ ] **Step 1: Write failing tests**

Add to `internal/repo/sqlite/peer_debt_test.go`. The test schema must include the full current PeerDebt schema (already present as `peerDebtSchema`). Append new test functions:

```go
func TestPeerDebtRepo_ConfirmInstallment_WithTx(t *testing.T) {
	db := openSQLiteTestDB(t, peerDebtSchema)
	repo := sqlite.NewSqlitePeerDebtRepo(db)
	accountID := uuid.New()
	friendID := uuid.New()
	debtID := uuid.New()

	_, err := db.Exec(`
		INSERT INTO PeerDebt (id, account_id, friend_id, amount, description, date,
		is_installment, total_installments, paid_installments, frequency, anchor_date, is_confirmed)
		VALUES (?, ?, ?, 5000, 'test', '2026-01-01', 0, NULL, 0, NULL, NULL, 0)`,
		debtID.String(), accountID.String(), friendID.String(),
	)
	requireNoErr(t, "seed", err)

	tx, err := db.Begin()
	requireNoErr(t, "begin", err)

	requireNoErr(t, "confirm", repo.ConfirmInstallment(debtID, tx))
	requireNoErr(t, "commit", tx.Commit())

	var isConfirmed int
	requireNoErr(t, "query", db.QueryRow(
		`SELECT is_confirmed FROM PeerDebt WHERE id = ?`, debtID.String(),
	).Scan(&isConfirmed))
	if isConfirmed != 1 {
		t.Fatalf("expected is_confirmed=1, got %d", isConfirmed)
	}
}

func TestPeerDebtRepo_UnconfirmInstallment_LumpSum(t *testing.T) {
	db := openSQLiteTestDB(t, peerDebtSchema)
	repo := sqlite.NewSqlitePeerDebtRepo(db)
	accountID := uuid.New()
	friendID := uuid.New()
	debtID := uuid.New()

	_, err := db.Exec(`
		INSERT INTO PeerDebt (id, account_id, friend_id, amount, description, date,
		is_installment, total_installments, paid_installments, frequency, anchor_date, is_confirmed)
		VALUES (?, ?, ?, 5000, 'test', '2026-01-01', 0, NULL, 0, NULL, NULL, 1)`,
		debtID.String(), accountID.String(), friendID.String(),
	)
	requireNoErr(t, "seed confirmed", err)

	requireNoErr(t, "unconfirm", repo.UnconfirmInstallment(debtID, nil))

	var isConfirmed int
	requireNoErr(t, "query", db.QueryRow(
		`SELECT is_confirmed FROM PeerDebt WHERE id = ?`, debtID.String(),
	).Scan(&isConfirmed))
	if isConfirmed != 0 {
		t.Fatalf("expected is_confirmed=0, got %d", isConfirmed)
	}
}

func TestPeerDebtRepo_UnconfirmInstallment_Installment(t *testing.T) {
	db := openSQLiteTestDB(t, peerDebtSchema)
	repo := sqlite.NewSqlitePeerDebtRepo(db)
	accountID := uuid.New()
	friendID := uuid.New()
	debtID := uuid.New()

	_, err := db.Exec(`
		INSERT INTO PeerDebt (id, account_id, friend_id, amount, description, date,
		is_installment, total_installments, paid_installments, frequency, anchor_date, is_confirmed)
		VALUES (?, ?, ?, 12000, 'test', '2026-01-01', 1, 3, 2, NULL, NULL, 0)`,
		debtID.String(), accountID.String(), friendID.String(),
	)
	requireNoErr(t, "seed installment", err)

	requireNoErr(t, "unconfirm", repo.UnconfirmInstallment(debtID, nil))

	var paid int
	requireNoErr(t, "query", db.QueryRow(
		`SELECT paid_installments FROM PeerDebt WHERE id = ?`, debtID.String(),
	).Scan(&paid))
	if paid != 1 {
		t.Fatalf("expected paid_installments=1, got %d", paid)
	}
}
```

- [ ] **Step 2: Run tests — expect compile failure**

```bash
go test ./internal/repo/sqlite/... 2>&1 | head -20
```
Expected: `undefined: repo.UnconfirmInstallment` or similar.

- [ ] **Step 3: Update `internal/repo/sqlite/peer_debt.go`**

**3a. Update `PeerDebtRepo` interface** — change `ConfirmInstallment` and add `UnconfirmInstallment`:

```go
// ConfirmInstallment atomically confirms or increments a debt. tx may be nil.
ConfirmInstallment(id uuid.UUID, tx *sql.Tx) error
// UnconfirmInstallment reverses a confirmation: decrements paid_installments or clears is_confirmed.
UnconfirmInstallment(id uuid.UUID, tx *sql.Tx) error
```

**3b. Update `SqlitePeerDebtRepo.ConfirmInstallment`** — add `tx *sql.Tx` param and use it:

```go
func (r *SqlitePeerDebtRepo) ConfirmInstallment(id uuid.UUID, tx *sql.Tx) error {
	q := `UPDATE PeerDebt SET
		    paid_installments = CASE WHEN is_installment = 1
		        THEN MIN(paid_installments + 1, COALESCE(total_installments, paid_installments + 1))
		        ELSE paid_installments END,
		    is_confirmed = CASE WHEN is_installment = 0 THEN 1 ELSE is_confirmed END
		WHERE id = ?`
	var res sql.Result
	var err error
	if tx != nil {
		res, err = tx.Exec(q, id.String())
	} else {
		res, err = r.db.Exec(q, id.String())
	}
	if err != nil {
		return fmt.Errorf("peer_debt.ConfirmInstallment: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("peer_debt.ConfirmInstallment: %w", sql.ErrNoRows)
	}
	return nil
}
```

**3c. Add `UnconfirmInstallment` implementation** after `ConfirmInstallment`:

```go
// UnconfirmInstallment reverses a confirmation atomically.
// For installment debts: decrements paid_installments by 1, floored at 0.
// For non-installment debts: sets is_confirmed = 0.
// Uses a single atomic SQL statement — no read-modify-write race.
func (r *SqlitePeerDebtRepo) UnconfirmInstallment(id uuid.UUID, tx *sql.Tx) error {
	q := `UPDATE PeerDebt SET
		    paid_installments = CASE WHEN is_installment = 1
		        THEN MAX(paid_installments - 1, 0)
		        ELSE paid_installments END,
		    is_confirmed = CASE WHEN is_installment = 0 THEN 0 ELSE is_confirmed END
		WHERE id = ?`
	var res sql.Result
	var err error
	if tx != nil {
		res, err = tx.Exec(q, id.String())
	} else {
		res, err = r.db.Exec(q, id.String())
	}
	if err != nil {
		return fmt.Errorf("peer_debt.UnconfirmInstallment: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("peer_debt.UnconfirmInstallment: %w", sql.ErrNoRows)
	}
	return nil
}
```

- [ ] **Step 4: Update `mockPeerDebtRepo` in `internal/service/peer_debt_test.go`**

Change `confirmInstallmentFn` signature and method:
```go
confirmInstallmentFn   func(id uuid.UUID, tx *sql.Tx) error
unconfirmInstallmentFn func(id uuid.UUID, tx *sql.Tx) error
```

Update `ConfirmInstallment` method:
```go
func (m *mockPeerDebtRepo) ConfirmInstallment(id uuid.UUID, tx *sql.Tx) error {
	if m.confirmInstallmentFn != nil {
		return m.confirmInstallmentFn(id, tx)
	}
	return nil
}
```

Add `UnconfirmInstallment` method:
```go
func (m *mockPeerDebtRepo) UnconfirmInstallment(id uuid.UUID, tx *sql.Tx) error {
	if m.unconfirmInstallmentFn != nil {
		return m.unconfirmInstallmentFn(id, tx)
	}
	return nil
}
```

- [ ] **Step 5: Run all tests**

```bash
go test ./internal/repo/sqlite/... ./internal/service/...
```
Expected: `ok` for both packages.

- [ ] **Step 6: Commit**

```bash
git add internal/repo/sqlite/peer_debt.go internal/repo/sqlite/peer_debt_test.go internal/service/peer_debt_test.go
git commit -m "feat: PeerDebtRepo — add tx param to ConfirmInstallment, add UnconfirmInstallment"
```

---

## Task 4: Update GroupEventRepo — tx param for `SetParticipantConfirmed`

**Files:**
- Modify: `internal/repo/sqlite/group_event.go`
- Modify: `internal/repo/sqlite/group_event_test.go`
- Modify: `internal/service/group_event_test.go`

- [ ] **Step 1: Write failing test**

Add to `internal/repo/sqlite/group_event_test.go`:

```go
func TestGroupEventRepo_SetParticipantConfirmed_WithTx(t *testing.T) {
	// Use the existing groupEventSchema constant already in group_event_test.go.
	db := openSQLiteTestDB(t, groupEventSchema)
	repo := sqlite.NewSqliteGroupEventRepo(db)
	eventID := uuid.New()
	friendID := uuid.New()

	_, err := db.Exec(`INSERT INTO GroupEvent (id, account_id, title, date, total_amount, public_token)
		VALUES (?, ?, 'Pizza', '2026-01-01', 10000, 'tok1')`,
		eventID.String(), uuid.New().String(),
	)
	requireNoErr(t, "seed event", err)
	_, err = db.Exec(`INSERT INTO GroupEventParticipant (event_id, friend_id, share_amount, is_confirmed)
		VALUES (?, ?, 3000, 0)`,
		eventID.String(), friendID.String(),
	)
	requireNoErr(t, "seed participant", err)

	tx, err := db.Begin()
	requireNoErr(t, "begin", err)
	requireNoErr(t, "confirm", repo.SetParticipantConfirmed(eventID, friendID, true, tx))
	requireNoErr(t, "commit", tx.Commit())

	var confirmed int
	requireNoErr(t, "query", db.QueryRow(
		`SELECT is_confirmed FROM GroupEventParticipant WHERE event_id = ? AND friend_id = ?`,
		eventID.String(), friendID.String(),
	).Scan(&confirmed))
	if confirmed != 1 {
		t.Fatalf("expected is_confirmed=1, got %d", confirmed)
	}
}
```

- [ ] **Step 2: Run test — expect compile failure**

```bash
go test ./internal/repo/sqlite/... 2>&1 | head -10
```
Expected: argument count mismatch or similar.

- [ ] **Step 3: Update `internal/repo/sqlite/group_event.go`**

**3a. Update `GroupEventRepo` interface:**
```go
SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool, tx *sql.Tx) error
```

**3b. Update `SqliteGroupEventRepo.SetParticipantConfirmed`** — add `tx *sql.Tx` param:

```go
func (r *SqliteGroupEventRepo) SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool, tx *sql.Tx) error {
	q := `UPDATE GroupEventParticipant SET is_confirmed = ? WHERE event_id = ? AND friend_id = ?`
	var res sql.Result
	var err error
	if tx != nil {
		res, err = tx.Exec(q, isConfirmed, eventID.String(), friendID.String())
	} else {
		res, err = r.db.Exec(q, isConfirmed, eventID.String(), friendID.String())
	}
	if err != nil {
		return fmt.Errorf("group_event.SetParticipantConfirmed: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("group_event.SetParticipantConfirmed: %w", sql.ErrNoRows)
	}
	return nil
}
```

- [ ] **Step 4: Update `mockGroupEventRepo` in `internal/service/group_event_test.go`**

Change `setParticipantConfirmedFn` signature:
```go
setParticipantConfirmedFn func(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool, tx *sql.Tx) error
```

Update the mock method:
```go
func (m *mockGroupEventRepo) SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool, tx *sql.Tx) error {
	if m.setParticipantConfirmedFn != nil {
		return m.setParticipantConfirmedFn(eventID, friendID, isConfirmed, tx)
	}
	return nil
}
```

- [ ] **Step 5: Fix the `GroupEventService.SetParticipantConfirmed` call in `internal/service/group_event.go`**

Update the call to repo to pass `nil` tx (public endpoint path — no transaction needed):
```go
func (s *GroupEventService) SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error {
	if err := s.repo.SetParticipantConfirmed(eventID, friendID, isConfirmed, nil); err != nil {
		return fmt.Errorf("service.SetParticipantConfirmed: %w", err)
	}
	return nil
}
```

- [ ] **Step 6: Run all tests**

```bash
go test ./internal/repo/sqlite/... ./internal/service/...
```
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add internal/repo/sqlite/group_event.go internal/repo/sqlite/group_event_test.go internal/service/group_event.go internal/service/group_event_test.go
git commit -m "feat: GroupEventRepo — add tx param to SetParticipantConfirmed"
```

---

## Task 5: Update `PeerDebtService` — inject deps, update `ConfirmInstallment`, add `UnconfirmInstallment`

**Files:**
- Modify: `internal/service/peer_debt.go`
- Modify: `internal/service/peer_debt_test.go`

- [ ] **Step 1: Write failing service tests**

Add to `internal/service/peer_debt_test.go`:

```go
type mockFriendRepo struct {
	getByIDFn func(id uuid.UUID) (sqlite.Friend, error)
}

func (m *mockFriendRepo) Insert(f sqlite.Friend) error          { return nil }
func (m *mockFriendRepo) GetAll() ([]sqlite.Friend, error)      { return nil, nil }
func (m *mockFriendRepo) GetByID(id uuid.UUID) (sqlite.Friend, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(id)
	}
	return sqlite.Friend{}, sql.ErrNoRows
}
func (m *mockFriendRepo) GetByToken(token string) (sqlite.Friend, error) { return sqlite.Friend{}, nil }
func (m *mockFriendRepo) Update(id uuid.UUID, name *string, notes *string, pixKey *string) error {
	return nil
}
func (m *mockFriendRepo) DeleteByID(id uuid.UUID) error { return nil }

func TestPeerDebtService_ConfirmInstallment_CreatesSettlementTxnAndUpdatesBalance(t *testing.T) {
	db := openTestDB(t)
	debtID := uuid.New()
	friendID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(10000)

	var insertedTxn sqlite.Transaction
	var gotNewBalance int64

	peerDebtRepo := &mockPeerDebtRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.PeerDebt, error) {
			return sqlite.PeerDebt{
				ID:            debtID,
				AccountID:     accountID,
				FriendID:      friendID,
				Amount:        3000,
				Description:   "dinner",
				IsInstallment: false,
			}, nil
		},
		confirmInstallmentFn: func(id uuid.UUID, tx *sql.Tx) error {
			if tx == nil {
				t.Fatal("expected non-nil tx in ConfirmInstallment")
			}
			return nil
		},
	}
	friendRepo := &mockFriendRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Friend, error) {
			return sqlite.Friend{ID: friendID, Name: "Alice"}, nil
		},
	}
	txnsRepo := &mockTransactionsRepo{
		insertFn: func(txn sqlite.Transaction, tx *sql.Tx) error {
			if tx == nil {
				t.Fatal("expected non-nil tx in Insert")
			}
			insertedTxn = txn
			return nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			return sqlite.Account{ID: accountID, CurrentBalance: startingBalance}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			if tx == nil {
				t.Fatal("expected non-nil tx in UpdateBalance")
			}
			gotNewBalance = balance
			return nil
		},
	}

	svc := service.NewPeerDebtService(peerDebtRepo, db, txnsRepo, accRepo, friendRepo)
	if err := svc.ConfirmInstallment(debtID); err != nil {
		t.Fatalf("ConfirmInstallment: %v", err)
	}

	if insertedTxn.Amount != 3000 {
		t.Fatalf("expected settlement amount 3000, got %d", insertedTxn.Amount)
	}
	if insertedTxn.Origin == nil || *insertedTxn.Origin != sqlite.TxnOriginPeerDebt {
		t.Fatalf("expected origin %q, got %v", sqlite.TxnOriginPeerDebt, insertedTxn.Origin)
	}
	if insertedTxn.SourceID == nil || *insertedTxn.SourceID != debtID.String() {
		t.Fatalf("expected source_id %q, got %v", debtID.String(), insertedTxn.SourceID)
	}
	wantDesc := "Friend debt settlement – Alice: dinner"
	if insertedTxn.Description != wantDesc {
		t.Fatalf("expected description %q, got %q", wantDesc, insertedTxn.Description)
	}
	if gotNewBalance != 13000 {
		t.Fatalf("expected new balance 13000, got %d", gotNewBalance)
	}
}

func TestPeerDebtService_UnconfirmInstallment_DeletesTxnAndReversesBalance(t *testing.T) {
	db := openTestDB(t)
	debtID := uuid.New()
	accountID := uuid.New()
	settlementTxnID := uuid.New()
	startingBalance := int64(13000)
	settlementAmount := int64(3000)

	origin := sqlite.TxnOriginPeerDebt
	sourceID := debtID.String()

	var deletedTxnID uuid.UUID
	var gotNewBalance int64

	peerDebtRepo := &mockPeerDebtRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.PeerDebt, error) {
			return sqlite.PeerDebt{ID: debtID, AccountID: accountID}, nil
		},
		unconfirmInstallmentFn: func(id uuid.UUID, tx *sql.Tx) error {
			if tx == nil {
				t.Fatal("expected non-nil tx")
			}
			return nil
		},
	}
	txnsRepo := &mockTransactionsRepo{
		findBySourceIDFn: func(sid, orig string) ([]sqlite.Transaction, error) {
			return []sqlite.Transaction{
				{ID: settlementTxnID, AccountID: accountID, Amount: settlementAmount, Origin: &origin, SourceID: &sourceID},
			}, nil
		},
		deleteByIDFn: func(id uuid.UUID, tx *sql.Tx) error {
			if tx == nil {
				t.Fatal("expected non-nil tx in DeleteByID")
			}
			deletedTxnID = id
			return nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			return sqlite.Account{ID: accountID, CurrentBalance: startingBalance}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			gotNewBalance = balance
			return nil
		},
	}

	svc := service.NewPeerDebtService(peerDebtRepo, db, txnsRepo, accRepo, &mockFriendRepo{})
	if err := svc.UnconfirmInstallment(debtID); err != nil {
		t.Fatalf("UnconfirmInstallment: %v", err)
	}

	if deletedTxnID != settlementTxnID {
		t.Fatalf("expected deleted txn %v, got %v", settlementTxnID, deletedTxnID)
	}
	if gotNewBalance != 10000 {
		t.Fatalf("expected new balance 10000, got %d", gotNewBalance)
	}
}
```

- [ ] **Step 2: Run tests — expect compile failure**

```bash
go test ./internal/service/... 2>&1 | head -20
```
Expected: `service.NewPeerDebtService` wrong argument count.

- [ ] **Step 3: Update `internal/service/peer_debt.go`**

**3a. Update struct and constructor:**

```go
// PeerDebtService handles business logic for peer debts.
type PeerDebtService struct {
	repo       sqlite.PeerDebtRepo
	db         *sql.DB
	txnsRepo   sqlite.TransactionsRepo
	accRepo    sqlite.AccountsRepo
	friendRepo sqlite.FriendRepo
}

// NewPeerDebtService creates a new PeerDebtService.
func NewPeerDebtService(
	repo sqlite.PeerDebtRepo,
	db *sql.DB,
	txnsRepo sqlite.TransactionsRepo,
	accRepo sqlite.AccountsRepo,
	friendRepo sqlite.FriendRepo,
) *PeerDebtService {
	return &PeerDebtService{repo: repo, db: db, txnsRepo: txnsRepo, accRepo: accRepo, friendRepo: friendRepo}
}
```

**3b. Add required imports** — ensure `"database/sql"`, `"fmt"`, `"time"`, `"github.com/google/uuid"` are all present.

**3c. Replace `ConfirmInstallment` method:**

```go
// ConfirmInstallment confirms or increments a peer debt payment, atomically
// creating a settlement transaction and updating the account balance.
func (s *PeerDebtService) ConfirmInstallment(id uuid.UUID) error {
	debt, err := s.repo.GetByID(id)
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: get debt: %w", err)
	}
	friend, err := s.friendRepo.GetByID(debt.FriendID)
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: get friend: %w", err)
	}
	acc, err := s.accRepo.GetByID(debt.AccountID)
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: get account: %w", err)
	}

	amount := debt.Amount
	var desc string
	if debt.IsInstallment && debt.TotalInstallments != nil {
		amount = debt.Amount / *debt.TotalInstallments
		n := debt.PaidInstallments + 1
		desc = fmt.Sprintf("Friend installment %d/%d – %s: %s",
			n, *debt.TotalInstallments, friend.Name, debt.Description)
	} else {
		desc = fmt.Sprintf("Friend debt settlement – %s: %s", friend.Name, debt.Description)
	}

	origin := sqlite.TxnOriginPeerDebt
	sourceID := id.String()
	settlementTxn := sqlite.Transaction{
		ID:          uuid.New(),
		AccountID:   debt.AccountID,
		Amount:      amount,
		Description: desc,
		Timestamp:   time.Now().UTC(),
		Origin:      &origin,
		SourceID:    &sourceID,
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.repo.ConfirmInstallment(id, tx); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: confirm: %w", err)
	}
	if err := s.txnsRepo.Insert(settlementTxn, tx); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: insert txn: %w", err)
	}
	newBalance := acc.CurrentBalance + amount
	if err := s.accRepo.UpdateBalance(debt.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: update balance: %w", err)
	}
	return tx.Commit()
}
```

**3d. Add `UnconfirmInstallment` method** after `ConfirmInstallment`:

```go
// UnconfirmInstallment reverses a peer debt confirmation, atomically deleting
// the most recent settlement transaction and reversing the account balance.
func (s *PeerDebtService) UnconfirmInstallment(id uuid.UUID) error {
	debt, err := s.repo.GetByID(id)
	if err != nil {
		return fmt.Errorf("service.UnconfirmInstallment: get debt: %w", err)
	}
	acc, err := s.accRepo.GetByID(debt.AccountID)
	if err != nil {
		return fmt.Errorf("service.UnconfirmInstallment: get account: %w", err)
	}

	settlements, err := s.txnsRepo.FindBySourceID(id.String(), sqlite.TxnOriginPeerDebt)
	if err != nil {
		return fmt.Errorf("service.UnconfirmInstallment: find settlement: %w", err)
	}
	if len(settlements) == 0 {
		return fmt.Errorf("service.UnconfirmInstallment: no settlement transaction found for debt %v", id)
	}
	settlementTxn := settlements[0] // ordered DESC by timestamp — most recent first

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.UnconfirmInstallment: begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.repo.UnconfirmInstallment(id, tx); err != nil {
		return fmt.Errorf("service.UnconfirmInstallment: unconfirm: %w", err)
	}
	newBalance := acc.CurrentBalance - settlementTxn.Amount
	if err := s.accRepo.UpdateBalance(debt.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.UnconfirmInstallment: update balance: %w", err)
	}
	if err := s.txnsRepo.DeleteByID(settlementTxn.ID, tx); err != nil {
		return fmt.Errorf("service.UnconfirmInstallment: delete txn: %w", err)
	}
	return tx.Commit()
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/service/... -run "TestPeerDebtService" -v
```
Expected: both new tests PASS.

- [ ] **Step 5: Run all tests**

```bash
go test ./...
```
Expected: `ok` everywhere (app.go will fail until Task 7 — that's OK, fix it next).

Actually app.go will fail to compile before Task 7. Run only service + repo tests:
```bash
go test ./internal/repo/sqlite/... ./internal/service/...
```
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add internal/service/peer_debt.go internal/service/peer_debt_test.go
git commit -m "feat: PeerDebtService — atomic confirm/unconfirm with settlement transaction"
```

---

## Task 6: Update `GroupEventService` — inject deps, add `ConfirmParticipant`/`UnconfirmParticipant`

**Files:**
- Modify: `internal/service/group_event.go`
- Modify: `internal/service/group_event_test.go`

- [ ] **Step 1: Write failing service tests**

Add to `internal/service/group_event_test.go`:

```go
func TestGroupEventService_ConfirmParticipant_AdminIsHost_CreditBalance(t *testing.T) {
	db := openTestDB(t)
	eventID := uuid.New()
	friendID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(10000)

	var insertedTxn sqlite.Transaction
	var gotNewBalance int64

	groupRepo := &mockGroupEventRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.GroupEvent, error) {
			return sqlite.GroupEvent{
				ID:           eventID,
				AccountID:    accountID,
				Title:        "Pizza Night",
				HostFriendID: nil, // admin is host
			}, nil
		},
		getParticipantsFn: func(id uuid.UUID) ([]sqlite.GroupEventParticipant, error) {
			return []sqlite.GroupEventParticipant{
				{EventID: eventID, FriendID: &friendID, ShareAmount: 2500, IsConfirmed: false},
			}, nil
		},
		setParticipantConfirmedFn: func(eID uuid.UUID, fID uuid.UUID, confirmed bool, tx *sql.Tx) error {
			if tx == nil {
				t.Fatal("expected non-nil tx")
			}
			return nil
		},
	}
	friendRepo := &mockFriendRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Friend, error) {
			return sqlite.Friend{ID: friendID, Name: "Bob"}, nil
		},
	}
	txnsRepo := &mockTransactionsRepo{
		insertFn: func(txn sqlite.Transaction, tx *sql.Tx) error {
			insertedTxn = txn
			return nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			return sqlite.Account{ID: accountID, CurrentBalance: startingBalance}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			gotNewBalance = balance
			return nil
		},
	}

	svc := service.NewGroupEventService(groupRepo, friendRepo, db, txnsRepo, accRepo)
	if err := svc.ConfirmParticipant(eventID, friendID); err != nil {
		t.Fatalf("ConfirmParticipant: %v", err)
	}

	if insertedTxn.Amount != 2500 {
		t.Fatalf("expected amount 2500 (credit), got %d", insertedTxn.Amount)
	}
	wantDesc := "Group event 'Pizza Night': received Bob's share"
	if insertedTxn.Description != wantDesc {
		t.Fatalf("expected desc %q, got %q", wantDesc, insertedTxn.Description)
	}
	if insertedTxn.Origin == nil || *insertedTxn.Origin != sqlite.TxnOriginGroupEvent {
		t.Fatalf("expected origin %q, got %v", sqlite.TxnOriginGroupEvent, insertedTxn.Origin)
	}
	wantSourceID := eventID.String() + ":" + friendID.String()
	if insertedTxn.SourceID == nil || *insertedTxn.SourceID != wantSourceID {
		t.Fatalf("expected source_id %q, got %v", wantSourceID, insertedTxn.SourceID)
	}
	if gotNewBalance != 12500 {
		t.Fatalf("expected new balance 12500, got %d", gotNewBalance)
	}
}

func TestGroupEventService_UnconfirmParticipant_DeletesTxnAndReversesBalance(t *testing.T) {
	db := openTestDB(t)
	eventID := uuid.New()
	friendID := uuid.New()
	accountID := uuid.New()
	settlementTxnID := uuid.New()
	startingBalance := int64(12500)
	settlementAmount := int64(2500)

	origin := sqlite.TxnOriginGroupEvent
	sourceID := eventID.String() + ":" + friendID.String()

	var deletedTxnID uuid.UUID
	var gotNewBalance int64

	groupRepo := &mockGroupEventRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.GroupEvent, error) {
			return sqlite.GroupEvent{ID: eventID, AccountID: accountID}, nil
		},
		setParticipantConfirmedFn: func(eID uuid.UUID, fID uuid.UUID, confirmed bool, tx *sql.Tx) error {
			return nil
		},
	}
	txnsRepo := &mockTransactionsRepo{
		findBySourceIDFn: func(sid, orig string) ([]sqlite.Transaction, error) {
			return []sqlite.Transaction{
				{ID: settlementTxnID, AccountID: accountID, Amount: settlementAmount, Origin: &origin, SourceID: &sourceID},
			}, nil
		},
		deleteByIDFn: func(id uuid.UUID, tx *sql.Tx) error {
			deletedTxnID = id
			return nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			return sqlite.Account{ID: accountID, CurrentBalance: startingBalance}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			gotNewBalance = balance
			return nil
		},
	}

	svc := service.NewGroupEventService(groupRepo, &mockFriendRepo{}, db, txnsRepo, accRepo)
	if err := svc.UnconfirmParticipant(eventID, friendID); err != nil {
		t.Fatalf("UnconfirmParticipant: %v", err)
	}

	if deletedTxnID != settlementTxnID {
		t.Fatalf("expected deleted txn %v, got %v", settlementTxnID, deletedTxnID)
	}
	if gotNewBalance != 10000 {
		t.Fatalf("expected new balance 10000, got %d", gotNewBalance)
	}
}
```

- [ ] **Step 2: Run tests — expect compile failure**

```bash
go test ./internal/service/... 2>&1 | head -20
```
Expected: `service.NewGroupEventService` wrong argument count.

- [ ] **Step 3: Update `internal/service/group_event.go`**

**3a. Update struct and constructor** — add new deps:

```go
// GroupEventService handles business logic for group events.
type GroupEventService struct {
	repo       sqlite.GroupEventRepo
	friendRepo sqlite.FriendRepo
	db         *sql.DB
	txnsRepo   sqlite.TransactionsRepo
	accRepo    sqlite.AccountsRepo
}

// NewGroupEventService creates a new GroupEventService.
func NewGroupEventService(
	repo sqlite.GroupEventRepo,
	friendRepo sqlite.FriendRepo,
	db *sql.DB,
	txnsRepo sqlite.TransactionsRepo,
	accRepo sqlite.AccountsRepo,
) *GroupEventService {
	return &GroupEventService{repo: repo, friendRepo: friendRepo, db: db, txnsRepo: txnsRepo, accRepo: accRepo}
}
```

**3b. Add required imports** — ensure `"database/sql"`, `"fmt"`, `"time"`, `"github.com/google/uuid"` are present.

**3c. Add `ConfirmParticipant` method:**

```go
// ConfirmParticipant marks a friend participant as paid, atomically creating a
// settlement transaction and updating the account balance.
// Amount direction: admin is host → +share_amount (credit); friend is host → -share_amount (debit).
func (s *GroupEventService) ConfirmParticipant(eventID, friendID uuid.UUID) error {
	event, err := s.repo.GetByID(eventID)
	if err != nil {
		return fmt.Errorf("service.ConfirmParticipant: get event: %w", err)
	}
	participants, err := s.repo.GetParticipants(eventID)
	if err != nil {
		return fmt.Errorf("service.ConfirmParticipant: get participants: %w", err)
	}
	var share int64
	found := false
	for _, p := range participants {
		if p.FriendID != nil && *p.FriendID == friendID {
			share = p.ShareAmount
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("service.ConfirmParticipant: %w", sql.ErrNoRows)
	}
	friend, err := s.friendRepo.GetByID(friendID)
	if err != nil {
		return fmt.Errorf("service.ConfirmParticipant: get friend: %w", err)
	}
	acc, err := s.accRepo.GetByID(event.AccountID)
	if err != nil {
		return fmt.Errorf("service.ConfirmParticipant: get account: %w", err)
	}

	amount := share
	var desc string
	if event.HostFriendID == nil {
		// Admin is host — friend pays admin.
		desc = fmt.Sprintf("Group event '%s': received %s's share", event.Title, friend.Name)
	} else {
		// Friend is host — admin pays friend.
		amount = -share
		desc = fmt.Sprintf("Group event '%s': paid share to %s", event.Title, friend.Name)
	}

	origin := sqlite.TxnOriginGroupEvent
	sourceID := eventID.String() + ":" + friendID.String()
	settlementTxn := sqlite.Transaction{
		ID:          uuid.New(),
		AccountID:   event.AccountID,
		Amount:      amount,
		Description: desc,
		Timestamp:   time.Now().UTC(),
		Origin:      &origin,
		SourceID:    &sourceID,
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.ConfirmParticipant: begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.repo.SetParticipantConfirmed(eventID, friendID, true, tx); err != nil {
		return fmt.Errorf("service.ConfirmParticipant: confirm: %w", err)
	}
	if err := s.txnsRepo.Insert(settlementTxn, tx); err != nil {
		return fmt.Errorf("service.ConfirmParticipant: insert txn: %w", err)
	}
	newBalance := acc.CurrentBalance + amount
	if err := s.accRepo.UpdateBalance(event.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.ConfirmParticipant: update balance: %w", err)
	}
	return tx.Commit()
}
```

**3d. Add `UnconfirmParticipant` method:**

```go
// UnconfirmParticipant reverses a participant payment confirmation, atomically
// deleting the settlement transaction and reversing the account balance.
func (s *GroupEventService) UnconfirmParticipant(eventID, friendID uuid.UUID) error {
	event, err := s.repo.GetByID(eventID)
	if err != nil {
		return fmt.Errorf("service.UnconfirmParticipant: get event: %w", err)
	}
	acc, err := s.accRepo.GetByID(event.AccountID)
	if err != nil {
		return fmt.Errorf("service.UnconfirmParticipant: get account: %w", err)
	}

	sourceID := eventID.String() + ":" + friendID.String()
	settlements, err := s.txnsRepo.FindBySourceID(sourceID, sqlite.TxnOriginGroupEvent)
	if err != nil {
		return fmt.Errorf("service.UnconfirmParticipant: find settlement: %w", err)
	}
	if len(settlements) == 0 {
		return fmt.Errorf("service.UnconfirmParticipant: no settlement transaction found")
	}
	settlementTxn := settlements[0]

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.UnconfirmParticipant: begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.repo.SetParticipantConfirmed(eventID, friendID, false, tx); err != nil {
		return fmt.Errorf("service.UnconfirmParticipant: unconfirm: %w", err)
	}
	newBalance := acc.CurrentBalance - settlementTxn.Amount
	if err := s.accRepo.UpdateBalance(event.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.UnconfirmParticipant: update balance: %w", err)
	}
	if err := s.txnsRepo.DeleteByID(settlementTxn.ID, tx); err != nil {
		return fmt.Errorf("service.UnconfirmParticipant: delete txn: %w", err)
	}
	return tx.Commit()
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/service/... -run "TestGroupEventService" -v
```
Expected: both new tests PASS.

- [ ] **Step 5: Run all service + repo tests**

```bash
go test ./internal/repo/sqlite/... ./internal/service/...
```
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add internal/service/group_event.go internal/service/group_event_test.go
git commit -m "feat: GroupEventService — atomic ConfirmParticipant/UnconfirmParticipant with settlement transaction"
```

---

## Task 7: Wire updated service constructors in `app.go`

**Files:**
- Modify: `internal/app/app.go`

- [ ] **Step 1: Update service constructors**

In `internal/app/app.go`, replace:
```go
peerDebtSvc := service.NewPeerDebtService(iPeerDebtRepo)
groupEventSvc := service.NewGroupEventService(iGroupEvtRepo, iFriendRepo)
```
with:
```go
peerDebtSvc := service.NewPeerDebtService(iPeerDebtRepo, database, iTxnsRepo, iAccRepo, iFriendRepo)
groupEventSvc := service.NewGroupEventService(iGroupEvtRepo, iFriendRepo, database, iTxnsRepo, iAccRepo)
```

- [ ] **Step 2: Build the whole project**

```bash
go build ./...
```
Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
go test ./...
```
Expected: `ok` everywhere.

- [ ] **Step 4: Commit**

```bash
git add internal/app/app.go
git commit -m "feat: wire settlement deps into PeerDebtService and GroupEventService"
```

---

## Task 8: Peer debt handler — add `Unconfirm` endpoint

**Files:**
- Modify: `internal/handler/peer_debt.go`
- Modify: `internal/handler/routes.go`

- [ ] **Step 1: Write failing handler test**

Create `internal/handler/peer_debt_test.go`:

```go
package handler

import (
	"database/sql"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// mockPeerDebtService satisfies PeerDebtServiceIface for handler tests.
type mockPeerDebtService struct {
	confirmFn   func(id uuid.UUID) error
	unconfirmFn func(id uuid.UUID) error
}

func (m *mockPeerDebtService) ListByFriend(friendID uuid.UUID, accountID *uuid.UUID) ([]sqlite.PeerDebt, error) {
	return nil, nil
}
func (m *mockPeerDebtService) ListAll(accountID *uuid.UUID) ([]sqlite.PeerDebt, error) {
	return nil, nil
}
func (m *mockPeerDebtService) CreateDebt(d sqlite.PeerDebt) (sqlite.PeerDebt, error) {
	return sqlite.PeerDebt{}, nil
}
func (m *mockPeerDebtService) UpdateDebt(id uuid.UUID, amount *int64, description *string) error {
	return nil
}
func (m *mockPeerDebtService) DeleteDebt(id uuid.UUID) error { return nil }
func (m *mockPeerDebtService) GetBalanceByFriend(friendID uuid.UUID) (sqlite.PeerDebtBalance, error) {
	return sqlite.PeerDebtBalance{}, nil
}
func (m *mockPeerDebtService) GetGlobalBalance(accountID *uuid.UUID) (sqlite.GlobalPeerBalance, error) {
	return sqlite.GlobalPeerBalance{}, nil
}

func (m *mockPeerDebtService) ConfirmInstallment(id uuid.UUID) error {
	if m.confirmFn != nil {
		return m.confirmFn(id)
	}
	return nil
}

func (m *mockPeerDebtService) UnconfirmInstallment(id uuid.UUID) error {
	if m.unconfirmFn != nil {
		return m.unconfirmFn(id)
	}
	return nil
}

func TestPeerDebtHandler_Unconfirm_Returns204(t *testing.T) {
	debtID := uuid.New()
	var calledWith uuid.UUID

	mock := &mockPeerDebtService{
		unconfirmFn: func(id uuid.UUID) error {
			calledWith = id
			return nil
		},
	}

	h := &PeerDebtHandler{svc: mock}
	rec, c := makeRequest(http.MethodPost, "/api/peer-debts/"+debtID.String()+"/unconfirm", "")
	c.SetParamNames("id")
	c.SetParamValues(debtID.String())

	if err := h.Unconfirm(c); err != nil {
		t.Fatalf("Unconfirm returned error: %v", err)
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if calledWith != debtID {
		t.Fatalf("expected service called with %v, got %v", debtID, calledWith)
	}
}

func TestPeerDebtHandler_Unconfirm_NotFound(t *testing.T) {
	mock := &mockPeerDebtService{
		unconfirmFn: func(id uuid.UUID) error {
			return sql.ErrNoRows
		},
	}

	h := &PeerDebtHandler{svc: mock}
	rec := serveRequest(func(c interface{ Param(string) string }) error {
		return h.Unconfirm(c.(echo.Context))
	}, http.MethodPost, "/api/peer-debts/"+uuid.New().String()+"/unconfirm", "")
	// Use serveRequest variant without the echo.Context type assertion for simplicity:
}
```

Actually, write a simpler not-found test:
```go
func TestPeerDebtHandler_Unconfirm_NotFound(t *testing.T) {
	debtID := uuid.New()
	mock := &mockPeerDebtService{
		unconfirmFn: func(id uuid.UUID) error { return sql.ErrNoRows },
	}
	h := &PeerDebtHandler{svc: mock}
	rec, c := makeRequest(http.MethodPost, "/api/peer-debts/"+debtID.String()+"/unconfirm", "")
	c.SetParamNames("id")
	c.SetParamValues(debtID.String())

	err := h.Unconfirm(c)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	_ = rec
}
```

- [ ] **Step 2: Run test — expect compile failure**

```bash
go test ./internal/handler/... 2>&1 | head -10
```
Expected: `h.Unconfirm undefined` or interface mismatch.

- [ ] **Step 3: Update `internal/handler/peer_debt.go`**

**3a. Update `PeerDebtServiceIface`** — add `UnconfirmInstallment`:

```go
type PeerDebtServiceIface interface {
	// ... existing methods ...
	ConfirmInstallment(id uuid.UUID) error
	UnconfirmInstallment(id uuid.UUID) error
}
```

**3b. Add `Unconfirm` handler method** after `Confirm`:

```go
// Unconfirm handles POST /peer-debts/:id/unconfirm — reverses a peer debt confirmation.
func (h *PeerDebtHandler) Unconfirm(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid peer debt id")
	}
	if err := h.svc.UnconfirmInstallment(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "peer debt not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
```

- [ ] **Step 4: Register route in `internal/handler/routes.go`**

Add after `peerDebts.POST("/:id/confirm", pdh.Confirm)`:
```go
peerDebts.POST("/:id/unconfirm", pdh.Unconfirm)
```

- [ ] **Step 5: Add compile-time interface check to handler file**

After the existing `var _ PeerDebtServiceIface = (*service.PeerDebtService)(nil)` line (if present), ensure it still compiles. If the line doesn't exist, add:
```go
var _ PeerDebtServiceIface = (*service.PeerDebtService)(nil)
```

- [ ] **Step 6: Run tests**

```bash
go test ./internal/handler/... -run TestPeerDebtHandler -v
```
Expected: PASS.

- [ ] **Step 7: Build and run all tests**

```bash
go build ./... && go test ./...
```
Expected: `ok`.

- [ ] **Step 8: Commit**

```bash
git add internal/handler/peer_debt.go internal/handler/peer_debt_test.go internal/handler/routes.go
git commit -m "feat: POST /peer-debts/:id/unconfirm endpoint"
```

---

## Task 9: Group event handler — add `ConfirmParticipant`/`UnconfirmParticipant` endpoints

**Files:**
- Modify: `internal/handler/group_event.go`
- Modify: `internal/handler/routes.go`

- [ ] **Step 1: Write failing handler tests**

Create `internal/handler/group_event_test.go`:

```go
package handler

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// mockGroupEventService satisfies GroupEventServiceIface for handler tests.
type mockGroupEventService struct {
	confirmParticipantFn   func(eventID, friendID uuid.UUID) error
	unconfirmParticipantFn func(eventID, friendID uuid.UUID) error
}

func (m *mockGroupEventService) ListEvents(accountID *uuid.UUID) ([]sqlite.GroupEvent, error) {
	return nil, nil
}
func (m *mockGroupEventService) CreateEvent(accountID uuid.UUID, title, date string, totalAmount int64, notes *string) (sqlite.GroupEvent, error) {
	return sqlite.GroupEvent{}, nil
}
func (m *mockGroupEventService) GetEventByID(id uuid.UUID) (sqlite.GroupEvent, error) {
	return sqlite.GroupEvent{}, nil
}
func (m *mockGroupEventService) GetEventByToken(token string) (sqlite.GroupEvent, error) {
	return sqlite.GroupEvent{}, nil
}
func (m *mockGroupEventService) UpdateEvent(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error {
	return nil
}
func (m *mockGroupEventService) DeleteEvent(id uuid.UUID) error { return nil }
func (m *mockGroupEventService) SetParticipants(eventID uuid.UUID, participants []sqlite.GroupEventParticipant, hostFriendID *uuid.UUID) error {
	return nil
}
func (m *mockGroupEventService) GetParticipants(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error) {
	return nil, nil
}
func (m *mockGroupEventService) EqualSplitAmounts(totalAmount int64, count int) []int64 {
	return nil
}

func (m *mockGroupEventService) ConfirmParticipant(eventID, friendID uuid.UUID) error {
	if m.confirmParticipantFn != nil {
		return m.confirmParticipantFn(eventID, friendID)
	}
	return nil
}

func (m *mockGroupEventService) UnconfirmParticipant(eventID, friendID uuid.UUID) error {
	if m.unconfirmParticipantFn != nil {
		return m.unconfirmParticipantFn(eventID, friendID)
	}
	return nil
}

func TestGroupEventHandler_ConfirmParticipant_Returns204(t *testing.T) {
	eventID := uuid.New()
	friendID := uuid.New()
	var gotEvent, gotFriend uuid.UUID

	mock := &mockGroupEventService{
		confirmParticipantFn: func(eID, fID uuid.UUID) error {
			gotEvent = eID
			gotFriend = fID
			return nil
		},
	}

	h := &GroupEventHandler{svc: mock}
	rec, c := makeRequest(http.MethodPost,
		"/api/group-events/"+eventID.String()+"/participants/"+friendID.String()+"/confirm", "")
	c.SetParamNames("id", "friendId")
	c.SetParamValues(eventID.String(), friendID.String())

	if err := h.ConfirmParticipant(c); err != nil {
		t.Fatalf("ConfirmParticipant error: %v", err)
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if gotEvent != eventID || gotFriend != friendID {
		t.Fatalf("wrong ids passed to service: event=%v friend=%v", gotEvent, gotFriend)
	}
}

func TestGroupEventHandler_UnconfirmParticipant_Returns204(t *testing.T) {
	eventID := uuid.New()
	friendID := uuid.New()

	mock := &mockGroupEventService{
		unconfirmParticipantFn: func(eID, fID uuid.UUID) error { return nil },
	}

	h := &GroupEventHandler{svc: mock}
	rec, c := makeRequest(http.MethodPost,
		"/api/group-events/"+eventID.String()+"/participants/"+friendID.String()+"/unconfirm", "")
	c.SetParamNames("id", "friendId")
	c.SetParamValues(eventID.String(), friendID.String())

	if err := h.UnconfirmParticipant(c); err != nil {
		t.Fatalf("UnconfirmParticipant error: %v", err)
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}
```

- [ ] **Step 2: Run test — expect compile failure**

```bash
go test ./internal/handler/... 2>&1 | head -10
```
Expected: `mockGroupEventService does not implement GroupEventServiceIface` or undefined method.

- [ ] **Step 3: Update `internal/handler/group_event.go`**

**3a. Update `GroupEventServiceIface`** — add the two new methods:

```go
ConfirmParticipant(eventID, friendID uuid.UUID) error
UnconfirmParticipant(eventID, friendID uuid.UUID) error
```

**3b. Add `ConfirmParticipant` handler:**

```go
// ConfirmParticipant handles POST /group-events/:id/participants/:friendId/confirm.
func (h *GroupEventHandler) ConfirmParticipant(c echo.Context) error {
	eventID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid event id")
	}
	friendID, err := uuid.Parse(c.Param("friendId"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid friend id")
	}
	if err := h.svc.ConfirmParticipant(eventID, friendID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "participant not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
```

**3c. Add `UnconfirmParticipant` handler:**

```go
// UnconfirmParticipant handles POST /group-events/:id/participants/:friendId/unconfirm.
func (h *GroupEventHandler) UnconfirmParticipant(c echo.Context) error {
	eventID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid event id")
	}
	friendID, err := uuid.Parse(c.Param("friendId"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid friend id")
	}
	if err := h.svc.UnconfirmParticipant(eventID, friendID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "participant not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
```

**3d. Ensure compile-time interface check exists:**
```go
var _ GroupEventServiceIface = (*service.GroupEventService)(nil)
```

- [ ] **Step 4: Register routes in `internal/handler/routes.go`**

Add after `groupEvents.PUT("/:id/participants", geh.SetParticipants)`:
```go
groupEvents.POST("/:id/participants/:friendId/confirm", geh.ConfirmParticipant)
groupEvents.POST("/:id/participants/:friendId/unconfirm", geh.UnconfirmParticipant)
```

- [ ] **Step 5: Run handler tests**

```bash
go test ./internal/handler/... -run TestGroupEventHandler -v
```
Expected: PASS.

- [ ] **Step 6: Build and run all tests**

```bash
go build ./... && go test ./...
```
Expected: `ok` everywhere.

- [ ] **Step 7: Commit**

```bash
git add internal/handler/group_event.go internal/handler/group_event_test.go internal/handler/routes.go
git commit -m "feat: group event confirm/unconfirm participant endpoints"
```

---

## Done

All tasks complete. Verify final state:

```bash
go build ./... && go test ./...
```

New endpoints:
- `POST /api/peer-debts/:id/confirm` — creates settlement txn + updates balance
- `POST /api/peer-debts/:id/unconfirm` — deletes settlement txn + reverses balance
- `POST /api/group-events/:id/participants/:friendId/confirm` — same for group events
- `POST /api/group-events/:id/participants/:friendId/unconfirm` — same reversal
