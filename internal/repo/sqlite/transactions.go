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
	"biweekly":  true, // legacy alias from older web clients
	"monthly":   true,
	"yearly":    true,
}

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
}

// UpdateTransaction holds the fields that can be updated on a transaction.
type UpdateTransaction struct {
	Description    *string
	Category       *string
	Amount         *int64
	NextOccurrence *time.Time
	Timestamp      *time.Time
}

// SqliteTxnsRepo implements TransactionsRepo.
type SqliteTxnsRepo struct {
	db *sql.DB
}

func NewSqliteTxnsRepo(db *sql.DB) *SqliteTxnsRepo { return &SqliteTxnsRepo{db: db} }

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
	var err error
	q := `INSERT INTO "Transaction"
			(id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	args := []any{t.ID.String(), t.AccountID.String(), t.Amount, t.Description, t.Category, t.Timestamp.UTC().Format(time.RFC3339), t.IsRecurring, freq, anchorStr, nextStr, t.RequiresConfirmation, nil}
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

func (r *SqliteTxnsRepo) GetByAccount(accountID uuid.UUID) ([]Transaction, error) {
	rows, err := r.db.Query(`SELECT id, account_id, amount, description, category, timestamp,
			is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at
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

func (r *SqliteTxnsRepo) GetByID(id uuid.UUID) (Transaction, error) {
	row := r.db.QueryRow(`SELECT id, account_id, amount, description, category, timestamp,
			is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, confirmed_at
		FROM "Transaction" WHERE id = ?`, id.String())
	t, err := scanTransactionRow(row)
	if err != nil {
		return t, fmt.Errorf("transactions.GetByID: %w", err)
	}
	return t, nil
}

func (r *SqliteTxnsRepo) Update(id uuid.UUID, upd UpdateTransaction, tx *sql.Tx) error {
	exec := func(q string, args ...any) error {
		var err error
		if tx != nil {
			_, err = tx.Exec(q, args...)
		} else {
			_, err = r.db.Exec(q, args...)
		}
		return err
	}
	if upd.Description != nil {
		if err := exec(`UPDATE "Transaction" SET description = ? WHERE id = ?`, *upd.Description, id.String()); err != nil {
			return fmt.Errorf("transactions.Update description: %w", err)
		}
	}
	if upd.Category != nil {
		if err := exec(`UPDATE "Transaction" SET category = ? WHERE id = ?`, *upd.Category, id.String()); err != nil {
			return fmt.Errorf("transactions.Update category: %w", err)
		}
	}
	if upd.Amount != nil {
		if err := exec(`UPDATE "Transaction" SET amount = ? WHERE id = ?`, *upd.Amount, id.String()); err != nil {
			return fmt.Errorf("transactions.Update amount: %w", err)
		}
	}
	if upd.NextOccurrence != nil {
		nextStr := upd.NextOccurrence.UTC().Format(time.RFC3339)
		if err := exec(`UPDATE "Transaction" SET next_occurrence = ? WHERE id = ?`, nextStr, id.String()); err != nil {
			return fmt.Errorf("transactions.Update next_occurrence: %w", err)
		}
	}
	if upd.Timestamp != nil {
		tsStr := upd.Timestamp.UTC().Format(time.RFC3339)
		if err := exec(`UPDATE "Transaction" SET timestamp = ? WHERE id = ?`, tsStr, id.String()); err != nil {
			return fmt.Errorf("transactions.Update timestamp: %w", err)
		}
	}
	return nil
}

func (r *SqliteTxnsRepo) DeleteByID(id uuid.UUID, tx *sql.Tx) error {
	var err error
	if tx != nil {
		_, err = tx.Exec(`DELETE FROM "Transaction" WHERE id = ?`, id.String())
	} else {
		_, err = r.db.Exec(`DELETE FROM "Transaction" WHERE id = ?`, id.String())
	}
	if err != nil {
		return fmt.Errorf("transactions.DeleteByID: %w", err)
	}
	return nil
}

func (r *SqliteTxnsRepo) AdvanceNextOccurrence(id uuid.UUID, next time.Time, tx *sql.Tx) error {
	nextStr := next.UTC().Format(time.RFC3339)
	var err error
	if tx != nil {
		_, err = tx.Exec(`UPDATE "Transaction" SET next_occurrence = ? WHERE id = ?`, nextStr, id.String())
	} else {
		_, err = r.db.Exec(`UPDATE "Transaction" SET next_occurrence = ? WHERE id = ?`, nextStr, id.String())
	}
	if err != nil {
		return fmt.Errorf("transactions.AdvanceNextOccurrence: %w", err)
	}
	return nil
}

func (r *SqliteTxnsRepo) MarkConfirmed(id uuid.UUID, confirmedAt time.Time, tx *sql.Tx) error {
	confirmedStr := confirmedAt.UTC().Format(time.RFC3339)
	var err error
	if tx != nil {
		_, err = tx.Exec(`UPDATE "Transaction" SET confirmed_at = ?, requires_confirmation = 0 WHERE id = ?`, confirmedStr, id.String())
	} else {
		_, err = r.db.Exec(`UPDATE "Transaction" SET confirmed_at = ?, requires_confirmation = 0 WHERE id = ?`, confirmedStr, id.String())
	}
	if err != nil {
		return fmt.Errorf("transactions.MarkConfirmed: %w", err)
	}
	return nil
}

func (r *SqliteTxnsRepo) SumUpcomingObligations(accountID uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	_ = after
	onOrBeforeStr := onOrBefore.UTC().Format(time.RFC3339)
	var sum int64
	err := r.db.QueryRow(`SELECT COALESCE(SUM(amount), 0)
		FROM "Transaction"
		WHERE account_id = ?
		AND (
			(is_recurring = 1 AND next_occurrence < ?)
			OR (is_recurring = 0 AND requires_confirmation = 1 AND confirmed_at IS NULL AND COALESCE(anchor_date, timestamp) < ?)
		)`, accountID.String(), onOrBeforeStr, onOrBeforeStr).Scan(&sum)
	if err != nil {
		return 0, fmt.Errorf("transactions.SumUpcomingObligations: %w", err)
	}
	return sum, nil
}

func scanTransaction(rows *sql.Rows) (Transaction, error) {
	var t Transaction
	var idStr, accIDStr, tsStr string
	var freq, anchorStr, nextStr, confirmedStr sql.NullString
	err := rows.Scan(&idStr, &accIDStr, &t.Amount, &t.Description, &t.Category, &tsStr, &t.IsRecurring, &freq, &anchorStr, &nextStr, &t.RequiresConfirmation, &confirmedStr)
	if err != nil {
		return t, err
	}
	return populateTransaction(t, idStr, accIDStr, tsStr, freq, anchorStr, nextStr, confirmedStr)
}

func scanTransactionRow(row *sql.Row) (Transaction, error) {
	var t Transaction
	var idStr, accIDStr, tsStr string
	var freq, anchorStr, nextStr, confirmedStr sql.NullString
	err := row.Scan(&idStr, &accIDStr, &t.Amount, &t.Description, &t.Category, &tsStr, &t.IsRecurring, &freq, &anchorStr, &nextStr, &t.RequiresConfirmation, &confirmedStr)
	if err != nil {
		return t, err
	}
	return populateTransaction(t, idStr, accIDStr, tsStr, freq, anchorStr, nextStr, confirmedStr)
}

func populateTransaction(t Transaction, idStr, accIDStr, tsStr string, freq, anchorStr, nextStr, confirmedStr sql.NullString) (Transaction, error) {
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
	if confirmedStr.Valid {
		ts, err := time.Parse(time.RFC3339, confirmedStr.String)
		if err != nil {
			return t, fmt.Errorf("parse confirmed_at: %w", err)
		}
		t.ConfirmedAt = &ts
	}
	return t, nil
}
