package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type mockGoalsService struct {
	createFn   func(in service.CreateGoalInput) (sqlite.Goal, error)
	listFn     func(accountID uuid.UUID) ([]sqlite.Goal, error)
	updateFn   func(goalID uuid.UUID, in service.UpdateGoalInput) error
	addFn      func(in service.AddGoalLedgerInput) (sqlite.GoalLedgerEntry, error)
	reverseFn  func(goalID, entryID uuid.UUID, note *string) (sqlite.GoalLedgerEntry, error)
	ledgerFn   func(goalID uuid.UUID) ([]sqlite.GoalLedgerEntry, error)
	trackingFn func(accountID uuid.UUID) (service.GoalsTrackingResponse, error)
}

func (m *mockGoalsService) CreateGoal(in service.CreateGoalInput) (sqlite.Goal, error) {
	return m.createFn(in)
}
func (m *mockGoalsService) ListGoals(accountID uuid.UUID) ([]sqlite.Goal, error) {
	return m.listFn(accountID)
}
func (m *mockGoalsService) UpdateGoal(goalID uuid.UUID, in service.UpdateGoalInput) error {
	return m.updateFn(goalID, in)
}
func (m *mockGoalsService) AddLedgerEntry(in service.AddGoalLedgerInput) (sqlite.GoalLedgerEntry, error) {
	return m.addFn(in)
}
func (m *mockGoalsService) ReverseLedgerEntry(goalID, entryID uuid.UUID, note *string) (sqlite.GoalLedgerEntry, error) {
	return m.reverseFn(goalID, entryID, note)
}
func (m *mockGoalsService) ListLedger(goalID uuid.UUID) ([]sqlite.GoalLedgerEntry, error) {
	return m.ledgerFn(goalID)
}
func (m *mockGoalsService) BuildTracking(accountID uuid.UUID) (service.GoalsTrackingResponse, error) {
	return m.trackingFn(accountID)
}

func TestGoalsCreate_ConvertsDecimalsToServiceBoundary(t *testing.T) {
	accID := uuid.New()
	called := false
	h := &GoalsHandler{svc: &mockGoalsService{createFn: func(in service.CreateGoalInput) (sqlite.Goal, error) {
		called = true
		if in.TargetAmount != 123.45 {
			t.Fatalf("target amount mismatch: %v", in.TargetAmount)
		}
		return sqlite.Goal{ID: uuid.New(), AccountID: accID, Name: in.Name, Status: "active", TargetAmountCents: 12345, StartDateUTC: in.StartDateUTC, Currency: "BRL"}, nil
	}}}
	body := `{"account_id":"` + accID.String() + `","name":"Trip","target_amount":123.45,"start_date_utc":"2026-04-29T00:00:00Z"}`
	rec, c := makeRequest(http.MethodPost, "/api/goals", body)
	if err := h.Create(c); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if !called || rec.Code != http.StatusCreated {
		t.Fatalf("unexpected result code=%d called=%v", rec.Code, called)
	}
}

func TestGoalsAddLedger_ValidationAndErrorShape(t *testing.T) {
	goalID := uuid.New()
	h := &GoalsHandler{svc: &mockGoalsService{addFn: func(in service.AddGoalLedgerInput) (sqlite.GoalLedgerEntry, error) {
		return sqlite.GoalLedgerEntry{}, nil
	}}}
	rec := serveRequest(func(c echo.Context) error {
		c.SetPath("/api/goals/:id/ledger")
		c.SetParamNames("id")
		c.SetParamValues(goalID.String())
		return h.AddLedger(c)
	}, http.MethodPost, "/api/goals/"+goalID.String()+"/ledger", `{"amount":10,"type":"bad","source":"manual"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "error") {
		t.Fatalf("expected error json")
	}
}

func TestGoalsRoutes_NoDeleteReverseExists(t *testing.T) {
	content, _ := os.ReadFile("routes.go")
	s := string(content)
	if strings.Contains(s, "goals.DELETE") {
		t.Fatalf("delete endpoint should not exist")
	}
	if !strings.Contains(s, "/:id/ledger/:entryId/reverse") {
		t.Fatalf("reverse endpoint missing")
	}
}

func TestGoalsListLedger_Success(t *testing.T) {
	goalID := uuid.New()
	h := &GoalsHandler{svc: &mockGoalsService{ledgerFn: func(id uuid.UUID) ([]sqlite.GoalLedgerEntry, error) {
		return []sqlite.GoalLedgerEntry{{ID: uuid.New(), GoalID: goalID, AmountCents: 1000, Type: "contribution", Source: "manual", TimestampUTC: time.Now().UTC()}}, nil
	}}}
	rec, c := makeRequest(http.MethodGet, "/api/goals/"+goalID.String()+"/ledger", "")
	c.SetParamNames("id")
	c.SetParamValues(goalID.String())
	if err := h.ListLedger(c); err != nil {
		t.Fatalf("ListLedger: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rec.Code)
	}
	var out []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
}
