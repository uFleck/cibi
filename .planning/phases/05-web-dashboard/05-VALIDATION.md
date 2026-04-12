---
phase: 5
slug: web-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) + go test (backend) |
| **Config file** | `web/vite.config.ts` (vitest inline config) |
| **Quick run command** | `cd web && npm run test -- --run` |
| **Full suite command** | `cd web && npm run test -- --run && go test ./...` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npm run test -- --run`
- **After every plan wave:** Run `cd web && npm run test -- --run && go test ./...`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | WEB-01 | — | N/A | build | `cd web && npm run build` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | WEB-01 | — | N/A | unit | `go test ./cmd/cibi-api/...` | ✅ | ⬜ pending |
| 5-02-01 | 02 | 1 | WEB-02 | — | N/A | unit | `cd web && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 2 | WEB-02 | — | N/A | unit | `cd web && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 2 | WEB-03 | — | N/A | unit | `cd web && npm run test -- --run` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 2 | WEB-04 | — | N/A | manual | See manual verifications | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/__tests__/dashboard.test.tsx` — stubs for WEB-01, WEB-02 (balance display + polling)
- [ ] `web/src/__tests__/verdict.test.tsx` — stubs for WEB-03 (verdict card animation)
- [ ] `npm install vitest @testing-library/react @testing-library/user-event jsdom` — if not already present

*Existing Go test infrastructure covers backend routes.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Verdict card animation (YES/NO) | WEB-03 | Animation is visual; cannot be fully asserted in jsdom | Load app, enter amount, verify green YES or red NO card animates in |
| Mobile/desktop layout | WEB-04 | Responsive layout requires real viewport or browser DevTools | Open app at 375px and 1280px; verify no overflow, inputs usable |
| Background polling refresh | WEB-02 | Requires live server + observable network requests | Open DevTools Network tab; verify `/api/accounts/default` refetches every ~30s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
