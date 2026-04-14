package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// PayScheduleServiceIface defines the service contract used by PayScheduleHandler.
type PayScheduleServiceIface interface {
	CreatePaySchedule(accountID uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth, dayOfMonth2 *int, label *string, amount int64) (sqlite.PaySchedule, error)
	ListPaySchedules(accountID uuid.UUID) ([]sqlite.PaySchedule, error)
	UpdatePaySchedule(id uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth, dayOfMonth2 *int, label *string, amount int64) error
	DeletePaySchedule(id uuid.UUID) error
}

var _ PayScheduleServiceIface = (*service.PayScheduleService)(nil)

// PayScheduleHandler handles HTTP requests for /pay-schedule routes.
type PayScheduleHandler struct {
	svc    PayScheduleServiceIface
	accSvc AccountsServiceIface
}

// NewPayScheduleHandler creates a PayScheduleHandler wired to the given services.
func NewPayScheduleHandler(svc *service.PayScheduleService, accSvc AccountsServiceIface) *PayScheduleHandler {
	return &PayScheduleHandler{svc: svc, accSvc: accSvc}
}

// Request / response types.

type CreatePayScheduleRequest struct {
	AccountID   string  `json:"account_id"    validate:"required"`
	Frequency   string  `json:"frequency"     validate:"required,oneof=weekly bi-weekly semi-monthly monthly"`
	AnchorDate  string  `json:"anchor_date"   validate:"required"` // YYYY-MM-DD
	DayOfMonth  *int    `json:"day_of_month"`
	DayOfMonth2 *int    `json:"day_of_month_2"`
	Label       *string `json:"label"`
	Amount      int64   `json:"amount" validate:"min=0"` // cents
}

type PatchPayScheduleRequest struct {
	Frequency   string  `json:"frequency"     validate:"required,oneof=weekly bi-weekly semi-monthly monthly"`
	AnchorDate  string  `json:"anchor_date"   validate:"required"` // YYYY-MM-DD
	DayOfMonth  *int    `json:"day_of_month"`
	DayOfMonth2 *int    `json:"day_of_month_2"`
	Label       *string `json:"label"`
	Amount      int64   `json:"amount" validate:"min=0"` // cents
}

type PayScheduleResponse struct {
	ID          string  `json:"id"`
	AccountID   string  `json:"account_id"`
	Frequency   string  `json:"frequency"`
	AnchorDate  string  `json:"anchor_date"` // YYYY-MM-DD
	Amount      int64   `json:"amount"`      // cents
	DayOfMonth  *int    `json:"day_of_month"`
	DayOfMonth2 *int    `json:"day_of_month_2"`
	Label       *string `json:"label"`
}

// payScheduleToResponse converts a sqlite.PaySchedule to PayScheduleResponse.
func payScheduleToResponse(ps sqlite.PaySchedule) PayScheduleResponse {
	return PayScheduleResponse{
		ID:          ps.ID.String(),
		AccountID:   ps.AccountID.String(),
		Frequency:   ps.Frequency,
		AnchorDate:  ps.AnchorDate.Format("2006-01-02"),
		Amount:      ps.Amount,
		DayOfMonth2: ps.DayOfMonth2,
		Label:       ps.Label,
	}
}

// List handles GET /api/pay-schedule?account_id=:id
func (h *PayScheduleHandler) List(c echo.Context) error {
	accountIDStr := c.QueryParam("account_id")
	if accountIDStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "account_id query param required")
	}
	accountID, err := uuid.Parse(accountIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	schedules, err := h.svc.ListPaySchedules(accountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]PayScheduleResponse, len(schedules))
	for i, ps := range schedules {
		resp[i] = payScheduleToResponse(ps)
	}
	return c.JSON(http.StatusOK, resp)
}

// Create handles POST /api/pay-schedule
func (h *PayScheduleHandler) Create(c echo.Context) error {
	var req CreatePayScheduleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	accountID, err := uuid.Parse(req.AccountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	anchorDate, err := time.Parse("2006-01-02", req.AnchorDate)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid anchor_date format, use YYYY-MM-DD")
	}
	ps, err := h.svc.CreatePaySchedule(accountID, req.Frequency, anchorDate,
		req.DayOfMonth, req.DayOfMonth2, req.Label, req.Amount)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, payScheduleToResponse(ps))
}

// Update handles PATCH /api/pay-schedule/:id
func (h *PayScheduleHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid schedule id")
	}
	var req PatchPayScheduleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	anchorDate, err := time.Parse("2006-01-02", req.AnchorDate)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid anchor_date format, use YYYY-MM-DD")
	}
	if err := h.svc.UpdatePaySchedule(id, req.Frequency, anchorDate,
		req.DayOfMonth, req.DayOfMonth2, req.Label, req.Amount); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /api/pay-schedule/:id
func (h *PayScheduleHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid schedule id")
	}
	if err := h.svc.DeletePaySchedule(id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
