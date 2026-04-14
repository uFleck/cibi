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

// FriendServiceIface defines the service contract used by FriendsHandler.
type FriendServiceIface interface {
	ListFriends() ([]sqlite.Friend, error)
	CreateFriend(name string, notes *string) (sqlite.Friend, error)
	GetFriendByID(id uuid.UUID) (sqlite.Friend, error)
	UpdateFriend(id uuid.UUID, name *string, notes *string) error
	DeleteFriend(id uuid.UUID) error
	GetFriendByToken(token string) (sqlite.Friend, error)
}

// Ensure *service.FriendService satisfies FriendServiceIface.
var _ FriendServiceIface = (*service.FriendService)(nil)

// PeerDebtSummaryIface defines the minimal interface needed by FriendsHandler.Summary.
type PeerDebtSummaryIface interface {
	GetGlobalBalance() (sqlite.GlobalPeerBalance, error)
}

// Ensure *service.PeerDebtService satisfies PeerDebtSummaryIface.
var _ PeerDebtSummaryIface = (*service.PeerDebtService)(nil)

// FriendsHandler handles HTTP requests for /friends routes.
type FriendsHandler struct {
	svc         FriendServiceIface
	peerDebtSvc PeerDebtSummaryIface
}

// NewFriendsHandler creates a FriendsHandler wired to the given services.
func NewFriendsHandler(svc *service.FriendService, peerDebtSvc *service.PeerDebtService) *FriendsHandler {
	return &FriendsHandler{svc: svc, peerDebtSvc: peerDebtSvc}
}

// Request / response types.

type CreateFriendRequest struct {
	Name  string  `json:"name"  validate:"required"`
	Notes *string `json:"notes"`
}

type PatchFriendRequest struct {
	Name  *string `json:"name"`
	Notes *string `json:"notes"`
}

type FriendResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	PublicToken string  `json:"public_token"`
	Notes       *string `json:"notes"`
}

type FriendSummaryResponse struct {
	TotalOwedToUser float64 `json:"total_owed_to_user"` // dollars
	TotalUserOwes   float64 `json:"total_user_owes"`
	Net             float64 `json:"net"`
}

// friendToResponse converts a sqlite.Friend to FriendResponse.
func friendToResponse(f sqlite.Friend) FriendResponse {
	return FriendResponse{
		ID:          f.ID.String(),
		Name:        f.Name,
		PublicToken: f.PublicToken,
		Notes:       f.Notes,
	}
}

// List handles GET /friends — returns all friends.
func (h *FriendsHandler) List(c echo.Context) error {
	friends, err := h.svc.ListFriends()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]FriendResponse, len(friends))
	for i, f := range friends {
		resp[i] = friendToResponse(f)
	}
	return c.JSON(http.StatusOK, resp)
}

// Create handles POST /friends — creates a new friend.
func (h *FriendsHandler) Create(c echo.Context) error {
	var req CreateFriendRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	f, err := h.svc.CreateFriend(req.Name, req.Notes)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, friendToResponse(f))
}

// GetByID handles GET /friends/:id — returns a friend by UUID.
func (h *FriendsHandler) GetByID(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid friend id")
	}
	f, err := h.svc.GetFriendByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "friend not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, friendToResponse(f))
}

// Update handles PATCH /friends/:id — patches mutable fields on a friend.
func (h *FriendsHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid friend id")
	}
	var req PatchFriendRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.svc.UpdateFriend(id, req.Name, req.Notes); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "friend not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	f, err := h.svc.GetFriendByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "friend not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, friendToResponse(f))
}

// Delete handles DELETE /friends/:id — removes a friend.
func (h *FriendsHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid friend id")
	}
	if err := h.svc.DeleteFriend(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "friend not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// Summary handles GET /friends/summary — returns global peer balance totals.
func (h *FriendsHandler) Summary(c echo.Context) error {
	bal, err := h.peerDebtSvc.GetGlobalBalance()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, FriendSummaryResponse{
		TotalOwedToUser: float64(bal.TotalOwedToUser) / 100.0,
		TotalUserOwes:   float64(bal.TotalUserOwes) / 100.0,
		Net:             float64(bal.Net) / 100.0,
	})
}

