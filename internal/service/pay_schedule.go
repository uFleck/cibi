package service

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// PayScheduleService handles business logic for pay schedules.
type PayScheduleService struct {
	psRepo  sqlite.PayScheduleRepo
	accRepo sqlite.AccountsRepo
}

// NewPayScheduleService creates a new PayScheduleService.
func NewPayScheduleService(psRepo sqlite.PayScheduleRepo, accRepo sqlite.AccountsRepo) *PayScheduleService {
	return &PayScheduleService{
		psRepo:  psRepo,
		accRepo: accRepo,
	}
}

// SetPaySchedule creates or updates a pay schedule for an account.
func (s *PayScheduleService) SetPaySchedule(accountID uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth, dayOfMonth2 *int, label *string) error {
	ps := sqlite.PaySchedule{
		ID:          uuid.New(),
		AccountID:   accountID,
		Frequency:   frequency,
		AnchorDate:  anchorDate.UTC(),
		DayOfMonth2: dayOfMonth2,
		Label:       label,
	}

	// Check if a pay schedule already exists for this account.
	_, err := s.psRepo.GetByAccountID(accountID)
	if err != nil {
		// If not found (sql.ErrNoRows), create new; otherwise return error.
		if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("service.SetPaySchedule: check existing: %w", err)
		}
		// No existing schedule — insert new.
		if err := s.psRepo.Insert(ps); err != nil {
			return fmt.Errorf("service.SetPaySchedule: insert: %w", err)
		}
		return nil
	}

	// Existing schedule found — update it.
	ps.AccountID = accountID // ensure correct account
	if err := s.psRepo.UpdateByAccountID(accountID, ps); err != nil {
		return fmt.Errorf("service.SetPaySchedule: update: %w", err)
	}
	return nil
}

// GetPaySchedule returns the pay schedule for an account.
func (s *PayScheduleService) GetPaySchedule(accountID uuid.UUID) (sqlite.PaySchedule, error) {
	ps, err := s.psRepo.GetByAccountID(accountID)
	if err != nil {
		return ps, fmt.Errorf("service.GetPaySchedule: %w", err)
	}
	return ps, nil
}
