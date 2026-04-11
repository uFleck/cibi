# Phase 2: Domain + Engine — Research

**Phase:** 02-domain-engine
**Requirements:** ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, TXN-01, TXN-02
**Date:** 2026-04-11

## Summary

Phase 2 introduces domain logic packages that are purely computational — `internal/engine/` for date math and `internal/service/` for the decision engine. The two critical algorithms are `AddMonthClamped` (month-end overflow prevention), and `NextPayday` (anchor-based interval math per schedule type). The `CanIBuyIt` engine combines a single SQL aggregation query with in-memory arithmetic against the safety buffer, and must complete in under 100ms. All time handling is strictly UTC using RFC3339 TEXT in SQLite.

---

## 1. AddMonthClamped — Month-End Date Math

### Problem
Go's `time.AddDate(0, 1, 0)` overflows month boundaries:
- Jan 31 + 1 month = March 2 (non-leap year) or March 3 (leap year)
- This is "normalized" Go behavior — wrong for billing/scheduling use cases.

### Correct Algorithm

```go
// AddMonthClamped adds n months to t, clamping to the last valid day if the
// result would overflow into the following month.
func AddMonthClamped(t time.Time, n int) time.Time {
    // Advance naively
    result := t.AddDate(0, n, 0)

    // If the day overflowed into the next month, subtract the surplus
    // to land on the last day of the intended target month.
    if result.Day() != t.Day() {
        result = result.AddDate(0, 0, -result.Day())
    }
    return result
}
```

**Why it works:** `AddDate` with overflow lands in the next month. E.g., Jan 31 + 1 month = March 2. `result.Day()` (2) != `t.Day()` (31), so we subtract 2 days → Feb 28.

### Edge Cases
| Input | n | Expected Output | Go AddDate (wrong) |
|-------|---|-----------------|-------------------|
| Jan 31 | +1 | Feb 28 (non-leap) | Mar 2 |
| Jan 31 | +1 | Feb 29 (leap year, 2024) | Mar 1 |
| Feb 29 (leap) | +12 | Feb 28 (non-leap next year) | Mar 1 |
| Dec 31 | +1 | Jan 31 | Jan 31 ✓ (no overflow) |
| Mar 31 | +1 | Apr 30 | May 1 |
| Jan 31 | +2 | Mar 31 | Mar 31 ✓ (no overflow) |
| Jan 31 | -1 | Dec 31 | Dec 31 ✓ (no overflow) |

### Yearly
For yearly recurrence (`n` months = 12), same function applies:  
`AddMonthClamped(t, 12)` handles Feb 29 → Feb 28 in non-leap years.

---

## 2. NextPayday — Pay Schedule Logic

### `PaySchedule` struct (from schema)
```go
type PaySchedule struct {
    ID          uuid.UUID
    AccountID   uuid.UUID
    Frequency   string    // "weekly" | "bi-weekly" | "semi-monthly" | "monthly"
    AnchorDate  time.Time // UTC
    DayOfMonth2 *int      // only for semi-monthly
    Label       *string
}
```

### Algorithm per Frequency

#### Weekly (7-day fixed intervals)
```
intervals_elapsed = floor((from - anchor) / 7 days)
next = anchor + (intervals_elapsed + 1) * 7 days
```

#### Bi-Weekly (14-day fixed intervals)
```
intervals_elapsed = floor((from - anchor) / 14 days)
next = anchor + (intervals_elapsed + 1) * 14 days
```
- Use integer day arithmetic: `days_since_anchor := int(from.Sub(anchor) / (24 * time.Hour))`
- This correctly handles DST-insensitive math in UTC.

#### Monthly
```
next = AddMonthClamped(anchor, months_elapsed + 1)
where months_elapsed is the number of complete months between anchor and from
```
- Increment month count until result > from.

#### Semi-Monthly (two anchor days per month)
- `day1` = `AnchorDate.Day()` (e.g., 15)
- `day2` = `*DayOfMonth2` (e.g., 30)
- Generate next occurrence for both day1 and day2 strictly after `from`
- Return `min(next_day1, next_day2)`
- For day2, use `time.Date(year, month, day2, 0, 0, 0, 0, time.UTC)` — clamp if day2 > last day of month using same pattern.

### Boundary Condition (D-02)
`NextPayday` returns the **next payday strictly after `from`** (i.e., `> from`, not `>= from`).
The engine then uses `next_occurrence <= next_payday` to include obligations due exactly on payday.

---

## 3. CanIBuyIt Engine Design

### Formula
```
purchasing_power = current_balance - sum(upcoming_obligations) - min_threshold
can_buy = purchasing_power >= item_price
```

### SQL Query for Upcoming Obligations
```sql
SELECT COALESCE(SUM(amount), 0)
FROM "Transaction"
WHERE account_id = ?
  AND is_recurring = 1
  AND next_occurrence > ?       -- strictly after now (UTC RFC3339)
  AND next_occurrence <= ?      -- on or before next_payday (UTC RFC3339)
```

Parameters: `accountID`, `now.UTC().Format(time.RFC3339)`, `nextPayday.UTC().Format(time.RFC3339)`

### Steps in CanIBuyIt
1. Load account (current_balance)
2. Load PaySchedule for account (`GetPaySchedule(accountID)`)
3. Compute `nextPayday = NextPayday(schedule, time.Now().UTC())`
4. Query obligation sum (single SQL aggregation — fast)
5. Load SafetyBuffer `min_threshold` (single row read, cacheable)
6. Calculate purchasing_power, determine can_buy, classify risk
7. Return EngineResult

### Performance (<100ms)
- All inputs are single-row or indexed reads
- Obligation sum is a single SQL aggregation with index on `(account_id, is_recurring, next_occurrence)`
- No loops or N+1 queries
- Recommend adding index: `CREATE INDEX idx_txn_obligations ON "Transaction"(account_id, is_recurring, next_occurrence);`

---

## 4. Risk Tier Classification

The REQUIREMENTS.md defers exact thresholds to agent discretion. Proposed tiers based on `remaining_buffer = purchasing_power - item_price` relative to `min_threshold`:

| RiskLevel | Condition |
|-----------|-----------|
| `BLOCKED` | `purchasing_power < item_price` (can't afford it) |
| `HIGH`    | `can_buy = true` AND `remaining_buffer < min_threshold * 0.25` |
| `MEDIUM`  | `can_buy = true` AND `remaining_buffer < min_threshold * 0.50` |
| `LOW`     | `can_buy = true` AND `remaining_buffer >= min_threshold * 0.50` |

Special case: `min_threshold = 0` → no buffer defined. If can_buy, return `LOW`; if not, return `BLOCKED`.

### EngineResult fields
```go
type EngineResult struct {
    CanBuy          bool
    PurchasingPower int64  // integer cents
    BufferRemaining int64  // purchasing_power - item_price (cents)
    RiskLevel       string // "LOW" | "MEDIUM" | "HIGH" | "BLOCKED"
}
```

> **Note on decimal:** Requirements mention `decimal.Decimal` but the schema stores INTEGER cents. Since there's no `shopspring/decimal` in go.mod, implement with `int64` cents. Division for risk tiers uses integer arithmetic. If the user later adds `shopspring/decimal`, the service layer is the only place to update.

---

## 5. Directory Structure (per D-03)

### New directories to create
```
internal/
  engine/
    engine.go          # AddMonthClamped, NextPayday
    engine_test.go     # Table-driven unit tests
  service/
    accounts.go        # AccountsService + GetPaySchedule integration
    transactions.go    # TransactionService: CRUD + next_occurrence advance
    engine.go          # CanIBuyItService: CanIBuyIt(accountID, itemPrice)
  repo/
    sqlite/
      accounts.go      # AccountsRepo interface + SqliteAccountsRepo
      transactions.go  # TransactionsRepo interface + SqliteTxnsRepo
      pay_schedule.go  # PayScheduleRepo interface + SqlitePayScheduleRepo
      safety_buffer.go # SafetyBufferRepo interface + SqliteSafetyBufferRepo
```

### Migration of legacy code
- Legacy `repos/` and `services/` directories contain old code with old schema col names (e.g., `balance` not `current_balance`, `value` not `amount`). These are **incompatible** with Phase 1's actual migration schema.
- **Strategy:** Create fresh implementations in `internal/repo/sqlite/` and `internal/service/` that match the Phase 1 schema exactly. Do NOT attempt to migrate or reuse the old `repos/` code (it references wrong column names and old `data/` types).
- Update `internal/app/app.go` to wire the new repos/services. The old `repos/`, `services/`, and `handlers/` can remain but will not be wired.
- No need to delete old directories yet — they will be cleaned up in a later phase.

### Types/Domain Models
Introduce `internal/domain/` (or inline in service package) for:
```go
type Account struct { ... }        // matches Phase 1 schema
type Transaction struct { ... }    // matches Phase 1 schema  
type PaySchedule struct { ... }    // matches Phase 1 schema
type SafetyBuffer struct { ... }   // matches Phase 1 schema
```

---

## 6. UTC Time Handling in Go + SQLite

### Storage Format
All timestamps stored as `TEXT` in SQLite using RFC3339: `"2026-01-31T00:00:00Z"`

### Parsing from DB
```go
// When scanning from SQL rows:
var ts string
rows.Scan(&ts)
t, err := time.Parse(time.RFC3339, ts)
// t is already UTC because the "Z" suffix denotes UTC
```

### Writing to DB
```go
// Always format with UTC zone:
ts := t.UTC().Format(time.RFC3339)
```

### Common Pitfalls
1. **`time.Now()` without `.UTC()`** — local timezone leaks into RFC3339 string (e.g., `-03:00` suffix). Always call `time.Now().UTC()`.
2. **SQLite TEXT comparison is lexicographic** — RFC3339 format is designed for this. `"2026-01-31T..." < "2026-02-01T..."` correctly. Only works because all timestamps must use the same format and `Z` suffix.
3. **`time.Local` in tests** — force UTC in tests via `os.Setenv("TZ", "UTC")` or use `time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)` explicitly.
4. **Scanning into `time.Time` directly** — `database/sql` does not auto-parse TEXT columns into `time.Time`. Always scan into `string` and parse manually.

---

## 7. Testing Strategy

### `internal/engine/engine_test.go` — Table-Driven

**AddMonthClamped tests:**
```go
tests := []struct {
    name     string
    input    time.Time
    months   int
    expected time.Time
}{
    {"jan31+1=feb28", date(2025, 1, 31), 1, date(2025, 2, 28)},
    {"jan31+1=feb29_leap", date(2024, 1, 31), 1, date(2024, 2, 29)},
    {"feb29+12=feb28", date(2024, 2, 29), 12, date(2025, 2, 28)},
    {"mar31+1=apr30", date(2025, 3, 31), 1, date(2025, 4, 30)},
    {"dec31+1=jan31", date(2025, 12, 31), 1, date(2026, 1, 31)},
    {"jan15+1=feb15", date(2025, 1, 15), 1, date(2025, 2, 15)}, // no clamping needed
    {"jan31-1=dec31", date(2025, 1, 31), -1, date(2024, 12, 31)},
}
```

**NextPayday tests:**
```go
// bi-weekly: anchor=2025-01-03, from=2025-01-10 → next=2025-01-17
// bi-weekly: anchor=2025-01-03, from=2025-01-17 → next=2025-01-31
// monthly: anchor=2025-01-31, from=2025-01-31 → next=2025-02-28
// semi-monthly: day1=15, day2=30, from=2025-01-20 → next=2025-01-30
// semi-monthly: day1=15, day2=30, from=2025-01-30 → next=2025-02-15
```

**CanIBuyIt integration tests (with in-memory SQLite):**
```go
// Setup: account with balance=50000 (500.00), safety_buffer=10000 (100.00)
// Setup: one recurring txn next_occurrence=next_week, amount=20000 (200.00)
// item_price = 10000 (100.00)
// purchasing_power = 50000 - 20000 - 10000 = 20000 (200.00)
// 200.00 >= 100.00 → CanBuy: true, RiskLevel: LOW

// Edge: purchasing_power < item_price → CanBuy: false, RiskLevel: BLOCKED
// Edge: min_threshold=0 → no buffer deducted, LOW if can_buy
// Edge: recurring txn after next_payday → excluded from obligations
```

---

## 8. Validation Architecture

### Validation Strategy per Requirement

- **ENGINE-01:** Unit tests in `internal/engine/engine_test.go`. Must verify: Jan 31 + 1 = Feb 28 (non-leap), Jan 31 + 1 = Feb 29 (leap 2024), Mar 31 + 1 = Apr 30. Test command: `go test ./internal/engine/... -run TestAddMonthClamped -v`

- **ENGINE-02:** Unit tests for all four schedule frequencies. Bi-weekly must produce correct 14-day intervals regardless of anchor. Semi-monthly must select the minimum of two day occurrences. Test command: `go test ./internal/engine/... -run TestNextPayday -v`

- **ENGINE-03:** Integration test with in-memory SQLite. Verify obligation query excludes transactions after next_payday. Verify formula produces correct purchasing_power. Measure latency (should be <5ms in-process, well under 100ms). Test command: `go test ./internal/service/... -run TestCanIBuyIt -v`

- **ENGINE-04:** Unit test verifying each RiskLevel bracket. Test all four levels: BLOCKED (can't afford), HIGH (tight), MEDIUM (moderate), LOW (comfortable). Test command: `go test ./internal/service/... -run TestRiskLevel -v`

- **TXN-01:** Integration test: create, read, update, delete a transaction. Verify frequency enum validation rejects invalid values. Verify anchor_date required when is_recurring=true. Test command: `go test ./internal/service/... -run TestTransactionCRUD -v`

- **TXN-02:** Integration test: after recording a debit, query next_occurrence > original value. Re-running the engine must NOT include the same transaction again. Verify advance uses AddMonthClamped for monthly. Test command: `go test ./internal/service/... -run TestNextOccurrenceAdvance -v`

---

*Research completed: 2026-04-11*
*Phase: 02-domain-engine*
