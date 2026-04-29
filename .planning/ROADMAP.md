# CIBI — Roadmap (Cleaned)

**Project:** CIBI (Can I Buy It?)  
**Last updated:** 2026-04-17  
**Status:** Milestone complete (all planned implementation phases done except MCP)

---

## Reality Snapshot

- ✅ Completed phases: **1, 2, 3, 4, 5, 7, 8, 9, 10**
- ⏳ Remaining planned phase: **6 (MCP Server)**
- ✅ Phase 10 human/runtime verification completed; project is stable.

---

## Milestones (Current Truth)

- **Milestone A — Core Product (Done):** Foundation, Engine, CLI, API, Web Dashboard
- **Milestone B — Product Expansion (Done):** Multi pay schedules, Friend Ledger, balance/recurring fixes, codebase simplification
- **Milestone C — Integrations (Pending):** MCP server for Claude tools

---

## Phase Ledger

| Phase | Name | Plans | Status | Completed | Notes |
|---|---|---:|---|---|---|
| 1 | Foundation | 1/1 | ✅ Complete | 2026-04-11 | Architecture + app wiring + migrations |
| 2 | Domain + Engine | 3/3 | ✅ Complete | 2026-04-12 | Core decision engine |
| 3 | CLI | 1/1 | ✅ Complete | 2026-04-11 | Full CLI surface |
| 4 | API Layer | 3/3 | ✅ Complete | 2026-04-12 | Echo REST + graceful shutdown |
| 5 | Web Dashboard | 7/7 | ✅ Complete | 2026-04-17 | Dashboard + full CRUD + pay-schedule follow-ups |
| 6 | MCP Server | 0/ ? | ⏳ Not started | — | Next major deliverable |
| 7 | N Payment Schedules per Account | 3/3 | ✅ Complete | 2026-04-17 | Multi-schedule engine + WAIT verdict + settings CRUD |
| 8 | Friend Ledger | 3/3 | ✅ Complete | 2026-04-14 | Friends, peer debts, group events, public token pages |
| 9 | Transaction Balance + Recurring Confirm Fixes | 2/2 | ✅ Complete | 2026-04-14 | Atomic balance sync + confirm-paid workflow |
| 10 | Codebase Simplification + Logic Centralization | 5/5 | ✅ Complete | 2026-04-17 | Refactors + bug fixes + service/tests verified |

---

## Dependency Map (Corrected)

- **1 → 2 → 3 → 4 → 5**
- **7 depends on 5** (web/settings + engine evolution)
- **8 depends on 5** (friend ledger UI/API foundations)
- **9 depends on 8** (post-friend-ledger transaction correctness fixes)
- **10 depends on 9** (cleanup + centralization after feature expansion)
- **6 depends on 2** (can be implemented independently of web phases)

---

## Phase Scope (Condensed)

### Phase 6 — MCP Server (Complete)
**Goal:** Expose CIBI capabilities via MCP stdio server for Claude.

**Requirements:** MCP-01, MCP-02, MCP-03  
**Depends on:** Phase 2  
**Plans:** TBD

Success criteria:
1. Claude Desktop connects over stdio.
2. `get_financial_status` returns current financial summary.
3. `check_purchase_feasibility(amount)` matches existing engine decisions.
4. `log_transaction(amount, description)` writes transaction through app/service layer.

---

## Artifact Pointers

- Full phase artifacts: `.Complete/phases/`
- Current execution state: `.Complete/STATE.md`
- Requirements traceability source: `.Complete/REQUIREMENTS.md`

### Phase 1: UI standardization: shared value

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 0
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 1 to break down)

### Phase 2: shared debt list components

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 1
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 2 to break down)

### Phase 11: Separate non-recurrent transactions from obligations with dashboard See All

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 2
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 11 to break down)

### Phase 12: modal create

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 12 to break down)

### Phase 13: Goals foundation: goal entity, target amount, and investment ledger

**Goal:** Establish account-scoped goals with editable target amounts, immutable investment ledger entries, and atomic account-balance coupling.
**Requirements**: TBD
**Depends on:** Phase 12
**Plans:** 3/3 plans complete

Plans:
- [x] 13-01-PLAN.md — Backend goals schema/repo/service with atomic ledger+balance rules
- [x] 13-02-PLAN.md — Goals API handlers/routes/tests and OpenAPI contract
- [x] 13-03-PLAN.md — Minimal web goal flows (create + ledger entry + reverse) with tests

### Phase 14: Goals tracking: tab, dashboard widget, recurring investments, and purchase impact

**Goal:** Deliver complete goals-tracking UX and supporting APIs: Goals tab, dashboard snapshot widget, recurring investment due/confirm flow, and purchase-impact preview across check and goals surfaces.
**Requirements**: P14-01, P14-02, P14-03, P14-04, P14-05
**Depends on:** Phase 13
**Plans:** 4/4 plans complete

Success criteria:
1. Goals tab shows summary cards, urgency-sorted goals list, and recent activity with empty/loading/error/retry states.
2. Dashboard widget shows top 3-5 urgent goals with progress %, remaining amount, and quick actions (add contribution + open goals tab).
3. Recurring goal contributions support due/overdue visibility and manual confirm/post flow with source badges (manual/system/recurring).
4. Purchase-check flow shows pre-confirm per-goal impact preview with severity tiers (LOW/MEDIUM/HIGH).
5. UI refresh/invalidation shows visible updated cues after goal/ledger mutations.

Plans:
- [x] TBD (run /gsd-plan-phase 14 to break down) (completed 2026-04-29)

### Phase 15: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 14
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 15 to break down)

### Phase 16: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 15
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 16 to break down)

### Phase 17: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 16
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 17 to break down)

### Phase 18: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 17
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 18 to break down)

### Phase 19: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 18
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 19 to break down)

### Phase 20: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 19
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 20 to break down)

### Phase 21: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 20
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 21 to break down)

### Phase 22: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 21
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 22 to break down)

### Phase 23: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 22
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 23 to break down)

### Phase 24: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 23
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 24 to break down)

### Phase 25: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 24
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 25 to break down)

### Phase 26: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 25
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 26 to break down)

### Phase 27: ""

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 26
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 27 to break down)

---

## Notes

This roadmap intentionally removes stale ordering/milestone assumptions and reflects actual delivered phases and dependencies as of 2026-04-17.
