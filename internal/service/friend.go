package service

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// FriendService handles business logic for friends.
type FriendService struct {
	repo sqlite.FriendRepo
}

// NewFriendService creates a new FriendService.
func NewFriendService(repo sqlite.FriendRepo) *FriendService {
	return &FriendService{repo: repo}
}

// ListFriends returns all friends.
func (s *FriendService) ListFriends() ([]sqlite.Friend, error) {
	friends, err := s.repo.GetAll()
	if err != nil {
		return nil, fmt.Errorf("service.ListFriends: %w", err)
	}
	return friends, nil
}

// CreateFriend creates a new friend with a generated UUID and public token.
func (s *FriendService) CreateFriend(name string, notes *string) (sqlite.Friend, error) {
	id := uuid.New()
	token, err := generatePublicToken()
	if err != nil {
		return sqlite.Friend{}, fmt.Errorf("service.CreateFriend: %w", err)
	}
	f := sqlite.Friend{
		ID:          id,
		Name:        name,
		PublicToken: token,
		Notes:       notes,
	}
	if err := s.repo.Insert(f); err != nil {
		return sqlite.Friend{}, fmt.Errorf("service.CreateFriend: %w", err)
	}
	return f, nil
}

// GetFriendByID returns a single friend by ID.
func (s *FriendService) GetFriendByID(id uuid.UUID) (sqlite.Friend, error) {
	f, err := s.repo.GetByID(id)
	if err != nil {
		return f, fmt.Errorf("service.GetFriendByID: %w", err)
	}
	return f, nil
}

// GetFriendByToken returns a friend by their public token.
func (s *FriendService) GetFriendByToken(token string) (sqlite.Friend, error) {
	f, err := s.repo.GetByToken(token)
	if err != nil {
		return f, fmt.Errorf("service.GetFriendByToken: %w", err)
	}
	return f, nil
}

// UpdateFriend patches mutable fields on a friend.
// Pass nil for fields that should not change.
func (s *FriendService) UpdateFriend(id uuid.UUID, name *string, notes *string) error {
	if err := s.repo.Update(id, name, notes); err != nil {
		return fmt.Errorf("service.UpdateFriend: %w", err)
	}
	return nil
}

// DeleteFriend removes a friend and all associated peer debts (CASCADE).
func (s *FriendService) DeleteFriend(id uuid.UUID) error {
	if err := s.repo.DeleteByID(id); err != nil {
		return fmt.Errorf("service.DeleteFriend: %w", err)
	}
	return nil
}
