---
phase: 10-codebase-simplification-and-logic-centralization
verified: 2026-04-17T00:00:00Z
status: human_needed
score: 10/10 must-haves verified (static)
overrides_applied: 0
human_verification:
  - test: "Install Go toolchain and run: go test ./internal/service -count=1 && go test ./internal/handler -count=1 && go test ./internal/engine -count=1 && go build ./..."
    expected: "All commands exit 0"
    why_human: "Current runtime lacks go binary; automated runtime verification blocked"
  - test: "Open /public/friend/:token and /public/group/:token in browser"
    expected: "Endpoints still render expected payload/UX after service orchestration move"
    why_human: "End-to-end browser/API behavior not runnable in this session"
---

# Phase 10 Verification Report

## Goal
Codebase simplification and logic centralization completed while preserving behavior.

## Static Evidence (verified)

| Check | Status | Evidence |
|---|---|---|
| Service/account optional scope paths present | VERIFIED | `internal/service/peer_debt.go` and `internal/service/group_event.go` contain unscoped/scoped calls (`GetAll(nil)`, `GetAll(&accountID)`) |
| Public friend orchestration moved to service | VERIFIED | `internal/service/friend.go` has `GetPublicFriendView(token)` |
| Public handler is thin adapter | VERIFIED | `internal/handler/public.go` uses `GetPublicFriendView(token)` |
| DeleteTransaction atomic reversal implemented | VERIFIED | `internal/service/transactions.go` has `DeleteByID(id, tx)` and `newBalance := acc.CurrentBalance - t.Amount` |
| Tx-aware repo delete exists | VERIFIED | `internal/repo/sqlite/transactions.go` has `DeleteByID(id uuid.UUID, tx *sql.Tx)` |
| RecordDebit dead path removed | VERIFIED | No `func (s *TransactionsService) RecordDebit(` in `internal/service/transactions.go` |
| Transaction regression tests added | VERIFIED | `internal/service/transactions_test.go` includes delete/confirm regression tests |
| Peer debt scoped-path tests added | VERIFIED | `internal/service/peer_debt_test.go` includes `TestGetFriendDebtBreakdownByAccount_UsesScopedPath` |
| Group event scoped-path tests added | VERIFIED | `internal/service/group_event_test.go` includes `TestListEventsByAccount_UsesScopedRepoPath` |
| Engine/public tests added | VERIFIED | `internal/engine/installment_test.go` + `internal/handler/public_test.go` include required cases |

## Runtime Verification Blocker

`go: command not found` in this execution environment.

Blocked commands:
- `go test ./internal/service -count=1`
- `go test ./internal/handler -count=1`
- `go test ./internal/engine -count=1`
- `go build ./...`

## Result

Static must-haves are satisfied.
Phase requires human/runtime verification before final pass/closure.
