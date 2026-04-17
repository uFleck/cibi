# Deferred Items (10-01)

Out-of-scope failures discovered while running plan acceptance command `go test ./... -count=1`:

1. `internal/handler/check_test.go:102:24` — `undefined: uuid`
2. `internal/handler/transactions_test.go` — `mockTransactionsService` missing `ConfirmRecurring` method required by `TransactionsServiceIface`

These failures are in handler test files unrelated to files modified by plan 10-01 tasks.
They block full-suite green but are deferred per scope-boundary rule.
