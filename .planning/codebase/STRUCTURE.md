# Structure

**Analysis Date:** 2026-04-16

## Directory Layout

```
cibi/
├── cmd/
│   ├── cibi/               # CLI binary entrypoint (cobra commands)
│   │   ├── main.go         # calls Execute()
│   │   ├── root.go         # rootCmd, PersistentPreRunE wires app.New()
│   │   ├── check.go        # `cibi check <amount>`
│   │   ├── account.go      # `cibi account` subcommands
│   │   ├── tx.go           # `cibi tx` subcommands
│   │   └── resolve.go      # `cibi resolve` subcommand
│   ├── cibi-api/           # HTTP server binary entrypoint
│   │   ├── main.go         # app.New → serve → graceful shutdown
│   │   ├── embed.go        # //go:embed web/dist — embeds React SPA
│   │   └── web/dist/       # copied here at build time (not committed)
│   └── seed/
│       └── main.go         # dev data seeder
├── db/
│   └── sqlite.go           # db.Init(): opens SQLite with WAL pragmas
├── internal/
│   ├── app/
│   │   └── app.go          # App struct, New() wiring, Start(), Shutdown()
│   ├── config/
│   │   └── config.go       # Config struct, LoadConfig() via Viper
│   ├── engine/
│   │   ├── engine.go       # NextPayday(), AddMonthClamped(), frequency consts
│   │   └── engine_test.go  # pure unit tests for date arithmetic
│   ├── handler/
│   │   ├── routes.go       # SetupRoutes() — all route registrations
│   │   ├── accounts.go     # AccountsHandler
│   │   ├── check.go        # CheckHandler (decision engine endpoint)
│   │   ├── transactions.go # TransactionsHandler
│   │   ├── pay_schedule.go # PayScheduleHandler
│   │   ├── friend.go       # FriendsHandler
│   │   ├── peer_debt.go    # PeerDebtHandler
│   │   ├── group_event.go  # GroupEventHandler
│   │   ├── profile.go      # ProfileHandler
│   │   ├── public.go       # PublicHandler (unauthenticated token endpoints)
│   │   ├── errors.go       # CustomHTTPErrorHandler, CustomValidator
│   │   ├── docs/
│   │   │   └── openapi.yaml    # embedded via //go:embed in routes.go
│   │   ├── accounts_test.go
│   │   ├── check_test.go
│   │   ├── transactions_test.go
│   │   ├── pay_schedule_test.go
│   │   ├── errors_test.go
│   │   └── testhelpers_test.go # shared test setup helpers
│   ├── migrations/
│   │   ├── migrations.go   # Run() via goose + //go:embed *.go
│   │   ├── 20260411000001_initial_schema.go
│   │   ├── 20260412000001_add_pay_schedule_amount.go
│   │   ├── 20260414000001_fix_amount_scale.go
│   │   ├── 20260414000002_friend_ledger.go
│   │   ├── 20260416000003_profile_and_group_host.go
│   │   ├── 20260416000004_pix_keys.go
│   │   └── 20260416000005_account_scoped_friend_ledger.go
│   ├── repo/
│   │   └── sqlite/         # Repository interfaces + SQLite implementations
│   │       ├── accounts.go         # AccountsRepo interface + SqliteAccountsRepo
│   │       ├── transactions.go     # TransactionsRepo interface + impl
│   │       ├── pay_schedule.go     # PayScheduleRepo interface + impl
│   │       ├── safety_buffer.go    # SafetyBufferRepo interface + impl
│   │       ├── friend.go           # FriendRepo interface + impl
│   │       ├── peer_debt.go        # PeerDebtRepo interface + impl
│   │       ├── group_event.go      # GroupEventRepo interface + impl
│   │       ├── profile.go          # ProfileRepo interface + impl
│   │       └── pay_schedule_test.go
│   └── service/
│       ├── accounts.go         # AccountsService
│       ├── transactions.go     # TransactionsService (atomic balance updates)
│       ├── engine.go           # EngineService (CanIBuyIt logic)
│       ├── pay_schedule.go     # PayScheduleService
│       ├── friend.go           # FriendService
│       ├── peer_debt.go        # PeerDebtService
│       ├── group_event.go      # GroupEventService
│       ├── profile.go          # ProfileService
│       ├── token.go            # generatePublicToken() helper
│       └── pay_schedule_test.go
├── types/
│   └── types.go            # Legacy request types (NewAccount, NewTransaction, UpdateAccount)
├── web/                    # React SPA
│   ├── src/
│   │   ├── App.tsx         # QueryClient, AccountContext, RootLayout
│   │   ├── router.tsx      # TanStack Router: route tree + Dashboard component
│   │   ├── components/
│   │   │   ├── ui/         # shadcn/ui primitives (button, dialog, etc.)
│   │   │   ├── StatCards.tsx
│   │   │   ├── CheckWidget.tsx
│   │   │   ├── ObligationsList.tsx
│   │   │   ├── PayScheduleList.tsx
│   │   │   ├── PayScheduleForm.tsx
│   │   │   ├── FriendLedgerWidget.tsx
│   │   │   ├── AccountSelector.tsx
│   │   │   ├── AppModal.tsx
│   │   │   ├── CompactEntityTable.tsx
│   │   │   ├── MobileHeader.tsx
│   │   │   ├── MobileDrawer.tsx
│   │   │   ├── MobileBottomNav.tsx
│   │   │   ├── MobileActionButton.tsx
│   │   │   └── Sidebar.tsx / SidebarNav.tsx
│   │   ├── pages/
│   │   │   ├── accounts.tsx
│   │   │   ├── transactions.tsx
│   │   │   ├── friends.tsx
│   │   │   ├── settings.tsx
│   │   │   ├── friend-public.tsx  # public token view for friend
│   │   │   └── group-public.tsx   # public token view for group
│   │   ├── lib/
│   │   │   ├── api.ts      # All fetch wrappers, TypeScript interfaces
│   │   │   ├── format.ts   # Currency/date formatting helpers
│   │   │   └── clipboard.ts
│   │   └── __tests__/
│   │       └── dashboard.test.tsx
│   ├── package.json
│   └── dist/               # Build output (gitignored; copied to cmd/cibi-api/web/dist/)
├── data/                   # Runtime SQLite database files (gitignored)
├── tmp/                    # Scratch / temp files
├── .planning/              # GSD planning documents
│   └── codebase/           # This directory
├── Dockerfile              # Multi-stage: golang:1.25-alpine builder → alpine runtime
├── docker-compose.yml      # Single-service compose with /data volume mount
├── go.mod                  # Module: github.com/ufleck/cibi
├── go.sum
└── CIBI_SPEC.md            # Product spec / architecture reference
```

## Module Organization

The Go module is `github.com/ufleck/cibi`. Internal packages follow strict layering:

```
engine (pure logic)
  ↑
repo/sqlite (data access — interfaces + impls)
  ↑
service (business logic — uses repo interfaces)
  ↑
handler (HTTP — uses service interfaces)
  ↑
app (wiring — depends on everything)
  ↑
cmd/* (entrypoints — depends on app + config)
```

Layers only depend downward. The `engine` package has no external dependencies. The `handler` package never imports `repo/sqlite` directly — only through `service` interfaces.

The `types/` package at the root contains legacy input structs (`NewAccount`, `NewTransaction`, `UpdateAccount`). Current code defines request/response types inline in each handler file. New code should follow the handler-local pattern.

## File Naming Conventions

**Go files:**
- One file per entity/domain in each layer: `accounts.go`, `transactions.go`, `friend.go`
- Handler files named after entity (singular for specific handler, e.g., `check.go` for the engine endpoint)
- Test files co-located: `accounts_test.go` next to `accounts.go`
- Shared test helpers: `testhelpers_test.go` in the handler package
- Migration files: `YYYYMMDDNNNNN_snake_case_description.go`

**React/TypeScript files:**
- Pages: `kebab-case.tsx` in `web/src/pages/` (e.g., `friend-public.tsx`, `group-public.tsx`)
- Components: `PascalCase.tsx` in `web/src/components/` (e.g., `CheckWidget.tsx`, `StatCards.tsx`)
- UI primitives: `kebab-case.tsx` in `web/src/components/ui/` (shadcn/ui convention)
- Library files: `camelCase.ts` in `web/src/lib/` (e.g., `api.ts`, `format.ts`)

**Directories:**
- Go internal packages: `lowercase` single word (e.g., `engine`, `handler`, `service`)
- Web source: follows React community convention (`components/`, `pages/`, `lib/`)

## Entry Points

**`cmd/cibi-api/main.go`** — HTTP server
- Loads config via `config.LoadConfig()`
- Calls `app.New(cfg)` to wire the full application graph
- Serves embedded React SPA via Echo `StaticWithConfig` (HTML5 mode)
- Starts HTTP on `cfg.ServerPort` (default `:42069`)
- Blocks on SIGINT/SIGTERM; graceful shutdown with 10s drain

**`cmd/cibi/main.go`** → `Execute()` → **`cmd/cibi/root.go`** — CLI
- `PersistentPreRunE` runs before every subcommand: loads config, calls `app.New(cfg)`, stores result in package-level `application *app.App`
- Subcommand files (`check.go`, `account.go`, `tx.go`, `resolve.go`) add their `cobra.Command` to `rootCmd` via `init()`

**`cmd/seed/main.go`** — Dev data seeder
- Standalone tool for populating the database with test data

## Configuration Files

**`go.mod`** — Go module definition. Module: `github.com/ufleck/cibi`. Go 1.25.

**`web/package.json`** — Node/React dependencies. Build: Vite. Key deps: React, TanStack Router, TanStack Query, shadcn/ui, Tailwind CSS.

**`Dockerfile`** — Multi-stage build.
- Stage 1 (`golang:1.25-alpine`): installs Node, builds React SPA, builds both Go binaries with `CGO_ENABLED=0`
- Stage 2 (`alpine:latest`): copies binaries only; exposes port 42069; `ENTRYPOINT ["/app/cibi-api"]`
- Default env: `CIBI_DATABASEPATH=/data/cibi.db` (expects `/data` volume)

**`docker-compose.yml`** — Single service; mounts `./data:/data` volume for SQLite persistence.

**`~/.config/cibi/config.yaml`** — Optional CLI config file (YAML). Overrides defaults for `DatabasePath`, `ServerPort`, `SafetyBuffer`.

**Environment variables** (prefix `CIBI_`):
- `CIBI_DATABASEPATH` — path to SQLite file
- `CIBI_SERVERPORT` — listen address (e.g., `:42069`)
- `CIBI_SAFETYBUFFER` — default safety buffer in cents

## Where to Add New Code

**New domain entity (e.g., a new financial concept):**
1. Add migration: `internal/migrations/YYYYMMDDNNNNN_description.go` with `goose.AddMigrationContext` in `init()`
2. Add repo interface + `Sqlite*` implementation: `internal/repo/sqlite/<entity>.go`
3. Add service: `internal/service/<entity>.go`
4. Add handler: `internal/handler/<entity>.go`
5. Register routes in `internal/handler/routes.go` → `SetupRoutes()`
6. Wire repo + service in `internal/app/app.go` → `New()`
7. Add API types to `web/src/lib/api.ts`
8. Add UI page/component in `web/src/pages/` or `web/src/components/`

**New CLI subcommand:**
- Add `cmd/cibi/<name>.go` with a `cobra.Command` registered via `init()` → `rootCmd.AddCommand()`
- Access services via the package-level `application *app.App`

**New engine calculation:**
- Add pure functions to `internal/engine/engine.go` with tests in `internal/engine/engine_test.go`
- Call from `internal/service/engine.go`

**New public token endpoint:**
- Add route to `/public` group in `internal/handler/routes.go`
- Add handler method to `PublicHandler` in `internal/handler/public.go`
- Define required service interface in `public.go` and add compile-time assertion

---

*Structure analysis: 2026-04-16*
