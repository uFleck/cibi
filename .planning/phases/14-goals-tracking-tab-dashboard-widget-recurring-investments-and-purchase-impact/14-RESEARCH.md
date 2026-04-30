# Phase 14: Goals tracking: tab, dashboard widget, recurring investments, and purchase impact - Research

**Researched:** 2026-04-29
**Domain:** Goals tracking UX + API contract extension + engine impact explanation
**Confidence:** HIGH

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Goals tab uses a sectioned layout: top summary cards, goals list, and recent ledger activity block.
- **D-02:** Goals list uses row/table-style density with progress bar and key amounts.
- **D-03:** Default ordering is urgency-first (closest target date + urgency signal), not completion-first.
- **D-04:** Activity visibility includes both global recent goal activity and per-goal activity context.
- **D-05:** Widget shows a multi-goal snapshot (top 3-5 goals), not single-goal only.
- **D-06:** Widget includes quick actions (add contribution + open Goals tab) in addition to read metrics.
- **D-07:** Each item shows both percent progress and remaining amount.
- **D-08:** Snapshot prioritization uses urgency (target date + gap), not highest percent complete.
- **D-09:** Show both upcoming recurring schedule and executed ledger history.
- **D-10:** Due recurring contributions use manual confirm/post flow (not fully automatic posting).
- **D-11:** Missed dues are shown as overdue; user posts selectively (no forced auto-catchup).
- **D-12:** UI shows source badges for entries (manual/system/recurring).
- **D-13:** Purchase impact is shown in both purchase-check flow and goals surfaces.
- **D-14:** Impact is presented per affected goal (not only global message).
- **D-15:** Impact uses tiered severity labels (low/medium/high impact).
- **D-16:** Impact preview is shown before transaction confirmation.
- **D-17:** Empty-goals state includes guided CTA (create first goal + short explainer).
- **D-18:** Loading uses skeletons + progressive reveal (not full blocking spinner-only mode).
- **D-19:** Errors are inline-recoverable with retry, plus toast notifications.
- **D-20:** Freshness/conflict uses query refresh + mutation invalidation + visible “updated” cues.

### Claude's Discretion
- Exact copywriting, micro-layout spacing, and visual token choices.
- Exact thresholds and formula details for urgency scoring (as long as urgency-first intent is preserved).
- Exact badge visuals for source/severity while preserving semantic meaning.

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.

## Project Constraints (from CLAUDE.md)
- No extra local constraints declared.

## Summary
Phase 13 already built goals foundation (goal CRUD, ledger append/reverse, atomic account-balance coupling). Phase 14 should avoid schema churn unless needed for recurring metadata and impact payloads. Best path: add thin backend read-model endpoints for tracking + recurring due items + purchase impact preview, then upgrade Goals tab and dashboard with existing UI primitives (`StatCards`, `CompactEntityTable`, `MoneyValue`, `CheckWidget` pattern).

Main quality risk is contract drift: frontend types include `WAIT` and extra check fields, but OpenAPI currently omits them. Similar drift will happen if recurring/source/impact fields are added ad hoc. Fix by making OpenAPI first-class and reusing existing handler/service layering (thin handlers, logic in services).

**Primary recommendation:** Split into 4 plans: (1) API contracts/read-models, (2) recurring contribution workflow, (3) goals tab + widget UX, (4) purchase impact integration + hardening tests.

## Phase Requirements

| ID | Description | Research Support |
| --- | --- | --- |
| P14-01 | Goals tab with summary + dense list + activity | Reuse `GoalsPage` route; replace minimal form UI with sectioned view and `CompactEntityTable`-style rows + progress bar |
| P14-02 | Dashboard multi-goal widget with urgency and quick actions | Add new dashboard widget component beside existing `StatCards`/`CheckWidget`; urgency sort function in frontend util |
| P14-03 | Recurring investments upcoming + executed + manual confirm | Add recurring-goal schedule API + mutation endpoint; source badges in ledger; overdue surfaced in list |
| P14-04 | Purchase impact preview per goal in check flow and goal surfaces | Extend `/api/check` response with per-goal impact breakdown; render in `CheckWidget` and goals page |
| P14-05 | Solid loading/error/refresh states | Follow existing Query invalidation/toast patterns; add skeleton/inline-retry blocks |

## Recommended Architecture (2-4 Plans)

### Plan 14-01 — API + Contract Foundation (backend first)
Scope:
- Add goal-tracking read model endpoint(s), e.g.:
  - `GET /api/goals/tracking?account_id=...` (summary + prioritized goals + recent activity)
  - optional split endpoints if simpler for handlers.
- Extend OpenAPI for current real `/check` contract (`WAIT`, `will_afford_after_payday`, `wait_until`) and new impact fields.
- Keep handlers thin; add service method(s) for urgency ranking and projection fields.

Deliverables:
- `internal/service/goals_tracking.go` (or extend `goals.go` cleanly)
- `internal/handler/goals_tracking.go`
- route registration + OpenAPI updates
- handler/service tests

### Plan 14-02 — Recurring Goal Contributions
Scope:
- Introduce recurring investment schedule model for goals (manual confirm posting).
- Add due/overdue calculation in service.
- Posting due item creates normal goal ledger entry with `source="recurring"` (requires enum expansion).

Deliverables:
- migration + repo methods
- recurring endpoints (`list due`, `confirm/post`)
- enum/validation updates in handler + api.ts + OpenAPI
- tests for overdue/selective posting/no auto-catchup

### Plan 14-03 — Goals Tab + Dashboard Widget UX
Scope:
- Replace current basic `GoalsPage` with sectioned architecture (D-01..D-04).
- Add dashboard `GoalsSnapshotWidget` (top 3-5 urgent goals + quick actions).
- Add skeleton + empty + inline retry states.

Deliverables:
- `web/src/pages/goals.tsx` rewrite
- new widget component(s)
- query hooks + invalidation cues (`last updated` timestamp)
- interaction tests

### Plan 14-04 — Purchase Impact Integration + Final Hardening
Scope:
- Show per-goal impact severity in `CheckWidget` result and goals surfaces before confirm.
- Ensure transaction/goal flows refresh coherently after mutations.
- Cross-surface polish and regression suite closure.

Deliverables:
- API client type updates
- `CheckWidget` UI extension
- e2e-like component tests + Go integration tests for impact math

## API/Frontend Gaps to Close

### Backend/API gaps
1. **No tracking aggregate endpoint** for summary + urgent list + recent activity.
2. **No recurring-goal schedule endpoints**; only one-off goal ledger exists.
3. **Ledger source enum mismatch**: code allows `manual|system`; phase needs `recurring` badge/source.
4. **OpenAPI drift on `/check`**:
   - spec enum misses `WAIT`
   - spec omits `will_afford_after_payday`, `wait_until`
   - handler emits `wait_until` as `YYYY-MM-DD`, not RFC3339 (needs explicit contract decision).
5. **No purchase-impact payload** in engine/check response today.

### Frontend gaps
1. `GoalsPage` is still minimal CRUD; lacks sectioned IA, urgency ordering, activity views.
2. No dashboard goals widget today.
3. `reverseGoalLedgerEntry(g.id, 'latest')` in current page is invalid placeholder (bug-prone).
4. No recurring flow UI for due/overdue/manual confirm.
5. `CheckWidget` has no goal impact block.
6. Tests missing for WAIT rendering (file currently skipped) and goals tracking UX states.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| Go + Echo handlers | existing | API endpoints and validation | Already project convention; thin handlers in this repo |
| internal/service layer | existing | Business logic (urgency, recurring due, impact) | Matches prior phases + avoids handler logic drift |
| React 19 + TS + TanStack Query v5 | existing | Goals tab/widget data + mutation invalidation | Existing dashboard architecture |
| Vitest + RTL | vitest 4.1.4 / RTL 16.3.2 | UI behavior tests | Existing web test stack |

### Supporting
| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| boneyard `Skeleton` | existing | Progressive loading placeholders | Goals tab and widget loading states |
| sonner | existing | toast errors/success | Mutation/error feedback |
| MoneyValue | existing internal | money formatting/sign policy | All currency displays |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| New state manager | Zustand/etc | Not needed; Query + local state already enough |
| Full e2e framework now | Playwright | Higher setup cost; phase can land with strong service+component coverage first |

## Architecture Patterns

### Pattern 1: Read-model endpoint for UI-heavy tracking
**What:** Build a service DTO that returns exactly what Goals tab/widget need (summary, prioritized rows, recent activity).
**When:** Multi-source UI requiring sort/severity logic.
**Use:** Avoid recomputing urgency differently in multiple components.

### Pattern 2: Manual-confirm recurring posting
**What:** due item list + explicit mutation to post each due item.
**When:** Financial actions that must stay user-confirmed.
**Use:** Aligns with D-10/D-11 and existing recurring confirm philosophy.

### Pattern 3: Query invalidation + visible freshness cue
**What:** keep `invalidateQueries` on mutation; show “updated at” timestamp on views.
**When:** ledger/impact/goal totals can conflict with stale cache.

### Anti-patterns
- Compute urgency separately in widget and tab.
- Auto-post overdue recurring entries on page load.
- Add business logic in handler/controller.
- Keep OpenAPI stale vs handler payloads.

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why |
| --- | --- | --- | --- |
| Money rendering/sign | ad-hoc string concat | `MoneyValue` | Existing sign/tone policy avoids regressions |
| Loading placeholders | custom CSS loaders everywhere | existing `Skeleton` pattern | Consistent UX + less code |
| Client cache sync | manual global stores | TanStack Query invalidate/refetch | Existing standard + proven in repo |

## Common Pitfalls

1. **Contract mismatch (spec vs runtime)**
   - Already visible in `/check` today.
   - Fix: update OpenAPI in same plan as handler changes.

2. **Cents/float boundary bugs**
   - Services use cents; handlers convert float.
   - Fix: keep conversion only at API boundary; tests for rounding.

3. **Recurring source enum breaks old validations**
   - `goals.go` currently rejects non `manual|system`.
   - Fix: migrate enum validation + tests + client types in one atomic change.

4. **Urgency instability / flicker**
   - If urgency uses `now` with no stable tiebreakers, list jumps.
   - Fix: deterministic sort: severity score desc, target date asc, created_at asc.

5. **Reverse flow misuse**
   - Current goals UI calls `/reverse` with fake `latest` id.
   - Fix: always choose real ledger entry id from data.

## Code Examples (repo-grounded)

### Existing query invalidation pattern
```ts
const addMut = useMutation({
  mutationFn: (goalId: string) => addGoalLedgerEntry(goalId, payload),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }) }
})
```
Source: `web/src/pages/goals.tsx`

### Existing ledger source validation boundary
```go
if req.Source != "manual" && req.Source != "system" {
  return echo.NewHTTPError(http.StatusBadRequest, "invalid ledger source")
}
```
Source: `internal/handler/goals.go`

### Existing check handler response shape (actual runtime)
```go
type CheckResponse struct {
  CanBuy bool `json:"can_buy"`
  PurchasingPower float64 `json:"purchasing_power"`
  BufferRemaining float64 `json:"buffer_remaining"`
  RiskLevel string `json:"risk_level"`
  WillAffordAfterPayday bool `json:"will_afford_after_payday"`
  WaitUntil *string `json:"wait_until"`
}
```
Source: `internal/handler/check.go`

## Runtime State Inventory
Not a rename/refactor/migration phase. Omitted by design.

## Environment Availability
Step 2.6: SKIPPED (no external dependencies identified; phase is code/API/UI changes within existing stack).

## Test Strategy

### Backend
- Extend `internal/service/goals_test.go`:
  - urgency ordering determinism
  - recurring due/overdue classification
  - manual confirm posts ledger + updates balance/invested atomically
  - selective overdue posting
  - impact severity mapping per goal.
- Extend `internal/handler/goals_test.go` + new tracking/recurring handler tests:
  - request validation
  - source enum accepts recurring
  - response schema fields present
  - error shape consistent.
- Extend `internal/handler/check_test.go`:
  - per-goal impact payload present
  - WAIT + impact coexistence.

### Frontend
- Replace stubs with behavior tests:
  - `CheckWidget` WAIT + per-goal impact rendering
  - goals tab urgency order, progress/remaining, empty/loading/error states
  - recurring due list + manual confirm action invalidation
  - dashboard widget top 3-5 urgent goals + quick actions.
- Keep API client tests in `web/src/__tests__` for request/response contract.

## Validation Architecture

### Test Framework
| Property | Value |
| --- | --- |
| Framework | Go `testing` + Vitest 4.1.4 + RTL 16.3.2 |
| Config file | none explicit (Vitest via package scripts; Go default) |
| Quick run command | `go test ./internal/handler ./internal/service -run 'Goals|Check' && cd web && npm test -- --run goals WaitVerdict` |
| Full suite command | `go test ./... && cd web && npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
| --- | --- | --- | --- | --- |
| P14-01 | Goals tab sections + urgency list + activity blocks | component | `cd web && npm test -- --run goals` | ❌ Wave 0 |
| P14-02 | Dashboard widget top urgent goals + quick actions | component | `cd web && npm test -- --run goals-widget` | ❌ Wave 0 |
| P14-03 | Recurring due/overdue + selective confirm posting | service+handler | `go test ./internal/service ./internal/handler -run 'Goal.*Recurring|Goals.*Recurring'` | ❌ Wave 0 |
| P14-04 | Purchase impact per-goal + severity | service+handler+component | `go test ./internal/service ./internal/handler -run 'Check|Impact' && cd web && npm test -- --run CheckWidget` | ⚠️ partial |
| P14-05 | Skeleton/inline retry/refresh cues | component | `cd web && npm test -- --run goals-states` | ❌ Wave 0 |

### Nyquist-friendly validation dimensions
- **Functional correctness:** urgency order, progress math, impact severity, due/overdue rules.
- **Data integrity:** cents math, atomic balance/ledger updates, append-only ledger behavior.
- **Contract integrity:** OpenAPI ↔ handler payload parity; client types aligned.
- **Temporal correctness:** timezone/UTC handling for target dates, due windows, wait-until.
- **Resilience:** empty/loading/error/retry states + stale data refresh cues.
- **Regression safety:** existing goals foundation + check verdict behavior remain green.

### Sampling Rate
- **Per task commit:** quick run command above.
- **Per wave merge:** full suite.
- **Phase gate:** full suite green + manual UI walkthrough for D-17..D-20.

### Wave 0 Gaps
- [ ] `web/src/components/CheckWidget.test.tsx` — cover WAIT + impact + severity badges.
- [ ] `web/src/pages/goals.test.tsx` — section layout, urgency sort, empty/loading/error/retry.
- [ ] `web/src/components/GoalsSnapshotWidget.test.tsx` — dashboard widget behavior.
- [ ] `internal/service/goals_tracking_test.go` — urgency + recurring + impact calculations.
- [ ] `internal/handler/goals_tracking_test.go` — new endpoints and validation/error shape.
- [ ] Update `internal/handler/docs/openapi.yaml` tests/checks for `/check` + new goals endpoints.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/14-goals-tracking-tab-dashboard-widget-recurring-investments-and-purchase-impact/14-CONTEXT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `internal/handler/goals.go`
- `internal/handler/routes.go`
- `internal/handler/docs/openapi.yaml`
- `internal/service/engine.go`
- `internal/service/goals.go`
- `internal/handler/check.go`
- `web/src/lib/api.ts`
- `web/src/pages/goals.tsx`
- `web/src/router.tsx`
- `web/src/components/CheckWidget.tsx`
- `web/src/components/StatCards.tsx`
- `web/src/components/CompactEntityTable.tsx`

### Secondary (MEDIUM confidence)
- Current test behavior from local runs:
  - `go test ./internal/handler ./internal/service ./internal/repo/sqlite -run 'Goals|Check'`
  - `cd web && npm test -- --run goals WaitVerdict`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing repo stack is explicit and stable.
- Architecture: HIGH — aligns with current service/handler/query patterns.
- Pitfalls: HIGH — verified from current code drift points and stubs.

**Research date:** 2026-04-29
**Valid until:** 2026-05-29
