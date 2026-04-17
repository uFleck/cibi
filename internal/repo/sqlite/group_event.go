package sqlite

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// GroupEvent represents a shared expense event (e.g., pizza night).
type GroupEvent struct {
	ID           uuid.UUID
	AccountID    uuid.UUID
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

// GroupEventBalance holds aggregate pending balances derived from group events.
type GroupEventBalance struct {
	TheyOweAdmin  int64 // sum of unconfirmed friend shares where admin is host
	AdminOwesHost int64 // sum of unconfirmed admin shares where a friend is host
}

// AdminGroupExpense is one pending admin payment in a friend-hosted event.
type AdminGroupExpense struct {
	HostName    string
	ShareAmount int64  // cents
	Date        string // RFC3339 or date-only
}

// GroupEventRepo defines the data access contract for group events.
type GroupEventRepo interface {
	Insert(e GroupEvent) error
	GetAll(accountID *uuid.UUID) ([]GroupEvent, error)
	GetByID(id uuid.UUID) (GroupEvent, error)
	GetByToken(token string) (GroupEvent, error)
	GetByFriend(friendID uuid.UUID) ([]GroupEvent, error)
	Update(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error
	DeleteByID(id uuid.UUID) error
	SetParticipants(eventID uuid.UUID, participants []GroupEventParticipant, hostFriendID *uuid.UUID) error
	SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error
	GetParticipants(eventID uuid.UUID) ([]GroupEventParticipant, error)
	SumUpcomingAdminObligations(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error)
	GetAdminPendingExpenses(accountID *uuid.UUID) ([]AdminGroupExpense, error)
	GetPendingBalanceForAdmin(accountID *uuid.UUID) (GroupEventBalance, error)
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
		`INSERT INTO GroupEvent (id, account_id, title, date, total_amount, public_token, notes, host_friend_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID.String(), e.AccountID.String(), e.Title, e.Date, e.TotalAmount, e.PublicToken, notes, hostFriendID,
	)
	if err != nil {
		return fmt.Errorf("group_event.Insert: %w", err)
	}
	return nil
}

func (r *SqliteGroupEventRepo) GetAll(accountID *uuid.UUID) ([]GroupEvent, error) {
	query := `SELECT id, account_id, title, date, total_amount, public_token, notes, host_friend_id FROM GroupEvent`
	var args []any
	if accountID != nil {
		query += ` WHERE account_id = ?`
		args = []any{accountID.String()}
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("group_event.GetAll: query: %w", err)
	}
	defer rows.Close()

	var events []GroupEvent
	for rows.Next() {
		var e GroupEvent
		var idStr, accountIDStr string
		var notes sql.NullString
		var hostFriendID sql.NullString
		if err := rows.Scan(&idStr, &accountIDStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes, &hostFriendID); err != nil {
			return nil, fmt.Errorf("group_event.GetAll: scan: %w", err)
		}
		e.ID, err = uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("group_event.GetAll: parse uuid: %w", err)
		}
		e.AccountID, err = uuid.Parse(accountIDStr)
		if err != nil {
			return nil, fmt.Errorf("group_event.GetAll: parse account_id uuid: %w", err)
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
	var idStr, accountIDStr string
	var notes sql.NullString
	var hostFriendID sql.NullString
	err := r.db.QueryRow(
		`SELECT id, account_id, title, date, total_amount, public_token, notes, host_friend_id FROM GroupEvent WHERE id = ?`,
		id.String(),
	).Scan(&idStr, &accountIDStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes, &hostFriendID)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByID: %w", err)
	}
	e.ID, err = uuid.Parse(idStr)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByID: parse uuid: %w", err)
	}
	e.AccountID, err = uuid.Parse(accountIDStr)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByID: parse account_id uuid: %w", err)
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
	var idStr, accountIDStr string
	var notes sql.NullString
	var hostFriendID sql.NullString
	err := r.db.QueryRow(
		`SELECT id, account_id, title, date, total_amount, public_token, notes, host_friend_id FROM GroupEvent WHERE public_token = ?`,
		token,
	).Scan(&idStr, &accountIDStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes, &hostFriendID)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByToken: %w", err)
	}
	e.ID, err = uuid.Parse(idStr)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByToken: parse uuid: %w", err)
	}
	e.AccountID, err = uuid.Parse(accountIDStr)
	if err != nil {
		return e, fmt.Errorf("group_event.GetByToken: parse account_id uuid: %w", err)
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
		`SELECT DISTINCT ge.id, ge.account_id, ge.title, ge.date, ge.total_amount, ge.public_token, ge.notes, ge.host_friend_id
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
		var idStr, accountIDStr string
		var notes sql.NullString
		var hostFriendID sql.NullString
		if err := rows.Scan(&idStr, &accountIDStr, &e.Title, &e.Date, &e.TotalAmount, &e.PublicToken, &notes, &hostFriendID); err != nil {
			return nil, fmt.Errorf("group_event.GetByFriend: scan: %w", err)
		}
		parsedID, parseErr := uuid.Parse(idStr)
		if parseErr != nil {
			return nil, fmt.Errorf("group_event.GetByFriend: parse uuid: %w", parseErr)
		}
		e.ID = parsedID
		parsedAccountID, parseErr := uuid.Parse(accountIDStr)
		if parseErr != nil {
			return nil, fmt.Errorf("group_event.GetByFriend: parse account_id uuid: %w", parseErr)
		}
		e.AccountID = parsedAccountID
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
	type updateField struct {
		col string
		val any
	}

	fields := make([]updateField, 0, 4)
	if title != nil {
		fields = append(fields, updateField{col: "title", val: *title})
	}
	if date != nil {
		fields = append(fields, updateField{col: "date", val: *date})
	}
	if totalAmount != nil {
		fields = append(fields, updateField{col: "total_amount", val: *totalAmount})
	}
	if notes != nil {
		fields = append(fields, updateField{col: "notes", val: *notes})
	}
	if len(fields) == 0 {
		return fmt.Errorf("group_event.Update: no fields provided")
	}

	setClauses := make([]string, 0, len(fields))
	args := make([]any, 0, len(fields)+1)
	for _, f := range fields {
		setClauses = append(setClauses, f.col+" = ?")
		args = append(args, f.val)
	}
	args = append(args, id.String())

	query := "UPDATE GroupEvent SET " + strings.Join(setClauses, ", ") + " WHERE id = ?"
	res, err := r.db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("group_event.Update: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("group_event.Update: %w", sql.ErrNoRows)
	}
	return nil
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

func parseGroupEventDate(raw string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t.UTC(), nil
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("unsupported date format")
}

// SumUpcomingAdminObligations returns pending admin->host obligations in [after, onOrBefore).
// Value is negative or zero so it can be added directly in engine purchasing power math.
func (r *SqliteGroupEventRepo) SumUpcomingAdminObligations(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	query := `SELECT ge.date, gep.share_amount
		 FROM GroupEvent ge
		 JOIN GroupEventParticipant gep ON gep.event_id = ge.id
		 WHERE ge.host_friend_id IS NOT NULL
		   AND gep.friend_id IS NULL
		   AND gep.is_confirmed = 0`
	args := []any{}
	if accountID != nil {
		query += ` AND ge.account_id = ?`
		args = append(args, accountID.String())
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return 0, fmt.Errorf("group_event.SumUpcomingAdminObligations: query: %w", err)
	}
	defer rows.Close()

	var sum int64
	for rows.Next() {
		var dateStr string
		var share int64
		if err := rows.Scan(&dateStr, &share); err != nil {
			return 0, fmt.Errorf("group_event.SumUpcomingAdminObligations: scan: %w", err)
		}
		due, err := parseGroupEventDate(dateStr)
		if err != nil {
			continue
		}
		if due.After(after) && due.Before(onOrBefore) {
			sum -= share
		}
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("group_event.SumUpcomingAdminObligations: rows: %w", err)
	}
	return sum, nil
}

// GetAdminPendingExpenses returns all unconfirmed admin shares where a friend is the host.
func (r *SqliteGroupEventRepo) GetAdminPendingExpenses(accountID *uuid.UUID) ([]AdminGroupExpense, error) {
	query := `SELECT f.name, gep.share_amount, ge.date
		 FROM GroupEvent ge
		 JOIN GroupEventParticipant gep ON gep.event_id = ge.id
		 JOIN Friend f ON f.id = ge.host_friend_id
		 WHERE ge.host_friend_id IS NOT NULL
		   AND gep.friend_id IS NULL
		   AND gep.is_confirmed = 0`
	args := []any{}
	if accountID != nil {
		query += ` AND ge.account_id = ?`
		args = append(args, accountID.String())
	}
	query += ` ORDER BY ge.date`

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("group_event.GetAdminPendingExpenses: query: %w", err)
	}
	defer rows.Close()

	result := []AdminGroupExpense{}
	for rows.Next() {
		var item AdminGroupExpense
		if err := rows.Scan(&item.HostName, &item.ShareAmount, &item.Date); err != nil {
			return nil, fmt.Errorf("group_event.GetAdminPendingExpenses: scan: %w", err)
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

// GetPendingBalanceForAdmin aggregates pending group-event balances for the admin.
func (r *SqliteGroupEventRepo) GetPendingBalanceForAdmin(accountID *uuid.UUID) (GroupEventBalance, error) {
	query := `SELECT
		    COALESCE(SUM(CASE
		      WHEN ge.host_friend_id IS NULL AND gep.friend_id IS NOT NULL AND gep.is_confirmed = 0
		      THEN gep.share_amount ELSE 0 END), 0),
		    COALESCE(SUM(CASE
		      WHEN ge.host_friend_id IS NOT NULL AND gep.friend_id IS NULL AND gep.is_confirmed = 0
		      THEN gep.share_amount ELSE 0 END), 0)
		 FROM GroupEvent ge
		 JOIN GroupEventParticipant gep ON gep.event_id = ge.id`
	args := []any{}
	if accountID != nil {
		query += ` WHERE ge.account_id = ?`
		args = append(args, accountID.String())
	}

	var b GroupEventBalance
	err := r.db.QueryRow(query, args...).Scan(&b.TheyOweAdmin, &b.AdminOwesHost)
	if err != nil {
		return b, fmt.Errorf("group_event.GetPendingBalanceForAdmin: %w", err)
	}
	return b, nil
}
