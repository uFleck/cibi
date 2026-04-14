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
}

// FriendRepo defines the data access contract for friends.
type FriendRepo interface {
	Insert(f Friend) error
	GetAll() ([]Friend, error)
	GetByID(id uuid.UUID) (Friend, error)
	GetByToken(token string) (Friend, error)
	Update(id uuid.UUID, name *string, notes *string) error
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
	_, err := r.db.Exec(
		`INSERT INTO Friend (id, name, public_token, notes) VALUES (?, ?, ?, ?)`,
		f.ID.String(), f.Name, f.PublicToken, notes,
	)
	if err != nil {
		return fmt.Errorf("friend.Insert: %w", err)
	}
	return nil
}

func (r *SqliteFriendRepo) GetAll() ([]Friend, error) {
	rows, err := r.db.Query(`SELECT id, name, public_token, notes FROM Friend`)
	if err != nil {
		return nil, fmt.Errorf("friend.GetAll: query: %w", err)
	}
	defer rows.Close()

	var friends []Friend
	for rows.Next() {
		var f Friend
		var idStr string
		var notes sql.NullString
		if err := rows.Scan(&idStr, &f.Name, &f.PublicToken, &notes); err != nil {
			return nil, fmt.Errorf("friend.GetAll: scan: %w", err)
		}
		f.ID, err = uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("friend.GetAll: parse uuid: %w", err)
		}
		if notes.Valid {
			f.Notes = &notes.String
		}
		friends = append(friends, f)
	}
	return friends, rows.Err()
}

func (r *SqliteFriendRepo) GetByID(id uuid.UUID) (Friend, error) {
	var f Friend
	var idStr string
	var notes sql.NullString
	err := r.db.QueryRow(
		`SELECT id, name, public_token, notes FROM Friend WHERE id = ?`,
		id.String(),
	).Scan(&idStr, &f.Name, &f.PublicToken, &notes)
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
	return f, nil
}

func (r *SqliteFriendRepo) GetByToken(token string) (Friend, error) {
	var f Friend
	var idStr string
	var notes sql.NullString
	err := r.db.QueryRow(
		`SELECT id, name, public_token, notes FROM Friend WHERE public_token = ?`,
		token,
	).Scan(&idStr, &f.Name, &f.PublicToken, &notes)
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
	return f, nil
}

func (r *SqliteFriendRepo) Update(id uuid.UUID, name *string, notes *string) error {
	if name != nil {
		if _, err := r.db.Exec(`UPDATE Friend SET name = ? WHERE id = ?`, *name, id.String()); err != nil {
			return fmt.Errorf("friend.Update: name: %w", err)
		}
	}
	if notes != nil {
		if _, err := r.db.Exec(`UPDATE Friend SET notes = ? WHERE id = ?`, *notes, id.String()); err != nil {
			return fmt.Errorf("friend.Update: notes: %w", err)
		}
	}
	return nil
}

func (r *SqliteFriendRepo) DeleteByID(id uuid.UUID) error {
	if _, err := r.db.Exec(`DELETE FROM Friend WHERE id = ?`, id.String()); err != nil {
		return fmt.Errorf("friend.DeleteByID: %w", err)
	}
	return nil
}
