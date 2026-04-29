# Phase 13: Goals foundation: goal entity, target amount, and investment ledger - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the core Goals foundation in backend + API + supporting web flows: goal entity shape, target amount semantics, and investment-ledger recording rules tied to accounts.

This phase does **not** include broader goals tracking UX (tab/widget/impact views) from Phase 14.

</domain>

<decisions>
## Implementation Decisions

### Goal data contract
- **D-01:** Goal is per-account (each goal belongs to exactly one account).
- **D-02:** Goal lifecycle states: `draft -> active -> completed -> archived`.
- **D-03:** Required fields: `name`, `account_id`, `target_amount_cents`, `start_date_utc`; optional: `target_date_utc`, `notes`.
- **D-04:** Goal auto-completes when `invested_total >= target_amount`.

### Target amount semantics
- **D-05:** Target amount is editable anytime with audit trail.
- **D-06:** Overfunding is allowed; goal remains completed.
- **D-07:** Goal currency must match linked account currency.
- **D-08:** UI accepts decimal input; persistence uses integer cents with half-up rounding.

### Investment ledger behavior
- **D-09:** Ledger entry types: `contribution`, `withdrawal`, `adjustment`.
- **D-10:** No hard delete for corrections; use reversing adjustment and preserve history.
- **D-11:** Minimum entry metadata: `amount_cents`, `type`, `timestamp_utc`, optional `note`, `source` (`manual|system`).
- **D-12:** Schema supports `source=system` in Phase 13 (even if most producers are manual initially).

### Balance relationship rules
- **D-13:** Contribution entries immediately debit linked account balance.
- **D-14:** Withdrawal entries immediately credit linked account balance.
- **D-15:** Contributions with insufficient funds are blocked with validation error.
- **D-16:** Goal ledger mutation + account balance update must be atomic in one DB transaction.

### the agent's Discretion
- Exact API endpoint names and payload shape details (as long as they reflect decisions above and existing API conventions).
- Exact migration split (single migration vs small sequence).
- UI form layout specifics for goal/investment entry in this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and intent
- `.planning/ROADMAP.md` (Phase 13 + dependency with Phase 14 boundary)
- `.planning/PROJECT.md` (locked architecture principles: local-first, integer cents, layered services)

### Technical constraints and conventions
- `.planning/REQUIREMENTS.md` (money/time/storage invariants and service/repo layering expectations)
- `.planning/codebase/STRUCTURE.md` (where to add migration/repo/service/handler/web pieces)
- `.planning/codebase/CONVENTIONS.md` (error handling, money conversion, UTC, naming/testing patterns)

### Prior phase decisions that constrain implementation style
- `.planning/phases/09-fix-transaction-balance-and-recurring-payment-confirm/09-CONTEXT.md` (atomic balance sync expectations)
- `.planning/phases/10-codebase-simplification-and-logic-centralization/10-CONTEXT.md` (service-layer centralization and transaction correctness expectations)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `internal/migrations/*`: established goose Go-migration pattern for schema evolution.
- `internal/repo/sqlite/*`: repo interface + sqlite implementation pattern ready for new goal/ledger repos.
- `internal/service/transactions.go`: atomic balance mutation pattern to mirror for goal ledger/account coupling.
- `internal/handler/*` + `internal/handler/routes.go`: established REST handler + routing registration style.
- `web/src/components/ui/money-value.tsx`, `web/src/lib/format.ts`: existing money rendering/input formatting conventions.
- `web/src/components/CompactEntityTable.tsx`, modal/form components: reusable list/form interaction primitives.

### Established Patterns
- Money persisted/calculated as integer cents; JSON/UI in decimal conversion boundaries.
- UTC/RFC3339 timestamp handling across persistence and API.
- Business rules in service layer; handlers remain thin adapters.
- Strong account scoping in data access and behavior.

### Integration Points
- New Goal and GoalInvestmentLedger entities hook into: migration layer, sqlite repos, services, handlers, route map, and web API client types.
- Balance effects integrate with existing account balance mutation logic via service-layer atomic transaction boundaries.

</code_context>

<specifics>
## Specific Ideas

- Foundation first: model and ledger must be solid now so Phase 14 tracking surfaces can build on stable semantics.
- Keep auditability high: editable targets with trail, reversal-not-delete correction model.

</specifics>

<deferred>
## Deferred Ideas

- Goals tab/dashboard widget/purchase impact and recurring investment tracking UI details are deferred to **Phase 14** by roadmap boundary.

</deferred>

---

*Phase: 13-goals-foundation-goal-entity-target-amount-and-investment-ledger*
*Context gathered: 2026-04-29*
