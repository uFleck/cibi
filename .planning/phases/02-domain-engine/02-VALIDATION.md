---
phase: 2
slug: domain-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `go test` (standard library) |
| **Config file** | none — no external test framework needed |
| **Quick run command** | `go test ./internal/engine/... -v` |
| **Full suite command** | `go test ./internal/... -v` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `go test ./internal/engine/... -v`
- **After every plan wave:** Run `go test ./internal/... -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 2-01-01 | 01 | 1 | ENGINE-01 | unit | `go test ./internal/engine/... -run TestAddMonthClamped -v` | ⬜ pending |
| 2-01-02 | 01 | 1 | ENGINE-02 | unit | `go test ./internal/engine/... -run TestNextPayday -v` | ⬜ pending |
| 2-02-01 | 02 | 2 | ENGINE-03, ENGINE-04 | integration | `go test ./internal/service/... -run TestCanIBuyIt -v` | ⬜ pending |
| 2-02-02 | 02 | 2 | ENGINE-04 | unit | `go test ./internal/service/... -run TestRiskLevel -v` | ⬜ pending |
| 2-03-01 | 03 | 2 | TXN-01 | integration | `go test ./internal/service/... -run TestTransactionCRUD -v` | ⬜ pending |
| 2-03-02 | 03 | 2 | TXN-02 | integration | `go test ./internal/service/... -run TestNextOccurrenceAdvance -v` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `internal/engine/engine_test.go` — stubs for ENGINE-01, ENGINE-02
- [ ] `internal/service/engine_test.go` — stubs for ENGINE-03, ENGINE-04
- [ ] `internal/service/transactions_test.go` — stubs for TXN-01, TXN-02

*No external test framework to install — standard `go test` only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CanIBuyIt completes in under 100ms | ENGINE-03 | Performance — hard to assert in unit test portably | Run `go test ./internal/service/... -run TestCanIBuyIt -bench=. -benchtime=100x` and verify mean < 1ms |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
