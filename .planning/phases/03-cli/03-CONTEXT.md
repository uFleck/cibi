# Phase 03: CLI - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Cobra command-line interface that mirrors the full domain surface; `cibi check` as the primary user-facing command. All CLI commands route through the internal service layer (no duplicated logic). Configuration loading via Viper with proper precedence.
</domain>

<decisions>
## Implementation Decisions

### CLI Structure and Organization
- **D-01:** Create separate `cmd/cibi/` directory for CLI binary, distinct from existing `cmd/cibi-api/` for API server
- **D-02:** CLI root command lives at `cmd/cibi/main.go` with Cobra framework
- **D-03:** Use Cobra's `PersistentPreRunE` to load Viper configuration before any subcommand executes
- **D-04:** Global `--config` flag overrides default config path (`~/.config/cibi/config.yaml`)
- **D-05:** Global `--db` flag binds to `database_path` Viper key for SQLite file location

### Configuration Management
- **D-06:** Viper configuration priority: CLI flags > `CIBI_*` environment variables > `~/.config/cibi/config.yaml` > hardcoded defaults
- **D-07:** Config struct includes `DatabasePath`, `ServerPort` (for API compatibility), and `SafetyBuffer` (in cents)
- **D-08:** Hardcoded defaults: `DatabasePath="./db/cibi.db"`, `ServerPort="8080"`, `SafetyBuffer=1000` (10.00 in decimal)

### Command Structure
- **D-09:** `cibi account` subcommands: `list`, `add`, `set-default`, `delete`
- **D-10:** `cibi tx` subcommands: `list [--account]`, `add`, `update`, `delete`
- **D-11:** `cibi tx add` accepts `--recurring`, `--frequency`, `--anchor` flags; requires `--frequency` and `--anchor` when `--recurring` is true
- **D-12:** `cibi check <amount>` command: invokes `EngineService.CanIBuyItDefault()` directly (no HTTP call)

### Service Layer Integration
- **D-13:** CLI commands access services via `internal/app.App` struct fields (`EngineSvc`, `TxnsSvc`, etc.)
- **D-14:** CLI maintains separate `App` instance from API server but shares same service layer implementations
- **D-15:** No business logic in CLI command handlers - all routing to `internal/service` layer functions

### User Interface and Output
- **D-16:** Account listing outputs as plain text table with balances formatted as decimal currency (not raw cents)
- **D-17:** `cibi check` outputs verdict, purchasing power, buffer remaining, and risk level with styled terminal output
- **D-18:** Use lipgloss library for styled terminal output (colors, formatting, alignment)
- **D-19:** Error messages user-friendly and actionable, not raw internal errors

### Error Handling and UX
- **D-20:** CLI commands return appropriate exit codes (0 for success, 1 for user error, 2+ for system errors)
- **D-21:** Validation errors show clear guidance (e.g., "frequency required when recurring is true")
- **D-22:** Successful operations provide confirmation feedback (e.g., "Account created with ID: xxx")

### the agent's Discretion
- Specific Cobra command structure and flag naming details
- Exact lipgloss styling choices for output formatting
- Precise wording of success/error messages
- Implementation of account default-setting logic (`set-default` subcommand)
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definitions
- `.planning/REQUIREMENTS.md` — Read CLI-01 through CLI-04 requirements.
- `.planning/phases/01-foundation/01-CONTEXT.md` — Review Foundation phase decisions (Viper, DB path, app wiring).
- `.planning/phases/02-domain-engine/02-CONTEXT.md` — Review Engine and transaction service interfaces.

### Existing Code Insights
- `internal/app/app.go` — Shows how services are wired and accessible via App struct
- `internal/service/engine.go` — EngineService interface for CanIBuyIt functionality
- `internal/service/transactions.go` — TransactionsService interface for TXN operations
</canonical_refs>

<specifics>
## Specific Ideas

- Ensure consistent command naming and flag usage across all subcommands
- Consider implementing command autocomplete generation for Cobra
- Keep Go code simple and maintainable - avoid over-abstraction
- Reuse existing validation logic from service layer where possible
</specifics>

<deferred>
## Deferred Ideas

- Command aliases and shorthands (to be considered in later iterations)
- Advanced output formats (JSON, CSV) for scripting use
- Interactive prompts for required fields
- Config validation and migration tools
</deferred>

---
*Phase: 03-cli*
*Context gathered: 2026-04-11*