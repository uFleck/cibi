package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PaySchedule mirrors the PaySchedule schema row.
type PaySchedule struct {
	ID          uuid.UUID
	AccountID   uuid.UUID
	Frequency   string
	AnchorDate  time.Time // UTC
	DayOfMonth2 *int      // nullable
	Label       *string   // nullable
}

// PayScheduleRepo defines the data access contract for pay schedules.
type PayScheduleRepo interface {
	Insert(ps PaySchedule) error
	GetByAccountID(accountID uuid.UUID) (PaySchedule, error)
	UpdateByAccountID(accountID uuid.UUID, ps PaySchedule) error
	DeleteByAccountID(accountID uuid.UUID) error
}

// SqlitePayScheduleRepo implements PayScheduleRepo.
type SqlitePayScheduleRepo struct {
	db *sql.DB
}

// NewSqlitePayScheduleRepo creates a new SqlitePayScheduleRepo.
func NewSqlitePayScheduleRepo(db *sql.DB) *SqlitePayScheduleRepo {
	return &SqlitePayScheduleRepo{db: db}
}

func (r *SqlitePayScheduleRepo) Insert(ps PaySchedule) error {
	var label interface{}
	if ps.Label != nil {
		label = *ps.Label
	}
	var dom2 interface{}
	if ps.DayOfMonth2 != nil {
		dom2 = *ps.DayOfMonth2
	}

	_, err := r.db.Exec(
		`INSERT INTO PaySchedule (id, account_id, frequency, anchor_date, day_of_month2, label)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		ps.ID.String(),
		ps.AccountID.String(),
		ps.Frequency,
		ps.AnchorDate.UTC().Format(time.RFC3339),
		dom2,
		label,
	)
	if err != nil {
		return fmt.Errorf("pay_schedule.Insert: %w", err)
	}
	return nil
}

func (r *SqlitePayScheduleRepo) GetByAccountID(accountID uuid.UUID) (PaySchedule, error) {
	var ps PaySchedule
	var idStr, accIDStr, anchorStr string
	var dom2 sql.NullInt64
	var label sql.NullString

	err := r.db.QueryRow(
		`SELECT id, account_id, frequency, anchor_date, day_of_month2, label
		 FROM PaySchedule WHERE account_id = ?`,
		accountID.String(),
	).Scan(&idStr, &accIDStr, &ps.Frequency, &anchorStr, &dom2, &label)
	if err != nil {
		return ps, fmt.Errorf("pay_schedule.GetByAccountID: %w", err)
	}

	ps.ID, err = uuid.Parse(idStr)
	if err != nil {
		return ps, fmt.Errorf("pay_schedule.GetByAccountID: parse id: %w", err)
	}
	ps.AccountID, err = uuid.Parse(accIDStr)
	if err != nil {
		return ps, fmt.Errorf("pay_schedule.GetByAccountID: parse account_id: %w", err)
	}
	ps.AnchorDate, err = time.Parse(time.RFC3339, anchorStr)
	if err != nil {
		return ps, fmt.Errorf("pay_schedule.GetByAccountID: parse anchor_date: %w", err)
	}
	if dom2.Valid {
		d := int(dom2.Int64)
		ps.DayOfMonth2 = &d
	}
	if label.Valid {
		ps.Label = &label.String
	}
	return ps, nil
}

func (r *SqlitePayScheduleRepo) UpdateByAccountID(accountID uuid.UUID, ps PaySchedule) error {
	var dom2 interface{}
	if ps.DayOfMonth2 != nil {
		dom2 = *ps.DayOfMonth2
	}
	var label interface{}
	if ps.Label != nil {
		label = *ps.Label
	}

	_, err := r.db.Exec(
		`UPDATE PaySchedule
		 SET frequency = ?, anchor_date = ?, day_of_month2 = ?, label = ?
		 WHERE account_id = ?`,
		ps.Frequency,
		ps.AnchorDate.UTC().Format(time.RFC3339),
		dom2,
		label,
		accountID.String(),
	)
	if err != nil {
		return fmt.Errorf("pay_schedule.UpdateByAccountID: %w", err)
	}
	return nil
}

func (r *SqlitePayScheduleRepo) DeleteByAccountID(accountID uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM PaySchedule WHERE account_id = ?`, accountID.String())
	if err != nil {
		return fmt.Errorf("pay_schedule.DeleteByAccountID: %w", err)
	}
	return nil
}
