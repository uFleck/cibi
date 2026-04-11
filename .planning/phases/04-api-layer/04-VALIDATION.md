---
phase: 4
slug: api-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Go stdlib `testing` + `net/http/httptest` |
| **Config file** | none — Wave 0 installs test files |
| **Quick run command** | `go test ./internal/handler/...` |
| **Full suite command** | `go test ./...` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `go test ./internal/handler/...`
- **After every plan wave:** Run `go test ./...`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | API-01 | — | N/A | unit | `go test ./internal/handler/... -run TestListAccounts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 0 | API-01 | — | N/A | unit | `go test ./internal/handler/... -run TestCreateAccount` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 0 | API-01 | — | N/A | unit | `go test ./internal/handler/... -run TestUpdateTransaction` | ❌ W0 | ⬜ pending |
| 4-01-04 | 01 | 1 | API-01 | T-4-01 | Input bound+validated; invalid returns 400 not 500 | integration | `go test ./internal/handler/... -run TestCheck` | ❌ W0 | ⬜ pending |
| 4-01-05 | 01 | 1 | API-03 | T-4-02 | Malformed body → {"error":"..."} not 500 | unit | `go test ./internal/handler/... -run TestBadRequest` | ❌ W0 | ⬜ pending |
| 4-01-06 | 01 | 1 | API-03 | T-4-02 | Uniform error shape across all routes | unit | `go test ./internal/handler/... -run TestErrorShape` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `internal/handler/accounts_test.go` — stubs for API-01 account routes
- [ ] `internal/handler/transactions_test.go` — stubs for API-01 transaction routes
- [ ] `internal/handler/check_test.go` — stubs for API-01 POST /check
- [ ] `internal/handler/errors_test.go` — stubs for API-03 error shape
- [ ] `internal/handler/testhelpers_test.go` — shared `httptest.NewRecorder` / mock service setup

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Graceful shutdown on SIGTERM | API-03 | Signal handling can't be automated in `go test` | Run `cibi-api`, send `kill -SIGTERM <pid>`, verify clean exit within 10s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
