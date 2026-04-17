# Testing

**Analysis Date:** 2026-04-16

## Test Strategy

The project uses two separate test suites:

1. **Go backend** — stdlib `testing` package with hand-written mocks; no third-party test library
2. **TypeScript frontend** — Vitest with jsdom; tests focus on pure utility functions and data contracts

Handler tests are the primary coverage layer on the Go side. They test the full HTTP request/response cycle at the handler boundary using mock service implementations. Pure engine logic (`internal/engine/`) is tested with table-driven unit tests. Several stub test files exist (`t.Skip(...)`) as placeholders for service and repo layers not yet covered.

## Frameworks & Tools

**Go:**
- Runner: `go test` (stdlib, no config file needed)
- Assertion: stdlib `t.Errorf`, `t.Fatalf`, `t.Fatal` — no testify or gomock
- HTTP testing: `net/http/httptest` — `httptest.NewRequest`, `httptest.NewRecorder`
- Mocks: hand-written function-field structs (see Mocking section)

**TypeScript:**
- Runner: Vitest 4 (`web/vitest.config.ts`)
- Environment: jsdom (configured in `web/vitest.config.ts` `test.environment`)
- Assertion: Vitest built-in `expect`
- Component testing: `@testing-library/react` + `@testing-library/user-event` (installed, minimal use currently)
- No snapshot testing

## Test Organization

**Go — Co-located with source:**
```
internal/
  engine/
    engine.go
    engine_test.go          # table-driven unit tests for pure engine logic
  handler/
    check.go
    check_test.go           # handler tests via serveRequest helper
    transactions.go
    transactions_test.go
    accounts_test.go
    errors_test.go
    testhelpers_test.go     # shared mocks + request helpers (package handler)
    pay_schedule_test.go    # stub (t.Skip)
  service/
    pay_schedule_test.go    # stub (t.Skip) — package service_test
  repo/sqlite/
    pay_schedule_test.go    # stub (t.Skip) — package sqlite_test
```

**TypeScript — Mixed co-located and `__tests__/` directory:**
```
web/src/
  __tests__/
    dashboard.test.tsx      # formatMoney, formatDate, reserved calculation
    verdict.test.tsx        # formatMoney edge cases for verdict display
    financial-window.test.ts # isInCurrentPayWindow logic
  components/
    WaitVerdict.test.tsx    # stub (it.skip)
```

**Package naming:**
- Handler tests use `package handler` (white-box, same package) to access unexported fields
- Service and repo stubs use `package service_test` / `package sqlite_test` (black-box)

## Coverage Approach

No coverage thresholds are enforced. No CI pipeline. Coverage is checked manually.

**Current coverage by layer:**
- `internal/engine/` — well covered: `AddMonthClamped`, `NextPayday` for all frequency types
- `internal/handler/` — partially covered: `CheckHandler`, `TransactionsHandler`, `AccountsHandler` (via `accounts_test.go`), `errors.go`; `PayScheduleHandler` is stub-only
- `internal/service/` — stub-only (`t.Skip`)
- `internal/repo/sqlite/` — stub-only (`t.Skip`)
- `web/src/lib/format.ts` — fully covered by `dashboard.test.tsx` and `verdict.test.tsx`
- `web/src/lib/financial-window.ts` — covered by `financial-window.test.ts`
- React components — effectively uncovered except `WaitVerdict.test.tsx` stub

## How to Run Tests

**Go — all tests:**
```bash
go test ./...
```

**Go — specific package:**
```bash
go test github.com/ufleck/cibi/internal/handler
go test github.com/ufleck/cibi/internal/engine
```

**Go — with coverage:**
```bash
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

**Go — verbose (see individual test names):**
```bash
go test -v ./...
```

**TypeScript — all tests:**
```bash
cd web && npm test
# or
cd web && npx vitest
```

**TypeScript — watch mode:**
```bash
cd web && npx vitest --watch
```

**TypeScript — coverage:**
```bash
cd web && npx vitest --coverage
```

## Test Patterns & Examples

### Go — Table-driven unit test (engine layer)

Used in `internal/engine/engine_test.go` for pure functions:

```go
func TestAddMonthClamped(t *testing.T) {
    tests := []struct {
        name     string
        input    time.Time
        n        int
        expected time.Time
    }{
        {"jan31+1=feb28_nonleap", date(2025, 1, 31), 1, date(2025, 2, 28)},
        {"jan31+1=feb29_leap",    date(2024, 1, 31), 1, date(2024, 2, 29)},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := AddMonthClamped(tt.input, tt.n)
            if !got.Equal(tt.expected) {
                t.Errorf("got %v; want %v", got.Format("2006-01-02"), tt.expected.Format("2006-01-02"))
            }
        })
    }
}
```

Helper `date()` is defined once per test file to reduce noise:
```go
func date(year int, month time.Month, day int) time.Time {
    return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}
```

### Go — Handler test via `serveRequest` (full middleware chain)

Used in `internal/handler/check_test.go` when the error handler must run:

```go
func TestCheck(t *testing.T) {
    mock := &mockEngineService{
        canIBuyItDefaultFn: func(itemPrice int64) (service.EngineResult, error) {
            return service.EngineResult{CanBuy: true, PurchasingPower: 5000, RiskLevel: "LOW"}, nil
        },
    }
    h := &CheckHandler{svc: mock}
    rec := serveRequest(func(c echo.Context) error {
        return h.Check(c)
    }, http.MethodPost, "/api/check", `{"amount":75.00}`)

    if rec.Code != http.StatusOK {
        t.Errorf("expected 200, got %d; body: %s", rec.Code, rec.Body.String())
    }
    var resp CheckResponse
    if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
        t.Fatalf("failed to decode response: %v", err)
    }
    if !resp.CanBuy {
        t.Errorf("expected can_buy true")
    }
}
```

### Go — Handler test via `makeRequest` (direct method call, no middleware)

Used in `internal/handler/transactions_test.go` when testing happy-path responses without error handler:

```go
func TestListTransactions(t *testing.T) {
    accountID := uuid.New()
    mock := &mockTransactionsService{
        listFn: func(id uuid.UUID) ([]sqlite.Transaction, error) {
            return []sqlite.Transaction{{ Amount: -2500 }}, nil
        },
    }
    h := &TransactionsHandler{svc: mock}
    rec, c := makeRequest(http.MethodGet, "/api/transactions?account_id="+accountID.String(), "")
    if err := h.List(c); err != nil {
        t.Fatalf("List returned error: %v", err)
    }
    if rec.Code != http.StatusOK {
        t.Errorf("expected 200, got %d", rec.Code)
    }
}
```

**When to use which:**
- `serveRequest` — use when testing error paths, validation failures, or any flow where `CustomHTTPErrorHandler` must run; routes through Echo's full `ServeHTTP`
- `makeRequest` — use for happy-path handler tests where you call the handler method directly

### Go — Mocking pattern

All mocks live in `internal/handler/testhelpers_test.go` (package `handler`). Each mock is a struct with `Fn` fields:

```go
type mockEngineService struct {
    canIBuyItFn        func(accountID uuid.UUID, itemPrice int64) (service.EngineResult, error)
    canIBuyItDefaultFn func(itemPrice int64) (service.EngineResult, error)
}

func (m *mockEngineService) CanIBuyIt(accountID uuid.UUID, itemPrice int64) (service.EngineResult, error) {
    if m.canIBuyItFn != nil {
        return m.canIBuyItFn(accountID, itemPrice)
    }
    panic("not implemented")
}
```

Rules:
- Unimplemented methods `panic("not implemented")` — tests that call unexpected methods fail loudly
- Only set the `Fn` fields relevant to the test case being exercised
- Mock structs are defined once in `testhelpers_test.go` and reused across all handler test files

### Go — Stub placeholder pattern

Used for layers not yet tested. Always include `t.Skip` with a descriptive message:

```go
func TestPayScheduleRepo_Stub(t *testing.T) {
    t.Skip("Wave 0 stub — implement in task")
}
```

When implementing a stub, remove `t.Skip` and replace the body with actual test logic.

### TypeScript — Pure function test

Used in `web/src/__tests__/dashboard.test.tsx` and `web/src/__tests__/financial-window.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatMoney } from '@/lib/format'

describe('formatMoney', () => {
  it('formats positive BRL amount', () => {
    expect(formatMoney(75)).toBe('R$\u00a075,00')
  })
  it('formats negative BRL amount', () => {
    expect(formatMoney(-15.99)).toBe('-R$\u00a015,99')
  })
})
```

### TypeScript — Data contract / calculation test

Used in `web/src/__tests__/dashboard.test.tsx` to verify frontend-side aggregation logic:

```typescript
describe('Reserved calculation', () => {
  it('sums absolute amounts of recurring transactions with next_occurrence', () => {
    const txns = [
      { amount: -15.99, is_recurring: true, next_occurrence: '2026-04-15T00:00:00Z' },
      { amount: -850.00, is_recurring: true, next_occurrence: '2026-05-01T00:00:00Z' },
      { amount: -20.00, is_recurring: true, next_occurrence: null },
    ]
    const reserved = txns
      .filter(t => t.next_occurrence !== null)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    expect(reserved).toBeCloseTo(865.99, 2)
  })
})
```

### TypeScript — Stub placeholder

Used in `web/src/components/WaitVerdict.test.tsx`:

```typescript
import { describe, it } from 'vitest'

describe('CheckWidget WAIT verdict', () => {
  it.skip('Wave 0 stub — implement WAIT verdict rendering tests', () => {})
})
```

---

*Testing analysis: 2026-04-16*
