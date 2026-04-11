# Phase 4: API Layer - Research

**Researched:** 2026-04-11
**Domain:** Echo v4 HTTP handlers, OpenAPI embedding, graceful shutdown, request validation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Delete `handlers/`, `repos/`, and `services/` root packages entirely. Phase 4 rewrites HTTP handlers using only `internal/service`. Legacy wiring in `internal/app/app.go` is removed at the same time.
- **D-02:** New HTTP handlers live in `internal/handler/` as a dedicated package.
- **D-03:** Hand-authored `openapi.yaml` embedded and served at `/docs`. No build-time codegen, no annotation clutter. The web dashboard (Phase 5) reads this file for type generation.
- **D-04:** All error responses use `{"error": "human-readable message"}`. HTTP status code carries semantic.
- **D-05:** Minimum route set:
  - `GET /accounts`, `POST /accounts`, `GET /accounts/:id`, `PATCH /accounts/:id`, `DELETE /accounts/:id`
  - `GET /transactions` (optional `?account_id=` filter), `POST /transactions`, `PATCH /transactions/:id`, `DELETE /transactions/:id`
  - `POST /check` — body `{"amount": 75.00}` (float64 converted to cents in handler)
- **D-06:** API accepts/returns money as float64 JSON. Handler converts to/from integer cents for the service layer.
- **D-07:** `cmd/cibi-api/main.go` listens on `os.Signal` (SIGTERM, SIGINT), calls `echo.Shutdown(ctx)` with 10-second timeout.
- **D-08:** Use Echo's built-in `c.Bind` plus `go-playground/validator` for struct-level validation. Invalid body returns 400 with `{"error": "..."}`.

### Claude's Discretion

- Exact field names in request/response JSON structs (stay consistent with existing domain model naming)
- Specific validator tags on request structs
- HTTP status codes for edge cases (404 vs 400 for missing account on a transaction create)
- Whether to expose a `GET /accounts/default` shortcut endpoint (existing legacy route)

### Deferred Ideas (OUT OF SCOPE)

- Route versioning (`/v1/` prefix)
- Pagination on list endpoints
- Authentication middleware
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | Echo HTTP server at `cmd/cibi-api/`; routes for all account and transaction CRUD plus `POST /check`; calls `internal/service` layer; JSON request/response | Echo v4.12 is already in go.mod; handler patterns verified against source |
| API-02 | OpenAPI documentation hand-authored and served at `/docs`; all request/response shapes described; used by web dashboard for type generation | Echo `StaticFileFS` + `//go:embed` pattern verified; works with stdlib `embed.FS` |
| API-03 | Request validation middleware on Echo; structured error responses with consistent JSON shape; graceful shutdown on SIGTERM | `e.Shutdown(ctx)` signature verified in Echo v4.12 source; validator v10 pattern confirmed |
</phase_requirements>

---

## Summary

Phase 4 wires the existing `internal/service` layer behind an Echo v4 HTTP server. The core work is three things: (1) creating `internal/handler/` with per-resource handler files, (2) replacing the legacy `handlers/`/`repos/`/`services/` root packages that app.go currently wires, and (3) adding graceful shutdown and a custom error handler to `cmd/cibi-api/main.go`.

The biggest risk in this phase is the legacy cleanup. `internal/app/app.go` currently imports `github.com/ufleck/cibi/handlers`, `github.com/ufleck/cibi/repos`, and `github.com/ufleck/cibi/services` — all three must be deleted and the wiring replaced in the same commit, or the build will be broken mid-phase. The new handler constructors follow the established manual DI pattern (`NewXxxHandler(svc *service.XxxService)`), which is identical to how the CLI was wired.

Money conversion is a deliberate handler responsibility: float64 from JSON → `int64(math.Round(amount * 100))` going in; `float64(cents) / 100.0` going out. This pattern is already established in `cmd/cibi/check.go` and must be replicated consistently across all handlers.

**Primary recommendation:** Create `internal/handler/` with one file per resource (`accounts.go`, `transactions.go`, `check.go`, `routes.go`), a shared `errResponse` helper, a custom Echo error handler, register `go-playground/validator`, embed and serve `openapi.yaml`, then wire everything in `app.go` and extend `main.go` with signal handling.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `github.com/labstack/echo/v4` | v4.12.0 | HTTP router, binding, middleware | Already in go.mod; project committed to Echo [VERIFIED: go.mod] |
| `github.com/go-playground/validator/v10` | v10.30.2 | Struct-level validation via tags | Echo's `Validator` interface designed for this library; zero alternatives considered per D-08 [VERIFIED: go list -m] |
| `github.com/google/uuid` | v1.6.0 | UUID parsing from path params | Already in go.mod; all entity IDs are `uuid.UUID` [VERIFIED: go.mod] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `embed` (stdlib) | Go 1.25 | Embed `openapi.yaml` at compile time | Serving `/docs` without runtime file path dependency [VERIFIED: go.mod Go version] |
| `os/signal` (stdlib) | Go 1.25 | Capture SIGTERM/SIGINT | Graceful shutdown in `main.go` [VERIFIED: stdlib] |
| `context` (stdlib) | Go 1.25 | 10-second timeout for `e.Shutdown` | Required by Echo `Shutdown(ctx)` signature [VERIFIED: echo.go source] |
| `math` (stdlib) | Go 1.25 | `math.Round` for float→cents | Same pattern as `cmd/cibi/check.go` [VERIFIED: check.go] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `go-playground/validator` | Hand-rolled struct checks | Validator gives declarative `validate:` tags; hand-rolling is busywork for a well-understood library |
| Hand-authored `openapi.yaml` | `swaggo/swag` codegen | Codegen requires annotation clutter in handler code; D-03 explicitly locks hand-authored |
| `embed.FS` + `StaticFileFS` | Runtime `os.ReadFile` | Embed produces a single binary; no deployment file path assumptions |

**Installation (new dependency only):**
```bash
go get github.com/go-playground/validator/v10@v10.30.2
```

---

## Architecture Patterns

### Recommended Project Structure

```
internal/
└── handler/
    ├── routes.go         # SetupRoutes(e *echo.Echo, app *app.App)
    ├── accounts.go       # AccountsHandler struct + methods
    ├── transactions.go   # TransactionsHandler struct + methods
    ├── check.go          # CheckHandler struct + CanIBuyIt handler
    └── errors.go         # errResponse helper, custom HTTPErrorHandler

cmd/cibi-api/
└── main.go               # signal wiring + e.Shutdown

internal/handler/docs/
└── openapi.yaml          # hand-authored, embedded at /docs
```

### Pattern 1: Handler Constructor (Manual DI)

Matches established project pattern from Phase 2/3.

```go
// Source: established pattern in internal/service/accounts.go + cmd/cibi CLI
package handler

type AccountsHandler struct {
    svc *service.AccountsService
}

func NewAccountsHandler(svc *service.AccountsService) *AccountsHandler {
    return &AccountsHandler{svc: svc}
}
```

### Pattern 2: Custom Echo Error Handler (D-04)

The custom error handler converts all errors — including Echo's built-in `*echo.HTTPError` — into the uniform `{"error": "..."}` JSON shape.

```go
// Source: echo.go source (HTTPErrorHandler type), Echo v4.12
func customHTTPErrorHandler(err error, c echo.Context) {
    code := http.StatusInternalServerError
    msg := "internal server error"

    var he *echo.HTTPError
    if errors.As(err, &he) {
        code = he.Code
        if s, ok := he.Message.(string); ok {
            msg = s
        }
    }

    // Suppress error on response write failure (connection already closed)
    _ = c.JSON(code, map[string]string{"error": msg})
}
```

Register in `app.New` or `main.go`:
```go
e.HTTPErrorHandler = customHTTPErrorHandler
```

### Pattern 3: go-playground/validator Registration

```go
// Source: Echo v4 docs + go-playground/validator v10
type CustomValidator struct {
    v *validator.Validate
}

func (cv *CustomValidator) Validate(i interface{}) error {
    return cv.v.Struct(i)
}

// In app.New or handler setup:
e.Validator = &CustomValidator{v: validator.New()}
```

Handler usage:
```go
var req CreateAccountRequest
if err := c.Bind(&req); err != nil {
    return echo.NewHTTPError(http.StatusBadRequest, err.Error())
}
if err := c.Validate(&req); err != nil {
    return echo.NewHTTPError(http.StatusBadRequest, err.Error())
}
```

### Pattern 4: Float64 ↔ Cents Conversion (D-06)

Same pattern as `cmd/cibi/check.go` — the only place this conversion currently exists.

```go
// Source: cmd/cibi/check.go (verified)
// Float to cents (request):
cents := int64(math.Round(amount * 100))

// Cents to float (response):
dollars := float64(cents) / 100.0
```

### Pattern 5: UUID Path Param Parsing

```go
// Source: handlers/accounts.go (legacy pattern, already established)
id, err := uuid.Parse(c.Param("id"))
if err != nil {
    return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
}
```

### Pattern 6: Graceful Shutdown (D-07)

```go
// Source: Echo v4.12 echo.go — func (e *Echo) Shutdown(ctx stdContext.Context) error
// (verified: wraps both Server.Shutdown and TLSServer.Shutdown)

func main() {
    // ... app init ...
    go func() {
        if err := application.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            log.Fatal(err)
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    if err := application.Shutdown(ctx); err != nil {
        log.Fatal(err)
    }
}
```

`App.Shutdown(ctx)` wraps `e.Shutdown(ctx)`:
```go
func (a *App) Shutdown(ctx context.Context) error {
    return a.Echo.Shutdown(ctx)
}
```

### Pattern 7: OpenAPI Embed at /docs (D-03)

```go
// Source: Echo StaticFileFS + stdlib embed
//go:embed docs/openapi.yaml
var openAPIFS embed.FS

// In SetupRoutes or app.New:
e.GET("/docs", func(c echo.Context) error {
    data, _ := openAPIFS.ReadFile("docs/openapi.yaml")
    return c.Blob(http.StatusOK, "application/yaml", data)
})
```

### Pattern 8: Query Param Filtering for Transactions

```go
// GET /transactions?account_id=<uuid>
func (h *TransactionsHandler) List(c echo.Context) error {
    accountIDStr := c.QueryParam("account_id")
    if accountIDStr == "" {
        // return all or error — agent's discretion: return error, account_id required
        return echo.NewHTTPError(http.StatusBadRequest, "account_id query param required")
    }
    accountID, err := uuid.Parse(accountIDStr)
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
    }
    // ...
}
```

### Pattern 9: POST /check Handler

```go
type CheckRequest struct {
    Amount float64 `json:"amount" validate:"required,gt=0"`
}

type CheckResponse struct {
    CanBuy          bool    `json:"can_buy"`
    PurchasingPower float64 `json:"purchasing_power"`
    BufferRemaining float64 `json:"buffer_remaining"`
    RiskLevel       string  `json:"risk_level"`
}

func (h *CheckHandler) Check(c echo.Context) error {
    var req CheckRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    if err := c.Validate(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    cents := int64(math.Round(req.Amount * 100))
    result, err := h.svc.CanIBuyItDefault(cents)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, CheckResponse{
        CanBuy:          result.CanBuy,
        PurchasingPower: float64(result.PurchasingPower) / 100.0,
        BufferRemaining: float64(result.BufferRemaining) / 100.0,
        RiskLevel:       result.RiskLevel,
    })
}
```

### Pattern 10: app.New Rewiring

The current `app.New` imports `handlers`, `repos`, `services` (legacy root packages). The new wiring:

```go
// Remove: imports of handlers/, repos/, services/
// Remove: legacy AccHandler, TxnsHandler fields
// Remove: legacy wiring block
// Remove: legacy handlers.SetupRoutes call

// Add: internal/handler import
// Add: handler.SetupRoutes(e, accountsSvc, txnsSvc, engineSvc)
// Keep: e = echo.New()
// Keep: e.Validator = &handler.CustomValidator{...}
// Keep: e.HTTPErrorHandler = handler.CustomHTTPErrorHandler
```

`App` struct after cleanup:
```go
type App struct {
    cfg         config.Config
    db          *sql.DB
    Echo        *echo.Echo
    AccountsSvc *service.AccountsService
    TxnsSvc     *service.TransactionsService
    EngineSvc   *service.EngineService
}
```

### Anti-Patterns to Avoid

- **Returning raw `error` from service layer directly to client:** Wrap with `echo.NewHTTPError` so the custom error handler controls the JSON shape. Never `return err` from a handler.
- **Business logic in handlers:** All validation beyond input format (e.g., "does this account exist?") lives in the service layer. Handlers only marshal/unmarshal.
- **Using `c.String(http.StatusBadRequest, err.Error())` for errors:** The legacy `handlers/accounts.go` does this — it bypasses the custom error handler. Use `return echo.NewHTTPError(...)` instead.
- **Float arithmetic without rounding:** `amount * 100` can produce floating point drift. Always use `math.Round`.
- **Leaving legacy packages imported in app.go while also adding new handler package:** The build will fail with duplicate symbol or import errors. Delete all three legacy packages atomically.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Struct validation | Custom field-by-field checks | `go-playground/validator/v10` | Handles required, gt, min, max, enum, nested structs; battle-tested edge cases |
| JSON binding | `json.NewDecoder(r.Body).Decode` | `c.Bind(&req)` | Echo Bind handles Content-Type negotiation, path params, query params in one call |
| HTTP error shape | Per-handler `if err != nil { c.JSON(500, ...) }` | Custom `HTTPErrorHandler` + `echo.NewHTTPError` | Single source of truth for error shape; panic recovery handled by Echo middleware |
| File serving of openapi.yaml | `os.ReadFile` with absolute path | `//go:embed` + `embed.FS` | Single binary, no deployment path assumptions |

**Key insight:** Echo's Bind + Validate + HTTPErrorHandler trio forms the complete input safety pipeline. Any custom layer around this is redundant and introduces inconsistency.

---

## Common Pitfalls

### Pitfall 1: Legacy Package Import Cycle After Partial Cleanup

**What goes wrong:** Deleting `handlers/` from disk but leaving the import in `internal/app/app.go` (or vice versa) breaks the build before the new handler package is ready.
**Why it happens:** The cleanup and the new wiring are two separate edits; if done in the wrong order, there's a broken-build window.
**How to avoid:** In a single task, (a) write `internal/handler/` fully, (b) rewrite `app.go` imports and wiring, then (c) delete legacy packages. Never delete before the replacement is complete.
**Warning signs:** `build: cannot find package "github.com/ufleck/cibi/handlers"` during `go build ./...`.

### Pitfall 2: Float Precision in Amount Conversion

**What goes wrong:** `int64(75.1 * 100)` evaluates to `7509` due to IEEE 754 representation.
**Why it happens:** Float multiplication is not exact.
**How to avoid:** Always `int64(math.Round(amount * 100))` — same pattern as `check.go`.
**Warning signs:** Off-by-one cent errors in engine results that don't match CLI output.

### Pitfall 3: Custom Error Handler Not Registered Before Routes

**What goes wrong:** Some requests go through Echo's default error handler and return HTML or a differently-shaped JSON body.
**Why it happens:** Echo registers `HTTPErrorHandler` at Echo instance creation time; if assigned after route registration, it still works — but if the instance is shared and the handler set conditionally, it can be missed.
**How to avoid:** Set `e.HTTPErrorHandler` immediately after `e = echo.New()`, before `SetupRoutes`.
**Warning signs:** Error responses that have `{"message": "..."}` (Echo default shape) instead of `{"error": "..."}` (D-04 shape).

### Pitfall 4: sql.ErrNoRows Leaking as 500

**What goes wrong:** `GetByID` returns `sql.ErrNoRows` wrapped in a service error; handler returns 500 instead of 404.
**Why it happens:** The service layer wraps errors with `fmt.Errorf("...: %w", err)` — the handler needs to `errors.Is(err, sql.ErrNoRows)` to detect not-found.
**How to avoid:** In each GET/PATCH/DELETE handler by ID, check `errors.Is(err, sql.ErrNoRows)` after the service call and return 404.
**Warning signs:** `GET /accounts/nonexistent-uuid` returns 500 instead of 404 with `{"error": "not found"}`.

### Pitfall 5: SIGTERM Not Handled on Windows Dev vs Linux Production

**What goes wrong:** `syscall.SIGTERM` is not available on Windows; using it breaks the Windows build.
**Why it happens:** The project runs on Windows (Go 1.25 windows/amd64 confirmed) but will likely be deployed on Linux.
**How to avoid:** Use `syscall.SIGTERM` — it IS defined on Windows in Go's syscall package (as a constant), even if the OS doesn't send it. Confirmed by Go stdlib. Alternatively, use `os.Interrupt` only for purely local use.
**Warning signs:** Build error: `undefined: syscall.SIGTERM` (this does NOT actually happen in Go — SIGTERM is defined cross-platform).

### Pitfall 6: Echo Bind Silently Ignores Unknown Fields

**What goes wrong:** A POST body with `{"amount": 75.00, "extra_field": "ignored"}` binds successfully with zero validation error — the extra field is silently dropped.
**Why it happens:** `encoding/json` by default ignores unknown fields; Echo Bind uses stdlib JSON.
**How to avoid:** This is acceptable for a personal tool. Document it in openapi.yaml so callers know the schema.
**Warning signs:** N/A — not a bug, just a known behavior.

---

## Code Examples

### Full accounts.go handler (skeleton)

```go
// Source: established pattern from handlers/accounts.go + internal/service/accounts.go
package handler

import (
    "database/sql"
    "errors"
    "net/http"

    "github.com/google/uuid"
    "github.com/labstack/echo/v4"
    "github.com/ufleck/cibi/internal/service"
)

type AccountsHandler struct {
    svc *service.AccountsService
}

func NewAccountsHandler(svc *service.AccountsService) *AccountsHandler {
    return &AccountsHandler{svc: svc}
}

type CreateAccountRequest struct {
    Name           string  `json:"name"            validate:"required"`
    CurrentBalance float64 `json:"current_balance"` // dollars; converted to cents
    Currency       string  `json:"currency"         validate:"required"`
    IsDefault      bool    `json:"is_default"`
}

func (h *AccountsHandler) Create(c echo.Context) error {
    var req CreateAccountRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    if err := c.Validate(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    // ... build sqlite.Account, call h.svc.CreateAccount
    return c.JSON(http.StatusCreated, ...)
}

func (h *AccountsHandler) GetByID(c echo.Context) error {
    id, err := uuid.Parse(c.Param("id"))
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
    }
    acc, err := h.svc.GetByID(id)  // agent must add GetByID to AccountsService
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return echo.NewHTTPError(http.StatusNotFound, "account not found")
        }
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, toAccountResponse(acc))
}
```

### routes.go

```go
// Source: pattern from handlers/routes.go, adapted for internal/handler
package handler

import (
    "github.com/labstack/echo/v4"
    "github.com/ufleck/cibi/internal/service"
)

func SetupRoutes(e *echo.Echo, accSvc *service.AccountsService, txnsSvc *service.TransactionsService, engineSvc *service.EngineService) {
    ah := NewAccountsHandler(accSvc)
    th := NewTransactionsHandler(txnsSvc)
    ch := NewCheckHandler(engineSvc)

    acc := e.Group("/accounts")
    acc.GET("", ah.List)
    acc.POST("", ah.Create)
    acc.GET("/default", ah.GetDefault)   // legacy shortcut; worth keeping per <specifics>
    acc.GET("/:id", ah.GetByID)
    acc.PATCH("/:id", ah.Update)
    acc.DELETE("/:id", ah.Delete)

    txn := e.Group("/transactions")
    txn.GET("", th.List)         // ?account_id= filter
    txn.POST("", th.Create)
    txn.PATCH("/:id", th.Update)
    txn.DELETE("/:id", th.Delete)

    e.POST("/check", ch.Check)
    e.GET("/docs", serveOpenAPI)
}
```

---

## Service Layer Gap Analysis

The existing `AccountsService` is missing a `GetByID` method (only `GetDefault` and `ListAccounts` exist). The `PATCH /accounts/:id` route will also need an `UpdateAccount(id, fields)` method. The planner must include tasks to add these:

| Missing Method | Service | Needed By | Notes |
|---------------|---------|-----------|-------|
| `GetByID(id uuid.UUID) (Account, error)` | `AccountsService` | `GET /accounts/:id`, `PATCH /accounts/:id` | `accRepo.GetByID` already exists [VERIFIED: accounts.go repo] |
| `UpdateAccount(id uuid.UUID, name string, balance int64) error` | `AccountsService` | `PATCH /accounts/:id` | `accRepo.UpdateName` + `accRepo.UpdateBalance` exist; service method needed |

`TransactionsService.GetTransaction` and `DeleteTransaction` already exist [VERIFIED: transactions.go]. The handler routes can call them directly.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Root-level `handlers/` package using legacy `services/` | `internal/handler/` using `internal/service` | Phase 4 | Consistent with layered arch; CLI and API share same service layer |
| `json.NewDecoder(r.Body).Decode` per handler | `c.Bind(&req)` + `c.Validate(&req)` | Phase 4 | Echo Bind handles JSON, form, query params uniformly |
| `c.String(http.StatusBadRequest, err.Error())` | `echo.NewHTTPError(code, msg)` + custom handler | Phase 4 | Uniform `{"error": "..."}` shape across all error paths |

**Deprecated/outdated:**
- `handlers/` root package: deleted in this phase; replace with `internal/handler/`
- `repos/` root package: deleted in this phase; already superseded by `internal/repo/sqlite/`
- `services/` root package: deleted in this phase; already superseded by `internal/service/`
- Legacy `AccHandler`/`TxnsHandler` fields on `App` struct: removed in this phase

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `AccountsService` needs `GetByID` added — confirmed by reading accounts.go which only has `ListAccounts`, `CreateAccount`, `GetDefault`, `SetDefault`, `DeleteAccount` | Service Layer Gap Analysis | If a GetByID already exists somewhere else, planner adds a duplicate task (low risk — easy to skip) |
| A2 | `GET /transactions` without `?account_id=` should return 400; the service has no ListAll method | Architecture Patterns, Pattern 8 | If a global list is desired, service needs a ListAll method; agent discretion covers this |

---

## Open Questions

1. **`PATCH /accounts/:id` — which fields are patchable?**
   - What we know: `accRepo.UpdateName` and `accRepo.UpdateBalance` exist separately
   - What's unclear: Does the PATCH accept both fields, or only one? The legacy handler (`HandleUpdateAcc`) used a `types.UpdateAccount` struct that no longer exists
   - Recommendation: Create a `PatchAccountRequest` with optional `name *string` and `current_balance *float64`; call each repo method only if field is non-nil

2. **`GET /transactions` — require `?account_id=` or allow no filter?**
   - What we know: `TransactionsService.ListTransactions` takes `accountID uuid.UUID` as required param; there is no ListAll method
   - What's unclear: Agent's discretion covers this per CONTEXT.md
   - Recommendation: Require `?account_id=` for now; return 400 if missing. Avoids adding a ListAll service method.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go | All compilation | Yes | 1.25.0 windows/amd64 | — |
| `github.com/labstack/echo/v4` | HTTP server | Yes | v4.12.0 | — |
| `github.com/go-playground/validator/v10` | Request validation (D-08) | No (not in go.mod) | v10.30.2 latest | Must install |
| `github.com/google/uuid` | UUID path param parsing | Yes | v1.6.0 | — |
| `embed` (stdlib) | OpenAPI serving | Yes | Go stdlib | — |
| `syscall` (stdlib) | SIGTERM handling | Yes | Go stdlib (cross-platform) | `os.Interrupt` only |

**Missing dependencies with no fallback:**
- `github.com/go-playground/validator/v10` must be added: `go get github.com/go-playground/validator/v10@v10.30.2`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Go stdlib `testing` + `net/http/httptest` |
| Config file | none (no test config file detected in repo) |
| Quick run command | `go test ./internal/handler/...` |
| Full suite command | `go test ./...` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | `POST /check` with `{"amount": 75.00}` returns same result as CLI | integration | `go test ./internal/handler/... -run TestCheck` | No — Wave 0 |
| API-01 | `GET /accounts` returns JSON array | unit | `go test ./internal/handler/... -run TestListAccounts` | No — Wave 0 |
| API-01 | `POST /accounts` creates account | unit | `go test ./internal/handler/... -run TestCreateAccount` | No — Wave 0 |
| API-01 | `PATCH /transactions/:id` updates transaction | unit | `go test ./internal/handler/... -run TestUpdateTransaction` | No — Wave 0 |
| API-03 | Malformed body returns `{"error": "..."}` not 500 | unit | `go test ./internal/handler/... -run TestBadRequest` | No — Wave 0 |
| API-03 | Custom error handler produces uniform shape | unit | `go test ./internal/handler/... -run TestErrorShape` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `go test ./internal/handler/...`
- **Per wave merge:** `go test ./...`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `internal/handler/accounts_test.go` — covers API-01 account routes
- [ ] `internal/handler/transactions_test.go` — covers API-01 transaction routes
- [ ] `internal/handler/check_test.go` — covers API-01 POST /check
- [ ] `internal/handler/errors_test.go` — covers API-03 error shape
- [ ] `internal/handler/testhelpers_test.go` — shared `httptest.NewRecorder` / mock service setup

---

## Security Domain

> `security_enforcement` not set in config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Deferred — personal tool on Tailscale network |
| V3 Session Management | No | Stateless API — no sessions |
| V4 Access Control | No | Deferred — Tailscale network boundary is the ACL |
| V5 Input Validation | Yes | `go-playground/validator/v10` + `c.Bind` + custom error handler |
| V6 Cryptography | No | No crypto operations in this phase |

### Known Threat Patterns for Echo + SQLite

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed JSON body causing panic | Tampering | `c.Bind` returns error; custom error handler catches; Echo recover middleware optional |
| UUID injection via path param | Tampering | `uuid.Parse(c.Param("id"))` returns error on malformed input; handler returns 400 |
| Negative or zero amount in /check | Tampering | `validate:"gt=0"` tag on `CheckRequest.Amount` |
| SQL injection | Tampering | All SQL in `internal/repo/sqlite/` uses parameterized queries (`?` placeholders) — no concatenation [VERIFIED: transactions.go, accounts.go] |

---

## Sources

### Primary (HIGH confidence)

- Echo v4.12.0 source at `C:\Users\Pichau\go\pkg\mod\github.com\labstack\echo\v4@v4.12.0` — `echo.go` (HTTPErrorHandler, Shutdown, Validator interface, HTTPError), `echo_fs.go` (embed.FS patterns) [VERIFIED: direct source read]
- `go.mod` — confirmed Echo v4.12.0, uuid v1.6.0, Go 1.25 [VERIFIED: go.mod]
- `internal/service/engine.go` — `CanIBuyIt`, `CanIBuyItDefault` signatures [VERIFIED: direct read]
- `internal/service/accounts.go` — existing methods, missing GetByID confirmed [VERIFIED: direct read]
- `internal/service/transactions.go` — all CRUD methods confirmed [VERIFIED: direct read]
- `internal/repo/sqlite/accounts.go` — `GetByID` exists on repo layer [VERIFIED: direct read]
- `cmd/cibi/check.go` — `math.Round(amount * 100)` conversion pattern [VERIFIED: direct read]
- `handlers/routes.go` — legacy route list for parity reference [VERIFIED: direct read]

### Secondary (MEDIUM confidence)

- `go list -m github.com/go-playground/validator/v10@latest` → v10.30.2 [VERIFIED: tool output]
- Echo Validator interface design for go-playground/validator pairing — standard community pattern [ASSUMED based on training + interface shape match]

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified via go.mod and source
- Architecture: HIGH — patterns verified against existing codebase (check.go, accounts.go repo, transactions.go)
- Pitfalls: HIGH — derived from reading actual legacy handler code and service layer
- Service gap analysis: HIGH — derived from reading internal/service/accounts.go directly

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (Echo v4 is stable; validator v10 API is stable)
