# Phase 10: Codebase Simplification and Logic Centralization — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce accidental complexity accumulated in phases 7–9 (friend ledger, payment schedules, balance fixes). No new features. Four focus areas:
1. Repo method consolidation — eliminate 20+ duplicate "with/without account" method pairs
2. Frontend page decomposition — split large page files into focused components
3. Logic centralization — extract duplicated date logic, move business logic out of handlers
4. Bug fixes + full service-layer test coverage

</domain>

<decisions>
## Implementation Decisions

### Repo Consolidation
- **D-01:** Remove unscoped repo methods entirely — account-scoped is the only code path. Methods accept `*uuid.UUID` for account ID; filter when non-nil. Verify no callers pass nil before removal.
- **D-02:** Consolidate both the repo implementations AND the service interfaces (`PeerDebtServiceIface`, `GroupEventServiceIface`). Handlers depend on service interfaces — removing unscoped service methods eliminates the actual callers.
- **D-03:** Replace field-at-a-time UPDATE pattern with a dynamic UPDATE statement using a slice of `(column, value)` pairs. Applies to `PeerDebtRepo.Update` and `GroupEventRepo.Update` (currently 50+ lines each).
- **D-04:** Add a follow-up migration to enforce `NOT NULL` on the `account_id` columns added by migration `20260416000005`. Rows without `account_id` are invisible in all scoped queries — a silent data integrity gap.

### Frontend Decomposition
- **D-05:** Full component extraction on all three large page files:
  - `friends.tsx` (1,342 lines) → extract `FriendForm`, `DebtForm`, `GroupEventForm`, `ParticipantEditor`
  - `accounts.tsx` (835 lines) → extract inline form/modal components
  - `transactions.tsx` (789 lines) → extract inline form/modal components
  - Extracted components land in `web/src/components/`
  - Page files become orchestrators that import components

### Logic Centralization
- **D-06:** Extract installment next-due date computation into `internal/engine/` as `NextInstallmentDue(firstDue time.Time, paidInstallments int64, frequency string) time.Time`. Currently duplicated verbatim in 4 places across `internal/repo/sqlite/peer_debt.go` (lines 573–584, 636–647) and `internal/service/peer_debt.go` (lines 162–170, 215–222). Belongs next to `NextPayday` and `AddMonthClamped`.
- **D-07:** Move business logic out of `public.go` handler into the service layer. Specifically: event iteration, `viewerIsHost` determination, and `hostedGroups` assembly currently in `GetFriendByToken` (lines 137–208). Handler becomes a thin HTTP adapter.

### Bug Fixes
- **D-08:** Fix `DeleteTransaction` balance reversal: fetch transaction before deletion, then atomically delete it and reverse its amount from `current_balance` — mirroring the `CreateTransaction` pattern. Currently deletion leaves balance permanently corrupted.
- **D-09:** Fix `RecordDebit` inverted guard or remove entirely. `ConfirmRecurring` is the live path; `RecordDebit` is dead code with an inverted `next_occurrence.After(now)` condition. Assess callers — if none exist outside tests, remove. If needed elsewhere, fix the guard.

### Test Coverage
- **D-10:** Full service-layer test coverage push. Covers:
  - `transactions.go`: `CreateTransaction` (balance sync), `UpdateTransaction` (balance recalc), `DeleteTransaction` (balance reversal after fix), `ConfirmRecurring`
  - `peer_debt.go` and `group_event.go` service methods
  - `GetFriendDebtBreakdown` and other previously untested service methods
  - The extracted `NextInstallmentDue` helper in `internal/engine/`
  - `internal/handler/public.go` endpoints (currently zero test coverage)
  - Pattern: follow existing `internal/handler/*_test.go` style with `testhelpers_test.go` setup

### Claude's Discretion
- Exact component names/file layout for extracted frontend components (beyond the names listed in D-05)
- Whether to use a struct or variadic approach for the dynamic UPDATE builder
- Order of operations within the service-layer test coverage push
- N+1 query fix for `GetFriendByToken` (perf concern noted in CONCERNS.md — include if low-effort alongside the public.go refactor, defer if complex)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Architecture
- `.planning/PROJECT.md` — Core constraints: layered arch, no SQL outside repo/sqlite/, interfaces not implementations
- `.planning/REQUIREMENTS.md` — TXN-01, TXN-02 define transaction/balance semantics; ARCH-03 defines App wiring

### Codebase Analysis
- `.planning/codebase/CONCERNS.md` — Primary source. Line-level locations of all issues this phase addresses
- `.planning/codebase/CONVENTIONS.md` — Naming conventions, error handling patterns, import grouping
- `.planning/codebase/STRUCTURE.md` — Directory layout, file ownership

### Prior Phase Context
- `.planning/phases/09-fix-transaction-balance-and-recurring-payment-confirm/09-CONTEXT.md` — Balance sync decisions (D-01–D-04 from phase 9) that this phase must not regress
- `.planning/phases/08-friend-ledger/08-CONTEXT.md` — Friend ledger scope and data model

### Key Files to Read Before Touching
- `internal/repo/sqlite/peer_debt.go` — Duplicate methods at lines 540–651 (SumUpcomingPeerObligations pairs)
- `internal/repo/sqlite/group_event.go` — Duplicate methods at lines 477–548; field-at-a-time UPDATE at 287–339
- `internal/service/peer_debt.go` — Duplicated date logic at lines 162–170, 215–222
- `internal/handler/public.go` — Business logic to extract at lines 137–208
- `web/src/pages/friends.tsx` — 1,342-line file to decompose
- `internal/service/transactions.go` — DeleteTransaction bug at lines 153–158; RecordDebit guard at 186–189

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `internal/engine/engine.go` — `NextPayday`, `AddMonthClamped` — the new `NextInstallmentDue` helper follows this exact pattern
- `internal/handler/testhelpers_test.go` — shared test setup; all new service tests follow this scaffolding
- `web/src/components/` — existing component library (shadcn/ui, custom components) — extracted components import from here

### Established Patterns
- Service layer orchestrates repo calls via injected interfaces — no direct DB access
- Atomic operations via `sql.Tx` passed through repo methods
- Handler returns thin JSON; service layer owns error types and wrapping
- `*uuid.UUID` nullable foreign keys already used in schema — pass-nil pattern is established

### Integration Points
- Extracted `NextInstallmentDue` → imported by both `internal/repo/sqlite/peer_debt.go` and `internal/service/peer_debt.go` (replaces inline copies)
- `public.go` handler → delegates to new service method (e.g., `FriendSvc.GetPublicFriendView(token)`)
- Extracted frontend components → imported by the page files they were extracted from

</code_context>

<specifics>
## Specific Ideas

- CONCERNS.md is the authoritative issue list — every item addressed here has exact file + line references
- Installment payment truncation (remainder cents dropped in integer division) noted in CONCERNS.md but not in scope — separate correctness fix
- `SafetyBuffer` per-account enhancement is out of scope for this phase (schema change, new feature)

</specifics>

<deferred>
## Deferred Ideas

- Per-account `SafetyBuffer` — schema change + new feature, not simplification
- Installment payment remainder cents fix — correctness but not duplication/complexity
- Public token revocation endpoint — new feature
- Pagination on list endpoints — performance, not simplification
- `CIBI_SAFETY_BUFFER` env-only limitation (no HTTP endpoint) — missing feature

</deferred>

---

*Phase: 10-codebase-simplification-and-logic-centralization*
*Context gathered: 2026-04-16*
