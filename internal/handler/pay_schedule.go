package handler

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// PayScheduleServiceIface defines the service contract used by PayScheduleHandler.
type PayScheduleServiceIface interface {
	SetPaySchedule(accountID uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth, dayOfMonth2 *int, label *string) error
	GetPaySchedule(accountID uuid.UUID) (sqlite.PaySchedule, error)
}

var _ PayScheduleServiceIface = (*service.PayScheduleService)(nil)

// PayScheduleHandler handles HTTP requests for /pay-schedule routes.
type PayScheduleHandler struct {
	svc    *service.PayScheduleService
	accSvc AccountsServiceIface
}

// NewPayScheduleHandler creates a PayScheduleHandler wired to the given services.
func NewPayScheduleHandler(svc *service.PayScheduleService, accSvc AccountsServiceIface) *PayScheduleHandler {
	return &PayScheduleHandler{svc: svc, accSvc: accSvc}
}

// Request / response types.

type SetPayScheduleRequest struct {
	AccountID   string  `json:"account_id"`
	Frequency   string  `json:"frequency" validate:"required,oneof=weekly biweekly monthly"`
	AnchorDate  string  `json:"anchor_date" validate:"required"` // YYYY-MM-DD
	DayOfMonth  *int    `json:"day_of_month"`                    // 1-31
	DayOfMonth2 *int    `json:"day_of_month_2"`                  // for biweekly: 2nd day
	Label       *string `json:"label"`
}

type PayScheduleResponse struct {
	ID          string  `json:"id"`
	AccountID   string  `json:"account_id"`
	Frequency   string  `json:"frequency"`
	AnchorDate  string  `json:"anchor_date"`
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
		DayOfMonth:  ps.DayOfMonth2, // Primary day stored here
		DayOfMonth2: nil,            // Secondary day only used in DB
		Label:       ps.Label,
	}
}

// CreateOrUpdate handles POST /pay-schedule — creates or updates a pay schedule.
func (h *PayScheduleHandler) CreateOrUpdate(c echo.Context) error {
	var req SetPayScheduleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// Parse account ID — fall back to default account if not provided.
	var accountID uuid.UUID
	var err error
	if req.AccountID == "" {
		acc, accErr := h.accSvc.GetDefault()
		if accErr != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "account_id is required and no default account exists")
		}
		accountID = acc.ID
	} else {
		accountID, err = uuid.Parse(req.AccountID)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
		}
	}

	// Parse anchor date.
	anchorDate, err := time.Parse("2006-01-02", req.AnchorDate)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid anchor_date format, use YYYY-MM-DD")
	}

	// Validate frequency and day of month.
	if req.Frequency == "monthly" && req.DayOfMonth == nil {
		return echo.NewHTTPError(http.StatusBadRequest, "day_of_month required for monthly frequency")
	}
	if req.Frequency == "biweekly" && (req.DayOfMonth == nil || req.DayOfMonth2 == nil) {
		return echo.NewHTTPError(http.StatusBadRequest, "day_of_month and day_of_month_2 required for biweekly frequency")
	}

	// Call service to create or update.
	if err := h.svc.SetPaySchedule(accountID, req.Frequency, anchorDate, req.DayOfMonth, req.DayOfMonth2, req.Label); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	// Fetch the created/updated schedule to return.
	ps, err := h.svc.GetPaySchedule(accountID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "pay schedule not found after creation")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, payScheduleToResponse(ps))
}
