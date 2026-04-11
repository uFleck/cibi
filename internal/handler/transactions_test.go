package handler

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// TestListTransactions verifies GET /transactions?account_id=<uuid> returns 200.
func TestListTransactions(t *testing.T) {
	accountID := uuid.New()
	txnID := uuid.New()
	now := time.Now().UTC()
	mock := &mockTransactionsService{
		listFn: func(id uuid.UUID) ([]sqlite.Transaction, error) {
			return []sqlite.Transaction{
				{
					ID:          txnID,
					AccountID:   accountID,
					Amount:      -2500,
					Description: "Coffee",
					Category:    "Food",
					Timestamp:   now,
					IsRecurring: false,
				},
			}, nil
		},
	}
	h := &TransactionsHandler{svc: mock}
	rec, c := makeRequest(http.MethodGet, "/transactions?account_id="+accountID.String(), "")
	if err := h.List(c); err != nil {
		t.Fatalf("List returned error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var resp []TransactionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp) != 1 {
		t.Errorf("expected 1 transaction, got %d", len(resp))
	}
	if resp[0].Amount != -25.0 {
		t.Errorf("expected amount -25.00, got %f", resp[0].Amount)
	}
}

// TestListTransactions_MissingAccountID verifies GET /transactions without account_id
// returns 400.
func TestListTransactions_MissingAccountID(t *testing.T) {
	mock := &mockTransactionsService{}
	h := &TransactionsHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		return h.List(c)
	}, http.MethodGet, "/transactions", "")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if _, ok := resp["error"]; !ok {
		t.Errorf("expected 'error' key in response, got %v", resp)
	}
}

// TestCreateTransaction verifies POST /transactions with valid body returns 201.
func TestCreateTransaction(t *testing.T) {
	accountID := uuid.New()
	mock := &mockTransactionsService{
		createFn: func(tx sqlite.Transaction) error {
			return nil
		},
	}
	h := &TransactionsHandler{svc: mock}
	body := `{"account_id":"` + accountID.String() + `","amount":-15.50,"description":"Lunch","category":"Food"}`
	rec, c := makeRequest(http.MethodPost, "/transactions", body)
	if err := h.Create(c); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", rec.Code)
	}
	var resp TransactionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Description != "Lunch" {
		t.Errorf("expected description Lunch, got %s", resp.Description)
	}
	if resp.Amount != -15.50 {
		t.Errorf("expected amount -15.50, got %f", resp.Amount)
	}
}

// TestUpdateTransaction verifies PATCH /transactions/:id returns 200.
func TestUpdateTransaction(t *testing.T) {
	id := uuid.New()
	accountID := uuid.New()
	now := time.Now().UTC()
	newDesc := "Updated Lunch"
	mock := &mockTransactionsService{
		updateFn: func(_ uuid.UUID, _ sqlite.UpdateTransaction) error {
			return nil
		},
		getByIDFn: func(_ uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:          id,
				AccountID:   accountID,
				Amount:      -1550,
				Description: newDesc,
				Category:    "Food",
				Timestamp:   now,
				IsRecurring: false,
			}, nil
		},
	}
	h := &TransactionsHandler{svc: mock}
	body := `{"description":"Updated Lunch"}`
	rec, c := makeRequest(http.MethodPatch, "/transactions/"+id.String(), body)
	c.SetParamNames("id")
	c.SetParamValues(id.String())
	if err := h.Update(c); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var resp TransactionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Description != newDesc {
		t.Errorf("expected description %s, got %s", newDesc, resp.Description)
	}
}

// TestDeleteTransaction verifies DELETE /transactions/:id returns 204.
func TestDeleteTransaction(t *testing.T) {
	id := uuid.New()
	mock := &mockTransactionsService{
		deleteFn: func(_ uuid.UUID) error {
			return nil
		},
	}
	h := &TransactionsHandler{svc: mock}
	rec, c := makeRequest(http.MethodDelete, "/transactions/"+id.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(id.String())
	if err := h.Delete(c); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}
