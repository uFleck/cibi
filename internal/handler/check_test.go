package handler

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

// TestCheck verifies POST /api/check with {"amount": 75.00} returns 200 +
// {"can_buy":true,"purchasing_power":50.00,"buffer_remaining":25.00,"risk_level":"LOW"}.
func TestCheck(t *testing.T) {
	var gotItemPrice int64
	mock := &mockEngineService{
		canIBuyItDefaultFn: func(itemPrice int64) (service.EngineResult, error) {
			gotItemPrice = itemPrice
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
	if gotItemPrice != 7500 {
		t.Errorf("expected engine itemPrice 7500 cents, got %d", gotItemPrice)
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

func TestCheck_WAITWithGoalImpacts(t *testing.T) {
	waitDate := "2026-05-01"
	goalID := uuid.New()
	mock := &mockEngineService{
		canIBuyItDefaultFn: func(itemPrice int64) (service.EngineResult, error) {
			if itemPrice != 5000 {
				t.Fatalf("expected 5000 cents, got %d", itemPrice)
			}
			return service.EngineResult{
				CanBuy:                false,
				PurchasingPower:       -1200,
				BufferRemaining:       -6200,
				RiskLevel:             "WAIT",
				WillAffordAfterPayday: true,
				WaitUntil:             mustDate(t, waitDate),
				GoalImpacts: []service.GoalImpact{{
					GoalID:            goalID,
					GoalName:          "Emergency Fund",
					RemainingBefore:   1000,
					RemainingAfter:    0,
					ProgressBeforePct: 96,
					ProgressAfterPct:  100,
					Severity:          "high",
				}},
			}, nil
		},
	}
	h := &CheckHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		return h.Check(c)
	}, http.MethodPost, "/api/check", `{"amount":50.00}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body: %s", rec.Code, rec.Body.String())
	}
	var resp CheckResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.RiskLevel != "WAIT" || !resp.WillAffordAfterPayday || resp.WaitUntil == nil || *resp.WaitUntil != waitDate {
		t.Fatalf("unexpected WAIT fields: %+v", resp)
	}
	if len(resp.GoalImpacts) != 1 {
		t.Fatalf("expected one goal impact, got %d", len(resp.GoalImpacts))
	}
	if resp.GoalImpacts[0].GoalID != goalID.String() || resp.GoalImpacts[0].Severity != "high" {
		t.Fatalf("unexpected goal impact payload: %+v", resp.GoalImpacts[0])
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

func TestCheck_WithAccountID(t *testing.T) {
	const accountID = "3f4fc70a-7f88-4b2e-8d1a-c07f522f8e3d"
	var usedCustomAccount bool
	mock := &mockEngineService{
		canIBuyItFn: func(id uuid.UUID, itemPrice int64) (service.EngineResult, error) {
			if id.String() == accountID && itemPrice == 1234 {
				usedCustomAccount = true
			}
			return service.EngineResult{CanBuy: true, PurchasingPower: 5000, BufferRemaining: 3766, RiskLevel: "LOW"}, nil
		},
	}
	h := &CheckHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		return h.Check(c)
	}, http.MethodPost, "/api/check", `{"amount":12.34,"account_id":"`+accountID+`"}`)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d; body: %s", rec.Code, rec.Body.String())
	}
	if !usedCustomAccount {
		t.Errorf("expected check to use account_id path")
	}
}

func mustDate(t *testing.T, value string) *time.Time {
	t.Helper()
	tm, err := time.Parse("2006-01-02", value)
	if err != nil {
		t.Fatalf("parse date: %v", err)
	}
	return &tm
}
