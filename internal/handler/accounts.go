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

// AccountsServiceIface defines the service contract used by AccountsHandler.
// Using an interface allows handler tests to inject mock implementations.
type AccountsServiceIface interface {
	ListAccounts() ([]sqlite.Account, error)
	CreateAccount(a sqlite.Account) error
	GetDefault() (sqlite.Account, error)
	GetByID(id uuid.UUID) (sqlite.Account, error)
	SetDefault(id uuid.UUID) error
	UpdateAccount(id uuid.UUID, name *string, balance *int64) error
	DeleteAccount(id uuid.UUID) error
}

// Ensure *service.AccountsService satisfies AccountsServiceIface.
var _ AccountsServiceIface = (*service.AccountsService)(nil)

// AccountsHandler handles HTTP requests for /accounts routes.
type AccountsHandler struct {
	svc AccountsServiceIface
}

// NewAccountsHandler creates an AccountsHandler wired to the given service.
func NewAccountsHandler(svc *service.AccountsService) *AccountsHandler {
	return &AccountsHandler{svc: svc}
}

// Request / response types.

type CreateAccountRequest struct {
	Name           string  `json:"name"            validate:"required"`
	CurrentBalance float64 `json:"current_balance"` // stored as dollars
	Currency       string  `json:"currency"         validate:"required"`
	IsDefault      bool    `json:"is_default"`
}

type AccountResponse struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	CurrentBalance float64 `json:"current_balance"` // stored as dollars
	Currency       string  `json:"currency"`
	IsDefault      bool    `json:"is_default"`
}

type PatchAccountRequest struct {
	Name           *string  `json:"name"`
	CurrentBalance *float64 `json:"current_balance"` // nil = no change
}

// accountToResponse converts a sqlite.Account to AccountResponse.
func accountToResponse(a sqlite.Account) AccountResponse {
	return AccountResponse{
		ID:             a.ID.String(),
		Name:           a.Name,
		CurrentBalance: float64(a.CurrentBalance) / 100.0,
		Currency:       a.Currency,
		IsDefault:      a.IsDefault,
	}
}

// List handles GET /accounts — returns all accounts.
func (h *AccountsHandler) List(c echo.Context) error {
	accs, err := h.svc.ListAccounts()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]AccountResponse, len(accs))
	for i, a := range accs {
		resp[i] = accountToResponse(a)
	}
	return c.JSON(http.StatusOK, resp)
}

// Create handles POST /accounts — creates a new account.
func (h *AccountsHandler) Create(c echo.Context) error {
	var req CreateAccountRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	acc := sqlite.Account{
		ID:             uuid.New(),
		Name:           req.Name,
		CurrentBalance: int64(math.Round(req.CurrentBalance)),
		Currency:       req.Currency,
		IsDefault:      req.IsDefault,
	}
	if err := h.svc.CreateAccount(acc); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, accountToResponse(acc))
}

// GetDefault handles GET /accounts/default — returns the default account.
func (h *AccountsHandler) GetDefault(c echo.Context) error {
	acc, err := h.svc.GetDefault()
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, accountToResponse(acc))
}

// GetByID handles GET /accounts/:id — returns an account by UUID.
func (h *AccountsHandler) GetByID(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account id")
	}
	acc, err := h.svc.GetByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "account not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, accountToResponse(acc))
}

// Update handles PATCH /accounts/:id — patches mutable fields on an account.
func (h *AccountsHandler) Update(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account id")
	}
	var req PatchAccountRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	// Convert dollars to stored value if provided.
	var balanceValue *int64
	if req.CurrentBalance != nil {
		v := int64(math.Round(*req.CurrentBalance))
		balanceValue = &v
	}
	if err := h.svc.UpdateAccount(id, req.Name, balanceValue); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "account not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	// Return updated account.
	acc, err := h.svc.GetByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "account not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, accountToResponse(acc))
}

// SetDefault handles POST /accounts/:id/set-default — marks an account as default.
func (h *AccountsHandler) SetDefault(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account id")
	}
	if err := h.svc.SetDefault(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "account not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /accounts/:id — removes an account.
func (h *AccountsHandler) Delete(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account id")
	}
	if err := h.svc.DeleteAccount(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "account not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
