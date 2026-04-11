# Coding Conventions

**Analysis Date:** 2026-04-11

## Naming Patterns

**Packages:**
- Lowercase, single-word: `handlers`, `services`, `repos`, `data`, `types`, `db`

**Files:**
- Lowercase, domain-named: `accounts.go`, `transactions.go`, `routes.go`, `sqlite.go`
- One file per domain entity per package layer

**Structs (types):**
- PascalCase nouns: `Account`, `Transaction`, `AccountsSrvc`, `SqliteAccRepo`, `SqliteTxnsRepo`
- Service structs use `Srvc` suffix: `AccountsSrvc`, `TransactionsSrvc`
- Repo structs use `Repo` suffix (interfaces) and `Sqlite` prefix + `Repo` suffix (implementations): `AccountsRepo`, `SqliteAccRepo`
- Input/request types use `New` prefix: `NewAccount`, `NewTransaction`
- Update types use `Update` prefix: `UpdateAccount`, `UpdateTransaction`

**Functions and Methods:**
- PascalCase for exported: `CreateAccount`, `GetAccountById`, `HandleCreateAcc`
- Handler methods prefixed with `Handle`: `HandleCreateAcc`, `HandleGetAccById`, `HandleDeleteAcc`
- Constructors use `New` prefix: `NewAccountsSrvc`, `NewTransactionsSrvc`, `NewSqliteTxnsRepo`, `NewAccount`, `NewTransaction`

**Variables:**
- camelCase: `accId`, `txnsSrvc`, `defAcc`, `newBalance`
- Short abbreviations common: `acc` (account), `txn`/`tx` (transaction), `srvc` (service), `repo` (repository), `newa` (new account), `newt` (new transaction)

**Type Aliases:**
- Plural collection types as named slice types: `type Accounts []Account`, `type Transactions []Transaction`

## Code Style

**Formatting:**
- Standard `gofmt` formatting (Go default)
- No explicit formatter config detected — relies on Go toolchain defaults

**Linting:**
- No `.golangci.yml` or linter config detected
- No linting enforced

## Import Organization

**Order (standard Go convention):**
1. Standard library (`database/sql`, `encoding/json`, `fmt`, `net/http`, `time`)
2. Third-party packages (`github.com/google/uuid`, `github.com/labstack/echo/v4`, `github.com/mattn/go-sqlite3`)
3. Internal packages (`github.com/ufleck/cibi-api/data`, `github.com/ufleck/cibi-api/db`, etc.)

**Example from `handlers/accounts.go`:**
```go
import (
    "encoding/json"
    "net/http"

    "github.com/google/uuid"
    "github.com/labstack/echo/v4"
    "github.com/ufleck/cibi-api/services"
    "github.com/ufleck/cibi-api/types"
)
```

**Path Aliases:**
- None used

## Error Handling

**Pattern:**
- Return errors as the last return value: `(result, error)`
- Wrap errors with context using `fmt.Errorf("message: %w", err)`: this is consistent across `services/` and `repos/`
- Handlers return HTTP error responses directly using `c.String(http.StatusXxx, err.Error())`
- No custom error types — all errors are plain `error` interface with wrapped messages

**Service layer example:**
```go
err := srvc.repo.Insert(a)
if err != nil {
    return fmt.Errorf("Could not create account. Error when inserting: %w", err)
}
```

**Handler layer example:**
```go
err = ah.AccSrvc.CreateAccount(acc)
if err != nil {
    return c.String(http.StatusInternalServerError, err.Error())
}
```

**Known deviation:** Error messages in `fmt.Errorf` use title case (e.g., `"Could not create account"`) rather than Go convention of lowercase error strings. This is inconsistent with official Go style.

## Logging

**Framework:** `fmt.Println` (stdlib only — no structured logging library)

**Patterns:**
- Debug-style `fmt.Println` calls scattered in service and repo code: `services/transactions.go` lines 27, 35; `repos/transactions.go` line 83; `handlers/transactions.go` line 27
- These appear to be development debugging artifacts, not intentional logging strategy
- No log levels, no structured output, no log rotation

## Comments

**When to Comment:**
- No doc comments (`//` above exported types/functions) are present anywhere in the codebase
- No inline comments found
- Effectively: zero comments exist

## Function Design

**Size:** Functions are small and single-purpose (typically 5-20 lines)

**Parameters:** Positional, typed. Interfaces used for dependency parameters (e.g., `repos.AccountsRepo`).

**Return Values:**
- Error-only returns for mutations: `func (srvc *AccountsSrvc) CreateAccount(...) error`
- Value + error for queries: `func (srvc *AccountsSrvc) GetAccountById(...) (*data.Account, error)`
- Pointer returns used for nullable/optional single values: `*data.Account`
- Value returns (non-pointer) used for required results: `data.Account`, `data.Accounts`

## Struct Design

**Dependency injection via constructors:**
- All service and repo structs expose a `New*` constructor that accepts interface dependencies
- Fields are unexported (lowercase): `repo`, `txRepo`, `txnsSrvc`, `accRepo`
- Handler structs use exported fields for injection at `main.go` level: `AccSrvc`, `TxnsSrvc`

**Example:**
```go
type AccountsSrvc struct {
    repo     repos.AccountsRepo
    txRepo   repos.TransactionsRepo
    txnsSrvc TransactionsSrvc
}

func NewAccountsSrvc(repo repos.AccountsRepo, txRepo repos.TransactionsRepo, txnsSrvc TransactionsSrvc) AccountsSrvc {
    return AccountsSrvc{repo: repo, txRepo: txRepo, txnsSrvc: txnsSrvc}
}
```

## Module Design

**Exports:**
- Types, constructors, and interface definitions are exported
- Implementation fields are unexported
- No barrel files (Go does not use them)

**Interface placement:**
- Interfaces are defined in the `repos/` package alongside implementations (`repos/accounts.go`, `repos/transactions.go`)
- Services depend on interfaces, not concrete types

## JSON Tags

**Struct tags used consistently for API types in `types/` and `data/`:**
- snake_case JSON keys: `json:"is_default"`, `json:"account_id"`, `json:"evaluates_at"`
- Optional fields use pointer types with `omitempty`: `Balance *float64`, `IsDefault *bool` in `types/types.go`
- `omitempty` used on embedded slices: `Transactions Transactions \`json:"transactions,omitempty"\``

---

*Convention analysis: 2026-04-11*
