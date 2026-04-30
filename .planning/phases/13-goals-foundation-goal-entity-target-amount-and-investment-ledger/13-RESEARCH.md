# Phase 13: Goals foundation: goal entity, target amount, and investment ledger - Research

**Researched:** 2026-04-29
**Domain:** Go backend domain modeling + atomic money ledger + REST/web integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- Exact API endpoint names and payload shape details (as long as they reflect decisions above and existing API conventions).
- Exact migration split (single migration vs small sequence).
- UI form layout specifics for goal/investment entry in this phase.

### Deferred Ideas (OUT OF SCOPE)
- Goals tab/dashboard widget/purchase impact and recurring investment tracking UI details are deferred to **Phase 14** by roadmap boundary.
</user_constraints>

## Summary

Phase 13 should be implemented as a new account-scoped Goals aggregate with append-only investment ledger behavior and transactional coupling to account balance updates. Existing codebase patterns already support this: migration-first schema changes (`goose`), repo interfaces in `internal/repo/sqlite`, business rules in service layer, and thin handlers.

Main planning risk is **money correctness across two ledgers** (goal ledger and account balance). Reuse the same transaction strategy used by `TransactionsService`: validate first, fetch required state before tx when needed, then perform goal-ledger write + account balance update in one DB transaction.

**Primary recommendation:** Build Goal + GoalLedger as first-class domain with immutable ledger rows, explicit reversal flow, and service-owned atomic write path that always updates goal status after each ledger mutation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| Go stdlib `database/sql` tx | go1.25.8 | Atomic multi-write updates | Already used in services; proven in Phase 9 fixes |
| `github.com/pressly/goose/v3` | v3.27.0 | Schema migrations | Existing migration system; no ad-hoc DDL |
| `github.com/labstack/echo/v4` | v4.12.0 | REST handlers | Existing API shape + validator/error flow |

### Supporting
| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| `github.com/google/uuid` | v1.6.0 | Goal + ledger IDs | All entities use UUID text PK |
| React 19 + TanStack Query v5 | web package | Goal forms/list mutations | Supporting web flows in phase scope |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| Append-only ledger + reversal | Hard delete/update ledger rows | Breaks auditability, violates D-10 |
| Service-layer tx orchestration | Trigger-based DB logic | Harder to test with current repo/service architecture |

**Installation:**
```bash
# none expected; stack already present in repo
```

**Version verification:**
- Verified from `go.mod` and `web/package.json` on 2026-04-29.

## Architecture Patterns

### Recommended Project Structure
```text
internal/
├── migrations/
│   └── <new_goal_migration>.go
├── repo/sqlite/
│   ├── goals.go
│   └── goals_test.go
├── service/
│   ├── goals.go
│   └── goals_test.go
└── handler/
    ├── goals.go
    └── goals_test.go
web/src/
├── lib/api.ts
└── pages/goals.tsx (or phase-scoped modal flow on existing page)
```

### Pattern 1: Service-owned atomic ledger write
**What:** service method opens tx, writes ledger row, updates account balance, updates goal aggregate/status, commits.
**When to use:** contribution/withdrawal/adjustment entry creation.
**Example:** mirror existing transaction pattern in `internal/service/transactions.go` (`CreateTransaction`, `UpdateTransaction`, `DeleteTransaction`).

### Pattern 2: Integer-cents boundary conversion
**What:** handler converts decimal API amounts to `int64` cents with `math.Round(amount * 100)`.
**When to use:** goal target updates + ledger amount input (D-08).
**Example:** existing conversion in `internal/handler/transactions.go`.

### Pattern 3: Repo interface + sqlite implementation
**What:** define `GoalsRepo` contract and `SqliteGoalsRepo` implementation in one file; optional `*sql.Tx` parameters for tx participation.
**When to use:** all goal/ledger persistence calls.
**Example:** `internal/repo/sqlite/transactions.go`.

### Anti-Patterns to Avoid
- **Balance update outside tx:** creates ledger/account drift.
- **Soft “edit in place” ledger corrections:** violates D-10 audit semantics.
- **Float money in service/repo:** violates project money invariant.
- **Handler business logic:** violates layered architecture.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Schema lifecycle | manual `CREATE TABLE` at runtime | goose migration file | Existing migration contract; reversible |
| Validation envelope | custom ad-hoc HTTP error shape | existing validator + `CustomHTTPErrorHandler` | Consistent API semantics |
| Cross-table atomicity | DIY retry/eventual consistency | `database/sql` transaction | Simpler, proven, correct for SQLite single-writer model |

**Key insight:** The project already solved this class in transaction/balance sync (Phase 9). Reuse pattern; do not invent new consistency model.

## Common Pitfalls

### Pitfall 1: Sign semantics confusion in ledger math
**What goes wrong:** contribution/withdrawal signs interpreted inconsistently between ledger and account balance.
**Why:** mixing “business direction” and signed amount conventions.
**How to avoid:** define one invariant in service docs/tests:
- ledger `amount_cents` stored as absolute positive + explicit `type`, OR
- signed amounts with strict mapping.
Pick one and enforce everywhere. Prefer explicit `type` + positive amount for clarity.
**Warning signs:** tests pass for one type but fail for reversal/adjustment edge cases.

### Pitfall 2: Goal completion not recomputed after target edits
**What goes wrong:** goal remains active after lowering target below invested total.
**Why:** status transition only checked on contributions.
**How to avoid:** recompute completion on every target update and every ledger mutation.
**Warning signs:** stale `status` with `invested_total >= target_amount`.

### Pitfall 3: Currency mismatch leakage
**What goes wrong:** goal created/updated with currency not matching account.
**Why:** validation only in handler, not service.
**How to avoid:** enforce in service using account lookup before write (D-07).
**Warning signs:** mixed-currency data appears in DB.

### Pitfall 4: correction flow accidentally allows deletion
**What goes wrong:** “delete ledger entry” endpoint sneaks in for convenience.
**Why:** CRUD symmetry pressure.
**How to avoid:** no delete endpoint for ledger rows; provide “reverse entry” API.
**Warning signs:** repo has `DeleteGoalLedgerEntry` method.

## Code Examples

### Atomic multi-write service flow (pattern)
```go
// Pattern source: internal/service/transactions.go
func (s *GoalsService) AddInvestment(req AddInvestmentInput) error {
    // 1) Validate goal/account/currency + funds
    // 2) Begin tx
    // 3) Insert goal ledger entry
    // 4) Update account balance (debit/credit)
    // 5) Recompute goal invested_total + status
    // 6) Commit
    return nil
}
```

### Decimal -> cents conversion boundary
```go
// Pattern source: internal/handler/transactions.go
amountCents := int64(math.Round(req.Amount * 100))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Potential non-atomic money writes | Explicit atomic tx in service layer | Phase 9 | Must replicate for goals |
| Handler-heavy orchestration | Service centralization | Phase 10 | Keep goal logic in service |

**Deprecated/outdated:**
- Any idea of direct SQL in handlers/services outside repo layer.

## Open Questions

1. **Should `invested_total` be stored or derived?**
   - What we know: D-04 requires quick comparison for completion.
   - What's unclear: denormalized column vs live SUM query strategy.
   - Recommendation: store denormalized `invested_total_cents` on Goal + verify against ledger in tests; simpler read paths and future Phase 14 dashboards.

2. **Reversal linkage metadata**
   - What we know: D-10 requires reversing adjustment.
   - What's unclear: whether to store `reverses_entry_id`.
   - Recommendation: add nullable `reverses_entry_id` FK in ledger for traceability.

3. **API shape for supporting web flows**
   - What we know: endpoint naming is discretion.
   - What's unclear: split endpoints by goal vs ledger subresource.
   - Recommendation: `/api/goals` + `/api/goals/:id/ledger` to align existing route grouping style.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
| --- | --- | --- | --- | --- |
| go | backend build/test | ✓ | go1.25.8 | — |
| node | web build/test | ✓ | v22.22.2 | — |
| npm | web deps/scripts | ✓ | 10.9.7 | — |
| sqlite3 CLI | optional manual DB inspection | ✗ | — | not required (app uses `modernc.org/sqlite`) |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- sqlite3 CLI missing; can inspect via tests/logging or temporary Go scripts if needed.

## Validation Architecture

### Test Framework
| Property | Value |
| --- | --- |
| Framework | Go `testing` + web `vitest` |
| Config file | `vitest.config.ts` (web); Go uses default tooling |
| Quick run command | `go test ./internal/service ./internal/handler -run Goals -count=1` |
| Full suite command | `go test ./... && cd web && npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
| --- | --- | --- | --- | --- |
| TBD | Goal lifecycle + target semantics + ledger/account atomicity | unit + integration-like service tests | `go test ./internal/service -run Goals -count=1` | ❌ Wave 0 |
| TBD | API validation + payload conversion + error mapping | handler tests | `go test ./internal/handler -run Goals -count=1` | ❌ Wave 0 |
| TBD | Web supporting flow mutation success/error | component/integration | `cd web && npm test -- --run goals` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `go test ./internal/service ./internal/handler -run Goals -count=1`
- **Per wave merge:** `go test ./...`
- **Phase gate:** `go test ./... && cd web && npm test -- --run`

### Wave 0 Gaps
- [ ] `internal/repo/sqlite/goals_test.go` — repo CRUD + ledger invariants
- [ ] `internal/service/goals_test.go` — atomicity, insufficient funds, completion transitions
- [ ] `internal/handler/goals_test.go` — request validation + cents conversion + error codes
- [ ] `web/src/__tests__/goals*.test.tsx` — mutation flow + optimistic refresh

## Sources

### Primary (HIGH confidence)
- `.planning/phases/13-goals-foundation-goal-entity-target-amount-and-investment-ledger/13-CONTEXT.md` — locked decisions D-01..D-16
- `.planning/REQUIREMENTS.md` — money/time/storage invariants
- `.planning/codebase/CONVENTIONS.md` — error/money/UTC/layering conventions
- `.planning/codebase/STRUCTURE.md` — insertion points and layering model
- `internal/service/transactions.go` — atomic balance mutation pattern
- `internal/repo/sqlite/transactions.go` — repo tx/no-tx API pattern
- `internal/handler/transactions.go` — decimal↔cents boundary + handler style
- `internal/app/app.go` and `internal/handler/routes.go` — wiring/route registration pattern
- `.planning/config.json` — `workflow.nyquist_validation=true`

### Secondary (MEDIUM confidence)
- `go.mod`, `web/package.json` — stack version reality for this repo

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing project stack and versions directly verified in repo.
- Architecture: HIGH - patterns proven in current code (phases 9/10 style).
- Pitfalls: MEDIUM - derived from established money-ledger failure modes + current conventions.

**Research date:** 2026-04-29
**Valid until:** 2026-05-29
