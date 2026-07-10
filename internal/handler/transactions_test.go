package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// TestListTransactions verifies GET /api/transactions?account_id=<uuid> returns 200.
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
	rec, c := makeRequest(http.MethodGet, "/api/transactions?account_id="+accountID.String(), "")
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

// TestListTransactions_MissingAccountID verifies GET /api/transactions without account_id
// returns 400.
func TestListTransactions_MissingAccountID(t *testing.T) {
	mock := &mockTransactionsService{}
	h := &TransactionsHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		return h.List(c)
	}, http.MethodGet, "/api/transactions", "")

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

// TestCreateTransaction verifies POST /api/transactions with valid body returns 201.
func TestCreateTransaction(t *testing.T) {
	accountID := uuid.New()
	mock := &mockTransactionsService{
		createFn: func(tx sqlite.Transaction) error {
			return nil
		},
	}
	h := &TransactionsHandler{svc: mock}
	body := `{"account_id":"` + accountID.String() + `","amount":-15.50,"description":"Lunch","category":"Food"}`
	rec, c := makeRequest(http.MethodPost, "/api/transactions", body)
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

// TestUpdateTransaction verifies PATCH /api/transactions/:id returns 200.
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
	rec, c := makeRequest(http.MethodPatch, "/api/transactions/"+id.String(), body)
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

// TestDeleteTransaction verifies DELETE /api/transactions/:id returns 204.
func TestDeleteTransaction(t *testing.T) {
	id := uuid.New()
	mock := &mockTransactionsService{
		deleteFn: func(_ uuid.UUID) error {
			return nil
		},
	}
	h := &TransactionsHandler{svc: mock}
	rec, c := makeRequest(http.MethodDelete, "/api/transactions/"+id.String(), "")
	c.SetParamNames("id")
	c.SetParamValues(id.String())
	if err := h.Delete(c); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}
	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", rec.Code)
	}
}

func TestConfirmInstallment_HappyPath(t *testing.T) {
	id := uuid.New()
	accountID := uuid.New()
	now := time.Now().UTC()
	total := int64(6)
	paid := int64(1)
	freq := "monthly"
	anchor := now.AddDate(0, -1, 0) // one month ago

	mock := &mockTransactionsService{
		confirmInstallmentFn: func(txnID uuid.UUID) error {
			if txnID != id {
				t.Fatalf("unexpected id: %v", txnID)
			}
			return nil
		},
		getByIDFn: func(_ uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                id,
				AccountID:         accountID,
				Amount:            -5000,
				Description:       "Phone",
				Category:          "Electronics",
				Timestamp:         now,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
				Frequency:         &freq,
				AnchorDate:        &anchor,
			}, nil
		},
	}
	h := &TransactionsHandler{svc: mock}
	rec, c := makeRequest(http.MethodPost, "/api/transactions/"+id.String()+"/confirm-installment", "")
	c.SetParamNames("id")
	c.SetParamValues(id.String())
	if err := h.ConfirmInstallment(c); err != nil {
		t.Fatalf("ConfirmInstallment returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var resp TransactionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !resp.IsInstallment {
		t.Errorf("expected is_installment=true")
	}
	if resp.PaidInstallments != 1 {
		t.Errorf("expected paid_installments=1, got %d", resp.PaidInstallments)
	}
	// next_occurrence should be computed (anchor + 1 month for paid=1)
	if resp.NextOccurrence == nil {
		t.Errorf("expected next_occurrence to be set for incomplete installment")
	}
}

func TestConfirmInstallment_InvalidID_Returns400(t *testing.T) {
	mock := &mockTransactionsService{}
	h := &TransactionsHandler{svc: mock}
	_, c := makeRequest(http.MethodPost, "/api/transactions/not-a-uuid/confirm-installment", "")
	c.SetParamNames("id")
	c.SetParamValues("not-a-uuid")
	if err := h.ConfirmInstallment(c); err == nil {
		t.Fatal("expected error for invalid id")
	}
}

func TestConfirmInstallment_NotFound_Returns404(t *testing.T) {
	id := uuid.New()
	mock := &mockTransactionsService{
		confirmInstallmentFn: func(_ uuid.UUID) error {
			return sql.ErrNoRows
		},
	}
	h := &TransactionsHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		c.SetParamNames("id")
		c.SetParamValues(id.String())
		return h.ConfirmInstallment(c)
	}, http.MethodPost, "/api/transactions/"+id.String()+"/confirm-installment", "")

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestConfirmInstallment_ServiceError_Returns400(t *testing.T) {
	id := uuid.New()
	mock := &mockTransactionsService{
		confirmInstallmentFn: func(_ uuid.UUID) error {
			return errors.New("db error")
		},
	}
	h := &TransactionsHandler{svc: mock}
	rec := serveRequest(func(c echo.Context) error {
		c.SetParamNames("id")
		c.SetParamValues(id.String())
		return h.ConfirmInstallment(c)
	}, http.MethodPost, "/api/transactions/"+id.String()+"/confirm-installment", "")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}
