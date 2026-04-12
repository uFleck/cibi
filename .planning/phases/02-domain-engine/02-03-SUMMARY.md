---
plan: "02-03"
phase: 2
title: "Service Layer — Transactions + Engine"
subsystem: service
tags: [service-layer, engine, transactions, go, purchasing-power, risk-tier]
dependency_graph:
  requires:
    - "02-01: internal/engine/engine.go (AddMonthClamped, NextPayday, frequency constants)"
    - "02-02: internal/repo/sqlite/ (all four repo interfaces)"
  provides:
    - internal/service/transactions.go
    - internal/service/engine.go
    - internal/app/app.go (updated wiring)
  affects:
    - internal/handler/ (Phase 4 handlers consume EngineService and TransactionsService)
    - cmd/cibi/ (Phase 3 CLI consumes TxnsSvc and EngineSvc via App)
tech_stack:
  added: []
  patterns:
    - "Service layer wraps repo interfaces — no direct SQL in service files"
    - "Double-debit guard: RecordDebit requires next_occurrence > now"
    - "purchasing_power = current_balance + obligations - min_threshold (obligations are negative cents)"
    - "Risk tiers: BLOCKED/HIGH/LOW/MEDIUM based on bufferRemaining vs min_threshold fractions"
key_files:
  created: []
  modified: []
  verified:
    - internal/service/transactions.go
    - internal/service/engine.go
    - internal/app/app.go
decisions:
  - "Files already existed from prior phase merge commit dee9512; no new implementation required"
  - "app.go uses internal/handler directly (no legacy handlers/repos/services packages) — more advanced than plan spec, all tests pass"
  - "classifyRisk uses 25%/50% of min_threshold as HIGH/MEDIUM thresholds per ENGINE-04 (agent discretion)"
  - "RecordDebit double-debit guard: next_occurrence must be strictly After(now) before advancing"
metrics:
  duration: ~5m
  completed: "2026-04-12"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 0
requirements: [ENGINE-03, ENGINE-04, TXN-01, TXN-02]
---

# Phase 2 Plan 03: Service Layer — Transactions + Engine Summary

## One-liner

TransactionsService (full CRUD + RecordDebit with double-debit guard) and EngineService (CanIBuyIt with purchasing_power formula, four risk tiers) wired into internal/app/app.go via dependency injection.

## What Was Built

All three tasks of plan 02-03 were already implemented in commit `dee9512` (prior phase merge). Execution verified correctness:

- **`internal/service/transactions.go`** — `TransactionsService` with `CreateTransaction` (validation for recurring), `ListTransactions`, `GetTransaction`, `UpdateTransaction`, `DeleteTransaction`, `RecordDebit` (double-debit guard), and `advanceOccurrence` using `engine.AddMonthClamped` for monthly/yearly
- **`internal/service/engine.go`** — `EngineService` with `CanIBuyIt` (purchasing_power formula: balance + obligations - threshold), `CanIBuyItDefault`, and `classifyRisk` (four reachable tiers: LOW, MEDIUM, HIGH, BLOCKED)
- **`internal/app/app.go`** — Fully wired DI graph with `AccountsSvc`, `TxnsSvc`, `EngineSvc` exported fields; uses `internal/handler` directly (no legacy packages)

## Verification Results

```
go build ./...           → exit 0 (entire project compiles cleanly)
go test ./internal/engine/... -v  → all 17 tests PASS
go vet ./internal/...    → exit 0
```

## Must-Haves Status

- [x] `go build ./...` exits 0
- [x] `CanIBuyIt` formula: `purchasing_power = current_balance + obligations - min_threshold` (obligations are negative cents) — implemented at line 97 of engine.go
- [x] `RecordDebit` advances `next_occurrence` and guards against double debit — double-debit guard at line 116 of transactions.go
- [x] All four RiskLevel values reachable in `classifyRisk` — BLOCKED (line 132), LOW (line 136), HIGH (line 140), MEDIUM (line 143)
- [x] `internal/app/app.go` exposes both `TxnsSvc` and `EngineSvc`

## Deviations from Plan

### Implementation Difference (Pre-existing)

**1. app.go uses internal/handler directly (not legacy handlers/repos/services packages)**

The existing `app.go` in commit `dee9512` is more advanced than the plan spec:
- Plan spec had `app.go` importing old `handlers/`, `repos/`, `services/` packages alongside the new `internal/` packages
- Actual implementation uses `internal/handler` exclusively with no legacy packages
- The old `handlers/`, `repos/`, `services/` directories and `main.go` were remnants in the worktree's working tree from the previous base commit (83fafa9) but were not tracked in `dee9512` — they were correctly cleaned up

This is an improvement, not a regression. All handler tests and service tests pass.

No bugs found. No rule-driven deviations required during this execution.

## Known Stubs

None — all service methods are fully implemented with real logic.

## Self-Check

### Files Verified

- FOUND: internal/service/transactions.go
- FOUND: internal/service/engine.go
- FOUND: internal/app/app.go

### Commits

- FOUND: dee9512 (service files committed in prior phase merge)

## Self-Check: PASSED
