# Phase 14: Goals tracking: tab, dashboard widget, recurring investments, and purchase impact - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver goals-tracking surfaces and behaviors on top of existing goals foundation: a Goals tab, dashboard widget, recurring investment visibility/flows, and purchase-impact presentation.

This phase clarifies tracking and UX behavior only. It does not add unrelated new capabilities.

</domain>

<decisions>
## Implementation Decisions

### Goals tab information architecture
- **D-01:** Goals tab uses a sectioned layout: top summary cards, goals list, and recent ledger activity block.
- **D-02:** Goals list uses row/table-style density with progress bar and key amounts.
- **D-03:** Default ordering is urgency-first (closest target date + urgency signal), not completion-first.
- **D-04:** Activity visibility includes both global recent goal activity and per-goal activity context.

### Dashboard widget behavior
- **D-05:** Widget shows a multi-goal snapshot (top 3-5 goals), not single-goal only.
- **D-06:** Widget includes quick actions (add contribution + open Goals tab) in addition to read metrics.
- **D-07:** Each item shows both percent progress and remaining amount.
- **D-08:** Snapshot prioritization uses urgency (target date + gap), not highest percent complete.

### Recurring investments experience
- **D-09:** Show both upcoming recurring schedule and executed ledger history.
- **D-10:** Due recurring contributions use manual confirm/post flow (not fully automatic posting).
- **D-11:** Missed dues are shown as overdue; user posts selectively (no forced auto-catchup).
- **D-12:** UI shows source badges for entries (manual/system/recurring).

### Purchase impact interaction
- **D-13:** Purchase impact is shown in both purchase-check flow and goals surfaces.
- **D-14:** Impact is presented per affected goal (not only global message).
- **D-15:** Impact uses tiered severity labels (low/medium/high impact).
- **D-16:** Impact preview is shown before transaction confirmation.

### State handling (empty/loading/error/conflict)
- **D-17:** Empty-goals state includes guided CTA (create first goal + short explainer).
- **D-18:** Loading uses skeletons + progressive reveal (not full blocking spinner-only mode).
- **D-19:** Errors are inline-recoverable with retry, plus toast notifications.
- **D-20:** Freshness/conflict uses query refresh + mutation invalidation + visible “updated” cues.

### the agent's Discretion
- Exact copywriting, micro-layout spacing, and visual token choices.
- Exact thresholds and formula details for urgency scoring (as long as urgency-first intent is preserved).
- Exact badge visuals for source/severity while preserving semantic meaning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and constraints
- `.planning/ROADMAP.md` - Phase 14 scope statement and dependency on Phase 13
- `.planning/PROJECT.md` - Core product principles (decision correctness, local-first, integer cents)
- `.planning/REQUIREMENTS.md` - Architecture/data invariants and web/API baseline constraints

### Prior phase decisions that are binding
- `.planning/phases/13-goals-foundation-goal-entity-target-amount-and-investment-ledger/13-CONTEXT.md` - Goal model, ledger semantics, balance coupling rules
- `.planning/phases/09-fix-transaction-balance-and-recurring-payment-confirm/09-CONTEXT.md` - Atomic balance/transaction correctness expectations
- `.planning/phases/10-codebase-simplification-and-logic-centralization/10-CONTEXT.md` - Service-layer responsibility and simplification constraints

### Existing architecture/conventions for implementation
- `.planning/codebase/STRUCTURE.md` - Where frontend/backend integrations should be added
- `.planning/codebase/CONVENTIONS.md` - Money/time formatting, handler/service/repo conventions, error patterns

### Existing goals API and integration surfaces
- `internal/handler/routes.go` - Registered `/api/goals` and ledger routes
- `internal/handler/goals.go` - Goals and ledger handler contracts/validation
- `internal/handler/docs/openapi.yaml` - Goals endpoints and payload/response shapes
- `internal/service/engine.go` - Purchase feasibility semantics for impact coupling

### Existing frontend patterns to reuse
- `web/src/lib/api.ts` - Query/mutation API client contracts
- `web/src/lib/format.ts` - Money/date formatting helpers
- `web/src/components/CheckWidget.tsx` - Purchase check UX and result presentation baseline
- `web/src/components/StatCards.tsx` - Dashboard summary card pattern
- `web/src/components/CompactEntityTable.tsx` - Dense list/table rendering baseline

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `internal/handler/goals.go` + `internal/handler/routes.go`: existing goals and ledger endpoints already available for tracking UI.
- `internal/handler/docs/openapi.yaml`: canonical API contract for frontend typing/planning.
- `web/src/lib/api.ts`: shared query/mutation layer for integrating new goals-tracking views.
- `web/src/components/StatCards.tsx`: dashboard metric-card pattern reusable for goals widget summary.
- `web/src/components/CompactEntityTable.tsx`: reusable dense row/table pattern for goals list.
- `web/src/components/CheckWidget.tsx`: existing purchase-check interaction surface for impact preview integration.
- `web/src/lib/format.ts` and `web/src/components/ui/money-value.tsx`: consistent money rendering for progress/remaining/impact numbers.

### Established Patterns
- Money is integer cents internally; UI/API convert at boundaries.
- UTC/RFC3339 timestamps and account-scoped behaviors are standard.
- Business logic stays in services; handlers remain thin.
- Frontend uses TanStack Query invalidation/refetch patterns for data freshness.

### Integration Points
- Goals tab and widget consume `/api/goals` + `/api/goals/{id}/ledger` flows.
- Recurring investment due-state and posting flows connect to goals ledger creation.
- Purchase impact integrates with existing check/transaction UX (pre-confirm preview + post-mutation refresh cues).

</code_context>

<specifics>
## Specific Ideas

- User chose urgency-first prioritization and multi-goal visibility over featured single-goal emphasis.
- User explicitly wanted both global and per-goal activity visibility (A+B).
- User accepted recommended defaults for recurring flow, purchase impact, and state handling.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 14-goals-tracking-tab-dashboard-widget-recurring-investments-and-purchase-impact*
*Context gathered: 2026-04-29*
