# Phase 13: Goals foundation: goal entity, target amount, and investment ledger - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 13-goals-foundation-goal-entity-target-amount-and-investment-ledger
**Areas discussed:** Goal data contract, Target amount semantics, Investment ledger behavior, Balance relationship rules

---

## Goal data contract

| Option | Description | Selected |
|---|---|---|
| Per-account goal | Goal belongs to exactly one account | ✓ |
| Global goal | Goal not tied to account |  |
| Hybrid | Global + optional account linkage |  |

| Option | Description | Selected |
|---|---|---|
| draft → active → completed → archived | Full lifecycle states | ✓ |
| active → completed | Minimal states |  |
| active → paused → completed → archived | Includes pause state |  |

| Option | Description | Selected |
|---|---|---|
| name, account_id, target_amount_cents, start_date_utc, target_date_utc(optional), notes(optional) | Core required/optional field set | ✓ |
| Same + target_date required | Force target date |  |
| Same + category required | Adds mandatory category |  |

| Option | Description | Selected |
|---|---|---|
| Auto-complete at invested_total >= target | System auto-completion | ✓ |
| Manual completion only | User marks complete |  |
| Auto-complete + manual reopen | Hybrid completion |  |

**User's choice:** 1,1,1,1
**Notes:** User corrected an accidental previous answer and confirmed final selection as 1,1,1,1.

---

## Target amount semantics

| Option | Description | Selected |
|---|---|---|
| Editable anytime with audit trail | Target can evolve with traceability | ✓ |
| Lock after activation | Immutable active target |  |
| Only increase allowed | No decreases |  |

| Option | Description | Selected |
|---|---|---|
| Allow overfunding | Continue past target, remain completed | ✓ |
| Cap at target | Reject excess contributions |  |
| Allow overfunding with per-entry confirm | Prompt over target |  |

| Option | Description | Selected |
|---|---|---|
| Match linked account currency | Keep per-account currency consistency | ✓ |
| Independent goal currency | Goal-level currency field |  |
| Always BRL | Fixed global currency |  |

| Option | Description | Selected |
|---|---|---|
| Decimal input + round half-up to cents | Standard UI + precise persistence | ✓ |
| Integer cents input only | Raw cents UX |  |
| Decimal input + truncate | Cut precision |  |

**User's choice:** 1,1,1,1
**Notes:** User accepted all recommended defaults.

---

## Investment ledger behavior

| Option | Description | Selected |
|---|---|---|
| contribution, withdrawal, adjustment | Full reversible ledger types | ✓ |
| contribution + withdrawal | No explicit adjustment type |  |
| contribution only | No negative/reversal model |  |

| Option | Description | Selected |
|---|---|---|
| Reverse via adjustment, never hard-delete | Preserve immutable audit trail | ✓ |
| Edit in place | Mutable entries |  |
| Delete within 24h then lock | Time-limited mutation |  |

| Option | Description | Selected |
|---|---|---|
| amount_cents, type, timestamp_utc, note(optional), source(manual|system) | Minimal complete metadata | ✓ |
| Same but note required | Mandatory note |  |
| Same + actor required now | Adds actor identity now |  |

| Option | Description | Selected |
|---|---|---|
| Support system entries now | Schema future-proof in Phase 13 | ✓ |
| Manual only now | No system source yet |  |
| Add system source in Phase 14 | Delay source model |  |

**User's choice:** 1,1,1,1
**Notes:** User wants audit-safe, future-ready ledger base in this phase.

---

## Balance relationship rules

| Option | Description | Selected |
|---|---|---|
| Contribution debits account immediately | Ledger affects real balance now | ✓ |
| Tracking-only, no balance effect | Isolated goal ledger |  |
| Prompt per entry | Conditional balance impact |  |

| Option | Description | Selected |
|---|---|---|
| Withdrawal credits account immediately | Reverse flow affects balance now | ✓ |
| No balance effect | Isolated withdrawal |  |
| Prompt per entry | Conditional credit |  |

| Option | Description | Selected |
|---|---|---|
| Block on insufficient funds | Strict safety for contributions | ✓ |
| Allow negative balance | Overdraft allowed |  |
| Warn + allow force | Soft enforcement |  |

| Option | Description | Selected |
|---|---|---|
| Atomic single DB transaction | Strong consistency guarantee | ✓ |
| Separate best-effort writes | Possible partial updates |  |
| Async eventual consistency | Deferred reconciliation |  |

**User's choice:** 1,1,1,1
**Notes:** User selected strict financial consistency model.

---

## the agent's Discretion

- Endpoint naming and payload formatting details.
- Migration granularity.
- UI arrangement details for forms/lists in this phase.

## Deferred Ideas

- Phase 14 visualization/tracking experience (tab/widget/purchase impact and recurring investment surfaces).
