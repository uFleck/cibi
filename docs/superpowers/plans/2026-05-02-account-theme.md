# Account-Scoped Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each account to persist a UI color theme (one of five palettes) selected in Settings → Appearance, applied immediately app-wide via `data-theme` on `<html>`.

**Architecture:** A `theme` TEXT column is added to `AccountProfile` (default `neutral-command`). The Go profile API GET/PATCH passes the field through. The frontend reads it on account load and sets `document.documentElement.setAttribute('data-theme', ...)`, which triggers per-theme CSS variable overrides defined in `index.css`. Settings page gains an Appearance card with five swatch buttons.

**Tech Stack:** Go + modernc SQLite (goose migrations), Echo v4, React 19, TanStack Query v5, Tailwind CSS v4 + shadcn/ui, TypeScript

---

## File Map

| File | Change |
|---|---|
| `internal/migrations/20260502000001_account_theme.go` | CREATE — adds `theme` column to `AccountProfile` |
| `internal/repo/sqlite/profile.go` | MODIFY — add `Theme` to struct + queries |
| `internal/service/profile.go` | MODIFY — add `theme` param + validation |
| `internal/handler/profile.go` | MODIFY — add `theme` to request/response types |
| `internal/handler/profile_test.go` | CREATE — test theme round-trip via API |
| `web/src/index.css` | MODIFY — replace hardcoded primary vars with 5 `[data-theme]` blocks |
| `web/src/lib/api.ts` | MODIFY — add `theme` to `ProfileResponse` + `updateProfile` payload |
| `web/src/App.tsx` | MODIFY — fetch profile per account, apply `data-theme` on load/switch |
| `web/src/pages/settings.tsx` | MODIFY — add Appearance card with theme picker |

---

## Task 1: DB Migration — add theme column

**Files:**
- Create: `internal/migrations/20260502000001_account_theme.go`

- [ ] **Step 1: Create migration file**

```go
package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upAccountTheme, downAccountTheme)
}

func upAccountTheme(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx,
		`ALTER TABLE AccountProfile ADD COLUMN theme TEXT NOT NULL DEFAULT 'neutral-command'`,
	)
	return err
}

func downAccountTheme(ctx context.Context, tx *sql.Tx) error {
	// SQLite ALTER TABLE DROP COLUMN requires SQLite ≥ 3.35.
	// modernc/sqlite bundles ≥ 3.40 so this is safe.
	_, err := tx.ExecContext(ctx, `ALTER TABLE AccountProfile DROP COLUMN theme`)
	return err
}
```

- [ ] **Step 2: Run migration test**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/migrations/... -v -run TestMigrations
```

Expected: PASS (the test applies all migrations up then down — new migration must not error).

- [ ] **Step 3: Commit**

```bash
git add internal/migrations/20260502000001_account_theme.go
git commit -m "feat: add theme column to AccountProfile (default neutral-command)"
```

---

## Task 2: Go repo layer — add Theme to UserProfile

**Files:**
- Modify: `internal/repo/sqlite/profile.go`

- [ ] **Step 1: Update `UserProfile` struct and interface**

Replace the entire file content:

```go
package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/google/uuid"
)

// UserProfile stores account-scoped profile configuration.
type UserProfile struct {
	AccountID   uuid.UUID
	DisplayName string
	PixKey      *string
	Theme       string
}

// ProfileRepo defines data access for user profile settings.
type ProfileRepo interface {
	GetByAccount(accountID uuid.UUID) (UserProfile, error)
	UpsertByAccount(accountID uuid.UUID, displayName string, pixKey *string, theme string) error
}

// SqliteProfileRepo implements ProfileRepo against modernc SQLite.
type SqliteProfileRepo struct {
	db *sql.DB
}

func NewSqliteProfileRepo(db *sql.DB) *SqliteProfileRepo {
	return &SqliteProfileRepo{db: db}
}

func (r *SqliteProfileRepo) GetByAccount(accountID uuid.UUID) (UserProfile, error) {
	var p UserProfile
	p.AccountID = accountID
	var pixKey sql.NullString
	err := r.db.QueryRow(
		`SELECT display_name, pix_key, theme FROM AccountProfile WHERE account_id = ?`,
		accountID.String(),
	).Scan(&p.DisplayName, &pixKey, &p.Theme)
	if err != nil {
		return p, fmt.Errorf("profile.GetByAccount: %w", err)
	}
	if pixKey.Valid {
		p.PixKey = &pixKey.String
	}
	return p, nil
}

func (r *SqliteProfileRepo) UpsertByAccount(accountID uuid.UUID, displayName string, pixKey *string, theme string) error {
	_, err := r.db.Exec(
		`INSERT INTO AccountProfile (account_id, display_name, pix_key, theme) VALUES (?, ?, ?, ?)
		 ON CONFLICT(account_id) DO UPDATE SET
		   display_name = excluded.display_name,
		   pix_key      = excluded.pix_key,
		   theme        = excluded.theme`,
		accountID.String(), displayName, pixKey, theme,
	)
	if err != nil {
		return fmt.Errorf("profile.UpsertByAccount: %w", err)
	}
	return nil
}
```

- [ ] **Step 2: Verify the package compiles**

```bash
cd /home/fleck/Projects/cibi && go build ./internal/repo/sqlite/...
```

Expected: no output (clean build). Fix any errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add internal/repo/sqlite/profile.go
git commit -m "feat: add Theme field to UserProfile repo layer"
```

---

## Task 3: Go service layer — validate and thread theme

**Files:**
- Modify: `internal/service/profile.go`

- [ ] **Step 1: Update `UpdateByAccount` to accept and validate theme**

Replace the entire file:

```go
package service

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

var validThemes = map[string]bool{
	"green-anchor":    true,
	"neutral-command": true,
	"teal-bridge":     true,
	"warm-amber":      true,
	"rose-noir":       true,
}

// ProfileService handles app owner profile settings.
type ProfileService struct {
	repo sqlite.ProfileRepo
}

func NewProfileService(repo sqlite.ProfileRepo) *ProfileService {
	return &ProfileService{repo: repo}
}

func (s *ProfileService) GetByAccount(accountID uuid.UUID) (sqlite.UserProfile, error) {
	p, err := s.repo.GetByAccount(accountID)
	if err != nil {
		return p, fmt.Errorf("service.Profile.GetByAccount: %w", err)
	}
	return p, nil
}

func (s *ProfileService) UpdateByAccount(accountID uuid.UUID, displayName string, pixKey *string, theme string) error {
	name := strings.TrimSpace(displayName)
	if name == "" {
		return fmt.Errorf("display_name is required")
	}
	if pixKey != nil {
		v := strings.TrimSpace(*pixKey)
		pixKey = &v
		if v == "" {
			pixKey = nil
		}
	}
	if !validThemes[theme] {
		return fmt.Errorf("invalid theme %q: must be one of green-anchor, neutral-command, teal-bridge, warm-amber, rose-noir", theme)
	}
	if err := s.repo.UpsertByAccount(accountID, name, pixKey, theme); err != nil {
		return fmt.Errorf("service.Profile.UpdateByAccount: %w", err)
	}
	return nil
}
```

- [ ] **Step 2: Verify package compiles**

```bash
cd /home/fleck/Projects/cibi && go build ./internal/service/...
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add internal/service/profile.go
git commit -m "feat: add theme validation to ProfileService.UpdateByAccount"
```

---

## Task 4: Go handler layer — expose theme in API

**Files:**
- Modify: `internal/handler/profile.go`

- [ ] **Step 1: Update handler types and wire theme through**

Replace the entire file:

```go
package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

type ProfileHandler struct {
	svc *service.ProfileService
}

func NewProfileHandler(svc *service.ProfileService) *ProfileHandler {
	return &ProfileHandler{svc: svc}
}

type ProfileResponse struct {
	DisplayName string  `json:"display_name"`
	PixKey      *string `json:"pix_key"`
	Theme       string  `json:"theme"`
}

type PatchProfileRequest struct {
	DisplayName string  `json:"display_name" validate:"required"`
	PixKey      *string `json:"pix_key"`
	Theme       string  `json:"theme" validate:"required"`
}

func (h *ProfileHandler) Get(c echo.Context) error {
	accountID, err := uuid.Parse(c.QueryParam("account_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	p, err := h.svc.GetByAccount(accountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, ProfileResponse{
		DisplayName: p.DisplayName,
		PixKey:      p.PixKey,
		Theme:       p.Theme,
	})
}

func (h *ProfileHandler) Patch(c echo.Context) error {
	accountID, err := uuid.Parse(c.QueryParam("account_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	var req PatchProfileRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.svc.UpdateByAccount(accountID, req.DisplayName, req.PixKey, req.Theme); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
```

- [ ] **Step 2: Build entire server to catch all compile errors**

```bash
cd /home/fleck/Projects/cibi && go build ./...
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add internal/handler/profile.go
git commit -m "feat: add theme field to profile GET/PATCH handler"
```

---

## Task 5: Go handler test — verify theme round-trip

**Files:**
- Create: `internal/handler/profile_test.go`

Look at `internal/handler/testhelpers_test.go` and `internal/handler/accounts_test.go` first to understand the test setup pattern, then create this file.

- [ ] **Step 1: Read test helper to understand setup**

```bash
cat /home/fleck/Projects/cibi/internal/handler/testhelpers_test.go
```

Note the helper function signatures (e.g. `newTestApp()`, `newTestServer()`) — use the same pattern below, adjusting names if they differ.

- [ ] **Step 2: Write profile handler tests**

Create `internal/handler/profile_test.go`. Adapt the setup helpers to match what `testhelpers_test.go` actually exports:

```go
package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProfileGetIncludesTheme(t *testing.T) {
	app := newTestApp(t) // use the helper from testhelpers_test.go
	req := httptest.NewRequest(http.MethodGet, "/api/profile?account_id="+app.DefaultAccountID(), nil)
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Theme string `json:"theme"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Theme == "" {
		t.Error("expected theme field in profile response, got empty string")
	}
}

func TestProfilePatchThemeValid(t *testing.T) {
	app := newTestApp(t)
	payload := `{"display_name":"Test","theme":"green-anchor"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/profile?account_id="+app.DefaultAccountID(),
		strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify it persisted
	req2 := httptest.NewRequest(http.MethodGet, "/api/profile?account_id="+app.DefaultAccountID(), nil)
	rec2 := httptest.NewRecorder()
	app.ServeHTTP(rec2, req2)

	var body struct {
		Theme string `json:"theme"`
	}
	json.NewDecoder(rec2.Body).Decode(&body)
	if body.Theme != "green-anchor" {
		t.Errorf("expected theme green-anchor after patch, got %q", body.Theme)
	}
}

func TestProfilePatchThemeInvalid(t *testing.T) {
	app := newTestApp(t)
	payload := `{"display_name":"Test","theme":"purple-haze"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/profile?account_id="+app.DefaultAccountID(),
		strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid theme, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

> **Note:** After reading `testhelpers_test.go`, adjust `newTestApp(t)` and `app.DefaultAccountID()` to match the actual helper API. The pattern of using httptest.NewRequest + app.ServeHTTP is standard for Echo.

- [ ] **Step 3: Run tests**

```bash
cd /home/fleck/Projects/cibi && go test ./internal/handler/... -v -run TestProfile
```

Expected: all 3 tests PASS.

- [ ] **Step 4: Run all Go tests to check nothing broken**

```bash
cd /home/fleck/Projects/cibi && go test ./...
```

Expected: PASS (or pre-existing failures only — do not introduce new failures).

- [ ] **Step 5: Commit**

```bash
git add internal/handler/profile_test.go
git commit -m "test: add profile handler tests for theme field round-trip"
```

---

## Task 6: CSS — add per-theme variable blocks

**Files:**
- Modify: `web/src/index.css`

The current `:root` block has `--primary: oklch(0.58 0.22 264)` (purple). We change the `:root` default to `neutral-command` values, then add 5 `[data-theme="..."]` blocks that override the primary-related vars only. Semantic colors (`--color-verdict-*`, `--color-risk-*`) are NOT changed.

- [ ] **Step 1: Update `:root` default primary to neutral-command (navy-slate)**

In `web/src/index.css`, find `:root` block (lines 59–88) and replace the primary/ring/sidebar-primary lines:

Change these 6 lines inside `:root`:
```css
  --primary: oklch(0.58 0.22 264);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.58 0.22 264);
  --sidebar-primary: oklch(0.58 0.22 264);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-ring: oklch(0.58 0.22 264);
```

To neutral-command light values:
```css
  --primary: oklch(0.45 0.10 240);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.45 0.10 240);
  --sidebar-primary: oklch(0.45 0.10 240);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-ring: oklch(0.45 0.10 240);
```

- [ ] **Step 2: Update `.dark` default primary to neutral-command (dark variant)**

In `.dark` block (lines 90–119), replace the same 6 lines:
```css
  --primary: oklch(0.58 0.22 264);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.58 0.22 264);
  --sidebar-primary: oklch(0.58 0.22 264);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-ring: oklch(0.58 0.22 264);
```

To:
```css
  --primary: oklch(0.55 0.10 240);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.10 240);
  --sidebar-primary: oklch(0.55 0.10 240);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-ring: oklch(0.55 0.10 240);
```

- [ ] **Step 3: Append 5 theme override blocks after the `.dark` block**

Add the following after line 119 (end of `.dark {}`), before `@layer base`:

```css
/* ── Theme overrides — only primary-family vars ─────────────────────── */
/* Light mode */
:root[data-theme="green-anchor"] {
  --primary: oklch(0.50 0.19 142);
  --primary-foreground: oklch(0.98 0.005 142);
  --ring: oklch(0.50 0.19 142);
  --sidebar-primary: oklch(0.50 0.19 142);
  --sidebar-primary-foreground: oklch(0.98 0.005 142);
  --sidebar-ring: oklch(0.50 0.19 142);
}
:root[data-theme="neutral-command"] {
  --primary: oklch(0.45 0.10 240);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.45 0.10 240);
  --sidebar-primary: oklch(0.45 0.10 240);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-ring: oklch(0.45 0.10 240);
}
:root[data-theme="teal-bridge"] {
  --primary: oklch(0.48 0.14 195);
  --primary-foreground: oklch(0.98 0.005 195);
  --ring: oklch(0.48 0.14 195);
  --sidebar-primary: oklch(0.48 0.14 195);
  --sidebar-primary-foreground: oklch(0.98 0.005 195);
  --sidebar-ring: oklch(0.48 0.14 195);
}
:root[data-theme="warm-amber"] {
  --primary: oklch(0.58 0.17 70);
  --primary-foreground: oklch(0.12 0.05 70);
  --ring: oklch(0.58 0.17 70);
  --sidebar-primary: oklch(0.58 0.17 70);
  --sidebar-primary-foreground: oklch(0.12 0.05 70);
  --sidebar-ring: oklch(0.58 0.17 70);
}
:root[data-theme="rose-noir"] {
  --primary: oklch(0.50 0.16 340);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.50 0.16 340);
  --sidebar-primary: oklch(0.50 0.16 340);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-ring: oklch(0.50 0.16 340);
}

/* Dark mode */
.dark[data-theme="green-anchor"] {
  --primary: oklch(0.62 0.19 142);
  --primary-foreground: oklch(0.09 0.03 142);
  --ring: oklch(0.62 0.19 142);
  --sidebar-primary: oklch(0.62 0.19 142);
  --sidebar-primary-foreground: oklch(0.09 0.03 142);
  --sidebar-ring: oklch(0.62 0.19 142);
}
.dark[data-theme="neutral-command"] {
  --primary: oklch(0.55 0.10 240);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.10 240);
  --sidebar-primary: oklch(0.55 0.10 240);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-ring: oklch(0.55 0.10 240);
}
.dark[data-theme="teal-bridge"] {
  --primary: oklch(0.60 0.14 195);
  --primary-foreground: oklch(0.09 0.03 195);
  --ring: oklch(0.60 0.14 195);
  --sidebar-primary: oklch(0.60 0.14 195);
  --sidebar-primary-foreground: oklch(0.09 0.03 195);
  --sidebar-ring: oklch(0.60 0.14 195);
}
.dark[data-theme="warm-amber"] {
  --primary: oklch(0.72 0.17 70);
  --primary-foreground: oklch(0.12 0.05 70);
  --ring: oklch(0.72 0.17 70);
  --sidebar-primary: oklch(0.72 0.17 70);
  --sidebar-primary-foreground: oklch(0.12 0.05 70);
  --sidebar-ring: oklch(0.72 0.17 70);
}
.dark[data-theme="rose-noir"] {
  --primary: oklch(0.60 0.16 340);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.60 0.16 340);
  --sidebar-primary: oklch(0.60 0.16 340);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-ring: oklch(0.60 0.16 340);
}
```

- [ ] **Step 4: Verify frontend builds**

```bash
cd /home/fleck/Projects/cibi/web && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/index.css
git commit -m "feat: add per-theme CSS variable overrides for 5 palette themes"
```

---

## Task 7: Frontend API types — add theme to ProfileResponse

**Files:**
- Modify: `web/src/lib/api.ts` (lines 640–655)

- [ ] **Step 1: Update `ProfileResponse` interface and `updateProfile` payload type**

Find this block (around line 640):
```ts
export interface ProfileResponse {
  display_name: string
  pix_key?: string | null
}

export function fetchProfile(accountId: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>(`/api/profile?account_id=${accountId}`)
}

export function updateProfile(accountId: string, data: ProfileResponse): Promise<void> {
  return apiFetch<void>(`/api/profile?account_id=${accountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
```

Replace with:
```ts
export interface ProfileResponse {
  display_name: string
  pix_key?: string | null
  theme: string
}

export type UpdateProfileRequest = {
  display_name: string
  pix_key?: string | null
  theme: string
}

export function fetchProfile(accountId: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>(`/api/profile?account_id=${accountId}`)
}

export function updateProfile(accountId: string, data: UpdateProfileRequest): Promise<void> {
  return apiFetch<void>(`/api/profile?account_id=${accountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /home/fleck/Projects/cibi/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If `settings.tsx` errors about `updateProfile` call signature, fix it as part of Task 9.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat: add theme field to ProfileResponse and UpdateProfileRequest"
```

---

## Task 8: App.tsx — apply data-theme on account load/switch

**Files:**
- Modify: `web/src/App.tsx`

The `AppShell` component already fetches accounts and manages `selectedAccountId`. We need to also fetch the profile for the selected account and apply `data-theme` on `<html>` whenever it changes.

- [ ] **Step 1: Add profile fetch and theme application to AppShell**

In `web/src/App.tsx`, add the import for `fetchProfile` and a `useQuery` + `useEffect` inside `AppShell`. The full modified `AppShell` function (only the additions are marked):

Add to imports at top of file:
```ts
import { fetchAccounts, fetchProfile } from '@/lib/api'
```

Inside `AppShell`, after the existing accounts query (after line ~104), add:
```ts
  const { data: profile } = useQuery({
    queryKey: ['profile', selectedAccountId],
    queryFn: () => fetchProfile(selectedAccountId as string),
    enabled: !!selectedAccountId,
  })

  useEffect(() => {
    const theme = profile?.theme ?? 'neutral-command'
    document.documentElement.setAttribute('data-theme', theme)
  }, [profile?.theme])
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/fleck/Projects/cibi/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat: apply data-theme on html element from account profile"
```

---

## Task 9: Settings page — Appearance card with theme picker

**Files:**
- Modify: `web/src/pages/settings.tsx`

- [ ] **Step 1: Add theme state and the Appearance card**

Replace the entire `settings.tsx` with the updated version below. Key changes: import `UpdateProfileRequest`, add `themeDraft` state, update `updateProfileMutation` to include `theme`, add Appearance card before the profile card.

```tsx
/* eslint-disable react-hooks/set-state-in-effect */
import { useContext, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, User, HandCoins, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchAccounts, fetchProfile, updateAccount, updateProfile } from '@/lib/api'
import { AccountContext } from '@/App'

const THEMES: { id: string; label: string; primary: string }[] = [
  { id: 'green-anchor',    label: 'Green',   primary: 'oklch(0.62 0.19 142)' },
  { id: 'neutral-command', label: 'Navy',    primary: 'oklch(0.55 0.10 240)' },
  { id: 'teal-bridge',     label: 'Teal',    primary: 'oklch(0.60 0.14 195)' },
  { id: 'warm-amber',      label: 'Amber',   primary: 'oklch(0.72 0.17 70)'  },
  { id: 'rose-noir',       label: 'Rose',    primary: 'oklch(0.60 0.16 340)' },
]

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { selectedAccountId } = useContext(AccountContext)

  const { data: profile } = useQuery({
    queryKey: ['profile', selectedAccountId],
    queryFn: () => fetchProfile(selectedAccountId as string),
    enabled: !!selectedAccountId,
  })
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })
  const selectedAccount = accounts.find(account => account.id === selectedAccountId) ?? null

  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [pixKeyDraft, setPixKeyDraft] = useState('')
  const [safetyBufferDraft, setSafetyBufferDraft] = useState('0')
  const [themeDraft, setThemeDraft] = useState('neutral-command')

  useEffect(() => {
    if (!profile) return
    if (profile.display_name) setDisplayNameDraft(profile.display_name)
    setPixKeyDraft(profile.pix_key ?? '')
    setThemeDraft(profile.theme ?? 'neutral-command')
  }, [profile])

  const updateProfileMutation = useMutation({
    mutationFn: (overrides?: { theme?: string }) =>
      updateProfile(selectedAccountId as string, {
        display_name: displayNameDraft,
        pix_key: pixKeyDraft.trim() || null,
        theme: overrides?.theme ?? themeDraft,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', selectedAccountId] })
      toast.success('Preferences saved')
    },
    onError: () => toast.error('Could not save preferences'),
  })

  function handleThemeSelect(themeId: string) {
    setThemeDraft(themeId)
    document.documentElement.setAttribute('data-theme', themeId)
    updateProfileMutation.mutate({ theme: themeId })
  }

  const updateSafetyBufferMutation = useMutation({
    mutationFn: () => {
      if (!selectedAccount) throw new Error('No selected account')
      const parsed = Number(safetyBufferDraft)
      return updateAccount(selectedAccount.id, { safety_buffer: Number.isFinite(parsed) ? parsed : 0 })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Safety buffer saved')
    },
    onError: () => toast.error('Could not save safety buffer'),
  })

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Preferences</h1>
        <p className="text-sm text-muted-foreground">Manage how your profile and payment details appear.</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette size={16} />
            Appearance
          </CardTitle>
          <CardDescription>
            Choose a color theme for this account. Applied immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                aria-label={t.label}
                aria-pressed={themeDraft === t.id}
                onClick={() => handleThemeSelect(t.id)}
                className={`flex flex-col items-center gap-1.5 rounded-lg p-2 border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  themeDraft === t.id
                    ? 'border-primary bg-primary/10 ring-2 ring-primary'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <span
                  className="w-8 h-8 rounded-full block"
                  style={{ background: t.primary }}
                />
                <span className="text-xs text-muted-foreground">{t.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User size={16} />
            Profile preferences
          </CardTitle>
          <CardDescription>
            This name is shown in public pages and shared views.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="display-name">Display name *</Label>
            <Input
              id="display-name"
              value={displayNameDraft}
              onChange={e => setDisplayNameDraft(e.target.value)}
              placeholder="How should people see your name?"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pix-key" className="flex items-center gap-2">
              <HandCoins size={14} />
              PIX key (optional)
            </Label>
            <Input
              id="pix-key"
              value={pixKeyDraft}
              onChange={e => setPixKeyDraft(e.target.value)}
              placeholder="CPF, email, phone, or random key"
            />
            <p className="text-xs text-muted-foreground">Used when friends need your payment key.</p>
          </div>

          <div>
            <Button
              size="sm"
              onClick={() => updateProfileMutation.mutate()}
              disabled={updateProfileMutation.isPending || !displayNameDraft.trim() || !selectedAccountId}
            >
              <Save size={14} />
              {updateProfileMutation.isPending ? 'Saving...' : 'Save preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account safety buffer</CardTitle>
          <CardDescription>
            Reserve this amount in dollars in the selected account before approving purchases.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="safety-buffer">Safety buffer ($)</Label>
            <Input
              id="safety-buffer"
              inputMode="decimal"
              value={safetyBufferDraft}
              onChange={e => setSafetyBufferDraft(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <Button
              size="sm"
              onClick={() => updateSafetyBufferMutation.mutate()}
              disabled={updateSafetyBufferMutation.isPending || !selectedAccount}
            >
              <Save size={14} />
              {updateSafetyBufferMutation.isPending ? 'Saving...' : 'Save safety buffer'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/fleck/Projects/cibi/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Run frontend tests**

```bash
cd /home/fleck/Projects/cibi/web && npm test -- --run 2>&1 | tail -30
```

Expected: pre-existing tests pass. The new `settings.test.tsx` (if it contains tests for the page) should also pass — if it fails due to missing `theme` field in test fixtures, add `theme: 'neutral-command'` to any mock `ProfileResponse` objects in that file.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/settings.tsx
git commit -m "feat: add Appearance card with theme picker to Settings page"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all Go tests**

```bash
cd /home/fleck/Projects/cibi && go test ./... 2>&1 | tail -20
```

Expected: PASS (no new failures).

- [ ] **Step 2: Run all frontend tests**

```bash
cd /home/fleck/Projects/cibi/web && npm test -- --run 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 3: Build frontend**

```bash
cd /home/fleck/Projects/cibi/web && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Start the app and do manual smoke test**

```bash
cd /home/fleck/Projects/cibi && docker compose up -d
```

Then open the web app:
1. Go to Settings → should see Appearance card with 5 swatches
2. Click "Green" → primary color of buttons/nav should change immediately
3. Reload page → green theme should persist
4. Click "Amber" → colors update
5. Reload → amber persists
6. Verify `GET /api/profile?account_id=<id>` returns `"theme":"warm-amber"` in JSON

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git add -p  # stage only relevant files
git commit -m "fix: <describe fixup>"
```
