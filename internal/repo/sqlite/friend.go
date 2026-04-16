package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/google/uuid"
)

// Friend represents a friend entity in the database.
type Friend struct {
	ID          uuid.UUID
	Name        string
	PublicToken string
	Notes       *string // nullable
	PixKey      *string // nullable
}

// FriendRepo defines the data access contract for friends.
type FriendRepo interface {
	Insert(f Friend) error
	GetAll() ([]Friend, error)
	GetByID(id uuid.UUID) (Friend, error)
	GetByToken(token string) (Friend, error)
	Update(id uuid.UUID, name *string, notes *string, pixKey *string) error
	DeleteByID(id uuid.UUID) error
}

// SqliteFriendRepo implements FriendRepo against modernc SQLite.
type SqliteFriendRepo struct {
	db *sql.DB
}

// NewSqliteFriendRepo creates a new SqliteFriendRepo.
func NewSqliteFriendRepo(db *sql.DB) *SqliteFriendRepo {
	return &SqliteFriendRepo{db: db}
}

func (r *SqliteFriendRepo) Insert(f Friend) error {
	var notes interface{}
	if f.Notes != nil {
		notes = *f.Notes
	}
	var pixKey interface{}
	if f.PixKey != nil {
		pixKey = *f.PixKey
	}
	_, err := r.db.Exec(
		`INSERT INTO Friend (id, name, public_token, notes, pix_key) VALUES (?, ?, ?, ?, ?)`,
		f.ID.String(), f.Name, f.PublicToken, notes, pixKey,
	)
	if err != nil {
		return fmt.Errorf("friend.Insert: %w", err)
	}
	return nil
}

func (r *SqliteFriendRepo) GetAll() ([]Friend, error) {
	rows, err := r.db.Query(`SELECT id, name, public_token, notes, pix_key FROM Friend`)
	if err != nil {
		return nil, fmt.Errorf("friend.GetAll: query: %w", err)
	}
	defer rows.Close()

	var friends []Friend
	for rows.Next() {
		var f Friend
		var idStr string
		var notes sql.NullString
		var pixKey sql.NullString
		if err := rows.Scan(&idStr, &f.Name, &f.PublicToken, &notes, &pixKey); err != nil {
			return nil, fmt.Errorf("friend.GetAll: scan: %w", err)
		}
		f.ID, err = uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("friend.GetAll: parse uuid: %w", err)
		}
		if notes.Valid {
			f.Notes = &notes.String
		}
		if pixKey.Valid {
			f.PixKey = &pixKey.String
		}
		friends = append(friends, f)
	}
	return friends, rows.Err()
}

func (r *SqliteFriendRepo) GetByID(id uuid.UUID) (Friend, error) {
	var f Friend
	var idStr string
	var notes sql.NullString
	var pixKey sql.NullString
	err := r.db.QueryRow(
		`SELECT id, name, public_token, notes, pix_key FROM Friend WHERE id = ?`,
		id.String(),
	).Scan(&idStr, &f.Name, &f.PublicToken, &notes, &pixKey)
	if err != nil {
		return f, fmt.Errorf("friend.GetByID: %w", err)
	}
	f.ID, err = uuid.Parse(idStr)
	if err != nil {
		return f, fmt.Errorf("friend.GetByID: parse uuid: %w", err)
	}
	if notes.Valid {
		f.Notes = &notes.String
	}
	if pixKey.Valid {
		f.PixKey = &pixKey.String
	}
	return f, nil
}

func (r *SqliteFriendRepo) GetByToken(token string) (Friend, error) {
	var f Friend
	var idStr string
	var notes sql.NullString
	var pixKey sql.NullString
	err := r.db.QueryRow(
		`SELECT id, name, public_token, notes, pix_key FROM Friend WHERE public_token = ?`,
		token,
	).Scan(&idStr, &f.Name, &f.PublicToken, &notes, &pixKey)
	if err != nil {
		return f, fmt.Errorf("friend.GetByToken: %w", err)
	}
	var parseErr error
	f.ID, parseErr = uuid.Parse(idStr)
	if parseErr != nil {
		return f, fmt.Errorf("friend.GetByToken: parse uuid: %w", parseErr)
	}
	if notes.Valid {
		f.Notes = &notes.String
	}
	if pixKey.Valid {
		f.PixKey = &pixKey.String
	}
	return f, nil
}

func (r *SqliteFriendRepo) Update(id uuid.UUID, name *string, notes *string, pixKey *string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("friend.Update: begin: %w", err)
	}
	defer tx.Rollback()
	if name != nil {
		res, err := tx.Exec(`UPDATE Friend SET name = ? WHERE id = ?`, *name, id.String())
		if err != nil {
			return fmt.Errorf("friend.Update: name: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fmt.Errorf("friend.Update: %w", sql.ErrNoRows)
		}
	}
	if notes != nil {
		if _, err := tx.Exec(`UPDATE Friend SET notes = ? WHERE id = ?`, *notes, id.String()); err != nil {
			return fmt.Errorf("friend.Update: notes: %w", err)
		}
	}
	if pixKey != nil {
		if _, err := tx.Exec(`UPDATE Friend SET pix_key = ? WHERE id = ?`, *pixKey, id.String()); err != nil {
			return fmt.Errorf("friend.Update: pix_key: %w", err)
		}
	}
	return tx.Commit()
}

func (r *SqliteFriendRepo) DeleteByID(id uuid.UUID) error {
	if _, err := r.db.Exec(`DELETE FROM Friend WHERE id = ?`, id.String()); err != nil {
		return fmt.Errorf("friend.DeleteByID: %w", err)
	}
	return nil
}
