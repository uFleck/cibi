package service

import (
	"fmt"

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

// ListEvents returns all group events.
func (s *GroupEventService) ListEvents() ([]sqlite.GroupEvent, error) {
	events, err := s.repo.GetAll()
	if err != nil {
		return nil, fmt.Errorf("service.ListEvents: %w", err)
	}
	return events, nil
}

// CreateEvent creates a new group event with a generated UUID and public token.
func (s *GroupEventService) CreateEvent(title, date string, totalAmount int64, notes *string) (sqlite.GroupEvent, error) {
	id := uuid.New()
	token, err := generatePublicToken()
	if err != nil {
		return sqlite.GroupEvent{}, fmt.Errorf("service.CreateEvent: %w", err)
	}
	e := sqlite.GroupEvent{
		ID:          id,
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
func (s *GroupEventService) SetParticipants(eventID uuid.UUID, participants []sqlite.GroupEventParticipant) error {
	if err := s.repo.SetParticipants(eventID, participants); err != nil {
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
