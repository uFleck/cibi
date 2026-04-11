# Phase 02: Domain + Engine - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

The core recurring transaction engine, `PaySchedule` definitions, month-end date math, and the "Can I Buy It?" Decision Engine.
</domain>

<decisions>
## Implementation Decisions

### Engine Logic
- **D-01:** (Timezone Handling): Enforce strict UTC everywhere for calculations, bounds, and string parsing to match SCHEMA-05.
- **D-02:** (PayDay Boundaries): Subtract from current check: `next_occurrence <= next_payday`. Obligations due exactly on payday are subtracted from the current remaining balance.

### Code Organization
- **D-03:** (Directory Restructure): Migrate all existing `services/` and `repos/` into `internal/service/` and `internal/repo/sqlite/` now for full consistency.
- **D-04:** (PaySchedule Structure): Manage `PaySchedule` via the Accounts logic. Add `GetPaySchedule(accountID)` methods to the existing Accounts repository and service rather than creating dedicated structural boilerplate.

### the agent's Discretion
- The specific implementation details of the `AddMonthClamped` edge cases (e.g., leap years).
- Exact function shapes, as long as they satisfy the engine logic boundaries and fulfill the `ENGINE-xx` / `TXN-xx` requirements.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definitions
- `.planning/REQUIREMENTS.md` — Read ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, TXN-01, and TXN-02.
- `.planning/phases/01-foundation/01-CONTEXT.md` — Review Foundation phase decisions to maintain the same architectural style.

</canonical_refs>

<specifics>
## Specific Ideas

- Ensure "normal caveman mode" continues from Phase 1. Keep the Go code simple, understandable, and free of over-abstraction.
</specifics>

<deferred>
## Deferred Ideas

None covered during this phase's discussion.

</deferred>

---

*Phase: 02-domain-engine*
*Context gathered: 2026-04-11*
