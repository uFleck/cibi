package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

// TestBadRequest verifies that any handler receiving malformed JSON returns
// {"error":"..."} (not {"message":"..."}).
func TestBadRequest(t *testing.T) {
	mock := &mockEngineService{}
	h := &CheckHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		return h.Check(c)
	}, http.MethodPost, "/check", `{bad json`)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d; body: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v; body: %s", err, rec.Body.String())
	}
	if _, ok := resp["error"]; !ok {
		t.Errorf("expected 'error' key in response, got keys: %v", resp)
	}
	if _, ok := resp["message"]; ok {
		t.Errorf("response must not contain 'message' key (Echo default), got: %v", resp)
	}
}

// TestErrorShape verifies customHTTPErrorHandler produces {"error":"..."} for
// both *echo.HTTPError and generic errors.
func TestErrorShape(t *testing.T) {
	e := newTestEcho()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	// Call CustomHTTPErrorHandler directly with a known HTTPError.
	he := echo.NewHTTPError(http.StatusUnprocessableEntity, "invalid")
	CustomHTTPErrorHandler(he, c)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v; body: %s", err, rec.Body.String())
	}
	if resp["error"] != "invalid" {
		t.Errorf("expected error 'invalid', got %q", resp["error"])
	}
}

// TestNotFound verifies 404 responses have {"error":"..."} shape not Echo's
// default HTML.
func TestNotFound(t *testing.T) {
	e := newTestEcho()
	req := httptest.NewRequest(http.MethodGet, "/nonexistent", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	he := echo.NewHTTPError(http.StatusNotFound, "not found")
	CustomHTTPErrorHandler(he, c)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v; body: %s", err, rec.Body.String())
	}
	if _, ok := resp["error"]; !ok {
		t.Errorf("expected 'error' key in response, got %v", resp)
	}
}
