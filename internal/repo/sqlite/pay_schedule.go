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
	Amount      int64     // cents
}

// PayScheduleRepo defines the data access contract for pay schedules.
type PayScheduleRepo interface {
	Insert(ps PaySchedule) error
	ListByAccountID(accountID uuid.UUID) ([]PaySchedule, error)
	UpdateByID(id uuid.UUID, ps PaySchedule) error
	DeleteByID(id uuid.UUID) error
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
		`INSERT INTO PaySchedule (id, account_id, frequency, anchor_date, day_of_month2, label, amount)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		ps.ID.String(),
		ps.AccountID.String(),
		ps.Frequency,
		ps.AnchorDate.UTC().Format(time.RFC3339),
		dom2,
		label,
		ps.Amount,
	)
	if err != nil {
		return fmt.Errorf("pay_schedule.Insert: %w", err)
	}
	return nil
}

func (r *SqlitePayScheduleRepo) ListByAccountID(accountID uuid.UUID) ([]PaySchedule, error) {
	rows, err := r.db.Query(
		`SELECT id, account_id, frequency, anchor_date, day_of_month2, label, amount
		 FROM PaySchedule WHERE account_id = ?
		 ORDER BY anchor_date ASC`,
		accountID.String(),
	)
	if err != nil {
		return nil, fmt.Errorf("pay_schedule.ListByAccountID: %w", err)
	}
	defer rows.Close()

	var schedules []PaySchedule
	for rows.Next() {
		var ps PaySchedule
		var idStr, accIDStr, anchorStr string
		var dom2 sql.NullInt64
		var label sql.NullString

		if err := rows.Scan(&idStr, &accIDStr, &ps.Frequency, &anchorStr, &dom2, &label, &ps.Amount); err != nil {
			return nil, fmt.Errorf("pay_schedule.ListByAccountID: scan: %w", err)
		}

		ps.ID, err = uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("pay_schedule.ListByAccountID: parse id: %w", err)
		}
		ps.AccountID, err = uuid.Parse(accIDStr)
		if err != nil {
			return nil, fmt.Errorf("pay_schedule.ListByAccountID: parse account_id: %w", err)
		}
		ps.AnchorDate, err = time.Parse(time.RFC3339, anchorStr)
		if err != nil {
			return nil, fmt.Errorf("pay_schedule.ListByAccountID: parse anchor_date: %w", err)
		}
		if dom2.Valid {
			d := int(dom2.Int64)
			ps.DayOfMonth2 = &d
		}
		if label.Valid {
			ps.Label = &label.String
		}
		schedules = append(schedules, ps)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("pay_schedule.ListByAccountID: rows: %w", err)
	}
	if schedules == nil {
		schedules = []PaySchedule{}
	}
	return schedules, nil
}

func (r *SqlitePayScheduleRepo) UpdateByID(id uuid.UUID, ps PaySchedule) error {
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
		 SET frequency = ?, anchor_date = ?, day_of_month2 = ?, label = ?, amount = ?
		 WHERE id = ?`,
		ps.Frequency,
		ps.AnchorDate.UTC().Format(time.RFC3339),
		dom2,
		label,
		ps.Amount,
		id.String(),
	)
	if err != nil {
		return fmt.Errorf("pay_schedule.UpdateByID: %w", err)
	}
	return nil
}

func (r *SqlitePayScheduleRepo) DeleteByID(id uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM PaySchedule WHERE id = ?`, id.String())
	if err != nil {
		return fmt.Errorf("pay_schedule.DeleteByID: %w", err)
	}
	return nil
}
