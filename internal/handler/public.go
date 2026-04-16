package handler

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

var indexHTML []byte

func SetIndexHTML(html []byte) { indexHTML = html }

type PublicFriendTokenSvc interface {
	GetFriendByToken(token string) (sqlite.Friend, error)
	GetFriendByID(id uuid.UUID) (sqlite.Friend, error)
}

type PublicPeerDebtSvc interface {
	GetBalanceByFriend(id uuid.UUID) (sqlite.PeerDebtBalance, error)
	ListByFriend(id uuid.UUID) ([]sqlite.PeerDebt, error)
}

type PublicProfileSvc interface { Get() (sqlite.UserProfile, error) }

type PublicGroupServiceIface interface {
	GetEventByToken(token string) (sqlite.GroupEvent, error)
	GetEventByID(id uuid.UUID) (sqlite.GroupEvent, error)
	ListEventsByFriend(friendID uuid.UUID) ([]sqlite.GroupEvent, error)
	GetParticipants(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error)
	SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error
}

var _ PublicFriendTokenSvc = (*service.FriendService)(nil)
var _ PublicPeerDebtSvc = (*service.PeerDebtService)(nil)
var _ PublicProfileSvc = (*service.ProfileService)(nil)
var _ PublicGroupServiceIface = (*service.GroupEventService)(nil)

type PublicHandler struct {
	friendSvc   PublicFriendTokenSvc
	peerDebtSvc PublicPeerDebtSvc
	groupSvc    PublicGroupServiceIface
	profileSvc  PublicProfileSvc
}

func NewPublicHandler(friendSvc *service.FriendService, peerDebtSvc *service.PeerDebtService, groupSvc *service.GroupEventService, profileSvc *service.ProfileService) *PublicHandler {
	return &PublicHandler{friendSvc: friendSvc, peerDebtSvc: peerDebtSvc, groupSvc: groupSvc, profileSvc: profileSvc}
}

type PeerDebtBalanceResp struct {
	FriendOwesUser float64 `json:"friend_owes_user"`
	UserOwesFriend float64 `json:"user_owes_friend"`
	Net            float64 `json:"net"`
}

type PublicFriendGroupEventResponse struct {
	EventID      string  `json:"event_id"`
	Title        string  `json:"title"`
	Date         string  `json:"date"`
	ShareAmount  float64 `json:"share_amount"`
	IsConfirmed  bool    `json:"is_confirmed"`
	HostName     string  `json:"host_name"`
	HostPixKey   *string `json:"host_pix_key"`
	ViewerIsHost bool    `json:"viewer_is_host"`
}

type HostedGroupParticipantResponse struct {
	FriendID    string  `json:"friend_id"`
	FriendName  string  `json:"friend_name"`
	ShareAmount float64 `json:"share_amount"`
	IsConfirmed bool    `json:"is_confirmed"`
}

type HostedGroupResponse struct {
	EventID       string                           `json:"event_id"`
	Title         string                           `json:"title"`
	Date          string                           `json:"date"`
	Participants  []HostedGroupParticipantResponse `json:"participants"`
}

type PublicFriendResponse struct {
	Name         string                           `json:"name"`
	Balance      PeerDebtBalanceResp              `json:"balance"`
	Debts        []PeerDebtResponse               `json:"debts"`
	Groups       []PublicFriendGroupEventResponse `json:"groups"`
	HostedGroups []HostedGroupResponse            `json:"hosted_groups"`
}

type PublicParticipantResponse struct {
	FriendID    *string `json:"friend_id"`
	Name        string  `json:"name"`
	ShareAmount float64 `json:"share_amount"`
	IsConfirmed bool    `json:"is_confirmed"`
	IsHost      bool    `json:"is_host"`
}

type PublicGroupResponse struct {
	Title        string                    `json:"title"`
	Date         string                    `json:"date"`
	TotalAmount  float64                   `json:"total_amount"`
	Notes        *string                   `json:"notes"`
	HostName     string                    `json:"host_name"`
	HostPixKey   *string                   `json:"host_pix_key"`
	Participants []PublicParticipantResponse `json:"participants"`
}

func (h *PublicHandler) wantsHTML(c echo.Context) bool {
	accept := c.Request().Header.Get("Accept")
	return accept != "" && (strings.Contains(accept, "text/html") || accept == "*/*")
}

func (h *PublicHandler) ownerProfile() sqlite.UserProfile {
	p, err := h.profileSvc.Get()
	if err != nil || strings.TrimSpace(p.DisplayName) == "" {
		defaultName := "Host"
		return sqlite.UserProfile{DisplayName: defaultName}
	}
	return p
}

func (h *PublicHandler) hostInfo(event sqlite.GroupEvent) (string, *string, *uuid.UUID) {
	if event.HostFriendID != nil {
		f, err := h.friendSvc.GetFriendByID(*event.HostFriendID)
		if err == nil && strings.TrimSpace(f.Name) != "" {
			return f.Name, f.PixKey, event.HostFriendID
		}
	}
	owner := h.ownerProfile()
	return owner.DisplayName, owner.PixKey, nil
}

func (h *PublicHandler) GetFriendByToken(c echo.Context) error {
	token := c.Param("token")
	if h.wantsHTML(c) && len(indexHTML) > 0 {
		return c.HTML(http.StatusOK, string(indexHTML))
	}

	friend, err := h.friendSvc.GetFriendByToken(token)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) { return echo.NewHTTPError(http.StatusNotFound, "friend not found") }
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	balance, err := h.peerDebtSvc.GetBalanceByFriend(friend.ID)
	if err != nil { return echo.NewHTTPError(http.StatusInternalServerError, err.Error()) }
	debts, err := h.peerDebtSvc.ListByFriend(friend.ID)
	if err != nil { return echo.NewHTTPError(http.StatusInternalServerError, err.Error()) }
	debtResp := make([]PeerDebtResponse, len(debts))
	for i, d := range debts { debtResp[i] = peerDebtToResponse(d) }

	events, err := h.groupSvc.ListEventsByFriend(friend.ID)
	if err != nil { return echo.NewHTTPError(http.StatusInternalServerError, err.Error()) }

	groups := make([]PublicFriendGroupEventResponse, 0, len(events))
	hostedGroups := make([]HostedGroupResponse, 0)

	for _, e := range events {
		hostName, hostPixKey, hostFriendID := h.hostInfo(e)
		parts, err := h.groupSvc.GetParticipants(e.ID)
		if err != nil { return echo.NewHTTPError(http.StatusInternalServerError, err.Error()) }

		for _, p := range parts {
			if p.FriendID == nil || *p.FriendID != friend.ID { continue }
			groups = append(groups, PublicFriendGroupEventResponse{
				EventID: e.ID.String(), Title: e.Title, Date: e.Date,
				ShareAmount: float64(p.ShareAmount) / 100.0,
				IsConfirmed: p.IsConfirmed,
				HostName: hostName,
				HostPixKey: hostPixKey,
				ViewerIsHost: hostFriendID != nil && *hostFriendID == friend.ID,
			})
			break
		}

		if hostFriendID != nil && *hostFriendID == friend.ID {
			hg := HostedGroupResponse{EventID: e.ID.String(), Title: e.Title, Date: e.Date}
			for _, p := range parts {
				if p.FriendID == nil || *p.FriendID == friend.ID { continue }
				target, ferr := h.friendSvc.GetFriendByID(*p.FriendID)
				name := "Participant"
				if ferr == nil && strings.TrimSpace(target.Name) != "" { name = target.Name }
				hg.Participants = append(hg.Participants, HostedGroupParticipantResponse{
					FriendID: p.FriendID.String(), FriendName: name,
					ShareAmount: float64(p.ShareAmount) / 100.0,
					IsConfirmed: p.IsConfirmed,
				})
			}
			hostedGroups = append(hostedGroups, hg)
		}
	}

	return c.JSON(http.StatusOK, PublicFriendResponse{
		Name: friend.Name,
		Balance: PeerDebtBalanceResp{
			FriendOwesUser: float64(balance.FriendOwesUser) / 100.0,
			UserOwesFriend: float64(balance.UserOwesFriend) / 100.0,
			Net: float64(balance.Net) / 100.0,
		},
		Debts: debtResp,
		Groups: groups,
		HostedGroups: hostedGroups,
	})
}

// only host (friend selected as host) can confirm participant payment via their token.
func (h *PublicHandler) ConfirmHostedGroupPayment(c echo.Context) error {
	token := c.Param("token")
	eventID, err := uuid.Parse(c.Param("eventID"))
	if err != nil { return echo.NewHTTPError(http.StatusBadRequest, "invalid event id") }
	targetID, err := uuid.Parse(c.Param("friendID"))
	if err != nil { return echo.NewHTTPError(http.StatusBadRequest, "invalid friend id") }

	hostFriend, err := h.friendSvc.GetFriendByToken(token)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) { return echo.NewHTTPError(http.StatusNotFound, "friend not found") }
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	event, err := h.groupSvc.GetEventByID(eventID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) { return echo.NewHTTPError(http.StatusNotFound, "event not found") }
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if event.HostFriendID == nil || *event.HostFriendID != hostFriend.ID {
		return echo.NewHTTPError(http.StatusForbidden, "only event host can confirm payments")
	}
	if err := h.groupSvc.SetParticipantConfirmed(eventID, targetID, true); err != nil {
		if errors.Is(err, sql.ErrNoRows) { return echo.NewHTTPError(http.StatusNotFound, "participant not found in event") }
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *PublicHandler) GetGroupByToken(c echo.Context) error {
	token := c.Param("token")
	if h.wantsHTML(c) && len(indexHTML) > 0 {
		return c.HTML(http.StatusOK, string(indexHTML))
	}
	event, err := h.groupSvc.GetEventByToken(token)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) { return echo.NewHTTPError(http.StatusNotFound, "group event not found") }
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	participants, err := h.groupSvc.GetParticipants(event.ID)
	if err != nil { return echo.NewHTTPError(http.StatusInternalServerError, err.Error()) }

	hostName, hostPixKey, hostFriendID := h.hostInfo(event)
	parts := make([]PublicParticipantResponse, len(participants))
	for i, p := range participants {
		var friendIDStr *string
		name := hostName
		isHost := false
		if p.FriendID != nil {
			s := p.FriendID.String()
			friendIDStr = &s
			if f, err := h.friendSvc.GetFriendByID(*p.FriendID); err == nil && strings.TrimSpace(f.Name) != "" {
				name = f.Name
			} else {
				name = "Participant"
			}
			isHost = hostFriendID != nil && *hostFriendID == *p.FriendID
		} else {
			isHost = hostFriendID == nil
		}
		parts[i] = PublicParticipantResponse{FriendID: friendIDStr, Name: name, ShareAmount: float64(p.ShareAmount) / 100.0, IsConfirmed: p.IsConfirmed, IsHost: isHost}
	}

	return c.JSON(http.StatusOK, PublicGroupResponse{
		Title: event.Title, Date: event.Date, TotalAmount: float64(event.TotalAmount) / 100.0,
		Notes: event.Notes, HostName: hostName, HostPixKey: hostPixKey, Participants: parts,
	})
}
