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
