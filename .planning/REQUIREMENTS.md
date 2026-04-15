# CIBI — Requirements

**Project:** CIBI (Can I Buy It?)
**Last updated:** 2026-04-11
**Milestone scope:**
- v1 = Milestone 1: Core (Engine + CLI)
- v2 = Milestone 2: API + Dashboard; Milestone 3: MCP

---

## Requirements

### ARCH — Architecture & Structure

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| ARCH-01 | Rename module from `github.com/ufleck/cibi-api` to `github.com/ufleck/cibi`; update all import paths; restructure to `cmd/cibi/` (CLI binary) and `cmd/cibi-api/` (API binary) with thin `main.go` bootstrappers | v1 | Must |
| ARCH-02 | Eliminate the global `db.Conn` package variable; inject `*sqlx.DB` as a struct field into every repository; the `internal/app` package owns the connection lifecycle | v1 | Must |
| ARCH-03 | Create `internal/app/app.go` — an `App` struct that wires all repos and services; every `cmd/*/main.go` calls `app.New(cfg)` and receives a fully wired graph; no DI framework | v1 | Must |
| ARCH-04 | Implement Viper config via `internal/config/config.go`; priority order: CLI flags > `CIBI_*` env vars > `~/.config/cibi/config.yaml` > hardcoded defaults; `Config` struct holds `DatabasePath`, `ServerPort`, `SafetyBuffer` | v1 | Must |
| ARCH-05 | Replace `mattn/go-sqlite3` (CGO) with `modernc.org/sqlite` (pure Go); open connection with WAL mode, busy timeout, and foreign keys via DSN; call `db.SetMaxOpenConns(1)` to prevent `SQLITE_BUSY` | v1 | Must |
| ARCH-06 | Integrate `pressly/goose` v3 with `//go:embed` for SQL migrations in `internal/migrations/`; run `goose.Up` at startup before serving; no `CREATE TABLE IF NOT EXISTS` in application code | v1 | Must |

### SCHEMA — Data Model

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| SCHEMA-01 | `Account` entity: `id` (UUID), `name` (TEXT), `current_balance` (INTEGER cents), `currency` (TEXT), `is_default` (BOOLEAN); balance stored as integer cents, never REAL | v1 | Must |
| SCHEMA-02 | `Transaction` entity: `id` (UUID), `account_id` (FK), `amount` (INTEGER cents), `description` (TEXT), `category` (TEXT), `timestamp` (TEXT UTC RFC3339), `is_recurring` (BOOLEAN), `frequency` (TEXT enum: `weekly`, `bi-weekly`, `monthly`, `yearly`, nullable), `anchor_date` (TEXT UTC, nullable), `next_occurrence` (TEXT UTC RFC3339, nullable); no RRULE strings | v1 | Must |
| SCHEMA-03 | `PaySchedule` entity: `id` (UUID), `account_id` (FK), `frequency` (TEXT enum: `weekly`, `bi-weekly`, `semi-monthly`, `monthly`), `anchor_date` (TEXT UTC), `day_of_month2` (INTEGER nullable, for semi-monthly second day), `label` (TEXT nullable); stores payday cadence separate from Account | v1 | Must |
| SCHEMA-04 | `SafetyBuffer` entity (global config row): `min_threshold` (INTEGER cents); a value of 0 is valid and disables the buffer; no percentage field in v1 | v1 | Must |
| SCHEMA-05 | All timestamps stored as UTC in TEXT columns using RFC3339 format (`2006-01-02T15:04:05Z`); all money columns declared as `INTEGER` (not NUMERIC, DECIMAL, or REAL) in DDL; `_foreign_keys=ON` enforced at DSN level | v1 | Must |

### ENGINE — Decision Engine Logic

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| ENGINE-01 | Implement `AddMonthClamped(t time.Time, n int) time.Time` helper in `internal/engine/` that clamps monthly/yearly date advancement to the last valid day of the target month instead of overflowing into the next month; used for all monthly and yearly `next_occurrence` calculations | v1 | Must |
| ENGINE-02 | Implement `NextPayday(schedule PaySchedule, from time.Time) time.Time` that returns the next pay date strictly after `from`; bi-weekly uses anchor + 14-day intervals; monthly uses `AddMonthClamped`; semi-monthly returns `min(next(day1), next(day2))` | v1 | Must |
| ENGINE-03 | Implement `CanIBuyIt(accountID UUID, itemPrice decimal.Decimal) EngineResult` in `internal/service/engine.go`; formula: `purchasing_power = current_balance - sum(upcoming_obligations) - min_threshold`; upcoming obligations are transactions where `next_occurrence > now AND next_occurrence <= next_payday`; must complete in under 100ms | v1 | Must |
| ENGINE-04 | `EngineResult` carries: `CanBuy bool`, `PurchasingPower decimal.Decimal`, `BufferRemaining decimal.Decimal`, `RiskLevel string` (one of `LOW`, `MEDIUM`, `HIGH`, `BLOCKED`); risk tiers based on remaining buffer post-purchase relative to `min_threshold` | v1 | Must |

### TXN — Transaction Management

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| TXN-01 | Full CRUD for transactions via `internal/service/transactions.go`; service layer validates `frequency` enum values; `anchor_date` required when `is_recurring` is true | v1 | Must |
| TXN-02 | After recording a debit against a recurring transaction, the service layer atomically advances `next_occurrence` by one period using `AddMonthClamped` (monthly/yearly) or fixed-day addition (weekly/bi-weekly); double-debit prevention via strict `next_occurrence > now` query | v1 | Must |
| TXN-03 | SQLite connection opened with `_journal_mode=WAL&_busy_timeout=5000&_synchronous=NORMAL&_foreign_keys=ON`; `SetMaxOpenConns(1)` on the pool; all SQL lives exclusively in `internal/repo/sqlite/`; no SQL strings outside that package | v1 | Must |

### CLI — Command-Line Interface

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| CLI-01 | Cobra root command at `cmd/cibi/`; `PersistentPreRunE` loads config via Viper before any subcommand; global `--config` flag overrides default config path; `--db` flag binds to `database_path` Viper key | v1 | Must |
| CLI-02 | `cibi account` subcommands: `list`, `add`, `set-default`, `delete`; output as plain text table; balances displayed as formatted decimal from integer cents | v1 | Must |
| CLI-03 | `cibi tx` subcommands: `list [--account]`, `add`, `update`, `delete`; `add` accepts `--recurring`, `--frequency`, `--anchor` flags; recurring transactions require `--frequency` and `--anchor` | v1 | Must |
| CLI-04 | `cibi check <amount>` command: invokes `Engine.CanIBuyIt()` directly via `internal/service` (no HTTP call); outputs verdict, purchasing power, buffer remaining, and risk level; styled terminal output via lipgloss | v1 | Must |

### API — REST API (Milestone 2)

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| API-01 | Echo HTTP server at `cmd/cibi-api/`; routes for all account and transaction CRUD operations plus `POST /check`; calls `internal/service` layer (no business logic in handlers); JSON request/response | v2 | Must |
| API-02 | OpenAPI documentation generated or hand-authored and served at `/docs`; all request/response shapes described; used by web dashboard for type generation | v2 | Should |
| API-03 | Request validation middleware on Echo; structured error responses with consistent JSON shape; graceful shutdown on SIGTERM | v2 | Must |

### WEB — Dashboard (Milestone 2)

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| WEB-01 | Scaffold React 19 + Vite 6 + TypeScript SPA; Tailwind CSS v4 (CSS-first `@theme` config); shadcn/ui component library initialized; served as static files, not SSR | v2 | Must |
| WEB-02 | TanStack Query v5 for all API data fetching; TanStack Router v1 for type-safe routing; polling for live balance refresh | v2 | Must |
| WEB-03 | Dashboard view showing: current balance, reserved funds (upcoming obligations), liquid amount, and upcoming recurring transactions list; matches the `purchasing_power` formula visually | v2 | Must |
| WEB-04 | "Can I Buy It?" verdict card on the dashboard with Motion (`motion/react`) animation for the YES/NO result; import from `motion` package (not `framer-motion`) | v2 | Must |

### MCP — MCP Server (Milestone 3)

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| MCP-01 | Go MCP server at `cmd/mcp/main.go` using `modelcontextprotocol/go-sdk` v1.5.0; stdio transport (Claude Desktop compatible); calls `internal/app` directly, no HTTP round-trip | v2 | Must |
| MCP-02 | Tool: `get_financial_status()` — returns current balance, reserved funds, liquid amount, next payday date, and safety buffer threshold as structured text | v2 | Must |
| MCP-03 | Tools: `check_purchase_feasibility(amount float64)` returns full `EngineResult` (can buy, purchasing power, buffer remaining, risk level); `log_transaction(amount float64, description string)` records a one-off transaction and returns updated balance | v2 | Must |

### PEER — Friend Ledger (Milestone 2)

| ID | Requirement | Version | Priority |
|----|-------------|---------|----------|
| PEER-01 | `Friend` entity: `id` (UUID), `name` (TEXT), `public_token` (TEXT unique, URL-safe slug), `notes` (TEXT nullable); token used to generate read-only public links via Tailscale | v2 | Must |
| PEER-02 | `PeerDebt` entity: `id` (UUID), `friend_id` (FK), `amount` (INTEGER cents, positive = friend owes user, negative = user owes friend), `description` (TEXT), `date` (TEXT UTC RFC3339), `is_installment` (BOOLEAN), `total_installments` (INTEGER nullable), `paid_installments` (INTEGER default 0), `frequency` (TEXT enum: `monthly`, nullable), `anchor_date` (TEXT UTC nullable), `is_confirmed` (BOOLEAN default false, only user can set) | v2 | Must |
| PEER-03 | `GroupEvent` entity: `id` (UUID), `title` (TEXT), `date` (TEXT UTC RFC3339), `total_amount` (INTEGER cents), `public_token` (TEXT unique, URL-safe slug), `notes` (TEXT nullable); associated `GroupEventParticipant`: `event_id` (FK), `friend_id` (FK nullable — null = assigned to user), `share_amount` (INTEGER cents), `is_confirmed` (BOOLEAN default false) | v2 | Must |
| PEER-04 | Public read-only endpoints (no auth): `GET /public/friend/:token` returns friend name, net balance, transaction history; `GET /public/group/:token` returns event title, date, participant shares and confirmation status | v2 | Must |
| PEER-05 | Dashboard overview section: total owed to user (sum of positive peer debts), total user owes (sum of negative peer debts), net balance; rendered as a summary widget linking to the Friends tab | v2 | Must |
| PEER-06 | Friends management page (dedicated tab): CRUD for friends; list of all peer debts per friend with confirmation toggle; create/manage group events with per-participant share amounts (default equal split, manual override per person); generate/copy public links | v2 | Must |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 1 | Complete |
| ARCH-03 | Phase 1 | Complete |
| ARCH-04 | Phase 1 | Complete |
| ARCH-05 | Phase 1 | Complete |
| ARCH-06 | Phase 1 | Complete |
| SCHEMA-01 | Phase 1 | Complete |
| SCHEMA-02 | Phase 1 | Complete |
| SCHEMA-03 | Phase 1 | Complete |
| SCHEMA-04 | Phase 1 | Complete |
| SCHEMA-05 | Phase 1 | Complete |
| ENGINE-01 | Phase 2 | Pending |
| ENGINE-02 | Phase 2 | Pending |
| ENGINE-03 | Phase 2 | Pending |
| ENGINE-04 | Phase 2 | Pending |
| TXN-01 | Phase 2 | Complete |
| TXN-02 | Phase 2 | Complete |
| TXN-03 | Phase 1 | Complete |
| CLI-01 | Phase 3 | Pending |
| CLI-02 | Phase 3 | Pending |
| CLI-03 | Phase 3 | Pending |
| CLI-04 | Phase 3 | Pending |
| API-01 | Phase 4 | Pending |
| API-02 | Phase 4 | Pending |
| API-03 | Phase 4 | Pending |
| WEB-01 | Phase 5 | Pending |
| WEB-02 | Phase 5 | Pending |
| WEB-03 | Phase 5 | Pending |
| WEB-04 | Phase 5 | Pending |
| MCP-01 | Phase 6 | Pending |
| MCP-02 | Phase 6 | Pending |
| MCP-03 | Phase 6 | Pending |
