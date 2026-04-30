---
phase: 1
slug: ui-standardization-shared-value
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 1 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                               |
| ---------------------- | --------------------------------------------------- |
| **Framework**          | vitest + testing-library (jsdom) |
| **Config file**        | `web/vitest.config.ts` |
| **Quick run command**  | `cd web && npm test -- --run src/__tests__/dashboard.test.tsx src/__tests__/verdict.test.tsx` |
| **Full suite command** | `cd web && npm test -- --run` |
| **Estimated runtime**  | ~20-60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npm test -- --run src/__tests__/dashboard.test.tsx src/__tests__/verdict.test.tsx` plus grep checks
- **After every plan wave:** Run `cd web && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status    |
| --------- | ---- | ---- | ----------- | --------- | ----------------- | ----------- | --------- |
| 1-01-01 | 01   | 1    | UI-STD-01 | grep | `rg -n "\.toFixed\(2\)" web/src/pages web/src/components` | ✅ | ⬜ pending |
| 1-01-02 | 01   | 1    | UI-STD-02 | unit | `cd web && npm test -- --run src/__tests__/money-value.test.tsx` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01   | 1    | UI-STD-03 | unit | `cd web && npm test -- --run src/__tests__/money-value.test.tsx` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02   | 2    | UI-STD-04 | integration | `cd web && npm test -- --run src/__tests__/dashboard.test.tsx src/__tests__/verdict.test.tsx` | ✅ | ⬜ pending |
| 1-03-01 | 03   | 2    | UI-STD-05 | grep | `rg -n "\+\{formatMoney\(|amount >= 0 \? '\+' : ''" web/src/pages web/src/components` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/__tests__/money-value.test.tsx` - stubs for UI-STD-02/UI-STD-03
- [ ] shared `MoneyValue` contract documented in component props

---

## Manual-Only Verifications

| Behavior   | Requirement | Why Manual | Test Instructions |
| ---------- | ----------- | ---------- | ----------------- |
| mobile + desktop amount consistency across list/card variants | UI-STD-01/UI-STD-05 | dual layout branches are hard to assert fully with current tests | run `cd web && npm run build`; manually verify accounts/transactions/friends pages in browser and compare same rows across mobile + desktop breakpoints |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
