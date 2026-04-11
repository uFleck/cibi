package handler

import (
	"database/sql"
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// TransactionsServiceIface defines the service contract used by TransactionsHandler.
type TransactionsServiceIface interface {
	ListTransactions(accountID uuid.UUID) ([]sqlite.Transaction, error)
	CreateTransaction(t sqlite.Transaction) error
	GetTransaction(id uuid.UUID) (sqlite.Transaction, error)
	UpdateTransaction(id uuid.UUID, upd sqlite.UpdateTransaction) error
	DeleteTransaction(id uuid.UUID) error
}

// Ensure *service.TransactionsService satisfies TransactionsServiceIface.
var _ TransactionsServiceIface = (*service.TransactionsService)(nil)

// TransactionsHandler handles HTTP requests for /transactions routes.
type TransactionsHandler struct {
	svc TransactionsServiceIface
}

// NewTransactionsHandler creates a TransactionsHandler wired to the given service.
func NewTransactionsHandler(svc *service.TransactionsService) *TransactionsHandler {
	return &TransactionsHandler{svc: svc}
}

// Request / response types.

type CreateTransactionRequest struct {
	AccountID   string  `json:"account_id"  validate:"required"`
	Amount      float64 `json:"amount"      validate:"required"`
	Description string  `json:"description" validate:"required"`
	Category    string  `json:"category"`
	IsRecurring bool    `json:"is_recurring"`
	Frequency   *string `json:"frequency"`   // required if is_recurring
	AnchorDate  *string `json:"anchor_date"` // RFC3339; required if is_recurring
}

type PatchTransactionRequest struct {
	Description    *string  `json:"description"`
	Category       *string  `json:"category"`
	Amount         *float64 `json:"amount"`          // nil = no change
	NextOccurrence *string  `json:"next_occurrence"` // RFC3339; nil = no change
}

type TransactionResponse struct {
	ID             string  `json:"id"`
	AccountID      string  `json:"account_id"`
	Amount         float64 `json:"amount"`          // cents → dollars
	Description    string  `json:"description"`
	Category       string  `json:"category"`
	Timestamp      string  `json:"timestamp"`       // RFC3339
	IsRecurring    bool    `json:"is_recurring"`
	Frequency      *string `json:"frequency"`
	AnchorDate     *string `json:"anchor_date"`
	NextOccurrence *string `json:"next_occurrence"`
}

// txnToResponse converts a sqlite.Transaction to TransactionResponse.
func txnToResponse(t sqlite.Transaction) TransactionResponse {
	resp := TransactionResponse{
		ID:          t.ID.String(),
		AccountID:   t.AccountID.String(),
		Amount:      float64(t.Amount) / 100.0,
		Description: t.Description,
		Category:    t.Category,
		Timestamp:   t.Timestamp.UTC().Format(time.RFC3339),
		IsRecurring: t.IsRecurring,
		Frequency:   t.Frequency,
	}
	if t.AnchorDate != nil {
		s := t.AnchorDate.UTC().Format(time.RFC3339)
		resp.AnchorDate = &s
	}
	if t.NextOccurrence != nil {
		s := t.NextOccurrence.UTC().Format(time.RFC3339)
		resp.NextOccurrence = &s
	}
	return resp
}

// List handles GET /transactions?account_id=<uuid> — returns transactions for an account.
func (h *TransactionsHandler) List(c echo.Context) error {
	accountIDStr := c.QueryParam("account_id")
	if accountIDStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "account_id query parameter is required")
	}
	accountID, err := uuid.Parse(accountIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	txns, err := h.svc.ListTransactions(accountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]TransactionResponse, len(txns))
	for i, t := range txns {
		resp[i] = txnToResponse(t)
	}
	return c.JSON(http.StatusOK, resp)
}

// Create handles POST /transactions — creates a new transaction.
func (h *TransactionsHandler) Create(c echo.Context) error {
	var req CreateTransactionRequest
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
	t := sqlite.Transaction{
		ID:          uuid.New(),
		AccountID:   accountID,
		Amount:      int64(math.Round(req.Amount * 100)),
		Description: req.Description,
		Category:    req.Category,
		Timestamp:   time.Now().UTC(),
		IsRecurring: req.IsRecurring,
		Frequency:   req.Frequency,
	}
	if req.AnchorDate != nil {
		parsed, err := time.Parse(time.RFC3339, *req.AnchorDate)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid anchor_date: must be RFC3339")
		}
		utc := parsed.UTC()
		t.AnchorDate = &utc
	}
	if err := h.svc.CreateTransaction(t); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, txnToResponse(t))
}

// Update handles PATCH /transactions/:id — patches mutable fields on a transaction.
func (h *TransactionsHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid transaction id")
	}
	var req PatchTransactionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	upd := sqlite.UpdateTransaction{
		Description: req.Description,
		Category:    req.Category,
	}

	// Convert *float64 dollars to *int64 cents if provided.
	if req.Amount != nil {
		v := int64(math.Round(*req.Amount * 100))
		upd.Amount = &v
	}

	// Parse next_occurrence if provided.
	if req.NextOccurrence != nil {
		parsed, err := time.Parse(time.RFC3339, *req.NextOccurrence)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid next_occurrence: must be RFC3339")
		}
		utc := parsed.UTC()
		upd.NextOccurrence = &utc
	}

	if err := h.svc.UpdateTransaction(id, upd); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "transaction not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	// Return updated transaction.
	txn, err := h.svc.GetTransaction(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "transaction not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, txnToResponse(txn))
}

// Delete handles DELETE /transactions/:id — removes a transaction.
func (h *TransactionsHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid transaction id")
	}
	if err := h.svc.DeleteTransaction(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "transaction not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
