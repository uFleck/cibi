# Integrations

**Analysis Date:** 2026-04-16

## External Services

**None detected.** Cibi is a fully self-hosted, local-first application. There are no calls to third-party SaaS APIs, cloud platforms, or external data services. All data is stored in a local SQLite file.

## APIs (Internal)

All API endpoints are defined in `internal/handler/routes.go` and served by the Go binary on port 42069. The React SPA communicates exclusively with this local API via `fetch` calls in `web/src/lib/api.ts`.

**Authenticated REST API (`/api/*`):**

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/accounts` | List / create accounts |
| GET/PATCH/DELETE | `/api/accounts/:id` | Read, update, delete account |
| POST | `/api/accounts/:id/set-default` | Set default account |
| GET | `/api/accounts/default` | Get default account (legacy) |
| GET/POST | `/api/transactions` | List / create transactions |
| PATCH/DELETE | `/api/transactions/:id` | Update, delete transaction |
| POST | `/api/transactions/:id/confirm` | Confirm recurring transaction |
| POST | `/api/check` | Purchasing power check (engine) |
| GET/POST | `/api/pay-schedule` | List / create pay schedules |
| PATCH/DELETE | `/api/pay-schedule/:id` | Update, delete pay schedule |
| GET/POST | `/api/friends` | List / create friends |
| GET/PATCH/DELETE | `/api/friends/:id` | Read, update, delete friend |
| GET | `/api/friends/summary` | Friend ledger summary totals |
| GET | `/api/friends/breakdown` | Per-friend debt breakdown |
| GET/POST | `/api/peer-debts` | List / create peer debts |
| PATCH/DELETE | `/api/peer-debts/:id` | Update, delete peer debt |
| POST | `/api/peer-debts/:id/confirm` | Confirm peer debt payment |
| GET/POST | `/api/group-events` | List / create group events |
| GET/PATCH/DELETE | `/api/group-events/:id` | Read, update, delete group event |
| PUT | `/api/group-events/:id/participants` | Set group event participants |
| GET/PATCH | `/api/profile` | Read / update user profile |
| GET | `/api/docs` | OpenAPI YAML spec (embedded) |

**Public unauthenticated endpoints (`/public/*`):**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/public/friend/:token` | Share friend ledger view by token |
| POST | `/public/friend/:token/groups/:eventID/participants/:friendID/confirm` | Friend confirms group payment via share link |
| GET | `/public/group/:token` | Share group event view by token |

Public endpoints use per-entity `public_token` fields (UUID) stored in the database — no external auth or session required.

## Authentication / Auth Providers

**No external auth provider.** The application has no user login, sessions, or authentication middleware. All `/api/*` routes are open — access control relies on network isolation (self-hosted, not exposed publicly by default).

Public share links use opaque tokens (`public_token` UUID columns on `friends` and `group_events` tables) as an access primitive for read-only sharing.

JWT library (`github.com/golang-jwt/jwt` v3.2.2) is present as an indirect transitive dependency of Echo — it is not used directly by the application.

## Infrastructure / Hosting

**Container:**
- Docker image `ufleck/cibi:latest` built from `Dockerfile`
- Multi-stage build: `golang:1.25-alpine` (builder) → `alpine:latest` (runtime)
- Single binary (`/app/cibi-api`) serves both API and embedded React SPA
- Port: 42069

**Storage:**
- SQLite database file mounted as Docker volume: `./data:/data` → `/data/cibi.db`
- No managed database, no object storage, no cloud storage

**CI/CD:**
- No CI pipeline configuration detected (no `.github/`, `.gitlab-ci.yml`, etc.)
- Docker Compose `develop.watch` provides hot-rebuild during development

## Notable Integrations

**React SPA embedded in Go binary:**
- `web/dist` is built by Vite and copied into `cmd/cibi-api/web/dist` at build time
- The Go binary embeds it via `//go:embed` and serves it via Echo's `middleware.Static` with `HTML5: true` for client-side routing
- The frontend has no separate hosting — it is served by the same Go process on the same port

**OpenAPI spec embedded in Go binary:**
- `internal/handler/docs/openapi.yaml` is embedded via `//go:embed` and served at `GET /api/docs`

**Pix key support (Brazilian payment system):**
- `pix_key` field on `friends` and `profile` tables (`web/src/lib/api.ts` — `FriendResponse.pix_key`, `ProfileResponse.pix_key`)
- Displayed on public share pages so friends know where to send payment
- No API integration — purely informational/display field

## Environment Configuration

**Required for production:**
- `CIBI_DATABASEPATH` - Path to SQLite file (default: `./db/cibi.db`, Docker default: `/data/cibi.db`)
- `CIBI_SERVERPORT` - Listen address (default: `:42069`)
- `CIBI_SAFETYBUFFER` - Financial safety buffer in cents (default: `1000`)

**CLI config file (optional):**
- `~/.config/cibi/config.yaml` — YAML file read by `cmd/cibi/root.go` via Viper
- Env vars with `CIBI_` prefix override the config file

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** None

---

*Integration audit: 2026-04-16*
