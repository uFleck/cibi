---
phase: 01
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-11
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | go test |
| **Config file** | none |
| **Quick run command** | `go build ./... && go test ./... -short` |
| **Full suite command** | `go test ./... -v` |
| **Estimated runtime** | ~1 seconds |

---

## Sampling Rate

- **After every task commit:** Run `go build ./...`
- **After every plan wave:** Run `go test ./...`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | ARCH-01 | — | N/A | unit | `go build ./cmd/cibi-api` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | ARCH-02..04 | — | N/A | unit | `go test ./internal/app` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | ARCH-05..06 | — | N/A | unit | `go test ./internal/migrations` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | SCHEMA-01..05 | — | N/A | syntax | `go build ./...` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `internal/app/app_test.go` — stubs for app initialization tests
- [ ] `internal/migrations/migrations_test.go` — stubs to run goose migrations against purely in-memory sqlite

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI startup | ARCH-01 | No logic just init | Run `go run ./cmd/cibi-api` and verify flags parse without panic |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-11
