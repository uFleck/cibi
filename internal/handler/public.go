package handler

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// PublicFriendTokenSvc is the minimal interface for friend token lookups.
type PublicFriendTokenSvc interface {
	GetFriendByToken(token string) (sqlite.Friend, error)
}

// PublicPeerDebtSvc is the minimal interface for public peer debt queries.
type PublicPeerDebtSvc interface {
	GetBalanceByFriend(id uuid.UUID) (sqlite.PeerDebtBalance, error)
	ListByFriend(id uuid.UUID) ([]sqlite.PeerDebt, error)
}

// PublicGroupServiceIface is the minimal interface for public group event queries.
type PublicGroupServiceIface interface {
	GetEventByToken(token string) (sqlite.GroupEvent, error)
	GetParticipants(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error)
}

// Compile-time checks against concrete service types.
var _ PublicFriendTokenSvc = (*service.FriendService)(nil)
var _ PublicPeerDebtSvc = (*service.PeerDebtService)(nil)
var _ PublicGroupServiceIface = (*service.GroupEventService)(nil)

// PublicHandler handles unauthenticated GET endpoints for public friend/group links.
type PublicHandler struct {
	friendSvc   PublicFriendTokenSvc
	peerDebtSvc PublicPeerDebtSvc
	groupSvc    PublicGroupServiceIface
}

// NewPublicHandler creates a PublicHandler wired to the given services.
func NewPublicHandler(friendSvc *service.FriendService, peerDebtSvc *service.PeerDebtService, groupSvc *service.GroupEventService) *PublicHandler {
	return &PublicHandler{
		friendSvc:   friendSvc,
		peerDebtSvc: peerDebtSvc,
		groupSvc:    groupSvc,
	}
}

// Response types for public endpoints.

type PeerDebtBalanceResp struct {
	FriendOwesUser float64 `json:"friend_owes_user"` // dollars
	UserOwesFriend float64 `json:"user_owes_friend"`
	Net            float64 `json:"net"`
}

type PublicFriendResponse struct {
	Name    string              `json:"name"`
	Balance PeerDebtBalanceResp `json:"balance"`
	Debts   []PeerDebtResponse  `json:"debts"`
}

type PublicGroupResponse struct {
	Title       string                `json:"title"`
	Date        string                `json:"date"`
	TotalAmount float64               `json:"total_amount"`
	Notes       *string               `json:"notes"`
	Participants []ParticipantResponse `json:"participants"`
}

// GetFriendByToken handles GET /public/friend/:token — returns friend balance summary.
func (h *PublicHandler) GetFriendByToken(c echo.Context) error {
	token := c.Param("token")
	friend, err := h.friendSvc.GetFriendByToken(token)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "friend not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	balance, err := h.peerDebtSvc.GetBalanceByFriend(friend.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	debts, err := h.peerDebtSvc.ListByFriend(friend.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	debtResp := make([]PeerDebtResponse, len(debts))
	for i, d := range debts {
		debtResp[i] = peerDebtToResponse(d)
	}
	return c.JSON(http.StatusOK, PublicFriendResponse{
		Name: friend.Name,
		Balance: PeerDebtBalanceResp{
			FriendOwesUser: float64(balance.FriendOwesUser) / 100.0,
			UserOwesFriend: float64(balance.UserOwesFriend) / 100.0,
			Net:            float64(balance.Net) / 100.0,
		},
		Debts: debtResp,
	})
}

// GetGroupByToken handles GET /public/group/:token — returns event + participants.
func (h *PublicHandler) GetGroupByToken(c echo.Context) error {
	token := c.Param("token")
	event, err := h.groupSvc.GetEventByToken(token)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "group event not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	participants, err := h.groupSvc.GetParticipants(event.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	parts := make([]ParticipantResponse, len(participants))
	for i, p := range participants {
		var friendIDStr *string
		if p.FriendID != nil {
			s := p.FriendID.String()
			friendIDStr = &s
		}
		parts[i] = ParticipantResponse{
			FriendID:    friendIDStr,
			ShareAmount: float64(p.ShareAmount) / 100.0,
			IsConfirmed: p.IsConfirmed,
		}
	}
	return c.JSON(http.StatusOK, PublicGroupResponse{
		Title:        event.Title,
		Date:         event.Date,
		TotalAmount:  float64(event.TotalAmount) / 100.0,
		Notes:        event.Notes,
		Participants: parts,
	})
}
