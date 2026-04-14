# Technology Stack

**Analysis Date:** 2026-04-11

## Languages

**Primary:**
- Go 1.22.0 - All backend application code (`main.go`, `handlers/`, `services/`, `repos/`, `data/`, `db/`)
- TypeScript 5.x - All frontend code (`web/src/`)

**Secondary:**
- None

**Secondary:**
- None detected

## Runtime

**Environment:**
- Go runtime 1.22.0

**Package Manager:**
- Go modules (`go mod`)
- Lockfile: `go.sum` present

## Frameworks

**Backend:**
- Echo v4.12.0 (`github.com/labstack/echo/v4`) - HTTP web framework; handles routing, request/response lifecycle

**Frontend:**
- React 19 + Vite 6 SPA (`web/`)
- shadcn/ui (base-nova preset, Radix UI primitives, components copied into repo at `web/src/components/ui/`)
- Tailwind CSS v4 (CSS-first config via `@theme` in `web/src/index.css`)
- TanStack Query v5 - server state, background polling
- TanStack Router v1 - type-safe SPA routing
- Motion v11+ (`motion/react`) - animations; import changed from deprecated `framer-motion`
- lucide-react - icon library

**Testing:**
- `stretchr/testify v1.8.4` present in `go.sum` (indirect via Echo), but no test files detected in codebase

**Build/Dev:**
- Air (inferred from `tmp/` directory with `build-errors.log` and `main` binary) - live reload for Go server
- Vite 6 dev server for frontend HMR

## Key Dependencies

**Backend (Go):**
- `github.com/labstack/echo/v4 v4.12.0` - HTTP server and routing framework
- `github.com/mattn/go-sqlite3 v1.14.22` - CGO-based SQLite3 driver; requires CGO and a C compiler at build time
- `github.com/google/uuid v1.6.0` - UUID generation for entity IDs
- `github.com/labstack/gommon v0.4.2` - Echo utilities (logging, colors)
- `golang.org/x/crypto v0.22.0` - Cryptography (indirect, pulled in by Echo)

**Frontend (npm):**
- `react` / `react-dom` 19 - UI framework
- `@tanstack/react-query` v5 - server state management
- `@tanstack/react-router` v1 - type-safe routing
- `motion` v11+ - animations (`import { motion } from "motion/react"`)
- `lucide-react` - icons
- `sonner` - toast notifications
- `@fontsource-variable/geist` - Geist Variable font
- shadcn/ui components (not a package dep — source copied into `web/src/components/ui/`)

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
- Node.js + npm (frontend build — `web/` directory)
- Air recommended for live reload (Go server)
- Vite dev server for frontend HMR (`npm run dev` in `web/`)

**Production:**
- Self-hosted / local-first (per `CIBI_SPEC.md` — zero cloud dependency, Tailscale network access intended)
- Single binary deployment (Go server embeds `web/dist` via `go:embed`)
- SQLite file (`db/cibi-api.db`) must be writable at runtime

---

*Stack analysis: 2026-04-14 (updated: added frontend stack — React 19/Vite 6/shadcn/ui/TanStack/Motion)*
