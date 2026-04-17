---
phase: 10-codebase-simplification-and-logic-centralization
plan: "01"
subsystem: database
tags: [sqlite, refactor, migrations, engine]
requires: []
provides:
  - Consolidated optional-account repo methods for PeerDebt and GroupEvent
  - Dynamic single-statement UPDATE builders for PeerDebt and GroupEvent
  - Shared installment due-date helper in internal/engine
  - Migration enforcing NOT NULL account_id for PeerDebt and GroupEvent
affects: [service, handler, engine, migrations]
tech-stack:
  added: []
  patterns: [optional-account-pointer-filter, dynamic-update-builder, shared-date-helper]
key-files:
  created:
    - internal/repo/sqlite/peer_debt_test.go
    - internal/repo/sqlite/group_event_test.go
    - internal/repo/sqlite/repo_test_helpers_test.go
    - internal/engine/installment.go
    - internal/migrations/20260416000006_account_id_not_null.go
  modified:
    - internal/repo/sqlite/peer_debt.go
    - internal/repo/sqlite/group_event.go
    - internal/service/peer_debt.go
    - internal/service/group_event.go
    - internal/service/engine.go
key-decisions:
  - "Use single optional accountID *uuid.UUID signatures instead of scoped/unscoped method pairs"
  - "Use one dynamic UPDATE statement per repo Update call with explicit no-fields guard"
  - "Keep parse-error behavior at callsites and centralize only due-date math in engine helper"
requirements-completed: [TXN-03, API-01, PEER-06]
duration: 16 min
completed: 2026-04-17
---

# Phase 10 Plan 01: Codebase Simplification and Logic Centralization Summary

**Repo method duplication removed via optional account filters, dynamic UPDATE builders added, installment due-date math centralized, and account_id NOT NULL migration added.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-17T01:18:10Z
- **Completed:** 2026-04-17T01:34:31Z
- **Tasks:** 4/4 implemented
- **Files modified:** 10

## Accomplishments
- Consolidated PeerDebtRepo duplicate with-account / without-account method pairs to optional-account signatures.
- Consolidated GroupEventRepo duplicate with-account / without-account method pairs to optional-account signatures.
- Replaced multi-Exec field-at-a-time updates with one dynamic UPDATE statement per repo.
- Added `engine.NextInstallmentDue` and switched repo/service due-date calculations to shared helper.
- Added migration `20260416000006_account_id_not_null.go` to enforce `account_id NOT NULL` for PeerDebt and GroupEvent.

## Task Commits

1. **Task 1: Consolidate PeerDebtRepo method pairs** - `9478f5a` (feat)
2. **Task 2: Consolidate GroupEventRepo method pairs** - `047ce2a` (feat)
3. **Task 3: Dynamic UPDATE builders** - `46b1d0c` (refactor)
4. **Task 4: Installment helper + NOT NULL migration** - `5d7e424` (feat)

## Files Created/Modified
- `internal/repo/sqlite/peer_debt.go` - optional-account methods + dynamic update + shared due-date helper usage
- `internal/repo/sqlite/group_event.go` - optional-account methods + dynamic update
- `internal/service/peer_debt.go` - repo signature adaptation + shared due-date helper usage
- `internal/service/group_event.go` - repo signature adaptation for optional account filters
- `internal/service/engine.go` - updated calls to consolidated repo signatures
- `internal/engine/installment.go` - `NextInstallmentDue(...)`
- `internal/migrations/20260416000006_account_id_not_null.go` - NOT NULL enforcement migration
- `internal/repo/sqlite/peer_debt_test.go` - nil/non-nil account filter coverage
- `internal/repo/sqlite/group_event_test.go` - nil/non-nil account filter coverage
- `internal/repo/sqlite/repo_test_helpers_test.go` - shared sqlite repo test helpers

## Decisions Made
- Consolidated account scoping at repo boundary using `*uuid.UUID` to remove duplicated methods while preserving semantics.
- Dynamic UPDATE builders now fail fast with explicit `no fields provided` error.
- Kept migration transactional and rebuilt dependent `GroupEventParticipant` table to preserve FK integrity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Service and engine callsites broken by repo signature consolidation**
- **Found during:** Task 3 verification (`go build ./...`)
- **Issue:** Service/engine still called removed `*ByAccount` repo methods.
- **Fix:** Updated service and engine callsites to new optional-account signatures.
- **Files modified:** `internal/service/peer_debt.go`, `internal/service/group_event.go`, `internal/service/engine.go`
- **Verification:** `nix shell nixpkgs#go nixpkgs#gcc -c go build ./...`
- **Committed in:** `46b1d0c`

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Required for successful compile after API consolidation; no architecture change.

## Issues Encountered

Full-suite acceptance command failed on out-of-scope pre-existing handler test compile errors:

- `internal/handler/check_test.go:102:24` — `undefined: uuid`
- `internal/handler/transactions_test.go` mock missing `ConfirmRecurring` method in `TransactionsServiceIface`

Deferred to: `.planning/phases/10-codebase-simplification-and-logic-centralization/deferred-items.md`

## Known Stubs

None.

## Next Phase Readiness

Core plan implementation is complete and committed, but **acceptance remains blocked** by pre-existing handler test failures outside this plan scope. Resolve deferred handler test issues, then re-run:

- `nix shell nixpkgs#go nixpkgs#gcc -c go test ./... -count=1`

## Self-Check: PASSED

- Summary file exists.
- Task commits exist in git log.
- Blockers documented clearly.
