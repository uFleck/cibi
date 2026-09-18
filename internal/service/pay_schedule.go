package service

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/engine"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// PayScheduleService handles business logic for pay schedules.
type PayScheduleService struct {
	db        *sql.DB
	psRepo    sqlite.PayScheduleRepo
	accRepo   sqlite.AccountsRepo
	ledgerSvc *LedgerService
}

// NewPayScheduleService creates a new PayScheduleService.
func NewPayScheduleService(db *sql.DB, psRepo sqlite.PayScheduleRepo, accRepo sqlite.AccountsRepo, ledgerSvc *LedgerService) *PayScheduleService {
	return &PayScheduleService{
		db:        db,
		psRepo:    psRepo,
		accRepo:   accRepo,
		ledgerSvc: ledgerSvc,
	}
}

// CreatePaySchedule validates account exists, generates UUID, and inserts a new pay schedule.
func (s *PayScheduleService) CreatePaySchedule(
	accountID uuid.UUID,
	frequency string,
	anchorDate time.Time,
	dayOfMonth2 *int,
	label *string,
	amount int64,
) (sqlite.PaySchedule, error) {
	if _, err := s.accRepo.GetByID(accountID); err != nil {
		return sqlite.PaySchedule{}, fmt.Errorf("service.CreatePaySchedule: account not found: %w", err)
	}

	ps := sqlite.PaySchedule{
		ID:          uuid.New(),
		AccountID:   accountID,
		Frequency:   frequency,
		AnchorDate:  anchorDate.UTC(),
		DayOfMonth2: dayOfMonth2,
		Label:       label,
		Amount:      amount,
	}

	if err := s.psRepo.Insert(ps); err != nil {
		return sqlite.PaySchedule{}, fmt.Errorf("service.CreatePaySchedule: insert: %w", err)
	}
	return ps, nil
}

// ListPaySchedules returns all schedules for an account (empty slice if none).
func (s *PayScheduleService) ListPaySchedules(accountID uuid.UUID) ([]sqlite.PaySchedule, error) {
	schedules, err := s.psRepo.ListByAccountID(accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListPaySchedules: %w", err)
	}
	return schedules, nil
}

// UpdatePaySchedule updates an existing schedule by its own UUID.
func (s *PayScheduleService) UpdatePaySchedule(
	id uuid.UUID,
	frequency string,
	anchorDate time.Time,
	dayOfMonth2 *int,
	label *string,
	amount int64,
) error {
	ps := sqlite.PaySchedule{
		Frequency:   frequency,
		AnchorDate:  anchorDate.UTC(),
		DayOfMonth2: dayOfMonth2,
		Label:       label,
		Amount:      amount,
	}
	if err := s.psRepo.UpdateByID(id, ps); err != nil {
		return fmt.Errorf("service.UpdatePaySchedule: %w", err)
	}
	return nil
}

// DeletePaySchedule deletes a schedule by its own UUID.
func (s *PayScheduleService) DeletePaySchedule(id uuid.UUID) error {
	if err := s.psRepo.DeleteByID(id); err != nil {
		return fmt.Errorf("service.DeletePaySchedule: %w", err)
	}
	return nil
}

// ConfirmPayday confirms a schedule payout: credits account balance by schedule amount
// and advances schedule anchor_date by one occurrence.
func (s *PayScheduleService) ConfirmPayday(id uuid.UUID) (sqlite.PaySchedule, error) {
	ps, err := s.psRepo.GetByID(id)
	if err != nil {
		return sqlite.PaySchedule{}, fmt.Errorf("service.ConfirmPayday: get schedule: %w", err)
	}

	acc, err := s.accRepo.GetByID(ps.AccountID)
	if err != nil {
		return sqlite.PaySchedule{}, fmt.Errorf("service.ConfirmPayday: get account: %w", err)
	}

	ep := engine.PaySchedule{
		Frequency:   ps.Frequency,
		AnchorDate:  ps.AnchorDate,
		DayOfMonth2: ps.DayOfMonth2,
	}
	upcoming := engine.NextPayday(ep, time.Now().UTC())
	nextAfterUpcoming := engine.NextPayday(ep, upcoming)

	tx, err := s.db.Begin()
	if err != nil {
		return sqlite.PaySchedule{}, fmt.Errorf("service.ConfirmPayday: begin tx: %w", err)
	}
	defer tx.Rollback()

	label := ps.ID.String()
	if ps.Label != nil {
		label = *ps.Label
	}
	if err := s.ledgerSvc.RecordEntry(sqlite.LedgerEntry{
		AccountID:     acc.ID,
		PayScheduleID: &ps.ID,
		EntryType:     "income",
		Amount:        ps.Amount,
		Description:   label,
		PostedAt:      time.Now().UTC(),
	}, tx); err != nil {
		return sqlite.PaySchedule{}, fmt.Errorf("service.ConfirmPayday: record income: %w", err)
	}

	if err := s.psRepo.UpdateAnchorDate(ps.ID, nextAfterUpcoming, tx); err != nil {
		return sqlite.PaySchedule{}, fmt.Errorf("service.ConfirmPayday: update anchor: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return sqlite.PaySchedule{}, fmt.Errorf("service.ConfirmPayday: commit: %w", err)
	}

	ps.AnchorDate = nextAfterUpcoming
	return ps, nil
}
