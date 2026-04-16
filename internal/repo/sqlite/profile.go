package sqlite

import (
	"database/sql"
	"fmt"
)

// UserProfile stores single-user configuration.
type UserProfile struct {
	DisplayName string
	PixKey      *string
}

// ProfileRepo defines data access for user profile settings.
type ProfileRepo interface {
	Get() (UserProfile, error)
	Upsert(displayName string, pixKey *string) error
}

// SqliteProfileRepo implements ProfileRepo against modernc SQLite.
type SqliteProfileRepo struct {
	db *sql.DB
}

func NewSqliteProfileRepo(db *sql.DB) *SqliteProfileRepo {
	return &SqliteProfileRepo{db: db}
}

func (r *SqliteProfileRepo) Get() (UserProfile, error) {
	var p UserProfile
	var pixKey sql.NullString
	err := r.db.QueryRow(`SELECT display_name, pix_key FROM UserProfile WHERE id = 1`).Scan(&p.DisplayName, &pixKey)
	if err != nil {
		return p, fmt.Errorf("profile.Get: %w", err)
	}
	if pixKey.Valid {
		p.PixKey = &pixKey.String
	}
	return p, nil
}

func (r *SqliteProfileRepo) Upsert(displayName string, pixKey *string) error {
	_, err := r.db.Exec(
		`INSERT INTO UserProfile (id, display_name, pix_key) VALUES (1, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, pix_key = excluded.pix_key`,
		displayName, pixKey,
	)
	if err != nil {
		return fmt.Errorf("profile.Upsert: %w", err)
	}
	return nil
}
