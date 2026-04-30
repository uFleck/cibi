package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ufleck/cibi/internal/config"
)

func TestAppNewComposesMigratedGraphAndRoutes(t *testing.T) {
	cfg := config.Config{
		DatabasePath: filepath.Join(t.TempDir(), "cibi.db"),
		ServerPort:   ":0",
		SafetyBuffer: config.DefaultSafetyBuffer,
	}

	application, err := New(cfg)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := application.Close(); err != nil {
			t.Fatalf("Close returned error: %v", err)
		}
	})

	if application.Echo == nil {
		t.Fatal("Echo was not wired")
	}
	if application.AccountsSvc == nil || application.TxnsSvc == nil || application.EngineSvc == nil || application.GoalsSvc == nil {
		t.Fatal("expected core services to be wired")
	}
	if err := application.db.Ping(); err != nil {
		t.Fatalf("composed database is not usable: %v", err)
	}

	var migrationVersion int
	if err := application.db.QueryRow(`SELECT COUNT(*) FROM goose_db_version`).Scan(&migrationVersion); err != nil {
		t.Fatalf("migrations did not create goose version table: %v", err)
	}
	if migrationVersion == 0 {
		t.Fatal("expected at least one applied migration")
	}

	createReq := httptest.NewRequest(http.MethodPost, "/api/accounts", strings.NewReader(`{"name":"Checking","current_balance":123.45,"currency":"USD","is_default":true}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	application.Echo.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("POST /api/accounts status = %d, body = %s", createRec.Code, createRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	listRec := httptest.NewRecorder()
	application.Echo.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("GET /api/accounts status = %d, body = %s", listRec.Code, listRec.Body.String())
	}

	var accounts []struct {
		Name           string  `json:"name"`
		CurrentBalance float64 `json:"current_balance"`
		Currency       string  `json:"currency"`
		IsDefault      bool    `json:"is_default"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &accounts); err != nil {
		t.Fatalf("decode accounts response: %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("expected 1 account, got %d", len(accounts))
	}
	if accounts[0].Name != "Checking" || accounts[0].Currency != "USD" || !accounts[0].IsDefault || accounts[0].CurrentBalance != 123.45 {
		t.Fatalf("unexpected account response: %+v", accounts[0])
	}
}

func TestAppNewReturnsStartupErrorForUnopenableDatabase(t *testing.T) {
	cfg := config.Config{
		DatabasePath: filepath.Join(t.TempDir(), "missing-parent", "cibi.db"),
		ServerPort:   ":0",
		SafetyBuffer: config.DefaultSafetyBuffer,
	}

	application, err := New(cfg)
	if err == nil {
		if application != nil {
			_ = application.Close()
		}
		t.Fatal("expected New to return an error")
	}
	if !strings.Contains(err.Error(), "failed to init db") {
		t.Fatalf("expected startup error to identify db init stage, got %v", err)
	}
}
