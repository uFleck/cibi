package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// mockProfileRepo implements sqlite.ProfileRepo for profile handler tests.
type mockProfileRepo struct {
	store map[uuid.UUID]sqlite.UserProfile
}

func newMockProfileRepo() *mockProfileRepo {
	return &mockProfileRepo{store: make(map[uuid.UUID]sqlite.UserProfile)}
}

func (m *mockProfileRepo) GetByAccount(accountID uuid.UUID) (sqlite.UserProfile, error) {
	p, ok := m.store[accountID]
	if !ok {
		// Return a default profile so GET works even before any PATCH.
		return sqlite.UserProfile{
			AccountID:   accountID,
			DisplayName: "User",
			Theme:       "green-anchor",
		}, nil
	}
	return p, nil
}

func (m *mockProfileRepo) UpsertByAccount(accountID uuid.UUID, displayName string, pixKey *string, theme string) error {
	m.store[accountID] = sqlite.UserProfile{
		AccountID:   accountID,
		DisplayName: displayName,
		PixKey:      pixKey,
		Theme:       theme,
	}
	return nil
}

// TestProfileGetIncludesTheme verifies GET /api/profile returns 200 with a non-empty theme field.
func TestProfileGetIncludesTheme(t *testing.T) {
	repo := newMockProfileRepo()
	svc := service.NewProfileService(repo)
	h := &ProfileHandler{svc: svc}

	accountID := uuid.New()
	rec, c := makeRequest(http.MethodGet, "/api/profile?account_id="+accountID.String(), "")

	if err := h.Get(c); err != nil {
		t.Fatalf("Get returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var resp ProfileResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Theme == "" {
		t.Errorf("expected non-empty theme field in response")
	}
}

// TestProfilePatchThemeValid verifies PATCH with a valid theme returns 204,
// then GET returns the updated theme value.
func TestProfilePatchThemeValid(t *testing.T) {
	repo := newMockProfileRepo()
	svc := service.NewProfileService(repo)
	h := &ProfileHandler{svc: svc}

	accountID := uuid.New()
	body := `{"display_name":"Test","theme":"green-anchor"}`

	recP, cP := makeRequest(http.MethodPatch, "/api/profile?account_id="+accountID.String(), body)
	if err := h.Patch(cP); err != nil {
		t.Fatalf("Patch returned error: %v", err)
	}
	if recP.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", recP.Code)
	}

	// Confirm via GET that the theme was persisted.
	recG, cG := makeRequest(http.MethodGet, "/api/profile?account_id="+accountID.String(), "")
	if err := h.Get(cG); err != nil {
		t.Fatalf("Get returned error: %v", err)
	}
	if recG.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", recG.Code)
	}
	var resp ProfileResponse
	if err := json.Unmarshal(recG.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode GET response: %v", err)
	}
	if resp.Theme != "green-anchor" {
		t.Errorf("expected theme 'green-anchor', got %q", resp.Theme)
	}
}

// TestProfilePatchThemeInvalid verifies PATCH with an unrecognised theme returns 400.
func TestProfilePatchThemeInvalid(t *testing.T) {
	repo := newMockProfileRepo()
	svc := service.NewProfileService(repo)
	h := &ProfileHandler{svc: svc}

	accountID := uuid.New()
	body := `{"display_name":"Test","theme":"purple-haze"}`

	// Use makeRequest and call the handler directly; the handler returns an
	// *echo.HTTPError which carries the status code.
	_, c := makeRequest(http.MethodPatch, "/api/profile?account_id="+accountID.String(), body)
	err := h.Patch(c)
	if err == nil {
		t.Fatal("expected error from Patch with invalid theme, got nil")
	}
	he, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("expected *echo.HTTPError, got %T: %v", err, err)
	}
	if he.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", he.Code)
	}
}
