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

// PeerDebtServiceIface defines the service contract used by PeerDebtHandler.
type PeerDebtServiceIface interface {
	ListByFriend(friendID uuid.UUID) ([]sqlite.PeerDebt, error)
	ListAll() ([]sqlite.PeerDebt, error)
	CreateDebt(d sqlite.PeerDebt) (sqlite.PeerDebt, error)
	UpdateDebt(id uuid.UUID, amount *int64, description *string) error
	DeleteDebt(id uuid.UUID) error
	ConfirmInstallment(id uuid.UUID) error
	GetBalanceByFriend(friendID uuid.UUID) (sqlite.PeerDebtBalance, error)
	GetGlobalBalance() (sqlite.GlobalPeerBalance, error)
}

// Ensure *service.PeerDebtService satisfies PeerDebtServiceIface.
var _ PeerDebtServiceIface = (*service.PeerDebtService)(nil)

// PeerDebtHandler handles HTTP requests for /peer-debts routes.
type PeerDebtHandler struct {
	svc PeerDebtServiceIface
}

// NewPeerDebtHandler creates a PeerDebtHandler wired to the given service.
func NewPeerDebtHandler(svc *service.PeerDebtService) *PeerDebtHandler {
	return &PeerDebtHandler{svc: svc}
}

// Request / response types.

type CreatePeerDebtRequest struct {
	FriendID          string   `json:"friend_id"          validate:"required"`
	Amount            float64  `json:"amount"             validate:"required"` // dollars, sign = direction
	Description       string   `json:"description"        validate:"required"`
	Date              string   `json:"date"               validate:"required"` // RFC3339
	IsInstallment     bool     `json:"is_installment"`
	TotalInstallments *int64   `json:"total_installments"`
	Frequency         *string  `json:"frequency"`
	AnchorDate        *string  `json:"anchor_date"`
}

type PatchPeerDebtRequest struct {
	Amount      *float64 `json:"amount"`
	Description *string  `json:"description"`
}

type PeerDebtResponse struct {
	ID                string  `json:"id"`
	FriendID          string  `json:"friend_id"`
	Amount            float64 `json:"amount"` // dollars
	Description       string  `json:"description"`
	Date              string  `json:"date"`
	IsInstallment     bool    `json:"is_installment"`
	TotalInstallments *int64  `json:"total_installments"`
	PaidInstallments  int64   `json:"paid_installments"`
	Frequency         *string `json:"frequency"`
	AnchorDate        *string `json:"anchor_date"`
	IsConfirmed       bool    `json:"is_confirmed"`
}

// peerDebtToResponse converts a sqlite.PeerDebt to PeerDebtResponse (cents → dollars).
func peerDebtToResponse(d sqlite.PeerDebt) PeerDebtResponse {
	return PeerDebtResponse{
		ID:                d.ID.String(),
		FriendID:          d.FriendID.String(),
		Amount:            float64(d.Amount) / 100.0,
		Description:       d.Description,
		Date:              d.Date,
		IsInstallment:     d.IsInstallment,
		TotalInstallments: d.TotalInstallments,
		PaidInstallments:  d.PaidInstallments,
		Frequency:         d.Frequency,
		AnchorDate:        d.AnchorDate,
		IsConfirmed:       d.IsConfirmed,
	}
}

// List handles GET /peer-debts — optional ?friend_id= query param.
// If friend_id is present, returns debts for that friend; otherwise returns all debts.
func (h *PeerDebtHandler) List(c echo.Context) error {
	friendIDStr := c.QueryParam("friend_id")
	if friendIDStr != "" {
		friendID, err := uuid.Parse(friendIDStr)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid friend_id")
		}
		debts, err := h.svc.ListByFriend(friendID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		resp := make([]PeerDebtResponse, len(debts))
		for i, d := range debts {
			resp[i] = peerDebtToResponse(d)
		}
		return c.JSON(http.StatusOK, resp)
	}

	debts, err := h.svc.ListAll()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]PeerDebtResponse, len(debts))
	for i, d := range debts {
		resp[i] = peerDebtToResponse(d)
	}
	return c.JSON(http.StatusOK, resp)
}

// Create handles POST /peer-debts — creates a new peer debt.
func (h *PeerDebtHandler) Create(c echo.Context) error {
	var req CreatePeerDebtRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.IsInstallment && (req.TotalInstallments == nil || *req.TotalInstallments <= 0) {
		return echo.NewHTTPError(http.StatusBadRequest,
			"total_installments must be a positive integer when is_installment is true")
	}
	friendID, err := uuid.Parse(req.FriendID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid friend_id")
	}
	d := sqlite.PeerDebt{
		FriendID:          friendID,
		Amount:            int64(math.Round(req.Amount)),
		Description:       req.Description,
		Date:              req.Date,
		IsInstallment:     req.IsInstallment,
		TotalInstallments: req.TotalInstallments,
		Frequency:         req.Frequency,
		AnchorDate:        req.AnchorDate,
	}
	created, err := h.svc.CreateDebt(d)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, peerDebtToResponse(created))
}

// Update handles PATCH /peer-debts/:id — patches amount and/or description.
func (h *PeerDebtHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid peer debt id")
	}
	var req PatchPeerDebtRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	var amountValue *int64
	if req.Amount != nil {
		v := int64(math.Round(*req.Amount))
		amountValue = &v
	}
	if err := h.svc.UpdateDebt(id, amountValue, req.Description); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "peer debt not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /peer-debts/:id — removes a peer debt.
func (h *PeerDebtHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid peer debt id")
	}
	if err := h.svc.DeleteDebt(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "peer debt not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// Confirm handles POST /peer-debts/:id/confirm — confirms or increments an installment.
func (h *PeerDebtHandler) Confirm(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid peer debt id")
	}
	if err := h.svc.ConfirmInstallment(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "peer debt not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
