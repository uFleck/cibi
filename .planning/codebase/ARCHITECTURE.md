# Architecture

**Analysis Date:** 2026-04-16

## System Overview

CIBI ("Can I Buy It?") is a personal finance decision engine that answers whether a user can afford a purchase given their current balance, upcoming recurring obligations, and a configured safety buffer.

**Core equation:**
```
purchasing_power = current_balance - sum(upcoming_obligations until next_payday) - safety_buffer
can_buy = purchasing_power >= item_price
```

The system is a **layered monolith** compiled to two Go binaries:
- `cibi-api` — HTTP server serving both the REST API and the embedded React SPA.
- `cibi` — CLI for direct local usage (bypasses HTTP; wires into the same `App` service graph directly).

Both binaries share the same `internal/` domain logic. The CLI calls `app.New(cfg)` in `PersistentPreRunE` and invokes service methods directly — it does not make HTTP calls to itself.

## Layers / Components

**`internal/engine` — Pure computation layer**
- Purpose: Date arithmetic for payday calculations. No I/O, no DB access.
- Location: `internal/engine/engine.go`
- Contains: `NextPayday()`, `AddMonthClamped()`, frequency constants (`weekly`, `bi-weekly`, `semi-monthly`, `monthly`, `yearly`)
- Depends on: standard library only
- Used by: `internal/service/engine.go`, `internal/service/transactions.go`

**`internal/repo/sqlite` — Data access layer**
- Purpose: All SQL queries and domain row structs. Defines repository interfaces for each entity.
- Location: `internal/repo/sqlite/`
- Contains: Interface definitions (e.g., `AccountsRepo`, `TransactionsRepo`, `PayScheduleRepo`, `SafetyBufferRepo`, `FriendRepo`, `PeerDebtRepo`, `GroupEventRepo`, `ProfileRepo`) and their `Sqlite*` concrete implementations. Row structs live here (e.g., `sqlite.Account`, `sqlite.Transaction`, `sqlite.Friend`).
- Depends on: `database/sql`, `modernc.org/sqlite`
- Used by: `internal/service/`

**`internal/service` — Business logic layer**
- Purpose: Orchestrates repositories, enforces business rules, manages atomic DB transactions.
- Location: `internal/service/`
- Services: `AccountsService`, `TransactionsService`, `EngineService`, `PayScheduleService`, `FriendService`, `PeerDebtService`, `GroupEventService`, `ProfileService`
- Depends on: `internal/repo/sqlite`, `internal/engine`
- Used by: `internal/handler/`, `cmd/cibi/`

**`internal/handler` — HTTP presentation layer**
- Purpose: HTTP request binding, validation, response serialization. Zero business logic.
- Location: `internal/handler/`
- Contains: Handler structs (one per domain), `SetupRoutes()`, request/response DTOs, `CustomHTTPErrorHandler`, `CustomValidator`
- Request/response types are separate from repo row structs (API uses float dollars; internals use int64 cents)
- Depends on: `internal/service`
- Used by: `internal/app`

**`internal/app` — Application composition root**
- Purpose: Constructs and wires the entire dependency graph in a single place.
- Location: `internal/app/app.go`
- Wiring order: `db.Init` → `migrations.Run` → repo constructors → service constructors → `handler.SetupRoutes`
- Exposes the `App` struct containing the Echo instance and all services
- Depends on: all `internal/` packages, `db`

**`internal/config` — Configuration**
- Purpose: Load config from environment variables via Viper.
- Location: `internal/config/config.go`
- Env prefix: `CIBI_` (e.g., `CIBI_DATABASEPATH`, `CIBI_SERVERPORT`, `CIBI_SAFETYBUFFER`)
- Defaults: `DatabasePath=./db/cibi.db`, `ServerPort=:42069`, `SafetyBuffer=1000` (cents)

**`internal/migrations` — Schema migrations**
- Purpose: Goose-based migrations embedded as Go source files via `//go:embed *.go`.
- Location: `internal/migrations/`
- Runs automatically at every startup via `migrations.Run(db)` called inside `app.New()`.
- Migration files named `YYYYMMDDNNNNN_description.go`.

**`db` — Database initialization**
- Purpose: Open SQLite connection with performance/safety pragmas.
- Location: `db/sqlite.go`
- Pragmas: WAL journal mode, `busy_timeout=5000`, NORMAL sync, `foreign_keys=ON`
- Max open connections: 1 (serializes all writes to SQLite)

**`web/` — React SPA**
- Purpose: Browser dashboard. Calls the Go API via relative paths (`/api/...`, `/public/...`).
- Location: `web/src/`
- Built to `web/dist/`, copied to `cmd/cibi-api/web/dist/`, embedded at compile time with `//go:embed`.
- Router: TanStack Router; state: TanStack Query (30s stale time, 30s refetch interval)

**`cmd/cibi-api` — API server binary**
- Location: `cmd/cibi-api/main.go`, `cmd/cibi-api/embed.go`
- Embeds `web/dist` and serves the SPA via Echo `StaticWithConfig` (HTML5 mode for client-side routing)
- Handles graceful shutdown on SIGINT/SIGTERM with 10s drain

**`cmd/cibi` — CLI binary**
- Location: `cmd/cibi/`
- Cobra command tree: `check`, `account`, `tx`, `resolve` subcommands under root
- Config search: `~/.config/cibi/config.yaml` or `--config` flag; `--db` flag overrides `DatabasePath`

## Data Flow

**"Can I Buy It?" decision flow:**

1. `POST /api/check` with `{ amount, account_id? }` arrives at `handler.CheckHandler.Check()`.
2. Handler binds/validates, converts float dollars → int64 cents.
3. Calls `service.EngineService.CanIBuyIt(accountID, cents)`.
4. Engine loads account balance via `AccountsRepo.GetByID()`.
5. Loads all pay schedules for account via `PayScheduleRepo.ListByAccountID()`; finds earliest next payday with `engine.NextPayday()`.
6. Sums recurring transaction obligations in window `[now, earliestPayday]` via `TransactionsRepo.SumUpcomingObligations()`.
7. Sums outgoing peer debt obligations via `PeerDebtRepo.SumUpcomingPeerObligationsByAccount()`.
8. Sums group event host obligations via `GroupEventRepo.SumUpcomingAdminObligationsByAccount()`.
9. Loads `SafetyBuffer.min_threshold` via `SafetyBufferRepo.Get()`.
10. Calculates: `purchasing_power = balance + obligations + peerObligs + groupObligs - threshold` (obligations are stored as negative values).
11. Determines `can_buy`, `buffer_remaining`, `risk_level`; if blocked, checks if affordable after payday → `WAIT` verdict.
12. Handler converts cents → dollars for JSON response.

**Transaction creation (D-01 atomic balance update):**

1. `POST /api/transactions` → `service.TransactionsService.CreateTransaction()`
2. Begins SQL transaction; inserts transaction row; updates `Account.current_balance += amount`
3. Commits atomically — balance is always consistent with transaction history.

**Recurring transaction confirmation (D-03):**

1. `POST /api/transactions/:id/confirm` → `service.TransactionsService.ConfirmRecurring()`
2. Atomically: debits account balance (`balance += amount` where amount is negative) and advances `next_occurrence` by one period using `advanceOccurrence()` / `engine.AddMonthClamped()`.

**Public friend/group token flow:**

1. User shares URL `/public/friend/<hex-token>` with a friend.
2. Browser hits the route; if `Accept: text/html`, server returns embedded `index.html`.
3. React SPA fetches `GET /public/friend/<token>` with `Accept: application/json`.
4. `PublicHandler.GetFriendByToken()` returns debt balance, peer debts, group events — no authentication required.
5. If the friend is a group host, `POST /public/friend/:token/groups/:eventID/participants/:friendID/confirm` lets them mark a participant as paid.

## Key Patterns & Design Decisions

**Cents everywhere internally.** All monetary values are stored and processed as `int64` cents. Conversion to/from float64 dollars happens only at the HTTP handler boundary (request parsing and response serialization). The database stores `INTEGER` (cents) for all monetary columns.

**Interface-driven repositories.** Each repo exposes a Go interface (e.g., `sqlite.AccountsRepo`) in the same package as its implementation. Services accept the interface, not the concrete struct. Compile-time assertion pattern: `var _ AccountsRepo = (*SqliteAccountsRepo)(nil)` verifies satisfaction at build time.

**Handler-local service interfaces.** Handlers define minimal service interfaces for their own needs (e.g., `EngineServiceIface` in `internal/handler/check.go`). Same compile-time assertion pattern used. This decouples the handler package from concrete service types in tests.

**Goose migrations as embedded Go files.** Migration files are `.go` source files that register themselves via `init()` calling `goose.AddMigrationContext()`. The directory is embedded at compile time via `//go:embed *.go`. No external SQL files or migration tools needed at runtime.

**Single-connection SQLite.** `db.SetMaxOpenConns(1)` serializes all writes. WAL mode permits concurrent reads. `busy_timeout=5000` prevents immediate failures under contention.

**Account-scoped friend ledger.** `PeerDebt` and `GroupEvent` carry `account_id` (added in migration 20260416000005). The engine includes peer and group obligations when computing purchasing power for a specific account.

**Public token security.** `Friend` and `GroupEvent` rows have a `public_token` generated as 32 hex chars (128-bit entropy from `crypto/rand`). Unauthenticated `/public/` endpoints resolve records only by this token. There is no session auth — the app is local-first and Tailscale-networked.

**Risk level classification (ENGINE-04):**
- `LOW`: `buffer_remaining >= 50%` of `min_threshold` (or `min_threshold == 0`)
- `MEDIUM`: `buffer_remaining >= 25%` but `< 50%` of threshold
- `HIGH`: `buffer_remaining < 25%` of threshold
- `BLOCKED`: cannot afford even ignoring threshold
- `WAIT`: blocked now but will afford after earliest next payday

**Uniform error response.** All errors return JSON `{"error": "string"}`. Machine-readable domain errors also include `"code"` (e.g., `PAY_SCHEDULE_REQUIRED`). Handled centrally in `handler.CustomHTTPErrorHandler`.

## Database / Storage

**Engine:** `modernc.org/sqlite` (pure Go — no CGO). Single file database. Default path `./db/cibi.db`, configurable via `CIBI_DATABASEPATH`. Production: `/data/cibi.db` via Docker volume.

**Schema tables:**

| Table | Key columns | Notes |
|---|---|---|
| `Account` | `id TEXT PK`, `current_balance INTEGER`, `is_default BOOLEAN` | One default per account set; balance in cents |
| `Transaction` | `id`, `account_id`, `amount INTEGER`, `is_recurring`, `frequency`, `anchor_date`, `next_occurrence` | Debit = negative amount; recurring txns track next due date |
| `PaySchedule` | `id`, `account_id`, `frequency TEXT`, `anchor_date`, `day_of_month2`, `amount INTEGER` | Multiple schedules per account; amount = expected paycheck |
| `SafetyBuffer` | `min_threshold INTEGER` | Global singleton; single row; no primary key constraint |
| `Friend` | `id`, `name`, `public_token TEXT UNIQUE`, `pix_key` | Token for shareable public URL |
| `PeerDebt` | `id`, `friend_id`, `account_id`, `amount`, `is_installment`, `total_installments`, `paid_installments`, `is_confirmed` | Supports recurring installment debts |
| `GroupEvent` | `id`, `account_id`, `title`, `total_amount`, `public_token UNIQUE`, `host_friend_id` | Shared expense; host can be a Friend or the owner |
| `GroupEventParticipant` | `event_id`, `friend_id` (nullable = owner), `share_amount`, `is_confirmed` | `NULL friend_id` represents the owner as participant |
| `UserProfile` | `id INTEGER PK CHECK(id=1)`, `display_name`, `pix_key` | Singleton row; insert-on-conflict-do-nothing |

**Balance consistency:** `Account.current_balance` is updated atomically within the same SQL transaction as every `INSERT`/`UPDATE`/`DELETE` on `Transaction`. The balance is a materialized running total, not recomputed from history.

## API Design

**Base:** `/api` — authenticated (no token; local network assumed).
**Public:** `/public` — unauthenticated, token-addressed.

**Core route summary:**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/check` | Decision engine query |
| `GET/POST` | `/api/accounts` | List / create accounts |
| `GET/PATCH/DELETE` | `/api/accounts/:id` | Read / update / delete account |
| `POST` | `/api/accounts/:id/set-default` | Set default account |
| `GET/POST` | `/api/transactions` | List / create transactions |
| `PATCH/DELETE` | `/api/transactions/:id` | Update / delete transaction |
| `POST` | `/api/transactions/:id/confirm` | Confirm recurring transaction occurrence |
| `GET/POST/PATCH/DELETE` | `/api/pay-schedule` / `/:id` | Pay schedule CRUD |
| `GET/POST/PATCH/DELETE` | `/api/friends` / `/:id` | Friend CRUD |
| `GET` | `/api/friends/summary` | Aggregate debt totals |
| `GET` | `/api/friends/breakdown` | Per-friend debt breakdown |
| `GET/POST/PATCH/DELETE` | `/api/peer-debts` / `/:id` | Peer debt CRUD |
| `POST` | `/api/peer-debts/:id/confirm` | Confirm peer debt paid |
| `GET/POST/PATCH/DELETE` | `/api/group-events` / `/:id` | Group event CRUD |
| `PUT` | `/api/group-events/:id/participants` | Replace full participant list |
| `GET/PATCH` | `/api/profile` | Owner profile |
| `GET` | `/api/docs` | Embedded OpenAPI YAML |
| `GET` | `/public/friend/:token` | Friend's public debt view |
| `POST` | `/public/friend/:token/groups/:eventID/participants/:friendID/confirm` | Host confirms participant payment |
| `GET` | `/public/group/:token` | Group event public view |

**Conventions:**
- Monetary amounts in JSON: `float64` dollars (converted at handler boundary)
- Timestamps: RFC3339 strings or `YYYY-MM-DD` date strings
- IDs: UUID strings
- Error body: `{"error": "message"}` or `{"error": "message", "code": "MACHINE_CODE"}`
- List endpoints accept `?account_id=<uuid>` query parameter for filtering

---

*Architecture analysis: 2026-04-16*
