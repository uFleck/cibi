package handler

import (
	"database/sql"
	"errors"
	"math"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// GroupEventServiceIface defines the service contract used by GroupEventHandler.
type GroupEventServiceIface interface {
	ListEvents() ([]sqlite.GroupEvent, error)
	CreateEvent(title, date string, totalAmount int64, notes *string) (sqlite.GroupEvent, error)
	GetEventByID(id uuid.UUID) (sqlite.GroupEvent, error)
	GetEventByToken(token string) (sqlite.GroupEvent, error)
	UpdateEvent(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error
	DeleteEvent(id uuid.UUID) error
	SetParticipants(eventID uuid.UUID, participants []sqlite.GroupEventParticipant) error
	GetParticipants(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error)
	EqualSplitAmounts(totalAmount int64, count int) []int64
}

// Ensure *service.GroupEventService satisfies GroupEventServiceIface.
var _ GroupEventServiceIface = (*service.GroupEventService)(nil)

// GroupEventHandler handles HTTP requests for /group-events routes.
type GroupEventHandler struct {
	svc GroupEventServiceIface
}

// NewGroupEventHandler creates a GroupEventHandler wired to the given service.
func NewGroupEventHandler(svc *service.GroupEventService) *GroupEventHandler {
	return &GroupEventHandler{svc: svc}
}

// Request / response types.

type CreateGroupEventRequest struct {
	Title       string   `json:"title"        validate:"required"`
	Date        string   `json:"date"         validate:"required"`
	TotalAmount float64  `json:"total_amount" validate:"required"` // dollars
	Notes       *string  `json:"notes"`
}

type PatchGroupEventRequest struct {
	Title       *string  `json:"title"`
	Date        *string  `json:"date"`
	TotalAmount *float64 `json:"total_amount"`
	Notes       *string  `json:"notes"`
}

type ParticipantInput struct {
	FriendID    *string `json:"friend_id"`    // null = host/user
	ShareAmount float64 `json:"share_amount"` // dollars
	IsConfirmed bool    `json:"is_confirmed"`
}

type SetParticipantsRequest struct {
	Participants []ParticipantInput `json:"participants" validate:"required"`
}

type ParticipantResponse struct {
	FriendID    *string `json:"friend_id"`
	ShareAmount float64 `json:"share_amount"` // dollars
	IsConfirmed bool    `json:"is_confirmed"`
}

type GroupEventResponse struct {
	ID          string                `json:"id"`
	Title       string                `json:"title"`
	Date        string                `json:"date"`
	TotalAmount float64               `json:"total_amount"` // dollars
	PublicToken string                `json:"public_token"`
	Notes       *string               `json:"notes"`
	Participants []ParticipantResponse `json:"participants,omitempty"`
}

// groupEventToResponse converts a sqlite.GroupEvent to GroupEventResponse (cents → dollars).
func groupEventToResponse(e sqlite.GroupEvent, participants []sqlite.GroupEventParticipant) GroupEventResponse {
	resp := GroupEventResponse{
		ID:          e.ID.String(),
		Title:       e.Title,
		Date:        e.Date,
		TotalAmount: float64(e.TotalAmount) / 100.0,
		PublicToken: e.PublicToken,
		Notes:       e.Notes,
	}
	if participants != nil {
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
		resp.Participants = parts
	}
	return resp
}

// List handles GET /group-events — returns all events (no participants embedded).
func (h *GroupEventHandler) List(c echo.Context) error {
	events, err := h.svc.ListEvents()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]GroupEventResponse, len(events))
	for i, e := range events {
		resp[i] = groupEventToResponse(e, nil)
	}
	return c.JSON(http.StatusOK, resp)
}

// Create handles POST /group-events — creates a new group event.
func (h *GroupEventHandler) Create(c echo.Context) error {
	var req CreateGroupEventRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	totalValue := int64(math.Round(req.TotalAmount))
	event, err := h.svc.CreateEvent(req.Title, req.Date, totalValue, req.Notes)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, groupEventToResponse(event, nil))
}

// GetByID handles GET /group-events/:id — returns an event with participants.
func (h *GroupEventHandler) GetByID(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid group event id")
	}
	event, err := h.svc.GetEventByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "group event not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	participants, err := h.svc.GetParticipants(id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, groupEventToResponse(event, participants))
}

// Update handles PATCH /group-events/:id — patches mutable fields on an event.
func (h *GroupEventHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid group event id")
	}
	var req PatchGroupEventRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	var totalValue *int64
	if req.TotalAmount != nil {
		v := int64(math.Round(*req.TotalAmount))
		totalValue = &v
	}
	if err := h.svc.UpdateEvent(id, req.Title, req.Date, totalValue, req.Notes); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "group event not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	event, err := h.svc.GetEventByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "group event not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, groupEventToResponse(event, nil))
}

// Delete handles DELETE /group-events/:id — removes a group event.
func (h *GroupEventHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid group event id")
	}
	if err := h.svc.DeleteEvent(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "group event not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// SetParticipants handles PUT /group-events/:id/participants — replaces the participant set.
func (h *GroupEventHandler) SetParticipants(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid group event id")
	}
	var req SetParticipantsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	participants := make([]sqlite.GroupEventParticipant, len(req.Participants))
	for i, p := range req.Participants {
		var friendID *uuid.UUID
		if p.FriendID != nil {
			parsed, err := uuid.Parse(*p.FriendID)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, "invalid friend_id in participants")
			}
			friendID = &parsed
		}
		participants[i] = sqlite.GroupEventParticipant{
			EventID:     id,
			FriendID:    friendID,
			ShareAmount: int64(math.Round(p.ShareAmount)),
			IsConfirmed: p.IsConfirmed,
		}
	}
	if err := h.svc.SetParticipants(id, participants); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "group event not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
