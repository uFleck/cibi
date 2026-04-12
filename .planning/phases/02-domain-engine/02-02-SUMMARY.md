---
phase: 02-domain-engine
plan: "02-02"
subsystem: database
tags: [sqlite, go, repository-pattern, sql, uuid, time-handling]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Initial schema migration (Account, Transaction, PaySchedule, SafetyBuffer tables)
provides:
  - AccountsRepo interface and SqliteAccountsRepo implementation
  - TransactionsRepo interface and SqliteTxnsRepo implementation with SumUpcomingObligations
  - PayScheduleRepo interface and SqlitePayScheduleRepo implementation
  - SafetyBufferRepo interface and SqliteSafetyBufferRepo implementation
affects: [03-service-layer, 04-api-layer, decision-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - All SQL strings confined to internal/repo/sqlite/ package
    - All time values persist as UTC RFC3339 TEXT strings
    - All money values as int64 cents
    - Nullable fields scanned via sql.NullString / sql.NullInt64
    - Transaction table quoted as "Transaction" in SQL (reserved keyword in SQLite)

key-files:
  created:
    - internal/repo/sqlite/accounts.go
    - internal/repo/sqlite/transactions.go
    - internal/repo/sqlite/pay_schedule.go
    - internal/repo/sqlite/safety_buffer.go
  modified: []

key-decisions:
  - "Transaction table requires double-quoting in SQL (\"Transaction\") — SQLite reserved keyword"
  - "SafetyBuffer.Get() returns MinThreshold=0 on sql.ErrNoRows — 0 is a valid disabled state"
  - "SumUpcomingObligations uses COALESCE(SUM(amount),0) to handle empty result sets"

patterns-established:
  - "Nullable columns: use sql.NullString/sql.NullInt64 for scanning, interface{} for inserting nil"
  - "All uuid.UUID values stored as strings via .String() and parsed via uuid.Parse()"
  - "UTC RFC3339 formatting: all time.Time values use .UTC().Format(time.RFC3339) on write, time.Parse(time.RFC3339, ...) on read"

requirements-completed: [TXN-01, TXN-02]

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 2 Plan 02: Repo Layer — internal/repo/sqlite/ Summary

**Four SQLite repository implementations (accounts, transactions, pay schedules, safety buffer) with interface contracts, UTC RFC3339 time handling, and the critical SumUpcomingObligations query for the decision engine**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-12T09:00:00Z
- **Completed:** 2026-04-12T09:05:00Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- All four repo files created in `internal/repo/sqlite/` matching the Phase 1 migration schema exactly
- `SumUpcomingObligations` query correctly implements the obligation window: `next_occurrence > after AND next_occurrence <= onOrBefore`
- `AdvanceNextOccurrence` supports optional `*sql.Tx` for atomic updates
- `SafetyBuffer.Get()` handles missing row gracefully (returns 0, which disables the buffer)
- All time values use UTC RFC3339 — consistent persistence pattern across entire package
- `Transaction` table properly quoted as `"Transaction"` in all SQL statements (SQLite reserved keyword)

## Task Commits

Files were present in the repo from prior phase consolidation work:

1. **Task 02-02-01: accounts.go** — already committed in `57a6328`
2. **Task 02-02-02: transactions.go** — already committed in `57a6328`
3. **Task 02-02-03: pay_schedule.go** — already committed in `57a6328`
4. **Task 02-02-04: safety_buffer.go** — already committed in `57a6328`

All four files build cleanly: `go build ./internal/repo/sqlite/...` exits 0.

## Files Created/Modified
- `internal/repo/sqlite/accounts.go` — AccountsRepo interface + SqliteAccountsRepo with full CRUD, UnsetDefaults, UpdateBalance (tx-aware)
- `internal/repo/sqlite/transactions.go` — TransactionsRepo interface + SqliteTxnsRepo with SumUpcomingObligations and AdvanceNextOccurrence
- `internal/repo/sqlite/pay_schedule.go` — PayScheduleRepo interface + SqlitePayScheduleRepo with upsert-style UpdateByAccountID
- `internal/repo/sqlite/safety_buffer.go` — SafetyBufferRepo interface + SqliteSafetyBufferRepo with delete-then-insert upsert

## Decisions Made
- `"Transaction"` must be double-quoted in all SQL — SQLite treats `Transaction` as a reserved keyword without quotes (fix applied in commit `064fea9`)
- `SafetyBuffer.Get()` returns `{MinThreshold: 0}` on `sql.ErrNoRows` — 0 is a valid value meaning buffer disabled (per SCHEMA-04)
- Delete-then-insert upsert for SafetyBuffer ensures single-row invariant without requiring a UNIQUE constraint

## Deviations from Plan

None — plan executed exactly as written. Files matched the plan specification. The `"Transaction"` quoting deviation from the literal plan text (which used unquoted `Transaction`) was a pre-existing correct fix in the committed code (applied in commit `064fea9`).

## Issues Encountered
None — all four files built cleanly, all acceptance criteria passed on first verification.

## Next Phase Readiness
- All four repo implementations ready for service layer consumption
- Interfaces (`AccountsRepo`, `TransactionsRepo`, `PayScheduleRepo`, `SafetyBufferRepo`) are the contracts the service layer must depend on
- `SumUpcomingObligations` is the critical query the decision engine service will use for purchasing power calculation

---
*Phase: 02-domain-engine*
*Completed: 2026-04-12*
