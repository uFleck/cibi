package handler

import (
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

func TestGoalsTrackingHandler_OK(t *testing.T) {
	accID := uuid.New()
	h := &GoalsHandler{svc: &mockGoalsService{trackingFn: func(accountID uuid.UUID) (service.GoalsTrackingResponse, error) {
		if accountID != accID {
			t.Fatalf("account id mismatch")
		}
		return service.GoalsTrackingResponse{UpdatedAtUTC: time.Now().UTC().Format(time.RFC3339)}, nil
	}}}

	rec, c := makeRequest(http.MethodGet, "/api/goals/tracking?account_id="+accID.String(), "")
	if err := h.Tracking(c); err != nil {
		t.Fatalf("Tracking: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rec.Code)
	}
}

func TestGoalsTrackingHandler_InvalidAccountID(t *testing.T) {
	h := &GoalsHandler{svc: &mockGoalsService{trackingFn: func(accountID uuid.UUID) (service.GoalsTrackingResponse, error) {
		return service.GoalsTrackingResponse{}, nil
	}}}

	_, c := makeRequest(http.MethodGet, "/api/goals/tracking?account_id=bad-uuid", "")
	err := h.Tracking(c)
	if err == nil {
		t.Fatalf("expected error")
	}
	httperr, ok := err.(*echo.HTTPError)
	if !ok || httperr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %#v", err)
	}
}
