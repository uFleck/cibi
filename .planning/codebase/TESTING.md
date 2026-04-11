# Testing Patterns

**Analysis Date:** 2026-04-11

## Test Framework

**Runner:** None — no tests exist in this codebase.

No `*_test.go` files were found anywhere under `/c/Projects/cibi-api/`. No test runner configuration exists (`go test` is the standard Go runner and requires no config file, but there are also no `testify`, `gomock`, or similar test library dependencies in `go.mod`).

**Run Commands:**
```bash
go test ./...          # Would run all tests (none currently exist)
go test -cover ./...   # With coverage reporting
```

## Test File Organization

**Location:** Not established — no test files exist.

**Go convention to follow when adding tests:**
- Co-locate test files with the package they test
- Name test files `<filename>_test.go` (e.g., `accounts_test.go` alongside `accounts.go`)
- Use the same package name for white-box tests, or `<pkg>_test` suffix for black-box tests

**Recommended structure to establish:**
```
repos/
  accounts.go
  accounts_test.go       # test SqliteAccRepo methods
  transactions.go
  transactions_test.go
services/
  accounts.go
  accounts_test.go       # test AccountsSrvc with mocked repos
  transactions.go
  transactions_test.go
data/
  accounts.go
  accounts_test.go       # test NewAccount, AddTransaction, Evaluate
  transactions.go
  transactions_test.go
```

## Test Structure

**Suite Organization:** Not established — no tests exist.

**Standard Go pattern to follow:**
```go
func TestCreateAccount(t *testing.T) {
    // arrange
    // act
    // assert
}

func TestCreateAccount_WhenRepoFails_ReturnsError(t *testing.T) {
    // table-driven tests are idiomatic Go
}
```

## Mocking

**Framework:** None installed. No mock libraries in `go.mod`.

**What to mock when tests are added:**
- `repos.AccountsRepo` interface (`repos/accounts.go`) — already an interface, ready for mocking
- `repos.TransactionsRepo` interface (`repos/transactions.go`) — already an interface, ready for mocking
- `services.TransactionsSrvc` — referenced as a concrete struct, not an interface; would need to be extracted to an interface to be mockable

**Recommended mock approach:**
- Use `github.com/stretchr/testify/mock` or hand-written struct mocks implementing the existing interfaces
- Both repo interfaces (`AccountsRepo`, `TransactionsRepo`) are well-defined and mockable without modification

**Hand-written mock example for `AccountsRepo`:**
```go
type MockAccountsRepo struct {
    InsertFn    func(a data.Account) error
    GetByIdFn   func(id uuid.UUID) (data.Account, error)
}

func (m *MockAccountsRepo) Insert(a data.Account) error {
    return m.InsertFn(a)
}
```

## Fixtures and Factories

**Test Data:** Not established — no fixtures or factories exist.

**Pattern to follow based on existing `New*` constructors:**
```go
// Use existing constructors as test factories
acc := data.NewAccount("Test Account", true)
txn := data.NewTransaction("Test Txn", "desc", 100.0, time.Now())
```

**Location for shared test helpers (when added):**
- Place in `testutil/` package at project root, or use `_test.go` helper files per package

## Coverage

**Requirements:** None enforced — no CI, no coverage thresholds configured.

**View Coverage:**
```bash
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Test Types

**Unit Tests:**
- None exist. Priority targets: `data/` package (pure logic, no DB dependency), `services/` package (mockable repo interfaces already defined)

**Integration Tests:**
- None exist. Would require a test SQLite database. The global `db.Conn` variable in `db/sqlite.go` makes integration testing harder — tests would need to call `db.Init()` or inject a test DB.

**E2E Tests:**
- None exist. No E2E framework in use.

## Testability Assessment

**Well-positioned for testing:**
- `data/accounts.go` — `NewAccount`, `AddTransaction` are pure functions with no external dependencies
- `data/transactions.go` — `NewTransaction`, `Evaluate` are pure functions
- `services/` — dependency-injected via interfaces; services can be unit tested with mock repos

**Poorly positioned for testing:**
- `repos/` — implementations directly use global `db.Conn` variable from `db/sqlite.go`; no DB abstraction makes isolated unit testing impossible without a real SQLite file
- `db/sqlite.go` — exposes a package-level global `var Conn *sql.DB` which cannot be swapped for tests without refactoring
- `handlers/` — `AccountsHandler.AccSrvc` is a concrete pointer `*services.AccountsSrvc`, not an interface; cannot be mocked without extracting a service interface

## Common Patterns (to establish)

**Async Testing:** Not applicable — codebase is synchronous.

**Error Testing:**
```go
// Pattern to use when testing error paths
func TestCreateAccount_InsertFails_ReturnsWrappedError(t *testing.T) {
    mockRepo := &MockAccountsRepo{
        InsertFn: func(a data.Account) error {
            return errors.New("db error")
        },
    }
    srvc := services.NewAccountsSrvc(mockRepo, mockTxRepo, mockTxnsSrvc)
    err := srvc.CreateAccount(types.NewAccount{Name: "Test"})
    if err == nil {
        t.Fatal("expected error, got nil")
    }
}
```

---

*Testing analysis: 2026-04-11*
