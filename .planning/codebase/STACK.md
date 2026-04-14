# Technology Stack

**Analysis Date:** 2026-04-11

## Languages

**Primary:**
- Go 1.22.0 - All application code (`main.go`, `handlers/`, `services/`, `repos/`, `data/`, `db/`)

**Secondary:**
- None detected

## Runtime

**Environment:**
- Go runtime 1.22.0

**Package Manager:**
- Go modules (`go mod`)
- Lockfile: `go.sum` present

## Frameworks

**Core:**
- Echo v4.12.0 (`github.com/labstack/echo/v4`) - HTTP web framework; handles routing, request/response lifecycle

**Testing:**
- `stretchr/testify v1.8.4` present in `go.sum` (indirect via Echo), but no test files detected in codebase

**Build/Dev:**
- Air (inferred from `tmp/` directory with `build-errors.log` and `main` binary) - live reload for development

## Key Dependencies

**Critical:**
- `github.com/labstack/echo/v4 v4.12.0` - HTTP server and routing framework
- `github.com/mattn/go-sqlite3 v1.14.22` - CGO-based SQLite3 driver; requires CGO and a C compiler at build time
- `github.com/google/uuid v1.6.0` - UUID generation for entity IDs

**Infrastructure:**
- `github.com/labstack/gommon v0.4.2` - Echo utilities (logging, colors)
- `golang.org/x/crypto v0.22.0` - Cryptography (indirect, pulled in by Echo for JWT/secure cookie support)
- `github.com/valyala/fasttemplate v1.2.2` - Fast template engine (indirect, Echo dependency)

## Configuration

**Environment:**
- No `.env` file detected; no environment variable reading found in source code
- Database path is hardcoded: `./db/cibi-api.db` in `db/sqlite.go`
- Server port is hardcoded: `:42069` in `main.go`

**Build:**
- `go.mod` at project root defines module `github.com/ufleck/cibi-api`
- No `Makefile`, `Dockerfile`, or build scripts detected
- `.gitignore` uses standard Go template (ignores binaries, `*.test`, `*.out`)

## Platform Requirements

**Development:**
- Go 1.22.0+
- C compiler required (CGO enabled) for `go-sqlite3`
- Air recommended for live reload (based on `tmp/` directory presence)

**Production:**
- Self-hosted / local-first (per `CIBI_SPEC.md` — zero cloud dependency, Tailscale network access intended)
- Single binary deployment
- SQLite file (`db/cibi-api.db`) must be writable at runtime

---

*Stack analysis: 2026-04-11*
