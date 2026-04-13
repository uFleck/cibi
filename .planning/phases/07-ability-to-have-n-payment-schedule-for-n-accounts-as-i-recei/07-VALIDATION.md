---
phase: 7
slug: ability-to-have-n-payment-schedule-for-n-accounts-as-i-recei
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `go test` (backend) + `vitest` (frontend) |
| **Config file** | `go.mod` (Go) / `web/vite.config.ts` (frontend) |
| **Quick run command** | `go test ./internal/...` |
| **Full suite command** | `go test ./... && cd web && npm run test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `go test ./internal/...`
- **After every plan wave:** Run `go test ./... && cd web && npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | SCHEMA-03 | — | N/A | migration | `go test ./internal/migrations/...` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | SCHEMA-03 | — | N/A | unit | `go test ./internal/repo/sqlite/... -run TestPaySchedule` | ❌ W0 | ⬜ pending |
| 7-01-03 | 01 | 2 | — | — | N/A | unit | `go test ./internal/service/... -run TestPaySchedule` | ❌ W0 | ⬜ pending |
| 7-01-04 | 01 | 2 | ENGINE-03 | — | N/A | unit | `go test ./internal/service/... -run TestCanIBuyIt` | ❌ W0 | ⬜ pending |
| 7-01-05 | 01 | 2 | ENGINE-04 | — | WAIT verdict only when next-payday affords | unit | `go test ./internal/service/... -run TestWaitVerdict` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 1 | API-01 | — | N/A | integration | `go test ./internal/handler/... -run TestPaySchedule` | ❌ W0 | ⬜ pending |
| 7-03-01 | 03 | 1 | WEB-01 | — | N/A | component | `cd web && npm run test -- --run PaySchedule` | ❌ W0 | ⬜ pending |
| 7-03-02 | 03 | 2 | WEB-04 | — | N/A | component | `cd web && npm run test -- --run WaitVerdict` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `internal/repo/sqlite/pay_schedule_test.go` — stubs for ListByAccountID, Insert, UpdateByID, DeleteByID, DeleteAllByAccountID
- [ ] `internal/service/pay_schedule_test.go` — stubs for Create, Update, Delete, List service methods
- [ ] `internal/service/engine_test.go` — stubs for multi-schedule CanIBuyIt + WAIT verdict
- [ ] `internal/handler/pay_schedule_test.go` — stubs for GET/POST/PATCH/DELETE routes
- [ ] `web/src/pages/settings.test.tsx` — stub for PaySchedule CRUD page
- [ ] `web/src/components/WaitVerdict.test.tsx` — stub for WAIT state in CheckWidget

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings page renders schedule list in browser | WEB-01 | Visual layout can't be asserted in unit tests | Open http://localhost:5173/settings, add 2 schedules, confirm both appear |
| WAIT verdict amber card animates correctly | WEB-04 | Motion animation not testable in vitest | Enter amount that triggers WAIT, confirm amber fade-in animation plays |
| Delete schedule confirmation dialog | WEB-01 | window.confirm is not unit-testable | Click delete, confirm dialog appears with correct text |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
