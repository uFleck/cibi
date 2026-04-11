package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// TestListAccounts verifies GET /accounts returns 200 + JSON array.
func TestListAccounts(t *testing.T) {
	id1 := uuid.New()
	mock := &mockAccountsService{
		listFn: func() ([]sqlite.Account, error) {
			return []sqlite.Account{
				{ID: id1, Name: "Checking", CurrentBalance: 10000, Currency: "USD", IsDefault: true},
			}, nil
		},
	}
	h := &AccountsHandler{svc: mock}
	rec, c := makeRequest(http.MethodGet, "/accounts", "")
	if err := h.List(c); err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var resp []AccountResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp) != 1 {
		t.Errorf("expected 1 account, got %d", len(resp))
	}
	if resp[0].Name != "Checking" {
		t.Errorf("expected name Checking, got %s", resp[0].Name)
	}
	if resp[0].CurrentBalance != 100.0 {
		t.Errorf("expected balance 100.00, got %f", resp[0].CurrentBalance)
	}
}

// TestCreateAccount verifies POST /accounts with valid body returns 201.
func TestCreateAccount(t *testing.T) {
	mock := &mockAccountsService{
		createFn: func(a sqlite.Account) error {
			return nil
		},
	}
	h := &AccountsHandler{svc: mock}
	body := `{"name":"Savings","current_balance":500.00,"currency":"USD","is_default":false}`
	rec, c := makeRequest(http.MethodPost, "/accounts", body)
	if err := h.Create(c); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", rec.Code)
	}
	var resp AccountResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Name != "Savings" {
		t.Errorf("expected name Savings, got %s", resp.Name)
	}
	if resp.CurrentBalance != 500.0 {
		t.Errorf("expected balance 500.00, got %f", resp.CurrentBalance)
	}
}

// TestGetAccountByID verifies GET /accounts/:id returns 200 for a known ID.
func TestGetAccountByID(t *testing.T) {
	id := uuid.New()
	mock := &mockAccountsService{
		getByIDFn: func(reqID uuid.UUID) (sqlite.Account, error) {
			if reqID != id {
				return sqlite.Account{}, fmt.Errorf("unexpected id")
			}
			return sqlite.Account{ID: id, Name: "Main", CurrentBalance: 20000, Currency: "USD", IsDefault: true}, nil
		},
	}
	h := &AccountsHandler{svc: mock}
	rec, c := makeRequest(http.MethodGet, "/accounts/"+id.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(id.String())
	if err := h.GetByID(c); err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var resp AccountResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.ID != id.String() {
		t.Errorf("expected id %s, got %s", id.String(), resp.ID)
	}
}

// TestGetAccountByID_NotFound verifies GET /accounts/:id with an unknown ID returns 404
// with body {"error":"account not found"}.
func TestGetAccountByID_NotFound(t *testing.T) {
	id := uuid.New()
	mock := &mockAccountsService{
		getByIDFn: func(_ uuid.UUID) (sqlite.Account, error) {
			return sqlite.Account{}, fmt.Errorf("accounts.GetByID: %w", sql.ErrNoRows)
		},
	}
	h := &AccountsHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		c.SetParamNames("id")
		c.SetParamValues(id.String())
		return h.GetByID(c)
	}, http.MethodGet, "/accounts/"+id.String(), "")

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["error"] != "account not found" {
		t.Errorf("expected error 'account not found', got %q", resp["error"])
	}
}

// TestUpdateAccount verifies PATCH /accounts/:id with valid body returns 200.
func TestUpdateAccount(t *testing.T) {
	id := uuid.New()
	newName := "Updated"
	mock := &mockAccountsService{
		updateFn: func(_ uuid.UUID, name *string, _ *int64) error {
			return nil
		},
		getByIDFn: func(_ uuid.UUID) (sqlite.Account, error) {
			return sqlite.Account{ID: id, Name: newName, CurrentBalance: 5000, Currency: "USD", IsDefault: false}, nil
		},
	}
	h := &AccountsHandler{svc: mock}
	body := `{"name":"Updated"}`
	rec, c := makeRequest(http.MethodPatch, "/accounts/"+id.String(), body)
	c.SetParamNames("id")
	c.SetParamValues(id.String())
	if err := h.Update(c); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var resp AccountResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Name != newName {
		t.Errorf("expected name %s, got %s", newName, resp.Name)
	}
}

// TestDeleteAccount verifies DELETE /accounts/:id returns 204.
func TestDeleteAccount(t *testing.T) {
	id := uuid.New()
	mock := &mockAccountsService{
		deleteFn: func(_ uuid.UUID) error {
			return nil
		},
	}
	h := &AccountsHandler{svc: mock}
	rec, c := makeRequest(http.MethodDelete, "/accounts/"+id.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(id.String())
	if err := h.Delete(c); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}
