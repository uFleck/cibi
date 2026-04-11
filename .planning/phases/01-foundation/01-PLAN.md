---
version: 1.0.0
wave: 1
depends_on: []
files_modified:
  - "go.mod"
  - "cmd/cibi-api/main.go"
  - "internal/config/config.go"
  - "internal/app/app.go"
  - "internal/migrations/00001_initial_schema.go"
  - "internal/migrations/migrations.go"
  - "db/sqlite.go"
  - "repos/sqlite.go"
autonomous: true
---

# Phase 01: Foundation

## Context
Refactoring the repository to establish the foundational infrastructure before adding business logic. This prepares the application for proper DI, zero global state, Viper configuration, pure-Go SQLite with `modernc.org/sqlite`, and Goose migrations.

## Requirements Covered
- `ARCH-01`, `ARCH-02`, `ARCH-03`, `ARCH-04`, `ARCH-05`, `ARCH-06`
- `SCHEMA-01`, `SCHEMA-02`, `SCHEMA-03`, `SCHEMA-04`, `SCHEMA-05`
- `TXN-03`

## Tasks

<task>
  <id>1</id>
  <description>Module Rename and Structural Directories</description>
  <requirements>ARCH-01</requirements>
  <read_first>
    - go.mod
    - main.go
  </read_first>
  <action>
    - Open `go.mod` and change `module github.com/ufleck/cibi-api` to `module github.com/ufleck/cibi`.
    - Run `go mod edit -module=github.com/ufleck/cibi`.
    - Replace all instances of `"github.com/ufleck/cibi-api/` with `"github.com/ufleck/cibi/` in all `*.go` files.
    - Create `cmd/cibi-api/` directory.
    - Move `main.go` into `cmd/cibi-api/main.go`.
    - Note: ensure standard package names still align post-move.
  </action>
  <acceptance_criteria>
    - `go.mod` contains `module github.com/ufleck/cibi`
    - `cmd/cibi-api/main.go` exists and package is `main`
    - `go build ./cmd/cibi-api` succeeds
  </acceptance_criteria>
</task>

<task>
  <id>2</id>
  <description>Implement Viper Configuration</description>
  <requirements>ARCH-04</requirements>
  <read_first>
    - .planning/REQUIREMENTS.md
  </read_first>
  <action>
    - Create `internal/config/config.go`.
    - Define `Config` struct with:
      - `DatabasePath string`
      - `ServerPort string`
      - `SafetyBuffer int64`
    - Create `LoadConfig()` function utilizing `github.com/spf13/viper`.
    - Bind `CIBI_` prefix for Environment variables (`viper.SetEnvPrefix("cibi")`).
    - Set defaults: `DatabasePath` = `./db/cibi.db`, `ServerPort` = `:42069`, `SafetyBuffer` = `0`.
  </action>
  <acceptance_criteria>
    - `internal/config/config.go` exists
    - `Config` struct has exactly three defined fields
    - `viper.SetEnvPrefix("cibi")` exists in the code
  </acceptance_criteria>
</task>

<task>
  <id>3</id>
  <description>Replace go-sqlite3 with modernc.org/sqlite and setup migrations</description>
  <requirements>ARCH-05, ARCH-06, TXN-03</requirements>
  <read_first>
    - db/sqlite.go
    - .planning/phases/01-foundation/01-CONTEXT.md
  </read_first>
  <action>
    - Replace `github.com/mattn/go-sqlite3` import with `modernc.org/sqlite` in `go.mod` and code.
    - Change SQL driver references from `sqlite3` to `sqlite`.
    - DSN parameters must include: `?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)`.
    - In `db/sqlite.go`, update `Init` function to accept `dbPath string`, instantiate `sql.Open("sqlite", ...)` and return `*sql.DB, error`. Immediately apply `db.SetMaxOpenConns(1)`.
    - Remove the package global `var Conn *sql.DB`.
    - Create `internal/migrations/migrations.go` and implement Goose v3 `go:embed` wrapper: `func Run(db *sql.DB) error`. Use `goose.SetDialect("sqlite3")`. (Note: use goose's sqlite3 dialect but our driver is `sqlite`).
  </action>
  <acceptance_criteria>
    - `go.mod` does NOT contain `github.com/mattn/go-sqlite3`
    - `modernc.org/sqlite` is present in `go.mod`
    - `var Conn *sql.DB` string is removed from the codebase
    - `db.SetMaxOpenConns(1)` is executed on the returned db pointer
    - `internal/migrations/migrations.go` includes `//go:embed *.go` or similar mechanism for finding goose scripts.
  </acceptance_criteria>
</task>

<task>
  <id>4</id>
  <description>Create initial SQLite Migrations</description>
  <requirements>SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, SCHEMA-05</requirements>
  <read_first>
    - internal/migrations/migrations.go
    - .planning/REQUIREMENTS.md
  </read_first>
  <action>
    - Create `internal/migrations/20260411000001_initial_schema.go` file for Goose Go Migrations (as per CONTEXT D-01).
    - In the `Up` function, execute the schema DDL:
      - `Account`: `id` TEXT PRIMARY KEY (uuid), `name` TEXT, `current_balance` INTEGER, `currency` TEXT, `is_default` BOOLEAN.
      - `Transaction`: `id` TEXT PRIMARY KEY, `account_id` TEXT REFERENCES Account(id), `amount` INTEGER, `description` TEXT, `category` TEXT, `timestamp` TEXT, `is_recurring` BOOLEAN, `frequency` TEXT, `anchor_date` TEXT, `next_occurrence` TEXT.
      - `PaySchedule`: `id` TEXT PRIMARY KEY, `account_id` TEXT REFERENCES Account(id), `frequency` TEXT, `anchor_date` TEXT, `day_of_month2` INTEGER, `label` TEXT.
      - `SafetyBuffer`: `min_threshold` INTEGER.
    - Money columns are declared `INTEGER`, timestamps are `TEXT`. UUIDs are `TEXT` because SQLite lacks native UUID.
  </action>
  <acceptance_criteria>
    - `internal/migrations/20260411000001_initial_schema.go` contains `CREATE TABLE` and `INTEGER` for balance/amount.
  </acceptance_criteria>
</task>

<task>
  <id>5</id>
  <description>Implement Application Graph structure (Dependency Injection)</description>
  <requirements>ARCH-02, ARCH-03</requirements>
  <read_first>
    - internal/config/config.go
    - handlers/routes.go
  </read_first>
  <action>
    - Create `internal/app/app.go` with `type App struct`.
    - Implement `func New(cfg config.Config) (*App, error)` in `app.go`.
    - In `New`:
      - Connect to DB using `db.Open(cfg.DatabasePath)`.
      - Run migrations `migrations.Run(database)`.
      - Inject DB into repos: `accRepo := repos.NewSqliteAccRepo(database)`.
      - Create services with repos.
      - Add fields to `App` struct to hold HTTP server or just services so `main.go` can attach them to Echo.
    - Update `cmd/cibi-api/main.go` to call `cfg := config.LoadConfig()`, `application, err := app.New(cfg)`, initialize `Echo`, map handlers to services injected from `application`, and start the server.
    - Refactor any structs inside `repos/sqlite.go` that previously relied on `db.Conn` to take `*sql.DB` via constructor.
  </action>
  <acceptance_criteria>
    - `internal/app/app.go` exists and initializes cleanly.
    - `cmd/cibi-api/main.go` does not open databases itself.
    - Go build `go build ./cmd/cibi-api` passes without error.
  </acceptance_criteria>
</task>

## Verification
- Code builds cleanly without CGO `CGO_ENABLED=0 go build ./...`.
- App boots, runs migrations, and starts the Echo server cleanly. All `sqlite3` usage is replaced with pure go SQLite.
