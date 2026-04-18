package service

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// GroupEventService handles business logic for group events.
type GroupEventService struct {
	repo       sqlite.GroupEventRepo
	friendRepo sqlite.FriendRepo // for participant friend validation
}

// NewGroupEventService creates a new GroupEventService.
func NewGroupEventService(repo sqlite.GroupEventRepo, friendRepo sqlite.FriendRepo) *GroupEventService {
	return &GroupEventService{repo: repo, friendRepo: friendRepo}
}

// ListEvents returns all group events, optionally scoped by account.
func (s *GroupEventService) ListEvents(accountID *uuid.UUID) ([]sqlite.GroupEvent, error) {
	events, err := s.repo.GetAll(accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListEvents: %w", err)
	}
	return events, nil
}

// ListEventsUnscoped returns all group events across all accounts.
func (s *GroupEventService) ListEventsUnscoped() ([]sqlite.GroupEvent, error) {
	events, err := s.repo.GetAll(nil)
	if err != nil {
		return nil, fmt.Errorf("service.ListEventsUnscoped: %w", err)
	}
	return events, nil
}

// ListEventsByAccount returns all events scoped to one account.
func (s *GroupEventService) ListEventsByAccount(accountID uuid.UUID) ([]sqlite.GroupEvent, error) {
	events, err := s.repo.GetAll(&accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListEventsByAccount: %w", err)
	}
	return events, nil
}

// CreateEvent creates a new group event with a generated UUID and public token.
func (s *GroupEventService) CreateEvent(accountID uuid.UUID, title, date string, totalAmount int64, notes *string) (sqlite.GroupEvent, error) {
	id := uuid.New()
	token, err := generatePublicToken()
	if err != nil {
		return sqlite.GroupEvent{}, fmt.Errorf("service.CreateEvent: %w", err)
	}
	e := sqlite.GroupEvent{
		ID:          id,
		AccountID:   accountID,
		Title:       title,
		Date:        date,
		TotalAmount: totalAmount,
		PublicToken: token,
		Notes:       notes,
	}
	if err := s.repo.Insert(e); err != nil {
		return sqlite.GroupEvent{}, fmt.Errorf("service.CreateEvent: %w", err)
	}
	return e, nil
}

// GetEventByID returns a single group event by ID.
func (s *GroupEventService) GetEventByID(id uuid.UUID) (sqlite.GroupEvent, error) {
	e, err := s.repo.GetByID(id)
	if err != nil {
		return e, fmt.Errorf("service.GetEventByID: %w", err)
	}
	return e, nil
}

// GetEventByToken returns a group event by its public token.
func (s *GroupEventService) GetEventByToken(token string) (sqlite.GroupEvent, error) {
	e, err := s.repo.GetByToken(token)
	if err != nil {
		return e, fmt.Errorf("service.GetEventByToken: %w", err)
	}
	return e, nil
}

// ListEventsByFriend returns all group events a friend participates in.
func (s *GroupEventService) ListEventsByFriend(friendID uuid.UUID) ([]sqlite.GroupEvent, error) {
	events, err := s.repo.GetByFriend(friendID)
	if err != nil {
		return nil, fmt.Errorf("service.ListEventsByFriend: %w", err)
	}
	return events, nil
}

// UpdateEvent patches mutable fields on a group event.
// Pass nil for fields that should not change.
func (s *GroupEventService) UpdateEvent(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error {
	if err := s.repo.Update(id, title, date, totalAmount, notes); err != nil {
		return fmt.Errorf("service.UpdateEvent: %w", err)
	}
	return nil
}

// DeleteEvent removes a group event and its participants (CASCADE).
func (s *GroupEventService) DeleteEvent(id uuid.UUID) error {
	if err := s.repo.DeleteByID(id); err != nil {
		return fmt.Errorf("service.DeleteEvent: %w", err)
	}
	return nil
}

// SetParticipants replaces all participants for an event in a single transaction.
func (s *GroupEventService) SetParticipants(eventID uuid.UUID, participants []sqlite.GroupEventParticipant, hostFriendID *uuid.UUID) error {
	if err := s.repo.SetParticipants(eventID, participants, hostFriendID); err != nil {
		return fmt.Errorf("service.SetParticipants: %w", err)
	}
	return nil
}

// GetParticipants returns all participants for a group event.
func (s *GroupEventService) GetParticipants(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error) {
	parts, err := s.repo.GetParticipants(eventID)
	if err != nil {
		return nil, fmt.Errorf("service.GetParticipants: %w", err)
	}
	return parts, nil
}

// SetParticipantConfirmed marks one friend participant payment status for an event.
func (s *GroupEventService) SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error {
	if err := s.repo.SetParticipantConfirmed(eventID, friendID, isConfirmed); err != nil {
		return fmt.Errorf("service.SetParticipantConfirmed: %w", err)
	}
	return nil
}

// ToggleParticipantConfirmation flips one friend participant payment status.
func (s *GroupEventService) ToggleParticipantConfirmation(eventID uuid.UUID, friendID uuid.UUID) error {
	if err := s.repo.ToggleParticipantConfirmed(eventID, friendID); err != nil {
		return fmt.Errorf("service.ToggleParticipantConfirmation: %w", err)
	}
	return nil
}

// SumUpcomingAdminObligations returns pending admin->host obligations in [after, onOrBefore).
// Value is negative or zero for direct use in engine purchasing power math.
func (s *GroupEventService) SumUpcomingAdminObligations(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	v, err := s.repo.SumUpcomingAdminObligations(accountID, after, onOrBefore)
	if err != nil {
		return 0, fmt.Errorf("service.SumUpcomingAdminObligations: %w", err)
	}
	return v, nil
}

// SumUpcomingAdminObligationsUnscoped returns pending obligations without account filter.
func (s *GroupEventService) SumUpcomingAdminObligationsUnscoped(after, onOrBefore time.Time) (int64, error) {
	v, err := s.repo.SumUpcomingAdminObligations(nil, after, onOrBefore)
	if err != nil {
		return 0, fmt.Errorf("service.SumUpcomingAdminObligationsUnscoped: %w", err)
	}
	return v, nil
}

// SumUpcomingAdminObligationsByAccount returns pending obligations scoped by account.
func (s *GroupEventService) SumUpcomingAdminObligationsByAccount(accountID uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	v, err := s.repo.SumUpcomingAdminObligations(&accountID, after, onOrBefore)
	if err != nil {
		return 0, fmt.Errorf("service.SumUpcomingAdminObligationsByAccount: %w", err)
	}
	return v, nil
}

// GetAdminPendingExpenses returns all unconfirmed admin shares where a friend is host.
func (s *GroupEventService) GetAdminPendingExpenses(accountID *uuid.UUID) ([]sqlite.AdminGroupExpense, error) {
	items, err := s.repo.GetAdminPendingExpenses(accountID)
	if err != nil {
		return nil, fmt.Errorf("service.GetAdminPendingExpenses: %w", err)
	}
	return items, nil
}

// GetAdminPendingExpensesUnscoped returns pending expenses without account filter.
func (s *GroupEventService) GetAdminPendingExpensesUnscoped() ([]sqlite.AdminGroupExpense, error) {
	items, err := s.repo.GetAdminPendingExpenses(nil)
	if err != nil {
		return nil, fmt.Errorf("service.GetAdminPendingExpensesUnscoped: %w", err)
	}
	return items, nil
}

// GetAdminPendingExpensesByAccount returns pending expenses scoped by account.
func (s *GroupEventService) GetAdminPendingExpensesByAccount(accountID uuid.UUID) ([]sqlite.AdminGroupExpense, error) {
	items, err := s.repo.GetAdminPendingExpenses(&accountID)
	if err != nil {
		return nil, fmt.Errorf("service.GetAdminPendingExpensesByAccount: %w", err)
	}
	return items, nil
}

// GetPendingBalanceForAdmin returns group-event pending balances from admin perspective.
func (s *GroupEventService) GetPendingBalanceForAdmin(accountID *uuid.UUID) (sqlite.GroupEventBalance, error) {
	b, err := s.repo.GetPendingBalanceForAdmin(accountID)
	if err != nil {
		return b, fmt.Errorf("service.GetPendingBalanceForAdmin: %w", err)
	}
	return b, nil
}

// GetPendingBalanceForAdminUnscoped returns pending balances without account filter.
func (s *GroupEventService) GetPendingBalanceForAdminUnscoped() (sqlite.GroupEventBalance, error) {
	b, err := s.repo.GetPendingBalanceForAdmin(nil)
	if err != nil {
		return b, fmt.Errorf("service.GetPendingBalanceForAdminUnscoped: %w", err)
	}
	return b, nil
}

// GetPendingBalanceForAdminByAccount returns pending balances scoped by account.
func (s *GroupEventService) GetPendingBalanceForAdminByAccount(accountID uuid.UUID) (sqlite.GroupEventBalance, error) {
	b, err := s.repo.GetPendingBalanceForAdmin(&accountID)
	if err != nil {
		return b, fmt.Errorf("service.GetPendingBalanceForAdminByAccount: %w", err)
	}
	return b, nil
}

// EqualSplitAmounts distributes totalAmount as evenly as possible across count participants.
// Remainder cents go to the first participant.
// Example: 100 cents / 3 = [34, 33, 33]
func (s *GroupEventService) EqualSplitAmounts(totalAmount int64, count int) []int64 {
	if count <= 0 {
		return nil
	}
	base := totalAmount / int64(count)
	remainder := totalAmount % int64(count)
	result := make([]int64, count)
	for i := range result {
		result[i] = base
	}
	result[0] += remainder
	return result
}
