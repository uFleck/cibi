package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/google/uuid"
)

// UserProfile stores account-scoped profile configuration.
type UserProfile struct {
	AccountID   uuid.UUID
	DisplayName string
	PixKey      *string
	Theme       string
}

// ProfileRepo defines data access for user profile settings.
type ProfileRepo interface {
	GetByAccount(accountID uuid.UUID) (UserProfile, error)
	UpsertByAccount(accountID uuid.UUID, displayName string, pixKey *string, theme string) error
}

// SqliteProfileRepo implements ProfileRepo against modernc SQLite.
type SqliteProfileRepo struct {
	db *sql.DB
}

func NewSqliteProfileRepo(db *sql.DB) *SqliteProfileRepo {
	return &SqliteProfileRepo{db: db}
}

func (r *SqliteProfileRepo) GetByAccount(accountID uuid.UUID) (UserProfile, error) {
	var p UserProfile
	p.AccountID = accountID
	var pixKey sql.NullString
	err := r.db.QueryRow(
		`SELECT display_name, pix_key, theme FROM AccountProfile WHERE account_id = ?`,
		accountID.String(),
	).Scan(&p.DisplayName, &pixKey, &p.Theme)
	if err != nil {
		return p, fmt.Errorf("profile.GetByAccount: %w", err)
	}
	if pixKey.Valid {
		p.PixKey = &pixKey.String
	}
	return p, nil
}

func (r *SqliteProfileRepo) UpsertByAccount(accountID uuid.UUID, displayName string, pixKey *string, theme string) error {
	_, err := r.db.Exec(
		`INSERT INTO AccountProfile (account_id, display_name, pix_key, theme) VALUES (?, ?, ?, ?)
		 ON CONFLICT(account_id) DO UPDATE SET
		   display_name = excluded.display_name,
		   pix_key      = excluded.pix_key,
		   theme        = excluded.theme`,
		accountID.String(), displayName, pixKey, theme,
	)
	if err != nil {
		return fmt.Errorf("profile.UpsertByAccount: %w", err)
	}
	return nil
}
