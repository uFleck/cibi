package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

// TestCheck verifies POST /api/check with {"amount": 75.00} returns 200 +
// {"can_buy":true,"purchasing_power":50.00,"buffer_remaining":25.00,"risk_level":"LOW"}.
func TestCheck(t *testing.T) {
	mock := &mockEngineService{
		canIBuyItDefaultFn: func(itemPrice int64) (service.EngineResult, error) {
			return service.EngineResult{
				CanBuy:          true,
				PurchasingPower: 5000,
				BufferRemaining: 2500,
				RiskLevel:       "LOW",
			}, nil
		},
	}
	h := &CheckHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		return h.Check(c)
	}, http.MethodPost, "/api/check", `{"amount":75.00}`)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d; body: %s", rec.Code, rec.Body.String())
	}
	var resp CheckResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !resp.CanBuy {
		t.Errorf("expected can_buy true, got false")
	}
	if resp.PurchasingPower != 50.0 {
		t.Errorf("expected purchasing_power 50.00, got %f", resp.PurchasingPower)
	}
	if resp.BufferRemaining != 25.0 {
		t.Errorf("expected buffer_remaining 25.00, got %f", resp.BufferRemaining)
	}
	if resp.RiskLevel != "LOW" {
		t.Errorf("expected risk_level LOW, got %s", resp.RiskLevel)
	}
}

// TestCheck_NegativeAmount verifies POST /api/check with {"amount": -5.00} returns 400
// with {"error":"..."}.
func TestCheck_NegativeAmount(t *testing.T) {
	mock := &mockEngineService{}
	h := &CheckHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		return h.Check(c)
	}, http.MethodPost, "/api/check", `{"amount":-5.00}`)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d; body: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if _, ok := resp["error"]; !ok {
		t.Errorf("expected 'error' key in response, got %v", resp)
	}
}

// TestCheck_MalformedBody verifies POST /api/check with malformed JSON returns 400
// with {"error":"..."}.
func TestCheck_MalformedBody(t *testing.T) {
	mock := &mockEngineService{}
	h := &CheckHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		return h.Check(c)
	}, http.MethodPost, "/api/check", `{bad`)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d; body: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if _, ok := resp["error"]; !ok {
		t.Errorf("expected 'error' key in response, got %v", resp)
	}
}
