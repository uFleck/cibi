# Conventions

**Analysis Date:** 2026-04-16

## Code Style

**Language:** Go 1.25 (backend), TypeScript 6 + React 19 (frontend)

**Formatting (Go):**
- Standard `gofmt` formatting; no `.golangci.yml` or explicit linter config
- Imports grouped in three blocks: stdlib, third-party, internal — separated by blank lines
- Example from `internal/handler/accounts.go`:
  ```go
  import (
      "database/sql"
      "errors"
      "math"
      "net/http"

      "github.com/google/uuid"
      "github.com/labstack/echo/v4"
      "github.com/ufleck/cibi/internal/repo/sqlite"
      "github.com/ufleck/cibi/internal/service"
  )
  ```

**Formatting (TypeScript/React):**
- ESLint with `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`
- No Prettier config detected; formatting enforced via ESLint only
- Path alias `@/` maps to `web/src/` (configured in `vite.config.ts` and `tsconfig.json`)
- Imports use named exports from `@/lib/api`, `@/lib/format`, `@/components/*`
- Components are `.tsx` files, utilities are `.ts` files

**UI Skill (`.claude/skills/ui-ux-pro-max`):**
- Use SVG icons from lucide-react — never emoji as icons
- Touch targets minimum 44x44px
- All clickable elements must have `cursor-pointer`
- Transitions: 150–300ms using `transition-colors`
- Light/dark mode: use `bg-primary`, `bg-background` theme tokens — not raw colors
- Glass cards in light mode: `bg-white/80` minimum opacity (not `bg-white/10`)

## Naming Conventions

**Go — Packages:**
- Lowercase single-word: `handler`, `service`, `sqlite`, `engine`, `config`, `migrations`
- Repo implementations are under `internal/repo/sqlite/`

**Go — Types and Structs:**
- PascalCase nouns: `Account`, `Transaction`, `PaySchedule`, `EngineResult`
- Handler structs: `<Domain>Handler` — e.g., `AccountsHandler`, `CheckHandler`, `TransactionsHandler`
- Service structs: `<Domain>Service` — e.g., `AccountsService`, `EngineService`, `PayScheduleService`
- Repo interfaces: `<Domain>Repo` — e.g., `AccountsRepo`, `TransactionsRepo`, `PayScheduleRepo`
- Repo implementations: `Sqlite<Domain>Repo` — e.g., `SqliteAccountsRepo`, `SqliteTxnsRepo`
- Service interfaces (for handler mocking): `<Domain>ServiceIface` — e.g., `AccountsServiceIface`, `EngineServiceIface`
- Request/response types: `<Action><Domain>Request` / `<Domain>Response` — e.g., `CreateAccountRequest`, `AccountResponse`, `CheckResponse`
- Update types: `Update<Domain>` — e.g., `UpdateTransaction`

**Go — Functions and Methods:**
- PascalCase for exported: `CreateAccount`, `GetByID`, `ListTransactions`, `CanIBuyIt`
- Constructors always use `New` prefix: `NewAccountsHandler`, `NewSqliteTxnsRepo`, `NewEngineService`
- Handler method names match HTTP semantics: `List`, `Create`, `GetByID`, `Update`, `Delete`, `SetDefault`

**Go — Variables:**
- camelCase: `accRepo`, `txnsRepo`, `psRepo`, `bufferRepo`, `earliestPayday`
- Short domain abbreviations: `acc` (account), `txn`/`tx` (transaction), `ps` (pay schedule), `buf` (buffer)

**TypeScript:**
- PascalCase for React components and type aliases: `AccountsPage`, `CheckWidget`, `TransactionResponse`
- camelCase for functions, variables, hooks: `fetchAccounts`, `postCheck`, `selectedAccountId`
- Interface names match Go response struct names: `AccountResponse`, `CheckResponse`, `PayScheduleResponse`
- snake_case JSON field names in interfaces match the Go API exactly: `is_default`, `account_id`, `next_occurrence`
- File names: `kebab-case.tsx` for pages and components, `camelCase.ts` for utilities

## Error Handling Patterns

**Go — Service layer:**
- Wrap errors with `fmt.Errorf("context.MethodName: description: %w", err)` — always include caller context
- Sentinel errors are package-level vars: `var ErrPayScheduleRequired = errors.New("PAY_SCHEDULE_REQUIRED")` in `internal/service/engine.go`
- Return zero-value struct + error on failure: `return EngineResult{}, fmt.Errorf(...)`

**Go — Handler layer:**
- Convert service errors to `echo.NewHTTPError(http.StatusXxx, err.Error())`
- Use `errors.Is(err, sql.ErrNoRows)` to return 404 vs 500
- All errors flow through `CustomHTTPErrorHandler` in `internal/handler/errors.go` which enforces `{"error": "message"}` JSON shape
- Special errors with machine-readable codes return `{"error": "...", "code": "PAY_SCHEDULE_REQUIRED"}`
- Input validation: bind first, then `c.Validate(&req)` using `CustomValidator` (wraps `go-playground/validator`)
- Struct validation tags: `validate:"required,gt=0"`, `validate:"required"`

**TypeScript — Frontend API:**
- `apiFetch<T>` in `web/src/lib/api.ts` parses error JSON and throws `Error` with optional `.code` property
- Components use `@tanstack/react-query` — errors surface via `isError` / `error` from `useQuery`/`useMutation`
- User-visible error feedback via `sonner` toast: `toast.error(err.message)`

## Common Patterns Used

**Go — Interface compile-time assertion:**
```go
// Ensure *service.AccountsService satisfies AccountsServiceIface.
var _ AccountsServiceIface = (*service.AccountsService)(nil)
```
Every handler file has this pattern immediately after the interface definition.

**Go — Handler struct with interface dependency:**
```go
type CheckHandler struct {
    svc EngineServiceIface
}

func NewCheckHandler(svc *service.EngineService) *CheckHandler {
    return &CheckHandler{svc: svc}
}
```
Handlers depend on local interfaces (not concrete service types) to allow mocking in tests.

**Go — Money representation:**
- All monetary values stored and computed as `int64` cents internally
- API request amounts arrive as `float64` dollars; converted with `int64(math.Round(amount * 100))`
- API response amounts emit as `float64` dollars: `float64(cents) / 100.0`
- Negative values = debits, positive = credits

**Go — Nullable optional fields via pointer types:**
```go
Frequency   *string    // nullable
AnchorDate  *time.Time // UTC, nullable
WaitUntil   *time.Time // non-nil only when RiskLevel == "WAIT"
```

**Go — SQL tx/no-tx duality in repo methods:**
```go
func (r *SqliteTxnsRepo) Insert(t Transaction, tx *sql.Tx) error {
    if tx != nil {
        _, err = tx.Exec(...)
    } else {
        _, err = r.db.Exec(...)
    }
}
```
Repo methods accept an optional `*sql.Tx` to participate in caller-managed transactions.

**Go — UTC everywhere:**
- All `time.Time` stored and compared in UTC: `time.Now().UTC()`, `t.AnchorDate.UTC().Format(time.RFC3339)`
- SQLite stores timestamps as RFC3339 strings

**TypeScript — React Query pattern:**
```tsx
const { data: accounts = [], isLoading } = useQuery({
  queryKey: ['accounts'],
  queryFn: fetchAccounts,
})
```
Default staleTime and refetchInterval are 30s (set in `web/src/App.tsx` QueryClient config).

**TypeScript — Context for account selection:**
- `AccountContext` in `web/src/App.tsx` provides `selectedAccountId` and `setSelectedAccountId`
- Consumed via `useContext(AccountContext)` in all pages that need the active account
- Account ID is persisted to `localStorage` under key `cibi.selectedAccountId`

## Anti-patterns to Avoid

**Go:**
- Do not return `http.StatusInternalServerError` for validation errors — use 400/422
- Do not use Echo's default error handler (it returns `{"message":"..."}` — the codebase enforces `{"error":"..."}`)
- Do not use `fmt.Println` for logging — no structured logging is present but debug prints should not be added
- Do not store monetary values as `float64` in the DB or internal calculations — always use `int64` cents
- Do not use concrete service types in handler structs — always use the local `*Iface` interface to preserve testability
- Do not skip the `var _ Interface = (*Impl)(nil)` compile-time check when adding new handlers

**TypeScript:**
- Do not use emoji as UI icons — use `lucide-react` SVG icons
- Do not hardcode currency amounts as strings — use `formatMoney()` from `web/src/lib/format.ts`
- Do not access `localStorage` directly outside of `App.tsx` account-selection logic

## Documentation Style

**Go:**
- Every exported type and function has a `//` doc comment directly above the declaration
- Format: `// TypeName does X.` or `// FunctionName verb-phrase.`
- Multi-step logic uses inline numbered step comments: `// Step 1: Load account.`, `// Step 2: Load pay schedules.`
- Formula documentation uses multi-line `//` blocks above the function with the formula written out
- Package-level examples: `// Example: balance=50000, obligations=-20000, threshold=10000 → pp=20000`

**TypeScript:**
- Minimal inline comments; most logic is self-documenting via TypeScript types
- Interface fields with non-obvious meaning get inline `// comment` — e.g., `amount: number // dollars`

---

*Convention analysis: 2026-04-16*
