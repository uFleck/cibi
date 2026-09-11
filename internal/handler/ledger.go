package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// LedgerHandler handles HTTP requests for /ledger routes.
type LedgerHandler struct {
	svc *service.LedgerService
}

// NewLedgerHandler creates a LedgerHandler wired to the given service.
func NewLedgerHandler(svc *service.LedgerService) *LedgerHandler {
	return &LedgerHandler{svc: svc}
}

// LedgerEntryResponse is the JSON shape for a ledger entry.
type LedgerEntryResponse struct {
	ID            string  `json:"id"`
	AccountID     string  `json:"account_id"`
	TransactionID *string `json:"transaction_id"`
	PayScheduleID *string `json:"pay_schedule_id"`
	EntryType     string  `json:"entry_type"`
	Amount        int64   `json:"amount"`
	Description   string  `json:"description"`
	PostedAt      string  `json:"posted_at"`
}

// RecordIncomeRequest is the JSON body for POST /ledger/income.
type RecordIncomeRequest struct {
	AccountID     string `json:"account_id"     validate:"required"`
	PayScheduleID string `json:"pay_schedule_id" validate:"required"`
	Amount        int64  `json:"amount"         validate:"required"`
	Description   string `json:"description"    validate:"required"`
}

func toLedgerEntryResponse(e sqlite.LedgerEntry) LedgerEntryResponse {
	r := LedgerEntryResponse{
		ID:          e.ID.String(),
		AccountID:   e.AccountID.String(),
		EntryType:   e.EntryType,
		Amount:      e.Amount,
		Description: e.Description,
		PostedAt:    e.PostedAt.UTC().Format(time.RFC3339),
	}
	if e.TransactionID != nil {
		s := e.TransactionID.String()
		r.TransactionID = &s
	}
	if e.PayScheduleID != nil {
		s := e.PayScheduleID.String()
		r.PayScheduleID = &s
	}
	return r
}

// List returns all ledger entries for the account given by ?account_id=.
func (h *LedgerHandler) List(c echo.Context) error {
	accountIDStr := c.QueryParam("account_id")
	accountID, err := uuid.Parse(accountIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	entries, err := h.svc.List(accountID)
	if err != nil {
		return err
	}
	resp := make([]LedgerEntryResponse, len(entries))
	for i, e := range entries {
		resp[i] = toLedgerEntryResponse(e)
	}
	return c.JSON(http.StatusOK, resp)
}

// Delete removes a ledger entry by :id.
func (h *LedgerHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	if err := h.svc.Delete(id); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// RecordIncome records an income ledger entry.
func (h *LedgerHandler) RecordIncome(c echo.Context) error {
	var req RecordIncomeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	accountID, err := uuid.Parse(req.AccountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	payScheduleID, err := uuid.Parse(req.PayScheduleID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid pay_schedule_id")
	}
	if err := h.svc.RecordIncome(accountID, payScheduleID, req.Amount, req.Description); err != nil {
		return err
	}
	return c.NoContent(http.StatusCreated)
}
