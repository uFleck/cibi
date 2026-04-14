package service

import (
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

// CreatePaySchedule validates account exists, generates UUID, and inserts a new pay schedule.
func (s *PayScheduleService) CreatePaySchedule(
	accountID uuid.UUID,
	frequency string,
	anchorDate time.Time,
	dayOfMonth, dayOfMonth2 *int,
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
	dayOfMonth, dayOfMonth2 *int,
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
