# Account-Scoped Theme System

**Date:** 2026-05-02
**Status:** approved

---

## Overview

Allow each account to persist a UI color theme. Theme is selected in Settings → Appearance and applies immediately across the whole app. Five themes replace the current hardcoded purple-primary palette.

---

## Theme Identifiers

| ID | Primary hue | Personality |
|---|---|---|
| `green-anchor` | oklch(0.62 0.19 142) | Optimistic, yes-energy |
| `neutral-command` | oklch(0.55 0.10 240) | Authoritative, navy-slate |
| `teal-bridge` | oklch(0.60 0.14 195) | Calm authority + warmth |
| `warm-amber` | oklch(0.72 0.17 70) | Deliberation, budget-conscious |
| `rose-noir` | oklch(0.60 0.16 340) | Bold, personal, emotional |

Default: `neutral-command`.

Semantic colors (`--color-verdict-yes/no/wait`, `--color-risk-*`) are NOT themed — they remain fixed.

---

## Database

**New migration file:** `internal/migrations/20260502000001_account_theme.go`

```sql
-- up
ALTER TABLE AccountProfile ADD COLUMN theme TEXT NOT NULL DEFAULT 'neutral-command';

-- down
-- SQLite does not support DROP COLUMN in older versions; migration is irreversible in down
-- acceptable for this single-column addition
```

---

## Backend (Go)

### `internal/repo/sqlite/profile.go`

- `UserProfile` struct: add `Theme string`
- `GetByAccount`: include `theme` in SELECT
- `UpsertByAccount`: add `theme string` param, include in INSERT/UPDATE

### `internal/service/profile.go`

- `UpdateByAccount`: add `theme string` param
- Validate theme against allowed set: `{"green-anchor", "neutral-command", "teal-bridge", "warm-amber", "rose-noir"}`. Return error if invalid.

### `internal/handler/profile.go`

- `ProfileResponse`: add `Theme string \`json:"theme"\``
- `PatchProfileRequest`: add `Theme string \`json:"theme"\``
- `Get`: include `p.Theme` in response
- `Patch`: pass `req.Theme` to service

---

## Frontend CSS (`web/src/index.css`)

Replace the hardcoded `:root { --primary: oklch(0.58 0.22 264); ... }` primary/ring/sidebar-primary vars with 5 `[data-theme="..."]` blocks. Each block sets:

- `--primary`
- `--primary-foreground`
- `--ring`
- `--sidebar-primary`
- `--sidebar-primary-foreground`
- `--sidebar-ring`

The `:root` block keeps all other vars (background, card, muted, border, etc.) and sets `neutral-command` values as fallback.

Dark mode `.dark` block is unchanged except primary-related vars also need per-theme overrides. Use `.dark [data-theme="..."]` selectors or nest inside `.dark`.

---

## Frontend App Boot (`web/src/App.tsx`)

On profile fetch success, apply theme to `<html>`:

```ts
document.documentElement.setAttribute('data-theme', profile.theme ?? 'neutral-command')
```

Re-apply on account switch (profile query re-runs with new `account_id`).

---

## Frontend API (`web/src/lib/api.ts`)

- `ProfileResponse` interface: add `theme: string`
- `updateProfile` payload type: add `theme?: string`

---

## Settings Page (`web/src/pages/settings.tsx`)

New card: **Appearance**.

- 5 clickable theme swatches in a flex row
- Each swatch shows: colored circle (primary color), label below
- Selected state: ring + checkmark icon overlay
- On click: optimistic local state update → PATCH profile with new theme → `invalidateQueries(['profile', accountId])` → `document.documentElement.setAttribute('data-theme', newTheme)` immediately
- No save button — instant apply

---

## Acceptance Criteria

1. Selecting theme in Settings immediately changes app colors with no page reload
2. Theme persists — reload same account → same theme applied
3. Switching accounts → theme switches to that account's stored theme
4. Invalid theme value rejected by API with 400
5. Default theme for new accounts is `neutral-command`
6. All 5 themes visually correct in both light and dark mode

---

## Out of Scope

- Adding new themes
- Per-mode (light/dark) theme variants (theme applies same primary in both modes)
- Exporting/importing theme preferences
