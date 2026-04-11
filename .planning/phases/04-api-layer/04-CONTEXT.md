# Phase 4: API Layer - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Echo HTTP server exposing all domain operations as JSON endpoints; `POST /check` mirrors `cibi check` exactly. The API is the access point for web and Tailscale clients. No business logic in handlers — everything routes through `internal/service`.

</domain>

<decisions>
## Implementation Decisions

### Legacy Cleanup
- **D-01:** Delete `handlers/`, `repos/`, and `services/` root packages entirely. These are pre-Phase 1 leftovers. Phase 4 rewrites HTTP handlers using only `internal/service`. The legacy wiring in `internal/app/app.go` is removed at the same time.

### Handler Location
- **D-02:** New HTTP handlers live in `internal/handler/` as a dedicated package. Keeps HTTP concerns out of `cmd/`, reusable by any future `cmd/*` entry point, and consistent with the `internal/service` and `internal/repo` layering.

### OpenAPI Documentation
- **D-03:** Hand-authored `openapi.yaml` embedded and served at `/docs`. No build-time codegen, no annotation clutter in handler code. The web dashboard (Phase 5) reads this file for type generation.

### Error Response Shape
- **D-04:** All error responses use `{"error": "human-readable message"}`. Consistent, minimal, sufficient for a personal tool. HTTP status code carries the semantic (400 for bad input, 404 for not found, 500 for internal).

### Routes Required
- **D-05:** Minimum route set per API-01 and success criteria:
  - `GET /accounts` — list all accounts
  - `POST /accounts` — create account
  - `GET /accounts/:id` — get by ID
  - `PATCH /accounts/:id` — update account
  - `DELETE /accounts/:id` — delete account
  - `GET /transactions` — list transactions (optional `?account_id=` filter)
  - `POST /transactions` — create transaction
  - `PATCH /transactions/:id` — update transaction
  - `DELETE /transactions/:id` — delete transaction
  - `POST /check` — invoke `EngineService.CanIBuyIt`; body `{"amount": 75.00}` (float64, converted to cents in handler)

### Request/Response Money Encoding
- **D-06:** API accepts and returns money as float64 JSON (e.g., `75.00`). Handler converts to/from integer cents for the service layer. Balances in responses formatted as float64, not raw cents integers.

### Graceful Shutdown
- **D-07:** `cmd/cibi-api/main.go` listens on `os.Signal` (SIGTERM, SIGINT), calls `echo.Shutdown(ctx)` with a 10-second timeout. Required by API-03.

### Validation
- **D-08:** Use Echo's built-in request binding (`c.Bind`) plus `go-playground/validator` for struct-level validation. Invalid body returns 400 with `{"error": "..."}`. No custom middleware needed beyond the standard Echo error handler.

### the agent's Discretion
- Exact field names in request/response JSON structs (stay consistent with existing domain model naming)
- Specific validator tags on request structs
- HTTP status codes for edge cases (404 vs 400 for missing account on a transaction create)
- Whether to expose a `GET /accounts/default` shortcut endpoint (existing legacy route)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definitions
- `.planning/REQUIREMENTS.md` — Read API-01, API-02, API-03 (Phase 4 requirements)
- `.planning/phases/01-foundation/01-CONTEXT.md` — Foundation decisions (DI wiring, DB path, app.New)
- `.planning/phases/02-domain-engine/02-CONTEXT.md` — Engine and transaction service interfaces
- `.planning/phases/03-cli/03-CONTEXT.md` — CLI decisions (service wiring pattern, `CanIBuyItDefault`)

### Existing Code (read before touching)
- `internal/app/app.go` — Current wiring; legacy wiring must be removed in this phase
- `internal/service/engine.go` — EngineService; handler calls `CanIBuyIt(accountID, cents)`
- `internal/service/transactions.go` — TransactionsService interface
- `internal/service/accounts.go` — AccountsService interface
- `cmd/cibi-api/main.go` — Existing thin bootstrap; extend with graceful shutdown
- `handlers/routes.go` — Legacy route list (reference for parity, then delete)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `internal/service/engine.go` — `EngineService.CanIBuyIt(accountID, itemPrice int64) (EngineResult, error)` — direct call from handler
- `internal/service/accounts.go` — `AccountsService` — list, get, create, update, delete, set-default, get-default
- `internal/service/transactions.go` — `TransactionsService` — list, get, create, update, delete
- `internal/app/app.go` — `App.AccountsSvc`, `App.TxnsSvc`, `App.EngineSvc` — inject into handler constructors
- `internal/config/config.go` — `Config.ServerPort` — used by Echo Start/Shutdown

### Established Patterns
- **Manual DI:** `NewXxxHandler(svc *service.XxxService)` constructors, no DI framework
- **Error wrapping:** `fmt.Errorf("context: %w", err)` throughout internal packages
- **Cents everywhere internally:** Service layer uses `int64` cents; handlers own the float64 ↔ cents conversion
- **UUID IDs:** All entity IDs are `uuid.UUID` (google/uuid); parse from path params with `uuid.Parse`

### Integration Points
- `internal/app/app.go` — `New()` must call `handler.SetupRoutes(e, app)` after dropping legacy wiring
- `cmd/cibi-api/main.go` — Extend `main()` with signal listener + `Echo.Shutdown`
- `internal/handler/` — New package; `routes.go` + per-resource handler files

</code_context>

<specifics>
## Specific Ideas

- `POST /check` body: `{"amount": 75.00}` per roadmap success criteria SC-1. Handler converts to cents: `int64(amount * 100)`.
- Keep it caveman-simple — no middleware stacks beyond what API-03 requires.
- `GET /accounts/default` endpoint is worth keeping (existing legacy route, useful for the web dashboard).
</specifics>

<deferred>
## Deferred Ideas

- Route versioning (`/v1/` prefix) — not needed for a personal tool at this scale
- Pagination on list endpoints — defer to Phase 5 if the web dashboard needs it
- Authentication middleware — out of scope (personal use, Tailscale network)

</deferred>

---

*Phase: 04-api-layer*
*Context gathered: 2026-04-11*
