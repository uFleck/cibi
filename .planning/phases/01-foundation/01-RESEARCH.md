# Phase 1: Foundation - Research

## Goal
The codebase is restructured into a clean, testable monorepo with no global state, pure-Go SQLite, versioned migrations, and a wired App struct — ready to receive domain logic.

## Analysis of Requirements

### Module and Directory Restructuring (ARCH-01)
- **Action**: Rename module `github.com/ufleck/cibi-api` to `github.com/ufleck/cibi`.
- **Action**: Move existing `main.go` and logic into the new folder structure: `cmd/cibi-api/main.go` and `cmd/cibi/main.go` (latter is a stub for future CLI).
- **Find/Replace**: All imports across the repository need updating to the new module path.

### Configuration (ARCH-04)
- **Tool**: `spf13/viper`.
- **Config Struct (`internal/config/config.go`)**: Requires `DatabasePath`, `ServerPort`, `SafetyBuffer`.
- **Precedence**: CLI flags > `CIBI_*` env vars > `~/.config/cibi/config.yaml` > hardcoded defaults. Default DB Path `db/cibi.db`.

### Dependency Injection (ARCH-02, ARCH-03)
- **Current State**: Global `db.Conn` and individual instantiation in `handlers/routes.go`.
- **Target State**: `internal/app/app.go` hosts the `App` struct containing references to all wired Repositories and Services.
- **Bootstrapping**: `app.New(cfg)` opens the DB connection, verifies it, instantiates `SqliteAccRepo` and `SqliteTxnsRepo` alongside their corresponding Services, and returns the fully populated `App`.

### Database Driver and Settings (ARCH-05, TXN-03)
- **Driver Replacement**: Replace `github.com/mattn/go-sqlite3` with `modernc.org/sqlite`. Remove CGO.
- **DSN Params**: `?_journal_mode=WAL&_busy_timeout=5000&_synchronous=NORMAL&_foreign_keys=ON`
- **Connection Pool**: `db.SetMaxOpenConns(1)` immediately after `sql.Open("sqlite", ...)`.

### Migrations with Goose (ARCH-06, SCHEMA-01...SCHEMA-05)
- **Tool**: `pressly/goose/v3`.
- **Target**: `internal/migrations/` using `.go` files (Per User Context D-01).
- **Execution**: `goose.Up(db, "internal/migrations")` must run in `app.New(cfg)`.
- **Schema**:
    - `Account`: `id` UUID, `name` TEXT, `current_balance` INTEGER, `currency` TEXT, `is_default` BOOLEAN.
    - `Transaction`: `id` UUID, `account_id` FK, `amount` INTEGER, `description` TEXT, `category` TEXT, `timestamp` TEXT, `is_recurring` BOOLEAN, `frequency` TEXT, `anchor_date` TEXT, `next_occurrence` TEXT.
    - `PaySchedule`: `id` UUID, `account_id` FK, `frequency` TEXT, `anchor_date` TEXT, `day_of_month2` INTEGER, `label` TEXT.
    - `SafetyBuffer`: `min_threshold` INTEGER.
- All IDs are UUID, currency/amount as `INTEGER` cents, datetimes as `TEXT` RFC3339.

## Validation Architecture
- **Dimensions**:
    - Build: `CGO_ENABLED=0 go build ./...` must succeed.
    - Unit checks: Verify DI outputs no panics.
    - Integration: Migrations run on an empty `.db` file; `PRAGMA foreign_keys` = 1.
    - Architecture: No usage of `db.Conn` packet variable anywhere via grep.

## Conclusion
The foundation is highly deterministic. The main risk is during the module path replacement breaking existing logic, but standard `find/replace` combined with `go mod edit` secures this transition.
