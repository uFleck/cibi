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
	TransactionID *uuid.UUID
	PayScheduleID *uuid.UUID
	EntryType     string
	Amount        int64
	Description   string
	PostedAt      time.Time
}

// LedgerRepo defines the data access contract for ledger entries.
type LedgerRepo interface {
	Insert(e LedgerEntry, tx *sql.Tx) error
	ListByAccount(accountID uuid.UUID) ([]LedgerEntry, error)
	DeleteByID(id uuid.UUID, tx *sql.Tx) error
	FindByTransactionID(txnID uuid.UUID) (*LedgerEntry, error)
	FindByID(id uuid.UUID) (*LedgerEntry, error)
	SumByAccount(accountID uuid.UUID, tx *sql.Tx) (int64, error)
	UpdateAmount(id uuid.UUID, amount int64, tx *sql.Tx) error
}

// SqliteLedgerRepo implements LedgerRepo.
type SqliteLedgerRepo struct {
	db *sql.DB
}

func NewSqliteLedgerRepo(db *sql.DB) *SqliteLedgerRepo {
	return &SqliteLedgerRepo{db: db}
}

func (r *SqliteLedgerRepo) Insert(e LedgerEntry, tx *sql.Tx) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
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
	rows, err := r.db.Query(`SELECT id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at
		FROM ledger WHERE account_id = ? ORDER BY posted_at ASC`, accountID.String())
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
	var err error
	if tx != nil {
		_, err = tx.Exec(`DELETE FROM ledger WHERE id = ?`, id.String())
	} else {
		_, err = r.db.Exec(`DELETE FROM ledger WHERE id = ?`, id.String())
	}
	if err != nil {
		return fmt.Errorf("ledger.DeleteByID: %w", err)
	}
	return nil
}

func (r *SqliteLedgerRepo) FindByTransactionID(txnID uuid.UUID) (*LedgerEntry, error) {
	row := r.db.QueryRow(`SELECT id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at
		FROM ledger WHERE transaction_id = ? LIMIT 1`, txnID.String())
	e, err := scanLedgerRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ledger.FindByTransactionID: %w", err)
	}
	return &e, nil
}

func (r *SqliteLedgerRepo) FindByID(id uuid.UUID) (*LedgerEntry, error) {
	row := r.db.QueryRow(`SELECT id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at
		FROM ledger WHERE id = ?`, id.String())
	e, err := scanLedgerRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ledger.FindByID: %w", err)
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

func (r *SqliteLedgerRepo) UpdateAmount(id uuid.UUID, amount int64, tx *sql.Tx) error {
	var err error
	if tx != nil {
		_, err = tx.Exec(`UPDATE ledger SET amount = ? WHERE id = ?`, amount, id.String())
	} else {
		_, err = r.db.Exec(`UPDATE ledger SET amount = ? WHERE id = ?`, amount, id.String())
	}
	if err != nil {
		return fmt.Errorf("ledger.UpdateAmount: %w", err)
	}
	return nil
}

type ledgerScanner interface {
	Scan(dest ...any) error
}

func scanLedgerEntry(s *sql.Rows) (LedgerEntry, error) {
	return scanLedger(s)
}

func scanLedgerRow(s *sql.Row) (LedgerEntry, error) {
	return scanLedger(s)
}

func scanLedger(s ledgerScanner) (LedgerEntry, error) {
	var e LedgerEntry
	var idStr, accIDStr, postedStr, entryType, desc string
	var txnIDStr, psIDStr sql.NullString
	var amount int64
	err := s.Scan(&idStr, &accIDStr, &txnIDStr, &psIDStr, &entryType, &amount, &desc, &postedStr)
	if err != nil {
		return e, err
	}
	e.ID, err = uuid.Parse(idStr)
	if err != nil {
		return e, fmt.Errorf("parse id: %w", err)
	}
	e.AccountID, err = uuid.Parse(accIDStr)
	if err != nil {
		return e, fmt.Errorf("parse account_id: %w", err)
	}
	if txnIDStr.Valid {
		id, err := uuid.Parse(txnIDStr.String)
		if err != nil {
			return e, fmt.Errorf("parse transaction_id: %w", err)
		}
		e.TransactionID = &id
	}
	if psIDStr.Valid {
		id, err := uuid.Parse(psIDStr.String)
		if err != nil {
			return e, fmt.Errorf("parse pay_schedule_id: %w", err)
		}
		e.PayScheduleID = &id
	}
	e.EntryType = entryType
	e.Amount = amount
	e.Description = desc
	e.PostedAt, err = time.Parse(time.RFC3339, postedStr)
	if err != nil {
		return e, fmt.Errorf("parse posted_at: %w", err)
	}
	return e, nil
}
