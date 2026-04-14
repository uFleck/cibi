package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/google/uuid"
)

// GroupEvent represents a shared expense event (e.g., pizza night).
type GroupEvent struct {
	ID          uuid.UUID
	Title       string
	Date        string  // RFC3339
	TotalAmount int64   // cents
	PublicToken string
	Notes       *string // nullable
}

// GroupEventParticipant represents a participant's share in a group event.
// FriendID nil = host (the user).
type GroupEventParticipant struct {
	EventID     uuid.UUID
	FriendID    *uuid.UUID // nil = host/user row
	ShareAmount int64      // cents
	IsConfirmed bool
}

// GroupEventRepo defines the data access contract for group events.
type GroupEventRepo interface {
	Insert(e GroupEvent) error
	GetAll() ([]GroupEvent, error)
	GetByID(id uuid.UUID) (GroupEvent, error)
	GetByToken(token string) (GroupEvent, error)
	Update(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error
	DeleteByID(id uuid.UUID) error
	SetParticipants(eventID uuid.UUID, participants []GroupEventParticipant) error
	GetParticipants(eventID uuid.UUID) ([]GroupEventParticipant, error)
}

// SqliteGroupEventRepo implements GroupEventRepo against modernc SQLite.
type SqliteGroupEventRepo struct {
	db *sql.DB
}

// NewSqliteGroupEventRepo creates a new SqliteGroupEventRepo.
func NewSqliteGroupEventRepo(db *sql.DB) *SqliteGroupEventRepo {
	return &SqliteGroupEventRepo{db: db}
}

func (r *SqliteGroupEventRepo) Insert(e GroupEvent) error {
	var notes interface{}
	if e.Notes != nil {
		notes = *e.Notes
	}
	_, err := r.db.Exec(
		`INSERT INTO GroupEvent (id, title, date, total_amount, public_token, notes) VALUES (?, ?, ?, ?, ?, ?)`,
		e.ID.String(), e.Title, e.Date, e.TotalAmount, e.PublicToken, notes,
	)
	if err != nil {
		return fmt.Errorf("group_event.Insert: %w", err)
	}
	return nil
}

func (r *SqliteGroupEventRepo) GetAll() ([]GroupEvent, error) {
	rows, err := r.db.Query(`SELECT id, title, date, total_amount, public_token, notes FROM GroupEvent`)
	if err != nil {
		return nil, fmt.Errorf("group_event.GetAll: query: %w", err)
	}
	defer rows.Close()

	var events []GroupEvent
	for rows.Next() {
		var e GroupEvent
		var idStr string
		var notes sql.NullString
		if err := rows.Scan(&idStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes); err != nil {
			return nil, fmt.Errorf("group_event.GetAll: scan: %w", err)
		}
		e.ID, err = uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("group_event.GetAll: parse uuid: %w", err)
		}
		if notes.Valid {
			e.Notes = &notes.String
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (r *SqliteGroupEventRepo) GetByID(id uuid.UUID) (GroupEvent, error) {
	var e GroupEvent
	var idStr string
	var notes sql.NullString
	err := r.db.QueryRow(
		`SELECT id, title, date, total_amount, public_token, notes FROM GroupEvent WHERE id = ?`,
		id.String(),
	).Scan(&idStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByID: %w", err)
	}
	e.ID, err = uuid.Parse(idStr)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByID: parse uuid: %w", err)
	}
	if notes.Valid {
		e.Notes = &notes.String
	}
	return e, nil
}

func (r *SqliteGroupEventRepo) GetByToken(token string) (GroupEvent, error) {
	var e GroupEvent
	var idStr string
	var notes sql.NullString
	err := r.db.QueryRow(
		`SELECT id, title, date, total_amount, public_token, notes FROM GroupEvent WHERE public_token = ?`,
		token,
	).Scan(&idStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByToken: %w", err)
	}
	var parseErr error
	e.ID, parseErr = uuid.Parse(idStr)
	if parseErr != nil {
		return e, fmt.Errorf("group_event.GetByToken: parse uuid: %w", parseErr)
	}
	if notes.Valid {
		e.Notes = &notes.String
	}
	return e, nil
}

func (r *SqliteGroupEventRepo) Update(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("group_event.Update: begin: %w", err)
	}
	defer tx.Rollback()
	rowChecked := false
	if title != nil {
		res, err := tx.Exec(`UPDATE GroupEvent SET title = ? WHERE id = ?`, *title, id.String())
		if err != nil {
			return fmt.Errorf("group_event.Update: title: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fmt.Errorf("group_event.Update: %w", sql.ErrNoRows)
		}
		rowChecked = true
	}
	if date != nil {
		res, err := tx.Exec(`UPDATE GroupEvent SET date = ? WHERE id = ?`, *date, id.String())
		if err != nil {
			return fmt.Errorf("group_event.Update: date: %w", err)
		}
		if !rowChecked {
			if n, _ := res.RowsAffected(); n == 0 {
				return fmt.Errorf("group_event.Update: %w", sql.ErrNoRows)
			}
			rowChecked = true
		}
	}
	if totalAmount != nil {
		res, err := tx.Exec(`UPDATE GroupEvent SET total_amount = ? WHERE id = ?`, *totalAmount, id.String())
		if err != nil {
			return fmt.Errorf("group_event.Update: total_amount: %w", err)
		}
		if !rowChecked {
			if n, _ := res.RowsAffected(); n == 0 {
				return fmt.Errorf("group_event.Update: %w", sql.ErrNoRows)
			}
			rowChecked = true
		}
	}
	if notes != nil {
		res, err := tx.Exec(`UPDATE GroupEvent SET notes = ? WHERE id = ?`, *notes, id.String())
		if err != nil {
			return fmt.Errorf("group_event.Update: notes: %w", err)
		}
		if !rowChecked {
			if n, _ := res.RowsAffected(); n == 0 {
				return fmt.Errorf("group_event.Update: %w", sql.ErrNoRows)
			}
		}
	}
	return tx.Commit()
}

func (r *SqliteGroupEventRepo) DeleteByID(id uuid.UUID) error {
	if _, err := r.db.Exec(`DELETE FROM GroupEvent WHERE id = ?`, id.String()); err != nil {
		return fmt.Errorf("group_event.DeleteByID: %w", err)
	}
	return nil
}

// SetParticipants replaces all participants for an event in a single transaction.
func (r *SqliteGroupEventRepo) SetParticipants(eventID uuid.UUID, participants []GroupEventParticipant) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("group_event.SetParticipants: begin: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM GroupEventParticipant WHERE event_id = ?`, eventID.String()); err != nil {
		tx.Rollback()
		return fmt.Errorf("group_event.SetParticipants: delete: %w", err)
	}

	for _, p := range participants {
		var friendID interface{}
		if p.FriendID != nil {
			friendID = p.FriendID.String()
		}
		if _, err := tx.Exec(
			`INSERT INTO GroupEventParticipant (event_id, friend_id, share_amount, is_confirmed) VALUES (?, ?, ?, ?)`,
			eventID.String(), friendID, p.ShareAmount, p.IsConfirmed,
		); err != nil {
			tx.Rollback()
			return fmt.Errorf("group_event.SetParticipants: insert: %w", err)
		}
	}

	return tx.Commit()
}

func (r *SqliteGroupEventRepo) GetParticipants(eventID uuid.UUID) ([]GroupEventParticipant, error) {
	rows, err := r.db.Query(
		`SELECT event_id, friend_id, share_amount, is_confirmed FROM GroupEventParticipant WHERE event_id = ?`,
		eventID.String(),
	)
	if err != nil {
		return nil, fmt.Errorf("group_event.GetParticipants: query: %w", err)
	}
	defer rows.Close()

	var participants []GroupEventParticipant
	for rows.Next() {
		var p GroupEventParticipant
		var eventIDStr string
		var friendIDStr sql.NullString
		if err := rows.Scan(&eventIDStr, &friendIDStr, &p.ShareAmount, &p.IsConfirmed); err != nil {
			return nil, fmt.Errorf("group_event.GetParticipants: scan: %w", err)
		}
		p.EventID, err = uuid.Parse(eventIDStr)
		if err != nil {
			return nil, fmt.Errorf("group_event.GetParticipants: parse event_id uuid: %w", err)
		}
		if friendIDStr.Valid {
			fid, parseErr := uuid.Parse(friendIDStr.String)
			if parseErr != nil {
				return nil, fmt.Errorf("group_event.GetParticipants: parse friend_id uuid: %w", parseErr)
			}
			p.FriendID = &fid
		}
		participants = append(participants, p)
	}
	return participants, rows.Err()
}
