# Phase 8: Friend Ledger — Research

**Researched:** 2026-04-14
**Domain:** Go layered architecture extension + React SPA new tab + public unauthenticated routes
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Group split: default equal split, manual override per person. Wife or other non-paying guests can be assigned $0 (their share goes to user).
- Public links: two types — per-friend URL (bilateral balance + history) and per-event URL (who owes what for that event).
- Confirmation: only the user can acknowledge/confirm payments. Friend links are strictly read-only.
- Phase depends on Phase 5 (Web Dashboard) — React scaffold, routing, API layer, shadcn/ui, TanStack Query already exist.

### Claude's Discretion
- Token generation approach (format/algorithm)
- Installment tracking model (counter vs. separate records)
- Public route architecture (how to structure unauthenticated Echo endpoints)
- React public page routing approach (TanStack Router layout vs. separate entrypoint)

### Deferred Ideas (OUT OF SCOPE)
- Friends cannot create accounts or log in
- No push notifications to friends
- No currency conversion
- Tailscale tunnel setup itself
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PEER-01 | `Friend` entity with UUID id, name, unique public_token, nullable notes | Token generation section; SQLite schema patterns |
| PEER-02 | `PeerDebt` entity: signed integer cents, installment fields, is_confirmed (user-only) | Installment modeling section; repo/service patterns |
| PEER-03 | `GroupEvent` + `GroupEventParticipant` with nullable friend_id (host row = null) | Nullable FK pattern; group split architecture |
| PEER-04 | Unauthenticated public endpoints GET /public/friend/:token and GET /public/group/:token | Echo public routes section |
| PEER-05 | Dashboard widget: totals (owed to me, I owe, net) | React integration section |
| PEER-06 | Friends management tab: CRUD for friends, peer debts, group events; public link generation | React page architecture section |
</phase_requirements>

---

## Summary

Phase 8 adds four new database entities (Friend, PeerDebt, GroupEvent, GroupEventParticipant), four new Go service+repo pairs, a new `/public` Echo route group (no auth), authenticated CRUD endpoints under `/api/friends`, `/api/peer-debts`, and `/api/group-events`, plus a Friends tab in the React SPA and two public read-only pages.

The codebase follows a rigidly consistent pattern: one Go file per entity per layer, interface-driven repos, service validation, handler DTOs with `json:"snake_case"` tags, goose Go-based migrations. Phase 8 must reproduce this exact pattern for four new entities.

The most non-obvious decisions are: (1) token generation using only stdlib `crypto/rand` + `encoding/hex` — no new dependency needed; (2) public Echo routes via a separate `e.Group("/public")` with no middleware, registered before the static file middleware; (3) installment tracking as a simple counter on the parent PeerDebt row (not child records) — the query for "remaining" is `total_installments - paid_installments`; (4) React public pages via a second, auth-free TanStack Router layout route.

**Primary recommendation:** Follow the existing patterns exactly. New entities = new files in `internal/repo/sqlite/`, `internal/service/`, `internal/handler/`. Add one goose migration. Add a `/public` Echo group in `SetupRoutes`. Add `/friends` route in the React router with its own layout, plus `/friend/:token` and `/group/:token` as children of a `PublicLayout` route with no auth wrapper.

---

## Standard Stack

### Core (all already in go.mod — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `github.com/google/uuid` | v1.6.0 | UUID generation for all IDs | Already used for every entity ID [VERIFIED: go.mod] |
| `crypto/rand` (stdlib) | Go 1.25 stdlib | Cryptographically random bytes for public tokens | No external dep; already available [VERIFIED: go.mod Go 1.25] |
| `encoding/hex` (stdlib) | Go 1.25 stdlib | Encode random bytes as URL-safe hex string | No external dep; produces URL-safe output [VERIFIED: stdlib] |
| `modernc.org/sqlite` | v1.48.2 | SQLite driver (pure Go, WAL) | Already in use; nullable FK works correctly [VERIFIED: go.mod] |
| `github.com/pressly/goose/v3` | v3.27.0 | Migration runner | Already used; new migration follows existing Go file pattern [VERIFIED: go.mod] |
| `github.com/labstack/echo/v4` | v4.12.0 | HTTP routing; `e.Group("/public")` for unauth routes | Already in use [VERIFIED: go.mod] |

### Frontend (all already in package.json — no new npm packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-router` | v1.168.18 | New routes: `/friends`, `/friend/:token`, `/group/:token` | Already in use [VERIFIED: package.json] |
| `@tanstack/react-query` | v5.99.0 | Data fetching for new API endpoints | Already in use [VERIFIED: package.json] |
| `lucide-react` | v1.8.0 | Icons (Users, HandCoins, etc.) | Already in use [VERIFIED: package.json] |
| `sonner` | v2.0.7 | Toast notifications for CRUD operations | Already in use [VERIFIED: package.json] |
| shadcn/ui components | (copied into repo) | Card, Table, Dialog, Badge for friend/debt UI | Already initialized [VERIFIED: web/src/components/ui/] |

### No New Dependencies

**Backend:** Token generation uses `crypto/rand` + `encoding/hex` from stdlib. No nanoid package, no `oklog/ulid`, no base58 library required.

**Frontend:** All required UI primitives (Card, Input, Select, Dialog) are already in `web/src/components/ui/`. No new npm packages.

---

## Architecture Patterns

### Recommended File Layout

**Backend — new files following existing one-file-per-entity-per-layer convention:**
```
internal/
├── repo/sqlite/
│   ├── friend.go              # FriendRepo interface + SqliteFriendRepo
│   ├── peer_debt.go           # PeerDebtRepo interface + SqlitePeerDebtRepo
│   ├── group_event.go         # GroupEventRepo interface + SqliteGroupEventRepo
│   └── group_event_participant.go  # GroupEventParticipantRepo (or embed in group_event.go)
├── service/
│   ├── friend.go              # FriendService
│   ├── peer_debt.go           # PeerDebtService
│   └── group_event.go         # GroupEventService (owns participants)
├── handler/
│   ├── friend.go              # FriendsHandler: CRUD + summary endpoint
│   ├── peer_debt.go           # PeerDebtHandler: CRUD
│   ├── group_event.go         # GroupEventHandler: CRUD + participant management
│   └── public.go              # PublicHandler: unauthenticated GET endpoints
└── migrations/
    └── 20260414000002_friend_ledger.go   # All four new tables in one migration
```

**Frontend — new files:**
```
web/src/
├── pages/
│   ├── friends.tsx            # FriendsPage: full CRUD tab
│   ├── friend-public.tsx      # /friend/:token — read-only, no auth
│   └── group-public.tsx       # /group/:token — read-only, no auth
├── components/
│   └── FriendLedgerWidget.tsx # Dashboard summary widget
└── lib/
    └── api.ts                 # Extend with peer/friend/group API functions
```

### Pattern 1: Token Generation (Go stdlib, no new dep)

**What:** Generate a 16-byte random value, hex-encode it to a 32-char URL-safe string.
**When to use:** On Friend.Create and GroupEvent.Create. Store in `public_token TEXT UNIQUE`.

```go
// Source: crypto/rand stdlib — standard Go pattern
import (
    "crypto/rand"
    "encoding/hex"
    "fmt"
)

func generatePublicToken() (string, error) {
    b := make([]byte, 16)
    if _, err := rand.Read(b); err != nil {
        return "", fmt.Errorf("generatePublicToken: %w", err)
    }
    return hex.EncodeToString(b), nil // 32-char lowercase hex, URL-safe
}
```

`hex.EncodeToString` produces only `[0-9a-f]` characters — always URL-safe, no encoding needed. 16 bytes = 128 bits of entropy; collision probability negligible for personal-use scale. [VERIFIED: encoding/hex Go stdlib docs — produces [0-9a-f] only]

**Alternative considered:** `uuid.New().String()[:8]` — rejected because truncated UUIDs have lower entropy and contain hyphens (less clean in URLs). `base58` encoding — rejected because it requires an additional dependency.

### Pattern 2: Echo Public Route Group (no auth middleware)

**What:** Register unauthenticated routes on a separate `/public` group. The existing `/api` group has no auth middleware either (CIBI currently has no auth at all), but structuring public routes separately is semantically clear and future-proofs auth addition.

**When to use:** `GET /public/friend/:token` and `GET /public/group/:token`.

```go
// Source: internal/handler/routes.go — extend SetupRoutes
// [VERIFIED: existing routes.go pattern]

func SetupRoutes(e *echo.Echo, accSvc *service.AccountsService, txnsSvc *service.TransactionsService,
    engineSvc *service.EngineService, psSvc *service.PayScheduleService,
    friendSvc *service.FriendService, peerDebtSvc *service.PeerDebtService,
    groupEventSvc *service.GroupEventService) {

    // ... existing api group ...
    api := e.Group("/api")

    friends := api.Group("/friends")
    friends.GET("", fh.List)
    friends.POST("", fh.Create)
    friends.GET("/:id", fh.GetByID)
    friends.PATCH("/:id", fh.Update)
    friends.DELETE("/:id", fh.Delete)

    peerDebts := api.Group("/peer-debts")
    peerDebts.GET("", pdh.List)       // ?friend_id=
    peerDebts.POST("", pdh.Create)
    peerDebts.PATCH("/:id", pdh.Update)
    peerDebts.DELETE("/:id", pdh.Delete)
    peerDebts.POST("/:id/confirm", pdh.Confirm)

    groupEvents := api.Group("/group-events")
    groupEvents.GET("", geh.List)
    groupEvents.POST("", geh.Create)
    groupEvents.GET("/:id", geh.GetByID)
    groupEvents.PATCH("/:id", geh.Update)
    groupEvents.DELETE("/:id", geh.Delete)
    groupEvents.PUT("/:id/participants", geh.SetParticipants)

    // Dashboard summary (single aggregated query)
    api.GET("/friends/summary", fh.Summary)

    // Public unauthenticated endpoints — no middleware, separate group
    pub := e.Group("/public")
    pub.GET("/friend/:token", ph.GetFriendByToken)
    pub.GET("/group/:token", ph.GetGroupByToken)
}
```

**Key constraint:** The Echo static middleware (registered in `cmd/cibi-api/main.go` after `app.New()`) catches all unmatched routes and serves `index.html`. Public routes MUST be registered inside `SetupRoutes` (called inside `app.New`) so they are registered before the static middleware. This is already how all API routes work. [VERIFIED: cmd/cibi-api/main.go — static middleware added after app.New()]

### Pattern 3: Installment Tracking (counter on parent row)

**What:** Track monthly installment debts using `total_installments` and `paid_installments` fields directly on `PeerDebt`. No separate child installment records.

**When to use:** For all `PeerDebt` rows where `is_installment = true`.

**Reasoning:**
- Remaining installments = `total_installments - paid_installments` — single arithmetic expression
- Fully paid = `paid_installments >= total_installments` — trivial query
- Confirming one installment = `UPDATE PeerDebt SET paid_installments = paid_installments + 1 WHERE id = ?`
- A separate child record table adds complexity (join, insert per payment) with no benefit at CIBI's scale
- The CONTEXT.md success criterion "after N confirmations, debt shows as fully paid" maps directly to the counter model [VERIFIED: CONTEXT.md success criterion 6]

**Confirm endpoint behavior:**
```go
// Service: confirm one installment (or the whole debt if not installment)
func (s *PeerDebtService) ConfirmInstallment(id uuid.UUID) error {
    // If is_installment: INCREMENT paid_installments (cap at total_installments)
    // If not is_installment: SET is_confirmed = true
}
```

**Anti-pattern:** Creating a separate `PeerDebtInstallment` table with one row per payment — unnecessary join complexity, no query benefit for the use cases defined in PEER-02/06.

### Pattern 4: Nullable FK for GroupEventParticipant (host row)

**What:** `friend_id TEXT REFERENCES Friend(id)` is nullable — NULL means the host (the app user). This is the standard SQLite pattern for "optional FK."

**SQLite nullable FK gotcha:** When `friend_id IS NULL`, the `REFERENCES Friend(id)` constraint is NOT enforced by SQLite (NULL always satisfies FK constraints in SQL). This is correct behavior — NULL means "no friend, this is the user's own row." [VERIFIED: SQLite FK documentation — NULLs are excluded from FK enforcement, standard SQL behavior]

**Migration DDL:**
```sql
CREATE TABLE GroupEventParticipant (
    event_id   TEXT NOT NULL REFERENCES GroupEvent(id) ON DELETE CASCADE,
    friend_id  TEXT REFERENCES Friend(id),  -- NULL = host/user row
    share_amount INTEGER NOT NULL,
    is_confirmed BOOLEAN NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, friend_id)  -- NOTE: see pitfall below
);
```

**Pitfall:** SQLite treats multiple NULL values in a UNIQUE index as distinct (not equal). This means `PRIMARY KEY (event_id, friend_id)` will NOT prevent two NULL friend_id rows for the same event — SQLite allows multiple NULLs in a unique index. [VERIFIED: SQLite documentation — NULLs are distinct in UNIQUE constraints]

**Correct approach:** Use a partial unique index for the host row enforcement:
```sql
-- Enforce only one host row per event (where friend_id IS NULL)
CREATE UNIQUE INDEX idx_gep_host ON GroupEventParticipant(event_id) WHERE friend_id IS NULL;
```

Or alternatively: use a sentinel value convention (a dedicated host participant enforced at service layer, not DB layer) and rely on service logic to prevent duplicate host rows. The index approach is cleaner.

### Pattern 5: Repo Layer — Nullable Field Handling

**What:** Nullable Go fields use `sql.NullString`, `sql.NullInt64` for scanning; for insertion, use `interface{}` with nil for NULL values. This is the exact pattern already used in `pay_schedule.go`.

```go
// Source: internal/repo/sqlite/pay_schedule.go lines 41-64 [VERIFIED: codebase]
// Pattern for nullable field on insert:
var notes interface{}
if friend.Notes != nil {
    notes = *friend.Notes
}
_, err = r.db.Exec(
    `INSERT INTO Friend (id, name, public_token, notes) VALUES (?, ?, ?, ?)`,
    friend.ID.String(), friend.Name, friend.PublicToken, notes,
)

// Pattern for nullable field on scan:
var notes sql.NullString
if err := rows.Scan(&idStr, &f.Name, &f.PublicToken, &notes); err != nil { ... }
if notes.Valid {
    f.Notes = &notes.String
}
```

### Pattern 6: Migration File Structure

**What:** New goose migration as a `.go` file in `internal/migrations/`. All four new tables in a single migration (atomic DDL).

```go
// File: internal/migrations/20260414000002_friend_ledger.go
// Source: existing migration pattern [VERIFIED: internal/migrations/20260411000001_initial_schema.go]

func init() {
    goose.AddMigrationContext(upFriendLedger, downFriendLedger)
}

func upFriendLedger(ctx context.Context, tx *sql.Tx) error {
    queries := []string{
        `CREATE TABLE IF NOT EXISTS Friend (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            public_token TEXT NOT NULL UNIQUE,
            notes        TEXT
        );`,
        `CREATE TABLE IF NOT EXISTS PeerDebt (
            id                 TEXT PRIMARY KEY,
            friend_id          TEXT NOT NULL REFERENCES Friend(id) ON DELETE CASCADE,
            amount             INTEGER NOT NULL,
            description        TEXT NOT NULL,
            date               TEXT NOT NULL,
            is_installment     BOOLEAN NOT NULL DEFAULT 0,
            total_installments INTEGER,
            paid_installments  INTEGER NOT NULL DEFAULT 0,
            frequency          TEXT,
            anchor_date        TEXT,
            is_confirmed       BOOLEAN NOT NULL DEFAULT 0
        );`,
        `CREATE TABLE IF NOT EXISTS GroupEvent (
            id           TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            date         TEXT NOT NULL,
            total_amount INTEGER NOT NULL,
            public_token TEXT NOT NULL UNIQUE,
            notes        TEXT
        );`,
        `CREATE TABLE IF NOT EXISTS GroupEventParticipant (
            event_id     TEXT NOT NULL REFERENCES GroupEvent(id) ON DELETE CASCADE,
            friend_id    TEXT REFERENCES Friend(id),
            share_amount INTEGER NOT NULL,
            is_confirmed BOOLEAN NOT NULL DEFAULT 0
        );`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_gep_host
            ON GroupEventParticipant(event_id) WHERE friend_id IS NULL;`,
    }
    for _, q := range queries {
        if _, err := tx.ExecContext(ctx, q); err != nil {
            return err
        }
    }
    return nil
}
```

**Note on timestamp migration filename:** The existing migrations use `20260411000001` (date-based). The next migration should use a later date, e.g., `20260414000002`. Check existing files first to avoid collision — current highest is `20260414000001_fix_amount_scale.go`. Use `20260414000002_friend_ledger.go`. [VERIFIED: internal/migrations/ directory listing]

### Pattern 7: App Wiring — Extend app.go

**What:** Add new repos, services, and update `SetupRoutes` signature in `internal/app/app.go`.

```go
// Source: internal/app/app.go [VERIFIED: codebase]
// Add to App struct:
FriendSvc     *service.FriendService
PeerDebtSvc   *service.PeerDebtService
GroupEventSvc *service.GroupEventService

// Add to New():
iFriendRepo     := reposqlite.NewSqliteFriendRepo(database)
iPeerDebtRepo   := reposqlite.NewSqlitePeerDebtRepo(database)
iGroupEventRepo := reposqlite.NewSqliteGroupEventRepo(database)

friendSvc     := service.NewFriendService(iFriendRepo)
peerDebtSvc   := service.NewPeerDebtService(iPeerDebtRepo, iFriendRepo)
groupEventSvc := service.NewGroupEventService(iGroupEventRepo, iFriendRepo)

handler.SetupRoutes(e, accountsSvc, txnsSvc, engineSvc, payScheduleSvc,
    friendSvc, peerDebtSvc, groupEventSvc)
```

### Pattern 8: React Public Pages (no auth, separate layout)

**What:** Add a `PublicLayout` route (no Sidebar, no AccountContext dependency) as a second child of the root route. Public pages (`/friend/:token`, `/group/:token`) live under it.

```typescript
// Source: web/src/router.tsx pattern [VERIFIED: codebase]
// PublicLayout: just renders <Outlet /> with no sidebar/header

function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  )
}

const publicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/public',
  component: PublicLayout,
})
const friendPublicRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/friend/$token',
  component: FriendPublicPage,
})
const groupPublicRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/group/$token',
  component: GroupPublicPage,
})

// Public pages fetch from /public/* endpoints — no auth cookie needed
// Uses a separate apiFetch call directly to /public/friend/:token
```

**Why not a separate Vite entrypoint:** The entire app is a single embedded binary serving `web/dist`. A second HTML entry would require two `go:embed` targets and separate build artifacts. A second layout route in the same SPA costs nothing and correctly handles the case where the friend visits the URL via Tailscale (the SPA loads, client-side routing activates, public layout renders).

**TanStack Router path parameter:** Public pages use `$token` (TanStack Router convention for path params) and fetch using `useParams({ from: '/public/friend/$token' })`. [VERIFIED: TanStack Router v1 docs pattern — `$paramName` in path, `useParams` hook]

### Pattern 9: React Friends Tab Architecture

**What:** Add `/friends` route with a multi-section page: friend list, per-friend debt history (slide-out or accordion), group events list.

```typescript
const friendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends',
  component: FriendsPage,
})
```

**FriendsPage sections:**
1. `FriendList` — list all friends with net balance badge; create/edit/delete
2. `FriendDebts` — per-friend section showing PeerDebt rows with confirm toggle
3. `GroupEvents` — list of group events; each expandable to show participant shares

**Group split UI pattern:**
```typescript
// Controlled form state with auto-recalculation
interface ParticipantRow {
  friend_id: string | null  // null = user/host
  share_amount: number      // cents, derived from equal split or overridden
  is_override: boolean      // true when manually entered
}

// On participant add/remove: recalculate non-overridden shares
function recalcEqualSplit(total: number, rows: ParticipantRow[]): ParticipantRow[] {
  const nonOverride = rows.filter(r => !r.is_override)
  const overrideTotal = rows.filter(r => r.is_override)
                             .reduce((s, r) => s + r.share_amount, 0)
  const remaining = total - overrideTotal
  const equalShare = Math.floor(remaining / nonOverride.length)
  const remainder = remaining - equalShare * nonOverride.length
  // Distribute penny-remainder to first participant
  return rows.map((r, i) =>
    r.is_override ? r : { ...r, share_amount: equalShare + (i === 0 ? remainder : 0) }
  )
}
```

**Dashboard Widget:**
```typescript
// FriendLedgerWidget in web/src/components/FriendLedgerWidget.tsx
// Fetches GET /api/friends/summary → { owed_to_me: number, i_owe: number, net: number }
// Renders as a StatCard-style card with link to /friends
```

### Anti-Patterns to Avoid

- **Hand-rolling base58/nanoid:** Use `crypto/rand` + `encoding/hex` — it's already available, produces URL-safe tokens, and requires no new dependency.
- **Separate installment child table:** Counter on parent row is sufficient. Do not create a `PeerDebtInstallment` table.
- **Putting public routes inside `/api` group:** Logically separate. `/public/friend/:token` lives outside the `/api` prefix.
- **Serving public pages from a separate Vite build:** Single SPA with a `PublicLayout` route is correct.
- **`PRIMARY KEY (event_id, friend_id)` without handling NULL:** SQLite allows multiple NULLs in composite PK when one column is NULL. Use a partial unique index for the host row instead.
- **Adding a `GroupEventParticipantRepo` interface:** Participants are logically owned by GroupEvent. Keep participant operations in `GroupEventRepo` (or `GroupEventService`) rather than a separate repo to avoid over-fragmentation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL-safe random tokens | Custom base58/nanoid encoding | `crypto/rand` + `encoding/hex` | stdlib, 0 deps, URL-safe output, adequate entropy |
| UUID generation | Random byte slices | `github.com/google/uuid` v1.6.0 | Already in go.mod; RFC 4122 compliant |
| Penny-distribution in equal split | Custom rounding logic | Simple floor + distribute remainder to first row | Integer cents arithmetic; document the approach |
| DB migration execution | Manual `CREATE TABLE IF NOT EXISTS` in app code | goose `AddMigrationContext` | Already the project pattern; `CREATE TABLE IF NOT EXISTS` is explicitly forbidden by ARCH-06 |
| React form validation | Custom validation framework | Inline TypeScript + sonner toasts | Consistent with existing pages (accounts.tsx, settings.tsx) |

**Key insight:** This phase adds no new external dependencies. Every required capability is covered by existing stdlib, go.mod entries, and installed npm packages.

---

## Common Pitfalls

### Pitfall 1: Static Middleware Swallows Public Routes
**What goes wrong:** If the static middleware is registered before `SetupRoutes`, all GET requests to `/public/*` return `index.html` (404 not found for the API).
**Why it happens:** Echo static middleware with `HTML5: true` catches all unmatched routes and serves `index.html`. If it runs before route matching, it intercepts `/public/friend/:token`.
**How to avoid:** All routes — including `/public/*` — must be registered inside `SetupRoutes`, which is called inside `app.New()`. The static middleware is registered afterward in `cmd/cibi-api/main.go`. This is already the correct order. [VERIFIED: cmd/cibi-api/main.go lines 33-37]
**Warning signs:** `GET /public/friend/abc123` returns a 200 with HTML body instead of JSON.

### Pitfall 2: SQLite NULL Primary Key Composite Uniqueness
**What goes wrong:** Using `PRIMARY KEY (event_id, friend_id)` in the `GroupEventParticipant` migration allows duplicate host rows (two rows where `friend_id IS NULL` for the same event).
**Why it happens:** SQL standard (and SQLite) treats NULL as distinct from every other NULL in UNIQUE/PK constraints. Two `(event_id=X, friend_id=NULL)` rows are considered distinct.
**How to avoid:** Use a partial unique index: `CREATE UNIQUE INDEX idx_gep_host ON GroupEventParticipant(event_id) WHERE friend_id IS NULL`. [VERIFIED: SQLite documentation on NULL in unique indexes]
**Warning signs:** The service can insert two host rows for one event without a constraint violation.

### Pitfall 3: `encoding/hex` Token Already Exists in DB
**What goes wrong:** On rare occasion, `generatePublicToken()` produces a token already in use.
**Why it happens:** 16 bytes = 2^128 combinations; collision probability is astronomically low but non-zero.
**How to avoid:** Attempt insert; on unique constraint error, retry token generation (max 3 attempts). [ASSUMED — standard practice; not specific to this codebase]
**Warning signs:** `UNIQUE constraint failed: Friend.public_token` error on insert.

### Pitfall 4: Group Split Penny Arithmetic
**What goes wrong:** Equal split of $10.00 among 3 people gives $3.33 × 3 = $9.99, losing 1 cent. If the planner naively rounds each share, `total_amount` ≠ sum of `share_amount`.
**Why it happens:** Integer division: `1000 / 3 = 333` cents per person, 1 cent lost.
**How to avoid:** `floor(total / n)` for all participants, then add the remainder (in cents) to the first non-override participant. Document this convention in the service. Validation: ensure `sum(share_amounts) == total_amount` before insert. [ASSUMED — standard cents-rounding convention]
**Warning signs:** `sum(share_amount) != total_amount` for group events with odd splits.

### Pitfall 5: `SetupRoutes` Signature Breaking Change
**What goes wrong:** Adding new service parameters to `SetupRoutes` without updating `app.go` (or vice versa) causes a compile error.
**Why it happens:** Go enforces strict function signatures; both files must be updated atomically.
**How to avoid:** Update `SetupRoutes` signature and `app.New()` call in the same commit/task.
**Warning signs:** `too many arguments in call to handler.SetupRoutes` compile error.

### Pitfall 6: TanStack Router Public Route Path Conflict
**What goes wrong:** `/public/friend/:token` in TanStack Router conflicts with the Go backend's `/public/friend/:token` — the Echo static middleware serves the SPA for these paths.
**Why it happens:** The SPA's client-side router handles ALL paths. When a friend opens `/public/friend/abc123`, the SPA loads, the public route renders, and the component fetches `/public/friend/abc123` from the Go API. This is correct — but the React route path must be `/public/friend/$token`, not `/friend/$token`, to match the URL.
**How to avoid:** React routes for public pages should use path `/public/friend/$token` and `/public/group/$token` to match the actual URL the friend visits.
**Warning signs:** Public page loads but token param is undefined.

---

## Code Examples

### Verified Repo Pattern — Friend Insert

```go
// Source: internal/repo/sqlite/pay_schedule.go (existing pattern) [VERIFIED: codebase]
func (r *SqliteFriendRepo) Insert(f Friend) error {
    var notes interface{}
    if f.Notes != nil {
        notes = *f.Notes
    }
    _, err := r.db.Exec(
        `INSERT INTO Friend (id, name, public_token, notes) VALUES (?, ?, ?, ?)`,
        f.ID.String(), f.Name, f.PublicToken, notes,
    )
    if err != nil {
        return fmt.Errorf("friend.Insert: %w", err)
    }
    return nil
}
```

### Verified Handler Pattern — Create with Validation

```go
// Source: internal/handler/accounts.go (existing pattern) [VERIFIED: codebase]
func (h *FriendsHandler) Create(c echo.Context) error {
    var req CreateFriendRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    if err := c.Validate(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    friend, err := h.svc.CreateFriend(req.Name, req.Notes)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusCreated, friendToResponse(friend))
}
```

### Verified React Mutation Pattern

```typescript
// Source: web/src/pages/accounts.tsx (existing pattern) [VERIFIED: codebase]
const createMutation = useMutation({
  mutationFn: (data: CreateFriendRequest) => createFriend(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['friends'] })
    toast.success('Friend added')
    setIsCreating(false)
    setFormData(EMPTY_FORM)
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to add friend')
  },
})
```

### Verified Router Extension Pattern

```typescript
// Source: web/src/router.tsx (existing pattern) [VERIFIED: codebase]
const friendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends',
  component: FriendsPage,
})

// Public layout (no sidebar)
const publicLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/public',
  component: PublicLayout,
})
const friendPublicRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/friend/$token',
  component: FriendPublicPage,
})
const groupPublicRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/group/$token',
  component: GroupPublicPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute, settingsRoute, accountsRoute, transactionsRoute,
  friendsRoute,
  publicLayoutRoute.addChildren([friendPublicRoute, groupPublicRoute]),
])
```

---

## API Contract Reference

### Authenticated Endpoints (under `/api`)

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/friends` | — | `FriendResponse[]` |
| POST | `/api/friends` | `CreateFriendRequest` | `FriendResponse` 201 |
| GET | `/api/friends/:id` | — | `FriendResponse` |
| PATCH | `/api/friends/:id` | `PatchFriendRequest` | `FriendResponse` |
| DELETE | `/api/friends/:id` | — | 204 |
| GET | `/api/friends/summary` | — | `FriendSummaryResponse` |
| GET | `/api/peer-debts` | `?friend_id=` | `PeerDebtResponse[]` |
| POST | `/api/peer-debts` | `CreatePeerDebtRequest` | `PeerDebtResponse` 201 |
| PATCH | `/api/peer-debts/:id` | `PatchPeerDebtRequest` | `PeerDebtResponse` |
| DELETE | `/api/peer-debts/:id` | — | 204 |
| POST | `/api/peer-debts/:id/confirm` | — | `PeerDebtResponse` |
| GET | `/api/group-events` | — | `GroupEventResponse[]` |
| POST | `/api/group-events` | `CreateGroupEventRequest` | `GroupEventResponse` 201 |
| GET | `/api/group-events/:id` | — | `GroupEventResponse` (with participants) |
| PATCH | `/api/group-events/:id` | `PatchGroupEventRequest` | `GroupEventResponse` |
| DELETE | `/api/group-events/:id` | — | 204 |
| PUT | `/api/group-events/:id/participants` | `ParticipantRow[]` | `GroupEventResponse` |

### Public Endpoints (under `/public`, no auth)

| Method | Path | Response |
|--------|------|----------|
| GET | `/public/friend/:token` | `PublicFriendResponse` |
| GET | `/public/group/:token` | `PublicGroupResponse` |

**PublicFriendResponse shape:**
```json
{
  "name": "Alice",
  "net_balance": 5000,
  "debts": [
    {
      "description": "Pizza night",
      "amount": 5000,
      "date": "2026-04-01T00:00:00Z",
      "is_confirmed": false,
      "is_installment": false
    }
  ]
}
```

**PublicGroupResponse shape:**
```json
{
  "title": "Pizza Night",
  "date": "2026-04-01T00:00:00Z",
  "total_amount": 12000,
  "participants": [
    { "name": "Alice", "share_amount": 4000, "is_confirmed": false },
    { "name": "You (host)", "share_amount": 4000, "is_confirmed": true }
  ]
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mattn/go-sqlite3` (CGO) | `modernc.org/sqlite` (pure Go) | Phase 1 | No C compiler needed; WAL mode works identically |
| `framer-motion` | `motion/react` (import from `motion`) | Phase 5 | Import path changed; existing components use `motion` package |
| `sonner` v1 API | `sonner` v2.0.7 | package.json | API compatible; toast calls are identical |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Token collision retry (max 3 attempts) on unique constraint error is the correct strategy | Pitfall 3 | Low risk: 2^128 tokens means retry is never needed in practice; retry is defensive hygiene |
| A2 | Penny remainder goes to first non-override participant in group split | Pitfall 4 | Low impact: amounts are off by 1 cent; acceptable at personal-app scale; document the convention |
| A3 | `GroupEventParticipant` operations belong in `GroupEventRepo` (not a separate repo) | Architecture Patterns | If participant queries grow complex, may warrant splitting — acceptable for Phase 8 scope |

---

## Open Questions (RESOLVED)

1. **PeerDebt `anchor_date` — what is it for?**
   - What we know: `anchor_date` exists on PeerDebt alongside `frequency` (monthly). The fields mirror the recurring Transaction pattern.
   - What's unclear: Is `anchor_date` used to compute a "next expected installment date"? Or is it just stored for display?
   - Recommendation: Treat it as stored metadata only (no engine logic). `paid_installments + 1` increments don't need date calculation. If the user wants "next due date" display, compute `anchor_date + paid_installments months` in the handler response.
   - RESOLVED: Store as metadata only. No engine computation of next due date in this phase.

2. **`GET /api/friends/summary` — scoped to default account or global?**
   - What we know: PeerDebts are not tied to any Account entity.
   - What's unclear: The dashboard widget shows totals — but which account's currency? CIBI currently assumes a single active account context.
   - Recommendation: The summary endpoint has no account_id scope. Return raw cent totals; the frontend formats them using the currently-selected account's currency. This matches how the dashboard already works.
   - RESOLVED: Global (no account_id scope). Frontend applies currency formatting from selected account context.

3. **Should `total_amount` on GroupEvent be editable after participants are set?**
   - What we know: The requirements say full CRUD on group events.
   - What's unclear: If `total_amount` changes, should participants' shares auto-recalculate?
   - Recommendation: On PATCH of `total_amount`, recalculate all non-override participant shares at the service layer. If there are no override rows, equal-split recalculates automatically.
   - RESOLVED: Yes — PATCH total_amount triggers equal-split recalculation for non-override rows at the service layer. Override rows remain unchanged.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 8 is code/config-only changes against the existing running stack. No new external services, runtimes, or CLI utilities are introduced. All dependencies are already in `go.mod` and `package.json`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest v4.1.4 (frontend); Go `testing` stdlib (backend) |
| Config file | `web/vitest.config.ts` (or vite.config.ts vitest section) |
| Quick run command | `cd web && npm run test -- --run` (frontend); `go test ./internal/...` (backend) |
| Full suite command | `cd web && npm run test` + `go test ./...` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PEER-01 | Friend CRUD + token uniqueness | unit (service) | `go test ./internal/service/ -run TestFriend` | ❌ Wave 0 |
| PEER-02 | PeerDebt confirm installment counter | unit (service) | `go test ./internal/service/ -run TestPeerDebt` | ❌ Wave 0 |
| PEER-03 | GroupEvent participant NULL FK + partial index | unit (repo) | `go test ./internal/repo/sqlite/ -run TestGroupEvent` | ❌ Wave 0 |
| PEER-04 | Public endpoints return 200 without auth | integration (handler) | `go test ./internal/handler/ -run TestPublic` | ❌ Wave 0 |
| PEER-05 | Summary totals math | unit (service) | `go test ./internal/service/ -run TestFriendSummary` | ❌ Wave 0 |
| PEER-06 | Group split equal-split recalc | unit (service) | `go test ./internal/service/ -run TestGroupSplit` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `internal/service/friend_test.go` — covers PEER-01
- [ ] `internal/service/peer_debt_test.go` — covers PEER-02, PEER-05
- [ ] `internal/service/group_event_test.go` — covers PEER-03, PEER-06
- [ ] `internal/handler/public_test.go` — covers PEER-04

---

## Security Domain

The app has no authentication on any endpoint (confirmed by ARCHITECTURE.md and codebase). The `/public/*` endpoints are intentionally unauthenticated. No new security surface is introduced beyond what already exists.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not implemented; app is local/Tailscale-only |
| V3 Session Management | no | No sessions |
| V4 Access Control | partial | Confirmation (`is_confirmed`) is user-only: enforced at service layer — public endpoints return read-only data, do not expose confirm operations |
| V5 Input Validation | yes | go-playground/validator on all handler structs (already wired via `CustomValidator`) |
| V6 Cryptography | yes | Token generation via `crypto/rand` (CSPRNG) — not `math/rand` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token enumeration | Info Disclosure | 128-bit random hex token; brute-force infeasible |
| Confirm via public link | Elevation of Privilege | `/public/*` endpoints are GET-only read-only; confirmation only via authenticated `/api/peer-debts/:id/confirm` |
| SQLite injection | Tampering | All queries use `?` placeholders (parameterized); consistent across entire codebase |

---

## Sources

### Primary (HIGH confidence)
- `internal/repo/sqlite/*.go` [VERIFIED: codebase] — existing repo pattern for nullable fields, SQL templates
- `internal/handler/*.go` [VERIFIED: codebase] — handler DTO pattern, error response shape
- `internal/app/app.go` [VERIFIED: codebase] — wiring pattern, SetupRoutes signature
- `cmd/cibi-api/main.go` [VERIFIED: codebase] — static middleware registration order
- `web/src/router.tsx` [VERIFIED: codebase] — TanStack Router layout route pattern
- `go.mod` [VERIFIED: codebase] — all backend dependencies
- `web/package.json` [VERIFIED: codebase] — all frontend dependencies
- `internal/migrations/20260411000001_initial_schema.go` [VERIFIED: codebase] — migration file pattern

### Secondary (MEDIUM confidence)
- SQLite nullable FK behavior: NULL values excluded from FK enforcement (standard SQL; consistent with SQLite docs) [CITED: https://www.sqlite.org/foreignkeys.html — "rows in the child table with a NULL foreign key value cannot violate the foreign key constraint"]
- SQLite NULL in UNIQUE index: NULLs are distinct (standard SQL; consistent with SQLite docs) [CITED: https://www.sqlite.org/nulls.html — "two NULL values are considered distinct by the UNIQUE constraint"]
- TanStack Router v1 path param syntax `$token`: [ASSUMED — consistent with TanStack Router docs convention]

### Tertiary (LOW confidence)
- None — all claims are codebase-verified or stdlib-documented.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all entries verified against go.mod and package.json
- Architecture: HIGH — all patterns verified against existing codebase; new patterns follow direct extrapolation
- Pitfalls: HIGH (SQLite NULL behavior) / MEDIUM (penny arithmetic, token retry)
- Public routes: HIGH — verified against cmd/cibi-api/main.go static middleware order

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable tech stack; no fast-moving dependencies)
