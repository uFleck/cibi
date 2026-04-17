package service

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

type friendPublicPeerDebtSvc interface {
	GetBalanceByFriend(id uuid.UUID) (sqlite.PeerDebtBalance, error)
	ListByFriend(friendID uuid.UUID, accountID *uuid.UUID) ([]sqlite.PeerDebt, error)
}

type friendPublicGroupSvc interface {
	ListEventsByFriend(friendID uuid.UUID) ([]sqlite.GroupEvent, error)
	GetParticipants(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error)
}

type friendPublicProfileSvc interface {
	Get() (sqlite.UserProfile, error)
}

// PublicFriendGroupEventView is the service DTO used by public friend endpoint.
type PublicFriendGroupEventView struct {
	EventID      string
	Title        string
	Date         string
	ShareAmount  float64
	IsConfirmed  bool
	HostName     string
	HostPixKey   *string
	ViewerIsHost bool
}

// HostedGroupParticipantView is the service DTO for hosted-group participants.
type HostedGroupParticipantView struct {
	FriendID    string
	FriendName  string
	ShareAmount float64
	IsConfirmed bool
}

// HostedGroupView is the service DTO for hosted events.
type HostedGroupView struct {
	EventID      string
	Title        string
	Date         string
	Participants []HostedGroupParticipantView
}

// PublicFriendView is the service DTO used by public friend endpoint.
type PublicFriendView struct {
	Name         string
	Balance      sqlite.PeerDebtBalance
	Debts        []sqlite.PeerDebt
	Groups       []PublicFriendGroupEventView
	HostedGroups []HostedGroupView
}

// FriendService handles business logic for friends.
type FriendService struct {
	repo         sqlite.FriendRepo
	peerDebtSvc  friendPublicPeerDebtSvc
	groupSvc     friendPublicGroupSvc
	profileSvc   friendPublicProfileSvc
}

// NewFriendService creates a new FriendService.
func NewFriendService(repo sqlite.FriendRepo) *FriendService {
	return &FriendService{repo: repo}
}

// ConfigurePublicViewDependencies wires collaborator services used by GetPublicFriendView.
func (s *FriendService) ConfigurePublicViewDependencies(peerDebtSvc friendPublicPeerDebtSvc, groupSvc friendPublicGroupSvc, profileSvc friendPublicProfileSvc) {
	s.peerDebtSvc = peerDebtSvc
	s.groupSvc = groupSvc
	s.profileSvc = profileSvc
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
func (s *FriendService) CreateFriend(name string, notes *string, pixKey *string) (sqlite.Friend, error) {
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
		PixKey:      pixKey,
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

func (s *FriendService) ownerProfile() sqlite.UserProfile {
	if s.profileSvc == nil {
		defaultName := "Host"
		return sqlite.UserProfile{DisplayName: defaultName}
	}
	p, err := s.profileSvc.Get()
	if err != nil || strings.TrimSpace(p.DisplayName) == "" {
		defaultName := "Host"
		return sqlite.UserProfile{DisplayName: defaultName}
	}
	return p
}

func (s *FriendService) hostInfo(event sqlite.GroupEvent) (string, *string, *uuid.UUID) {
	if event.HostFriendID != nil {
		f, err := s.repo.GetByID(*event.HostFriendID)
		if err == nil && strings.TrimSpace(f.Name) != "" {
			return f.Name, f.PixKey, event.HostFriendID
		}
	}
	owner := s.ownerProfile()
	return owner.DisplayName, owner.PixKey, nil
}

// GetPublicFriendView builds all public friend endpoint data in service layer.
func (s *FriendService) GetPublicFriendView(token string) (PublicFriendView, error) {
	if s.peerDebtSvc == nil || s.groupSvc == nil {
		return PublicFriendView{}, fmt.Errorf("service.GetPublicFriendView: dependencies not configured")
	}

	friend, err := s.repo.GetByToken(token)
	if err != nil {
		return PublicFriendView{}, fmt.Errorf("service.GetPublicFriendView: %w", err)
	}

	balance, err := s.peerDebtSvc.GetBalanceByFriend(friend.ID)
	if err != nil {
		return PublicFriendView{}, fmt.Errorf("service.GetPublicFriendView: get balance: %w", err)
	}
	debts, err := s.peerDebtSvc.ListByFriend(friend.ID, nil)
	if err != nil {
		return PublicFriendView{}, fmt.Errorf("service.GetPublicFriendView: list debts: %w", err)
	}
	events, err := s.groupSvc.ListEventsByFriend(friend.ID)
	if err != nil {
		return PublicFriendView{}, fmt.Errorf("service.GetPublicFriendView: list events: %w", err)
	}

	groups := make([]PublicFriendGroupEventView, 0, len(events))
	hostedGroups := make([]HostedGroupView, 0)

	for _, e := range events {
		hostName, hostPixKey, hostFriendID := s.hostInfo(e)
		parts, err := s.groupSvc.GetParticipants(e.ID)
		if err != nil {
			return PublicFriendView{}, fmt.Errorf("service.GetPublicFriendView: get participants: %w", err)
		}

		for _, p := range parts {
			if p.FriendID == nil || *p.FriendID != friend.ID {
				continue
			}
			groups = append(groups, PublicFriendGroupEventView{
				EventID:      e.ID.String(),
				Title:        e.Title,
				Date:         e.Date,
				ShareAmount:  float64(p.ShareAmount) / 100.0,
				IsConfirmed:  p.IsConfirmed,
				HostName:     hostName,
				HostPixKey:   hostPixKey,
				ViewerIsHost: hostFriendID != nil && *hostFriendID == friend.ID,
			})
			break
		}

		if hostFriendID != nil && *hostFriendID == friend.ID {
			hg := HostedGroupView{EventID: e.ID.String(), Title: e.Title, Date: e.Date}
			for _, p := range parts {
				if p.FriendID == nil || *p.FriendID == friend.ID {
					continue
				}
				target, ferr := s.repo.GetByID(*p.FriendID)
				name := "Participant"
				if ferr == nil && strings.TrimSpace(target.Name) != "" {
					name = target.Name
				}
				hg.Participants = append(hg.Participants, HostedGroupParticipantView{
					FriendID:    p.FriendID.String(),
					FriendName:  name,
					ShareAmount: float64(p.ShareAmount) / 100.0,
					IsConfirmed: p.IsConfirmed,
				})
			}
			hostedGroups = append(hostedGroups, hg)
		}
	}

	return PublicFriendView{
		Name:         friend.Name,
		Balance:      balance,
		Debts:        debts,
		Groups:       groups,
		HostedGroups: hostedGroups,
	}, nil
}

// UpdateFriend patches mutable fields on a friend.
// Pass nil for fields that should not change.
func (s *FriendService) UpdateFriend(id uuid.UUID, name *string, notes *string, pixKey *string) error {
	if err := s.repo.Update(id, name, notes, pixKey); err != nil {
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
