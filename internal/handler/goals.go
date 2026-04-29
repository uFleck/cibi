package handler

import (
	"math"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type GoalsServiceIface interface {
	CreateGoal(in service.CreateGoalInput) (sqlite.Goal, error)
	ListGoals(accountID uuid.UUID) ([]sqlite.Goal, error)
	UpdateGoal(goalID uuid.UUID, in service.UpdateGoalInput) error
	AddLedgerEntry(in service.AddGoalLedgerInput) (sqlite.GoalLedgerEntry, error)
	ReverseLedgerEntry(goalID, entryID uuid.UUID, note *string) (sqlite.GoalLedgerEntry, error)
	ListLedger(goalID uuid.UUID) ([]sqlite.GoalLedgerEntry, error)
	BuildTracking(accountID uuid.UUID) (service.GoalsTrackingResponse, error)
	ListRecurringDue(accountID uuid.UUID, now time.Time) ([]service.GoalRecurringDueItem, error)
	ConfirmRecurringDue(itemID uuid.UUID, timestamp time.Time) error
}

var _ GoalsServiceIface = (*service.GoalsService)(nil)

type GoalsHandler struct{ svc GoalsServiceIface }

func NewGoalsHandler(svc *service.GoalsService) *GoalsHandler { return &GoalsHandler{svc: svc} }

type GoalResponse struct {
	ID            string  `json:"id"`
	AccountID     string  `json:"account_id"`
	Name          string  `json:"name"`
	Status        string  `json:"status"`
	TargetAmount  float64 `json:"target_amount"`
	InvestedTotal float64 `json:"invested_total"`
	StartDateUTC  string  `json:"start_date_utc"`
	TargetDateUTC *string `json:"target_date_utc"`
	Notes         *string `json:"notes"`
	Currency      string  `json:"currency"`
}

type GoalLedgerEntryResponse struct {
	ID              string  `json:"id"`
	GoalID          string  `json:"goal_id"`
	Amount          float64 `json:"amount"`
	Type            string  `json:"type"`
	Source          string  `json:"source"`
	Note            *string `json:"note"`
	ReversesEntryID *string `json:"reverses_entry_id"`
	TimestampUTC    string  `json:"timestamp_utc"`
}

type CreateGoalRequest struct {
	AccountID     string  `json:"account_id" validate:"required"`
	Name          string  `json:"name" validate:"required"`
	TargetAmount  float64 `json:"target_amount" validate:"required,gt=0"`
	StartDateUTC  string  `json:"start_date_utc" validate:"required"`
	TargetDateUTC *string `json:"target_date_utc"`
	Notes         *string `json:"notes"`
}

type UpdateGoalRequest struct {
	Name          *string  `json:"name"`
	TargetAmount  *float64 `json:"target_amount"`
	TargetDateUTC *string  `json:"target_date_utc"`
	Notes         *string  `json:"notes"`
}

type AddLedgerRequest struct {
	Amount       float64 `json:"amount" validate:"required,gt=0"`
	Type         string  `json:"type" validate:"required"`
	Source       string  `json:"source"`
	TimestampUTC *string `json:"timestamp_utc"`
	Note         *string `json:"note"`
}

type ReverseRequest struct {
	Note *string `json:"note"`
}

func goalResp(g sqlite.Goal) GoalResponse {
	var td *string
	if g.TargetDateUTC != nil {
		s := g.TargetDateUTC.UTC().Format(time.RFC3339)
		td = &s
	}
	return GoalResponse{ID: g.ID.String(), AccountID: g.AccountID.String(), Name: g.Name, Status: g.Status, TargetAmount: float64(g.TargetAmountCents) / 100, InvestedTotal: float64(g.InvestedTotalCents) / 100, StartDateUTC: g.StartDateUTC.UTC().Format(time.RFC3339), TargetDateUTC: td, Notes: g.Notes, Currency: g.Currency}
}
func ledgerResp(e sqlite.GoalLedgerEntry) GoalLedgerEntryResponse {
	var rev *string
	if e.ReversesEntryID != nil {
		s := e.ReversesEntryID.String()
		rev = &s
	}
	return GoalLedgerEntryResponse{ID: e.ID.String(), GoalID: e.GoalID.String(), Amount: float64(e.AmountCents) / 100, Type: e.Type, Source: e.Source, Note: e.Note, ReversesEntryID: rev, TimestampUTC: e.TimestampUTC.UTC().Format(time.RFC3339)}
}

func (h *GoalsHandler) Create(c echo.Context) error {
	var req CreateGoalRequest
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
	start, err := time.Parse(time.RFC3339, req.StartDateUTC)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start_date_utc")
	}
	var target *time.Time
	if req.TargetDateUTC != nil && *req.TargetDateUTC != "" {
		p, err := time.Parse(time.RFC3339, *req.TargetDateUTC)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid target_date_utc")
		}
		u := p.UTC()
		target = &u
	}
	g, err := h.svc.CreateGoal(service.CreateGoalInput{AccountID: accountID, Name: req.Name, TargetAmount: math.Round(req.TargetAmount*100) / 100, StartDateUTC: start.UTC(), TargetDateUTC: target, Notes: req.Notes})
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusCreated, goalResp(g))
}

func (h *GoalsHandler) List(c echo.Context) error {
	accountID, err := uuid.Parse(c.QueryParam("account_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	goals, err := h.svc.ListGoals(accountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]GoalResponse, len(goals))
	for i, g := range goals {
		resp[i] = goalResp(g)
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *GoalsHandler) Update(c echo.Context) error {
	goalID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid goal id")
	}
	var req UpdateGoalRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	var td *time.Time
	if req.TargetDateUTC != nil && *req.TargetDateUTC != "" {
		p, err := time.Parse(time.RFC3339, *req.TargetDateUTC)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid target_date_utc")
		}
		u := p.UTC()
		td = &u
	}
	if err := h.svc.UpdateGoal(goalID, service.UpdateGoalInput{Name: req.Name, TargetAmount: req.TargetAmount, TargetDateUTC: td, Notes: req.Notes}); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *GoalsHandler) AddLedger(c echo.Context) error {
	goalID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid goal id")
	}
	var req AddLedgerRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if !sqlite.ValidGoalLedgerTypes[req.Type] {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid ledger type")
	}
	if req.Source == "" {
		req.Source = "manual"
	}
	if req.Source != "manual" && req.Source != "system" && req.Source != "recurring" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid ledger source")
	}
	ts := time.Now().UTC()
	if req.TimestampUTC != nil && *req.TimestampUTC != "" {
		p, err := time.Parse(time.RFC3339, *req.TimestampUTC)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid timestamp_utc")
		}
		ts = p.UTC()
	}
	entry, err := h.svc.AddLedgerEntry(service.AddGoalLedgerInput{GoalID: goalID, Amount: req.Amount, Type: req.Type, Source: req.Source, TimestampUTC: ts, Note: req.Note})
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusCreated, ledgerResp(entry))
}

func (h *GoalsHandler) ReverseLedger(c echo.Context) error {
	goalID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid goal id")
	}
	entryID, err := uuid.Parse(c.Param("entryId"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid entry id")
	}
	var req ReverseRequest
	_ = c.Bind(&req)
	entry, err := h.svc.ReverseLedgerEntry(goalID, entryID, req.Note)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusCreated, ledgerResp(entry))
}

func (h *GoalsHandler) ListLedger(c echo.Context) error {
	goalID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid goal id")
	}
	entries, err := h.svc.ListLedger(goalID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := make([]GoalLedgerEntryResponse, len(entries))
	for i, e := range entries {
		resp[i] = ledgerResp(e)
	}
	return c.JSON(http.StatusOK, resp)
}
