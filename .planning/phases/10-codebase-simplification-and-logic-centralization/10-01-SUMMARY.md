---
plan: "10-01"
phase: 10
title: "Repo Simplification Foundation"
subsystem: backend

tags: [repo, sqlite, migration, engine]
dependency_graph:
  requires: []
  provides:
    - internal/repo/sqlite/peer_debt.go
    - internal/repo/sqlite/group_event.go
    - internal/engine/installment.go
    - internal/migrations/20260416000006_account_id_not_null.go
  affects:
    - internal/service/peer_debt.go
tech_stack:
  added: []
  patterns: [optional-account-filter, dynamic-update-builder, single-statement-update]
key_files:
  created:
    - internal/engine/installment.go
    - internal/migrations/20260416000006_account_id_not_null.go
  modified:
    - internal/repo/sqlite/peer_debt.go
    - internal/repo/sqlite/group_event.go
    - internal/service/peer_debt.go
  verified:
    - internal/repo/sqlite/peer_debt.go
    - internal/repo/sqlite/group_event.go
    - internal/engine/installment.go
    - internal/migrations/20260416000006_account_id_not_null.go
decisions:
  - "Consolidated account-scoped/unscoped repo paths into optional accountID signatures"
  - "Converted repo patch updates to one dynamic UPDATE statement per call"
  - "Centralized installment next-due math in engine.NextInstallmentDue"
  - "Enforced NOT NULL account_id via migration rebuild/swap for PeerDebt and GroupEvent"
metrics:
  completed: "2026-04-17"
  tasks_completed: 4
  tasks_total: 4
requirements: [TXN-03, API-01, PEER-06]
---

# Phase 10 Plan 01 Summary

## One-liner
Unified repo access patterns, simplified update logic, centralized installment due-date calculation, and tightened DB integrity with NOT NULL account ownership.

## What Was Built
- PeerDebt repo methods consolidated to optional `accountID *uuid.UUID` filtering.
- GroupEvent repo methods consolidated to optional `accountID *uuid.UUID` filtering.
- `Update` methods in both repos now build one dynamic SQL statement.
- New `internal/engine/installment.go` with `NextInstallmentDue`.
- New migration `20260416000006_account_id_not_null.go` enforcing `account_id NOT NULL` for PeerDebt/GroupEvent.
- Service debt breakdown now uses shared due-date helper.

## Commits
- `9478f5a` feat(10-01): consolidate peer debt optional account methods
- `047ce2a` feat(10-01): consolidate group event optional account methods
- `46b1d0c` refactor(10-01): use dynamic single-statement repo updates
- `5d7e424` feat(10-01): centralize installment due-date and add not-null migration

## Verification
Planned Go checks could not be executed in this environment (Go toolchain missing in PATH).

## Self-Check
- [x] Optional-account repo signatures in place
- [x] Dynamic single-statement updates in both repos
- [x] Shared `engine.NextInstallmentDue` used
- [x] Migration for NOT NULL account_id added
- [ ] `go test ./...` (blocked: go binary unavailable)

## Self-Check: PARTIAL (toolchain unavailable)
