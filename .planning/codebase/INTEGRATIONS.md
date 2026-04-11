# External Integrations

**Analysis Date:** 2026-04-11

## APIs & External Services

None detected. The application is fully self-contained with no outbound calls to third-party APIs.

## Data Storage

**Databases:**
- SQLite (embedded, via `github.com/mattn/go-sqlite3`)
  - Connection: Hardcoded path `./db/cibi-api.db` in `db/sqlite.go`
  - Client: Standard library `database/sql` with `go-sqlite3` driver (raw SQL, no ORM)
  - Schema initialized at startup via `db.Init()` in `db/sqlite.go`
  - Tables: `accounts` and `transactions`

**File Storage:**
- Local filesystem only (SQLite file at `./db/cibi-api.db`)

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None — no authentication or authorization layer is implemented
- All API endpoints in `handlers/routes.go` are publicly accessible

## Monitoring & Observability

**Error Tracking:**
- None — errors are returned as HTTP response strings via `c.String(http.StatusInternalServerError, err.Error())`

**Logs:**
- Echo's built-in logger (default configuration, no custom setup)
- `fmt.Println` used directly in `repos/transactions.go` and `services/transactions.go` for debug output

## CI/CD & Deployment

**Hosting:**
- Local machine only, intended for Tailscale network access (per `CIBI_SPEC.md`)
- No containerization (no `Dockerfile` or `docker-compose.yml` detected)

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
- None — no environment variables are read anywhere in the codebase

**Secrets location:**
- Not applicable; no secrets in use

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Planned Integrations (from CIBI_SPEC.md)

The spec describes intended future integrations not yet implemented:
- **MCP (Model Context Protocol):** Tools for AI agents (Claude) to query financial status and log transactions
- **CLI interface:** Typer/Click-based CLI to call the API
- **Web frontend:** Next.js or HTMX dashboard
- **Tailscale:** Network layer for private remote access from mobile/laptop

---

*Integration audit: 2026-04-11*
