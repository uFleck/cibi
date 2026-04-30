---
phase: 13
slug: goals-foundation-goal-entity-target-amount-and-investment-ledger
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 13 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                               |
| ---------------------- | --------------------------------------------------- |
| **Framework**          | go test + vitest                                    |
| **Config file**        | `vitest.config.ts` (web); Go default tooling        |
| **Quick run command**  | `go test ./internal/service ./internal/handler -run Goals -count=1` |
| **Full suite command** | `go test ./... && cd web && npm test -- --run`      |
| **Estimated runtime**  | ~120 seconds                                        |

---

## Sampling Rate

- **After every task commit:** Run `go test ./internal/service ./internal/handler -run Goals -count=1`
- **After every plan wave:** Run `go test ./...`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status    |
| --------- | ---- | ---- | ----------- | --------- | ----------------- | ----------- | --------- |
| 13-01-01 | 01   | 1    | TBD-goal-lifecycle | unit/service | `go test ./internal/service -run Goals -count=1` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02   | 1    | TBD-api-contract | handler | `go test ./internal/handler -run Goals -count=1` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03   | 2    | TBD-web-goal-flow | web component/integration | `cd web && npm test -- --run goals` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `internal/repo/sqlite/goals_test.go` - repo CRUD + ledger invariants
- [ ] `internal/service/goals_test.go` - atomicity, insufficient funds, completion transitions
- [ ] `internal/handler/goals_test.go` - request validation + cents conversion + error codes
- [ ] `web/src/__tests__/goals*.test.tsx` - mutation flow + optimistic refresh

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
