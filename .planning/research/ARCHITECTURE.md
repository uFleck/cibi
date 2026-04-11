# Architecture Patterns

**Project:** CIBI (Can I Buy It?)
**Researched:** 2026-04-11
**Confidence:** HIGH (verified against official Go docs, threedots.tech, and current SDK repos)

---

## Recommended Architecture

CIBI targets three entrypoints — REST API (`cmd/api`), CLI (`cmd/cli`), MCP server (`cmd/mcp`) — all sharing a single domain/service layer. The pattern is a flat internal monorepo with a shared `internal/` package tree and no inter-process calls between entrypoints.

```
cibi-api/
  cmd/
    api/
      main.go        # wires Echo + handlers, calls internal/app to build services
    cli/
      main.go        # wires Cobra + commands, calls internal/app to build services
    mcp/
      main.go        # wires MCP server + tools, calls internal/app to build services
  internal/
    app/
      app.go         # App struct: holds all services, built once per process
    config/
      config.go      # Config struct, loaded from env/file/flags
    domain/
      account.go     # pure domain types: Account, Transaction, SafetyBuffer
      transaction.go
    repo/
      interfaces.go  # AccountsRepo, TransactionsRepo interfaces (no DB imports)
      sqlite/
        accounts.go  # SqliteAccountsRepo implementing repo.AccountsRepo
        transactions.go
        db.go        # *sql.DB factory, schema bootstrap
      postgres/      # (future) PostgresAccountsRepo — same interfaces, different driver
    service/
      accounts.go    # AccountsService — business logic, depends on repo interfaces only
      transactions.go
      engine.go      # Decision Engine: CanIBuyIt() lives here
    handler/         # HTTP handlers (Echo-specific)
      accounts.go
      transactions.go
      routes.go
    command/         # CLI commands (Cobra-specific)
      check.go
      add.go
    tool/            # MCP tool handlers (mcp-go or official SDK)
      status.go
      feasibility.go
  data/              # (rename to internal/domain — see below)
  go.mod
  go.sum
```

The key insight: `cmd/*/main.go` files are thin bootstrappers. They call `internal/app.New(cfg)` and get back a fully wired `App` struct. CLI commands call `app.Engine.CanIBuyIt()` directly — no HTTP round-trip.

---

## Component Boundaries

| Component | Responsibility | Depends On |
|-----------|---------------|------------|
| `cmd/api/main.go` | Wire Echo, mount handlers, start HTTP server | `internal/app`, `internal/handler` |
| `cmd/cli/main.go` | Register Cobra commands, parse flags | `internal/app`, `internal/command` |
| `cmd/mcp/main.go` | Register MCP tools, start stdio/HTTP transport | `internal/app`, `internal/tool` |
| `internal/app` | Build the full dependency graph once | `internal/config`, `internal/repo`, `internal/service` |
| `internal/service` | Business logic, the Decision Engine | `internal/repo` interfaces, `internal/domain` |
| `internal/repo/sqlite` | SQLite-specific SQL, schema bootstrap | `database/sql`, `mattn/go-sqlite3` |
| `internal/handler` | HTTP request/response translation | `internal/service` |
| `internal/command` | CLI flag parsing, output formatting | `internal/service` |
| `internal/tool` | MCP tool schema + handler logic | `internal/service` |

The service layer has zero knowledge of HTTP, CLI flags, or MCP. Handlers translate between their transport format and the service layer — nothing else.

---

## Data Flow

```
CLI flag input
  → internal/command parses → internal/service.Engine.CanIBuyIt()
                                → internal/repo.AccountsRepo.GetDefault()
                                → internal/repo.TransactionsRepo.GetAccTxns()
                                ← returns domain types
                              ← returns EngineResult
  ← command formats to stdout

HTTP POST /check
  → internal/handler decodes JSON body → internal/service.Engine.CanIBuyIt()
                                           (same path as CLI above)
  ← handler encodes JSON response

MCP tool call: check_purchase_feasibility
  → internal/tool wraps args → internal/service.Engine.CanIBuyIt()
  ← tool wraps result in MCP TextContent
```

All three entrypoints exercise the same code path. The Decision Engine is tested once, not three times.

---

## Pattern 1: Repository Interface Split

**The current problem:** `repos/accounts.go` defines `AccountsRepo` alongside `SqliteAccRepo` in the same package. This couples the interface to the implementation package, making it awkward to add a second driver.

**The fix:** Separate interfaces from implementations.

```go
// internal/repo/interfaces.go
package repo

import (
    "database/sql"
    "github.com/google/uuid"
    "github.com/ufleck/cibi-api/internal/domain"
)

type AccountsRepo interface {
    Insert(a domain.Account) error
    GetAll() (domain.Accounts, error)
    GetDefault() (domain.Account, error)
    GetById(id uuid.UUID) (domain.Account, error)
    UpdateBalance(accountId uuid.UUID, balance float64, tx *sql.Tx) error
    UpdateName(accId uuid.UUID, name string) error
    UpdateIsDefault(accId uuid.UUID, isDefault bool) error
    DeleteById(accId uuid.UUID) error
}

type TransactionsRepo interface {
    Insert(t domain.Transaction, acc domain.Account) error
    GetAccTxns(accountId uuid.UUID) (domain.Transactions, error)
    Update(tId uuid.UUID, update UpdateTransaction) error
}
```

```go
// internal/repo/sqlite/accounts.go
package sqlite

import "github.com/ufleck/cibi-api/internal/repo"

// Compile-time check: SqliteAccountsRepo must satisfy the interface.
var _ repo.AccountsRepo = (*SqliteAccountsRepo)(nil)

type SqliteAccountsRepo struct {
    db *sql.DB  // injected, not a package-level global
}
```

Adding PostgreSQL later means creating `internal/repo/postgres/accounts.go` with the same interface — nothing else changes.

**Transaction handling:** The current `tx *sql.Tx` parameter threading pattern is fine and idiomatic. Keep it. Do not pass transactions through `context.Context` (that pattern obscures dependencies).

---

## Pattern 2: The App Struct (Manual DI, No Framework)

Do not use Google Wire or any DI framework for a project this size. Manual wiring in `internal/app/app.go` is transparent and sufficient.

```go
// internal/app/app.go
package app

import (
    "database/sql"
    "github.com/ufleck/cibi-api/internal/config"
    "github.com/ufleck/cibi-api/internal/repo/sqlite"
    "github.com/ufleck/cibi-api/internal/service"
)

type App struct {
    DB       *sql.DB
    Accounts *service.AccountsService
    Txns     *service.TransactionsService
    Engine   *service.DecisionEngine
}

func New(cfg config.Config) (*App, error) {
    db, err := sqlite.Open(cfg.DatabasePath)
    if err != nil {
        return nil, err
    }

    accRepo := sqlite.NewAccountsRepo(db)
    txnRepo := sqlite.NewTransactionsRepo(db, accRepo)
    txnSvc  := service.NewTransactionsService(txnRepo, accRepo)
    accSvc  := service.NewAccountsService(accRepo, txnRepo, txnSvc)
    engine  := service.NewDecisionEngine(accRepo, txnRepo, cfg.SafetyBuffer)

    return &App{
        DB:       db,
        Accounts: accSvc,
        Txns:     txnSvc,
        Engine:   engine,
    }, nil
}
```

Each `cmd/*/main.go` calls `app.New(cfg)`, then passes the relevant services to its handlers/commands. No global state. Fully testable by substituting mock repos.

---

## Pattern 3: Database Library — Use sqlx, Not GORM

**Recommendation: sqlx over GORM.**

Rationale:
- GORM abstracts SQL away, which fights you when queries get non-trivial (the recurring transaction projection in the Decision Engine requires precise date arithmetic — GORM's query builder will not help here).
- The existing codebase already uses raw `database/sql`. sqlx is a zero-friction upgrade: it wraps `*sql.DB` and `*sql.Tx` in-place, so existing query strings keep working.
- sqlx adds struct scanning (`db.Get`, `db.Select`), named parameters, and `In()` — the three things most painful with raw `database/sql` — while remaining completely transparent about what SQL is executed.
- Swapping SQLite to PostgreSQL with sqlx means: change the driver import and DSN string. The queries themselves need minimal adjustment (SQLite uses `?` placeholders; PostgreSQL uses `$1`). Use `sqlx.Rebind` to handle this difference automatically.
- GORM is appropriate if you want zero-SQL development and are fine with the magic. For CIBI, where financial calculations require exact SQL control, GORM's magic is a liability.

**Driver setup for swappability:**

```go
// internal/repo/sqlite/db.go
import _ "github.com/mattn/go-sqlite3"

func Open(path string) (*sqlx.DB, error) {
    return sqlx.Open("sqlite3", path)
}

// internal/repo/postgres/db.go (future)
import _ "github.com/lib/pq"

func Open(dsn string) (*sqlx.DB, error) {
    return sqlx.Open("postgres", dsn)
}
```

The repo structs in each package accept `*sqlx.DB`. When you swap drivers, you change which `Open` function you call in `app.New` — nothing in the service layer changes.

---

## Pattern 4: Sharing Domain Logic Across CLI, API, and MCP

**Rule: No interface calls HTTP. The CLI and MCP server import the service layer directly.**

This is the most important architectural constraint. The spec's original `Rule 2` ("All interfaces must communicate through the FastAPI layer") was written for a Python architecture where FastAPI was the centralization point. In Go, the service layer IS that centralization point — there is no need for an HTTP hop.

```go
// cmd/cli/main.go
cfg  := config.Load()
app  := app.New(cfg)

rootCmd.AddCommand(checkCmd(app.Engine))

// internal/command/check.go
func checkCmd(engine *service.DecisionEngine) *cobra.Command {
    return &cobra.Command{
        Use:   "check [amount]",
        Short: "Ask: can I buy this?",
        RunE: func(cmd *cobra.Command, args []string) error {
            amount, _ := strconv.ParseFloat(args[0], 64)
            result, err := engine.CanIBuyIt(amount)
            if err != nil {
                return err
            }
            fmt.Printf("Can buy: %v | Buffer remaining: %.2f\n",
                result.CanBuy, result.BufferRemaining)
            return nil
        },
    }
}
```

This means:
- The CLI works offline (no server required to be running).
- The Decision Engine logic lives in one place and is tested once.
- Adding a Telegram bot or any other interface means importing `internal/service` — not calling an HTTP endpoint.

---

## Pattern 5: Configuration Management

**Recommendation: Viper with a layered priority stack.**

Priority order (high to low):
1. CLI flags (via `pflag`/`cobra` binding)
2. Environment variables
3. Config file (`~/.config/cibi/config.yaml` or `./cibi.yaml`)
4. Hardcoded defaults

```go
// internal/config/config.go
package config

import (
    "github.com/spf13/viper"
)

type Config struct {
    DatabasePath string  `mapstructure:"database_path"`
    ServerPort   int     `mapstructure:"server_port"`
    SafetyBuffer float64 `mapstructure:"safety_buffer"`
}

func Load() (Config, error) {
    v := viper.New()

    // Defaults
    v.SetDefault("database_path", "./db/cibi.db")
    v.SetDefault("server_port", 42069)
    v.SetDefault("safety_buffer", 50.0)

    // Env vars: CIBI_DATABASE_PATH, CIBI_SERVER_PORT, CIBI_SAFETY_BUFFER
    v.SetEnvPrefix("CIBI")
    v.AutomaticEnv()
    v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

    // Config file (optional, silently ignored if absent)
    v.SetConfigName("cibi")
    v.SetConfigType("yaml")
    v.AddConfigPath("$HOME/.config/cibi/")
    v.AddConfigPath(".")
    _ = v.ReadInConfig() // intentionally ignore "file not found"

    var cfg Config
    if err := v.Unmarshal(&cfg); err != nil {
        return cfg, err
    }
    return cfg, nil
}
```

In `cmd/api/main.go`, Cobra flags bind to Viper keys:
```go
rootCmd.PersistentFlags().String("db", "", "Path to SQLite database")
viper.BindPFlag("database_path", rootCmd.PersistentFlags().Lookup("db"))
```

This means `cibi-api --db /data/cibi.db` overrides the env var, which overrides the config file, which overrides the default. All three entrypoints (api, cli, mcp) use the same `config.Load()` call.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Global `db.Conn`
**Current state:** `db/sqlite.go` exports a package-level `var Conn *sql.DB` that every repo imports directly.
**Why bad:** Makes it impossible to test repos in isolation, impossible to run multiple database connections, and impossible to swap implementations cleanly.
**Fix:** Inject `*sqlx.DB` (or `*sql.DB`) as a struct field into each repo. The `internal/app` package owns the connection lifecycle.

### Anti-Pattern 2: CLI Calling HTTP
**What it is:** Running `cibi-api` in a subprocess or calling `http.Get("localhost:42069/check")` from the CLI.
**Why bad:** Requires the server to be running, adds latency, makes testing exponentially harder.
**Fix:** CLI imports `internal/service` directly. The server is only required for web/mobile access via Tailscale.

### Anti-Pattern 3: Business Logic in Handlers
**What it is:** Putting the recurring transaction projection math in `handlers/transactions.go`.
**Why bad:** Duplicated across CLI and API, untestable without an HTTP context.
**Fix:** `internal/service/engine.go` owns all Decision Engine logic. Handlers only translate inputs/outputs.

### Anti-Pattern 4: SQL Strings Scattered Across Packages
**Current state:** Raw SQL in `repos/accounts.go` references `db.Conn` directly.
**Why bad:** No single place to audit queries; driver-specific syntax leaks everywhere.
**Fix:** All SQL lives in `internal/repo/sqlite/*.go`. Nothing outside that package should contain a SQL string.

### Anti-Pattern 5: Schema Bootstrap in Application Code
**Current state:** `CREATE TABLE IF NOT EXISTS` runs on every startup in `db/sqlite.go`.
**Why bad:** Cannot manage schema evolution (adding columns, indexes) safely; no migration history.
**Fix:** Use `golang-migrate/migrate` for schema versioning. Migration files in `internal/repo/sqlite/migrations/001_init.sql`. Run migrations at startup before the app starts serving.

---

## MCP Server Implementation

Use the official `modelcontextprotocol/go-sdk` for long-term spec compliance. The community `mark3labs/mcp-go` is more ergonomic today but the official SDK is now the correct long-term bet (maintained with Google, targets spec version 2025-11-25).

```go
// cmd/mcp/main.go
app, _ := app.New(cfg)

s := mcp.NewServer("cibi", "1.0.0")

s.AddTool(mcp.NewTool("get_financial_status",
    mcp.WithDescription("Returns current balance, reserved funds, and liquid amount"),
), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    status, err := app.Engine.GetStatus()
    // ...
    return mcp.NewToolResultText(formatStatus(status)), nil
})
```

The tool handler calls `app.Engine` — it does not make an HTTP request. MCP server, API server, and CLI all share the same `App` instance within their respective process.

---

## Scalability Considerations

CIBI is a single-user personal finance app. The architecture should optimize for maintainability and correctness, not throughput.

| Concern | Now (single user) | If ever multi-user |
|---------|-------------------|-------------------|
| Database | SQLite (file-based, zero config) | Swap `internal/repo/sqlite` → `internal/repo/postgres`, change `app.New` driver call |
| Concurrency | SQLite with WAL mode (`PRAGMA journal_mode=WAL`) handles concurrent reads fine | PostgreSQL handles this natively |
| Auth | None (Tailscale for network isolation) | Add middleware in `internal/handler` only |
| Deployment | Single binary, runs locally | Same binary, deploy to VPS behind Tailscale |

The repository pattern and `internal/app` wiring mean the database swap is a config-level change, not a code rewrite.

---

## Migration Path from Current Structure

The existing codebase is 80% of the way there. The changes are structural, not rewrites:

1. Move `data/` → `internal/domain/` (rename package from `data` to `domain`)
2. Move `repos/` → `internal/repo/` — split interfaces into `interfaces.go`, implementations into `sqlite/`
3. Move `services/` → `internal/service/`
4. Move `handlers/` → `internal/handler/`
5. Move `types/` → merge into `internal/domain/` (request/response types) and `internal/service/` (service input types)
6. Replace `db.Conn` global with injected `*sql.DB` field in each repo struct
7. Create `internal/app/app.go` — move the wiring from `main.go` here
8. Create `cmd/api/main.go` — thin wrapper that calls `app.New()` and starts Echo
9. Add `cmd/cli/` and `cmd/mcp/` as new entrypoints sharing `internal/app`

No existing logic needs to change — only its location and how dependencies are wired.

---

## Sources

- [Official Go Module Layout — go.dev](https://go.dev/doc/modules/layout) — HIGH confidence
- [Repository Pattern in Go — Three Dots Labs](https://threedots.tech/post/repository-pattern-in-go/) — HIGH confidence
- [GORM vs sqlx vs pgx (2025) — dasroot.net](https://dasroot.net/posts/2025/12/go-database-patterns-gorm-sqlx-pgx-compared/) — MEDIUM confidence
- [JetBrains: Comparing database/sql, GORM, sqlx, and sqlc](https://blog.jetbrains.com/go/2023/04/27/comparing-db-packages/) — HIGH confidence
- [sqlx GitHub](https://github.com/jmoiron/sqlx) — HIGH confidence
- [Official MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk) — HIGH confidence
- [mark3labs/mcp-go](https://github.com/mark3labs/mcp-go) — HIGH confidence
- [Building an MCP Server in Go — navendu.me](https://navendu.me/posts/mcp-server-go/) — MEDIUM confidence
- [Viper configuration — spf13/viper](https://github.com/spf13/viper) — HIGH confidence
- [Go Dependency Injection with Wire — go.dev blog](https://go.dev/blog/wire) — HIGH confidence (cited to confirm Wire is overkill at this scale)
