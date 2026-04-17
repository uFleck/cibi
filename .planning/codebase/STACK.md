# Technology Stack

**Analysis Date:** 2026-04-16

## Languages

**Primary:**
- Go 1.25 - Backend API server, CLI tool, database layer (`cmd/`, `internal/`, `db/`, `types/`)
- TypeScript ~6.0.2 - Frontend SPA (`web/src/`)

**Secondary:**
- SQL (SQLite dialect) - Schema migrations (`internal/migrations/`)

## Runtime

**Environment:**
- Go 1.25 (backend)
- Node.js (frontend build only — not a runtime dependency in production)

**Package Manager:**
- Go modules (`go.mod` / `go.sum`)
- npm (frontend, `web/package-lock.json`)
- Lockfile: present for both

## Frameworks & Libraries

**Backend:**
- `github.com/labstack/echo/v4` v4.12.0 - HTTP server and routing framework (`internal/app/app.go`, `internal/handler/`)
- `github.com/spf13/cobra` v1.10.2 - CLI command framework (`cmd/cibi/`)
- `github.com/spf13/viper` v1.21.0 - Configuration loading with env prefix `CIBI_` (`internal/config/config.go`, `cmd/cibi/root.go`)
- `github.com/pressly/goose/v3` v3.27.0 - SQL migration runner using embedded `.go` files (`internal/migrations/migrations.go`)
- `github.com/go-playground/validator/v10` v10.30.2 - Request struct validation (`internal/handler/`)
- `github.com/google/uuid` v1.6.0 - UUID generation for entity IDs
- `github.com/charmbracelet/lipgloss` v1.1.0 - Terminal styling for CLI output
- `github.com/golang-jwt/jwt` v3.2.2 - JWT support (indirect via echo)

**Frontend:**
- React 19.2.4 - UI component library (`web/src/`)
- `@tanstack/react-router` ^1.168.18 - Client-side routing (`web/src/router.tsx`)
- `@tanstack/react-query` ^5.99.0 - Server state, data fetching (`web/src/router.tsx`, component files)
- Tailwind CSS ^4.2.2 - Utility-first styling (via `@tailwindcss/vite` plugin)
- `shadcn` ^4.2.0 + `radix-ui` ^1.4.3 - Headless UI component primitives (`web/src/components/ui/`)
- `@base-ui/react` ^1.3.0 - Additional headless UI components
- `lucide-react` ^1.8.0 - Icon set
- `motion` ^12.38.0 - Animation library (Framer Motion successor)
- `sonner` ^2.0.7 - Toast notifications (`web/src/router.tsx`)
- `recharts` ^3.8.1 - Chart/data visualization (`web/src/components/ui/chart.tsx`)
- `next-themes` ^0.4.6 - Light/dark theme switching
- `boneyard-js` ^1.7.6 - Skeleton loading component (`web/src/router.tsx`)
- `class-variance-authority` ^0.7.1 + `clsx` ^2.1.1 + `tailwind-merge` ^3.5.0 - Class utility helpers
- `@fontsource-variable/geist` ^5.2.8 - Geist variable font

## Build Tools

**Backend:**
- Standard `go build` with `CGO_ENABLED=0` for static binaries
- Multi-stage Docker build (`Dockerfile`)
- Docker Compose with `develop.watch` for hot-rebuild (`docker-compose.yml`)

**Frontend:**
- Vite ^8.0.4 with `@vitejs/plugin-react` ^6.0.1 (`web/vite.config.ts`)
- TypeScript compiler (`tsc -b && vite build`)
- Path alias `@` → `web/src/` configured in both `web/vite.config.ts` and `web/tsconfig.json`
- Dev proxy: `/api` → `http://localhost:8080` (dev mode only)

**Linting:**
- ESLint ^9.39.4 with `typescript-eslint` ^8.58.0, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`

**Testing:**
- Vitest ^4.1.4 (frontend, `web/`)
- Go standard `testing` package (backend, `internal/handler/`)
- `@testing-library/react` ^16.3.2 + `@testing-library/user-event` ^14.6.1
- jsdom ^29.0.2 as browser environment

## Database

**Engine:**
- SQLite via `modernc.org/sqlite` v1.48.2 — pure Go, no CGO required (`db/sqlite.go`)
- WAL journal mode, `busy_timeout=5000ms`, `synchronous=NORMAL`, `foreign_keys=ON`
- Single connection (`SetMaxOpenConns(1)`)
- Migrations: Goose with embedded `.go` migration files (`internal/migrations/`)

## Key Dependencies (with versions)

| Package | Version | Purpose |
|---------|---------|---------|
| `github.com/labstack/echo/v4` | v4.12.0 | HTTP framework |
| `github.com/spf13/cobra` | v1.10.2 | CLI framework |
| `github.com/spf13/viper` | v1.21.0 | Configuration |
| `github.com/pressly/goose/v3` | v3.27.0 | DB migrations |
| `modernc.org/sqlite` | v1.48.2 | SQLite driver (no CGO) |
| `github.com/go-playground/validator/v10` | v10.30.2 | Validation |
| `github.com/google/uuid` | v1.6.0 | UUID generation |
| `react` | ^19.2.4 | UI framework |
| `@tanstack/react-router` | ^1.168.18 | SPA routing |
| `@tanstack/react-query` | ^5.99.0 | Server state management |
| `tailwindcss` | ^4.2.2 | CSS utility framework |
| `recharts` | ^3.8.1 | Charting |
| `sonner` | ^2.0.7 | Toast notifications |
| `motion` | ^12.38.0 | Animations |
| `vite` | ^8.0.4 | Frontend build tool |
| `vitest` | ^4.1.4 | Frontend test runner |
| `typescript` | ~6.0.2 | TypeScript compiler |

## Configuration

**Environment:**
- Loaded via Viper with `CIBI_` prefix for env vars
- Config file: `~/.config/cibi/config.yaml` (CLI) or env vars only (server)
- Key env vars: `CIBI_DATABASEPATH`, `CIBI_SERVERPORT`, `CIBI_SAFETYBUFFER`
- Defaults: `CIBI_DATABASEPATH=./db/cibi.db`, `CIBI_SERVERPORT=:42069`, `CIBI_SAFETYBUFFER=1000`
- No `.env` file present — configuration via environment variables directly

**Build:**
- `Dockerfile` (multi-stage: builder + alpine runtime)
- `docker-compose.yml` with `./data` volume mount for SQLite persistence

## Package Management

**Development:**
- Go 1.25+
- Node.js + npm (frontend build)
- Docker / Docker Compose (optional, for containerized dev)

**Production:**
- Docker image based on `alpine:latest` with `sqlite-libs`, `ca-certificates`, `tzdata`
- Exposed port: 42069
- Persistent volume: `/data/cibi.db`
- Entrypoint: `/app/cibi-api` (Go binary serving API + embedded React SPA)

---

*Stack analysis: 2026-04-16*
