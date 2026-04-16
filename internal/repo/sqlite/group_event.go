package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/google/uuid"
)

// GroupEvent represents a shared expense event (e.g., pizza night).
type GroupEvent struct {
	ID           uuid.UUID
	Title        string
	Date         string // RFC3339
	TotalAmount  int64  // cents
	PublicToken  string
	Notes        *string // nullable
	HostFriendID *uuid.UUID
}

// GroupEventParticipant represents a participant's share in a group event.
// FriendID nil = app owner/admin.
type GroupEventParticipant struct {
	EventID     uuid.UUID
	FriendID    *uuid.UUID // nil = app owner/admin row
	ShareAmount int64      // cents
	IsConfirmed bool
}

// GroupEventRepo defines the data access contract for group events.
type GroupEventRepo interface {
	Insert(e GroupEvent) error
	GetAll() ([]GroupEvent, error)
	GetByID(id uuid.UUID) (GroupEvent, error)
	GetByToken(token string) (GroupEvent, error)
	GetByFriend(friendID uuid.UUID) ([]GroupEvent, error)
	Update(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error
	DeleteByID(id uuid.UUID) error
	SetParticipants(eventID uuid.UUID, participants []GroupEventParticipant, hostFriendID *uuid.UUID) error
	SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error
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
	var hostFriendID interface{}
	if e.HostFriendID != nil {
		hostFriendID = e.HostFriendID.String()
	}
	_, err := r.db.Exec(
		`INSERT INTO GroupEvent (id, title, date, total_amount, public_token, notes, host_friend_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		e.ID.String(), e.Title, e.Date, e.TotalAmount, e.PublicToken, notes, hostFriendID,
	)
	if err != nil {
		return fmt.Errorf("group_event.Insert: %w", err)
	}
	return nil
}

func (r *SqliteGroupEventRepo) GetAll() ([]GroupEvent, error) {
	rows, err := r.db.Query(`SELECT id, title, date, total_amount, public_token, notes, host_friend_id FROM GroupEvent`)
	if err != nil {
		return nil, fmt.Errorf("group_event.GetAll: query: %w", err)
	}
	defer rows.Close()

	var events []GroupEvent
	for rows.Next() {
		var e GroupEvent
		var idStr string
		var notes sql.NullString
		var hostFriendID sql.NullString
		if err := rows.Scan(&idStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes, &hostFriendID); err != nil {
			return nil, fmt.Errorf("group_event.GetAll: scan: %w", err)
		}
		e.ID, err = uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("group_event.GetAll: parse uuid: %w", err)
		}
		if notes.Valid {
			e.Notes = &notes.String
		}
		if hostFriendID.Valid {
			fid, parseErr := uuid.Parse(hostFriendID.String)
			if parseErr != nil {
				return nil, fmt.Errorf("group_event.GetAll: parse host_friend_id uuid: %w", parseErr)
			}
			e.HostFriendID = &fid
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (r *SqliteGroupEventRepo) GetByID(id uuid.UUID) (GroupEvent, error) {
	var e GroupEvent
	var idStr string
	var notes sql.NullString
	var hostFriendID sql.NullString
	err := r.db.QueryRow(
		`SELECT id, title, date, total_amount, public_token, notes, host_friend_id FROM GroupEvent WHERE id = ?`,
		id.String(),
	).Scan(&idStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes, &hostFriendID)
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
	if hostFriendID.Valid {
		fid, parseErr := uuid.Parse(hostFriendID.String)
		if parseErr != nil {
			return e, fmt.Errorf("group_event.GetByID: parse host_friend_id uuid: %w", parseErr)
		}
		e.HostFriendID = &fid
	}
	return e, nil
}

func (r *SqliteGroupEventRepo) GetByToken(token string) (GroupEvent, error) {
	var e GroupEvent
	var idStr string
	var notes sql.NullString
	var hostFriendID sql.NullString
	err := r.db.QueryRow(
		`SELECT id, title, date, total_amount, public_token, notes, host_friend_id FROM GroupEvent WHERE public_token = ?`,
		token,
	).Scan(&idStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes, &hostFriendID)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByToken: %w", err)
	}
	e.ID, err = uuid.Parse(idStr)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByToken: parse uuid: %w", err)
	}
	if notes.Valid {
		e.Notes = &notes.String
	}
	if hostFriendID.Valid {
		fid, parseErr := uuid.Parse(hostFriendID.String)
		if parseErr != nil {
			return e, fmt.Errorf("group_event.GetByToken: parse host_friend_id uuid: %w", parseErr)
		}
		e.HostFriendID = &fid
	}
	return e, nil
}

func (r *SqliteGroupEventRepo) GetByFriend(friendID uuid.UUID) ([]GroupEvent, error) {
	rows, err := r.db.Query(
		`SELECT DISTINCT ge.id, ge.title, ge.date, ge.total_amount, ge.public_token, ge.notes, ge.host_friend_id
		 FROM GroupEvent ge
		 JOIN GroupEventParticipant gep ON gep.event_id = ge.id
		 WHERE gep.friend_id = ? OR ge.host_friend_id = ?
		 ORDER BY ge.date DESC`,
		friendID.String(), friendID.String(),
	)
	if err != nil {
		return nil, fmt.Errorf("group_event.GetByFriend: query: %w", err)
	}
	defer rows.Close()

	var events []GroupEvent
	for rows.Next() {
		var e GroupEvent
		var idStr string
		var notes sql.NullString
		var hostFriendID sql.NullString
		if err := rows.Scan(&idStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes, &hostFriendID); err != nil {
			return nil, fmt.Errorf("group_event.GetByFriend: scan: %w", err)
		}
		parsedID, parseErr := uuid.Parse(idStr)
		if parseErr != nil {
			return nil, fmt.Errorf("group_event.GetByFriend: parse uuid: %w", parseErr)
		}
		e.ID = parsedID
		if notes.Valid {
			e.Notes = &notes.String
		}
		if hostFriendID.Valid {
			fid, parseErr := uuid.Parse(hostFriendID.String)
			if parseErr != nil {
				return nil, fmt.Errorf("group_event.GetByFriend: parse host_friend_id uuid: %w", parseErr)
			}
			e.HostFriendID = &fid
		}
		events = append(events, e)
	}
	return events, rows.Err()
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
func (r *SqliteGroupEventRepo) SetParticipants(eventID uuid.UUID, participants []GroupEventParticipant, hostFriendID *uuid.UUID) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("group_event.SetParticipants: begin: %w", err)
	}
	defer tx.Rollback()

	// Verify the event exists before modifying participants.
	var exists int
	if err := tx.QueryRow(`SELECT 1 FROM GroupEvent WHERE id = ?`, eventID.String()).Scan(&exists); err != nil {
		return fmt.Errorf("group_event.SetParticipants: %w", sql.ErrNoRows)
	}

	ownerIncluded := false
	if hostFriendID != nil {
		hostIncluded := false
		for _, p := range participants {
			if p.FriendID == nil {
				ownerIncluded = true
			}
			if p.FriendID != nil && *p.FriendID == *hostFriendID {
				hostIncluded = true
			}
		}
		if !hostIncluded {
			return fmt.Errorf("group_event.SetParticipants: host friend must be a participant")
		}
	} else {
		for _, p := range participants {
			if p.FriendID == nil {
				ownerIncluded = true
				break
			}
		}
	}
	if !ownerIncluded {
		return fmt.Errorf("group_event.SetParticipants: owner/admin must always be a participant")
	}

	var hostValue interface{}
	if hostFriendID != nil {
		hostValue = hostFriendID.String()
	}
	if _, err := tx.Exec(`UPDATE GroupEvent SET host_friend_id = ? WHERE id = ?`, hostValue, eventID.String()); err != nil {
		return fmt.Errorf("group_event.SetParticipants: update host: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM GroupEventParticipant WHERE event_id = ?`, eventID.String()); err != nil {
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
			return fmt.Errorf("group_event.SetParticipants: insert: %w", err)
		}
	}

	return tx.Commit()
}

func (r *SqliteGroupEventRepo) SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error {
	res, err := r.db.Exec(
		`UPDATE GroupEventParticipant SET is_confirmed = ? WHERE event_id = ? AND friend_id = ?`,
		isConfirmed, eventID.String(), friendID.String(),
	)
	if err != nil {
		return fmt.Errorf("group_event.SetParticipantConfirmed: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("group_event.SetParticipantConfirmed: %w", sql.ErrNoRows)
	}
	return nil
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
