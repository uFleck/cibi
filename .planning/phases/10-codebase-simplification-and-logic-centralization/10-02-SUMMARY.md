---
phase: 10-codebase-simplification-and-logic-centralization
plan: "02"
subsystem: api
tags: [go, echo, sqlite, service-layer, refactor]
requires:
  - phase: 10-01
    provides: optional-account repository contract direction and simplification baseline
provides:
  - Consolidated service account-scoping contracts routed through pointer-based repo methods
  - Public friend endpoint orchestration moved from handler into FriendService
  - Atomic DeleteTransaction balance reversal with tx-aware repo delete
  - RecordDebit dead path removed after caller audit
affects: [handler-interfaces, service-contracts, public-endpoints, transaction-balance]
tech-stack:
  added: []
  patterns: [pointer-based optional account scope, thin-handler orchestration, atomic delete-plus-balance-update]
key-files:
  created: []
  modified:
    - internal/service/peer_debt.go
    - internal/service/group_event.go
    - internal/handler/peer_debt.go
    - internal/handler/group_event.go
    - internal/handler/friend.go
    - internal/service/friend.go
    - internal/handler/public.go
    - internal/service/transactions.go
    - internal/repo/sqlite/transactions.go
key-decisions:
  - "Kept pointer-based consolidated methods as canonical path and retained compatibility wrappers where needed to avoid cross-handler breakage."
  - "PublicHandler now delegates friend public payload assembly to FriendService.GetPublicFriendView(token)."
  - "DeleteTransaction now performs delete + balance reversal in one SQL transaction using tx-aware repo delete."
  - "RecordDebit removed because no production callers exist; recurring debit flow remains ConfirmRecurring."
patterns-established:
  - "Service methods for account scoping should pass nil (unscoped) or &accountID (scoped) to consolidated repo methods."
  - "Public handlers should map DTOs; orchestration loops stay in service layer."
requirements-completed: [TXN-01, TXN-02, API-01, PEER-04, PEER-06]
duration: 18 min
completed: 2026-04-17
---

# Phase 10 Plan 02: Codebase simplification and logic centralization summary

**Service contracts now route through consolidated optional-account repo methods, public friend endpoint orchestration moved into service, and transaction deletion now atomically reverses account balance.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-17T03:00:30Z
- **Completed:** 2026-04-17T03:18:53Z
- **Tasks:** 4
- **Files modified:** 9

## Accomplishments
- Unified account-scoped/unscoped service paths to pointer-based repo calls.
- Moved `GetFriendByToken` business orchestration out of handler into `FriendService.GetPublicFriendView`.
- Fixed `DeleteTransaction` corruption risk with atomic delete + balance reversal.
- Removed unused `RecordDebit` dead path after caller audit.

## Task Commits

1. **Task 1: Align service methods to consolidated optional-account repo contracts (D-02)** - `91f0e3f` (refactor)
2. **Task 2: Move GetFriendByToken business logic to service and thin public handler (D-07)** - `fe78251` (feat)
3. **Task 3: Fix DeleteTransaction balance reversal atomically (D-08)** - `ca3fc71` (fix)
4. **Task 4: Resolve RecordDebit dead-path guard (D-09)** - `431451f` (refactor)

## Files Created/Modified
- `internal/service/peer_debt.go` - consolidated account-scoping entry points and compatibility wrappers
- `internal/service/group_event.go` - consolidated account-scoping entry points and compatibility wrappers
- `internal/handler/peer_debt.go` - pointer-based account-scoped service interface usage
- `internal/handler/group_event.go` - pointer-based account-scoped service interface usage
- `internal/handler/friend.go` - summary interfaces switched to pointer-based account-scoped methods
- `internal/service/friend.go` - added `PublicFriendView` DTO + `GetPublicFriendView(token)` orchestration
- `internal/handler/public.go` - `GetFriendByToken` thinned to adapter that maps service DTO to response
- `internal/repo/sqlite/transactions.go` - `DeleteByID(id, tx)` tx-aware signature and implementation
- `internal/service/transactions.go` - atomic `DeleteTransaction` reversal, removed dead `RecordDebit`

## Decisions Made
- Consolidation completed via pointer account argument at service/repo boundary (`nil` unscoped, `&accountID` scoped).
- Public endpoint host/group/debt orchestration now belongs to FriendService, not handler.
- Transaction deletion must mirror create/update atomicity by mutating transaction + account balance in same tx.
- Dead method `RecordDebit` removed instead of retaining guarded unused path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Handler summary interfaces still depended on legacy by-account service methods**
- **Found during:** Task 1
- **Issue:** `internal/handler/friend.go` interface still expected legacy `*ByAccount` signatures, conflicting with consolidated pointer-based service contracts.
- **Fix:** Updated summary interfaces and call sites to pointer-based account-scoped signatures.
- **Files modified:** `internal/handler/friend.go`
- **Verification:** Static signature/call-site check via source read/grep.
- **Committed in:** `91f0e3f`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; required to complete contract consolidation cleanly.

## Issues Encountered
- Go toolchain unavailable in environment (`go: command not found`). Runtime verification commands could not execute.
- Per user instruction, static acceptance checks were performed with read/grep for required symbols and call-path changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 10-02 code changes complete and atomically committed per task.
- Runtime test/build verification remains pending until Go toolchain is available.
- Ready for next plan execution after environment restores `go`.

## Self-Check: PASSED
- SUMMARY file exists.
- All task commit hashes were found in git history.
