package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type mockPublicFriendService struct {
	getFriendByTokenFn    func(token string) (sqlite.Friend, error)
	getFriendByIDFn       func(id uuid.UUID) (sqlite.Friend, error)
	getPublicFriendViewFn func(token string) (service.PublicFriendView, error)
}

func (m *mockPublicFriendService) GetFriendByToken(token string) (sqlite.Friend, error) {
	if m.getFriendByTokenFn != nil {
		return m.getFriendByTokenFn(token)
	}
	return sqlite.Friend{}, sql.ErrNoRows
}

func (m *mockPublicFriendService) GetFriendByID(id uuid.UUID) (sqlite.Friend, error) {
	if m.getFriendByIDFn != nil {
		return m.getFriendByIDFn(id)
	}
	return sqlite.Friend{}, sql.ErrNoRows
}

func (m *mockPublicFriendService) GetPublicFriendView(token string) (service.PublicFriendView, error) {
	if m.getPublicFriendViewFn != nil {
		return m.getPublicFriendViewFn(token)
	}
	return service.PublicFriendView{}, sql.ErrNoRows
}

type mockPublicPeerDebtService struct{}

func (m *mockPublicPeerDebtService) GetBalanceByFriend(id uuid.UUID) (sqlite.PeerDebtBalance, error) {
	return sqlite.PeerDebtBalance{}, nil
}

func (m *mockPublicPeerDebtService) ListByFriend(friendID uuid.UUID, accountID *uuid.UUID) ([]sqlite.PeerDebt, error) {
	return nil, nil
}

type mockPublicProfileService struct{}

func (m *mockPublicProfileService) GetByAccount(accountID uuid.UUID) (sqlite.UserProfile, error) {
	return sqlite.UserProfile{AccountID: accountID, DisplayName: "Owner"}, nil
}

type mockPublicGroupService struct {
	getEventByTokenFn       func(token string) (sqlite.GroupEvent, error)
	getEventByIDFn          func(id uuid.UUID) (sqlite.GroupEvent, error)
	listEventsByFriendFn    func(friendID uuid.UUID) ([]sqlite.GroupEvent, error)
	getParticipantsFn       func(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error)
	setParticipantConfirmFn func(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error
	toggleParticipantFn     func(eventID uuid.UUID, friendID uuid.UUID) error
}

func (m *mockPublicGroupService) GetEventByToken(token string) (sqlite.GroupEvent, error) {
	if m.getEventByTokenFn != nil {
		return m.getEventByTokenFn(token)
	}
	return sqlite.GroupEvent{}, sql.ErrNoRows
}

func (m *mockPublicGroupService) GetEventByID(id uuid.UUID) (sqlite.GroupEvent, error) {
	if m.getEventByIDFn != nil {
		return m.getEventByIDFn(id)
	}
	return sqlite.GroupEvent{}, sql.ErrNoRows
}

func (m *mockPublicGroupService) ListEventsByFriend(friendID uuid.UUID) ([]sqlite.GroupEvent, error) {
	if m.listEventsByFriendFn != nil {
		return m.listEventsByFriendFn(friendID)
	}
	return nil, nil
}

func (m *mockPublicGroupService) GetParticipants(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error) {
	if m.getParticipantsFn != nil {
		return m.getParticipantsFn(eventID)
	}
	return nil, nil
}

func (m *mockPublicGroupService) SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error {
	if m.setParticipantConfirmFn != nil {
		return m.setParticipantConfirmFn(eventID, friendID, isConfirmed)
	}
	return nil
}

func (m *mockPublicGroupService) ToggleParticipantConfirmation(eventID uuid.UUID, friendID uuid.UUID) error {
	if m.toggleParticipantFn != nil {
		return m.toggleParticipantFn(eventID, friendID)
	}
	return nil
}

func TestGetFriendByToken_ReturnsFriendPayload(t *testing.T) {
	friendSvc := &mockPublicFriendService{
		getPublicFriendViewFn: func(token string) (service.PublicFriendView, error) {
			return service.PublicFriendView{
				Name:    "Ana",
				Balance: sqlite.PeerDebtBalance{FriendOwesUser: 1000, UserOwesFriend: 400, Net: 600},
				Debts:   []sqlite.PeerDebt{{Description: "Lunch", Amount: -1200}},
			}, nil
		},
	}
	h := &PublicHandler{
		friendSvc:   friendSvc,
		peerDebtSvc: &mockPublicPeerDebtService{},
		groupSvc:    &mockPublicGroupService{},
		profileSvc:  &mockPublicProfileService{},
	}

	rec, c := makeRequest(http.MethodGet, "/public/friends/token-123", "")
	c.SetParamNames("token")
	c.SetParamValues("token-123")
	if err := h.GetFriendByToken(c); err != nil {
		t.Errorf("GetFriendByToken error: %v", err)
		return
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
		return
	}

	var resp PublicFriendResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Errorf("decode response: %v", err)
		return
	}
	if resp.Name != "Ana" {
		t.Errorf("expected name Ana, got %s", resp.Name)
		return
	}
	if len(resp.Debts) != 1 {
		t.Errorf("expected 1 debt, got %d", len(resp.Debts))
		return
	}
	if resp.Balance.Net != 6.0 {
		t.Errorf("expected net 6.0, got %f", resp.Balance.Net)
	}
}

func TestGetFriendByToken_Returns404WhenMissing(t *testing.T) {
	friendSvc := &mockPublicFriendService{
		getPublicFriendViewFn: func(token string) (service.PublicFriendView, error) {
			return service.PublicFriendView{}, sql.ErrNoRows
		},
	}
	h := &PublicHandler{
		friendSvc:   friendSvc,
		peerDebtSvc: &mockPublicPeerDebtService{},
		groupSvc:    &mockPublicGroupService{},
		profileSvc:  &mockPublicProfileService{},
	}

	rec := serveRequest(func(c echo.Context) error {
		c.SetParamNames("token")
		c.SetParamValues("missing")
		return h.GetFriendByToken(c)
	}, http.MethodGet, "/public/friends/missing", "")

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestGetGroupByToken_ReturnsGroupPayload(t *testing.T) {
	eventID := uuid.New()
	hostID := uuid.New()
	participantID := uuid.New()
	hostPix := "host-pix"

	friendSvc := &mockPublicFriendService{
		getFriendByIDFn: func(id uuid.UUID) (sqlite.Friend, error) {
			switch id {
			case hostID:
				return sqlite.Friend{ID: hostID, Name: "Host", PixKey: &hostPix}, nil
			case participantID:
				return sqlite.Friend{ID: participantID, Name: "Bob"}, nil
			default:
				return sqlite.Friend{}, sql.ErrNoRows
			}
		},
	}
	groupSvc := &mockPublicGroupService{
		getEventByTokenFn: func(token string) (sqlite.GroupEvent, error) {
			return sqlite.GroupEvent{ID: eventID, Title: "Pizza Night", Date: "2026-01-01", TotalAmount: 5000, HostFriendID: &hostID}, nil
		},
		getParticipantsFn: func(id uuid.UUID) ([]sqlite.GroupEventParticipant, error) {
			return []sqlite.GroupEventParticipant{
				{EventID: eventID, FriendID: &hostID, ShareAmount: 2000, IsConfirmed: true},
				{EventID: eventID, FriendID: &participantID, ShareAmount: 3000, IsConfirmed: false},
			}, nil
		},
	}
	h := &PublicHandler{
		friendSvc:   friendSvc,
		peerDebtSvc: &mockPublicPeerDebtService{},
		groupSvc:    groupSvc,
		profileSvc:  &mockPublicProfileService{},
	}

	rec, c := makeRequest(http.MethodGet, "/public/groups/group-token", "")
	c.SetParamNames("token")
	c.SetParamValues("group-token")
	if err := h.GetGroupByToken(c); err != nil {
		t.Errorf("GetGroupByToken error: %v", err)
		return
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
		return
	}

	var resp PublicGroupResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Errorf("decode response: %v", err)
		return
	}
	if resp.Title != "Pizza Night" {
		t.Errorf("expected title Pizza Night, got %s", resp.Title)
		return
	}
	if resp.HostName != "Host" {
		t.Errorf("expected host Host, got %s", resp.HostName)
		return
	}
	if len(resp.Participants) != 2 {
		t.Errorf("expected 2 participants, got %d", len(resp.Participants))
	}
}
