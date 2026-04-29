# Phase 14: Goals tracking: tab, dashboard widget, recurring investments, and purchase impact - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-04-29T18:49:36-03:00
**Phase:** 14-goals-tracking-tab-dashboard-widget-recurring-investments-and-purchase-impact
**Areas discussed:** Goals tab information architecture, Dashboard widget behavior, Recurring investments UX/logic exposure, Purchase impact interaction, State handling (empty/loading/error/conflict)

---

## Goals tab information architecture

| Option | Description | Selected |
| --- | --- | --- |
| A | Single long page (summary + goals + activity mixed) | |
| B | Sectioned tab: top summary cards, goals list, recent ledger block | ✓ |
| C | Two-subtabs inside Goals (Overview / Activity) | |

**User's choice:** B
**Notes:** Preferred structured layout.

| Option | Description | Selected |
| --- | --- | --- |
| A | Big cards per goal | |
| B | Table/list rows with progress bar + key numbers | ✓ |
| C | Hybrid (rows desktop, cards mobile) | |

**User's choice:** B
**Notes:** Density/scannability favored.

| Option | Description | Selected |
| --- | --- | --- |
| A | Highest progress % first | |
| B | Closest to target date / most urgent first | ✓ |
| C | Largest remaining amount first | |

**User's choice:** B
**Notes:** Urgency-first prioritized.

| Option | Description | Selected |
| --- | --- | --- |
| A | Per-goal activity only | ✓ |
| B | Global recent goal ledger activity on tab | ✓ |
| C | No activity on tab | |

**User's choice:** A+B
**Notes:** Wants both global and specific activity visibility.

---

## Dashboard widget behavior

| Option | Description | Selected |
| --- | --- | --- |
| A | One featured goal only | |
| B | Multi-goal snapshot (top 3-5) | ✓ |
| C | Toggle featured/snapshot | |

| Option | Description | Selected |
| --- | --- | --- |
| A | Read-only metrics | |
| B | Quick actions: add contribution + open goals tab | ✓ |
| C | Full mini-manager in widget | |

| Option | Description | Selected |
| --- | --- | --- |
| A | % complete only | |
| B | Money remaining only | |
| C | Both % + money remaining | ✓ |

| Option | Description | Selected |
| --- | --- | --- |
| A | Highest % complete | |
| B | Most urgent (target date + gap) | ✓ |
| C | User-pinned manual order | |

**User's choice:** Keep recommended for all.
**Notes:** Accepted all recommended defaults.

---

## Recurring investments UX/logic exposure

| Option | Description | Selected |
| --- | --- | --- |
| A | Only show executed ledger entries | |
| B | Show upcoming recurring schedule + executed history | ✓ |
| C | Separate recurring tab | |

| Option | Description | Selected |
| --- | --- | --- |
| A | Fully automatic posting | |
| B | Manual confirm/post when due (with reminders) | ✓ |
| C | Auto with optional review queue | |

| Option | Description | Selected |
| --- | --- | --- |
| A | Skip missed occurrences | |
| B | Auto-catchup all missed | |
| C | Show overdue and let user post selectively | ✓ |

| Option | Description | Selected |
| --- | --- | --- |
| A | Hide source | |
| B | Show source badge (manual/system/recurring) | ✓ |
| C | Show only on detail view | |

**User's choice:** Recommended for all.

---

## Purchase impact interaction

| Option | Description | Selected |
| --- | --- | --- |
| A | Check flow only | |
| B | Goals tab only | |
| C | Both check flow + goals surfaces | ✓ |

| Option | Description | Selected |
| --- | --- | --- |
| A | Single global message | |
| B | Per-goal impact preview for affected goals | ✓ |
| C | Full simulation panel | |

| Option | Description | Selected |
| --- | --- | --- |
| A | Binary safe/unsafe | |
| B | Tiered severity (low/medium/high impact) | ✓ |
| C | Numeric-only no severity labels | |

| Option | Description | Selected |
| --- | --- | --- |
| A | Preview before transaction confirm | ✓ |
| B | Only after transaction posts | |
| C | Both pre and post always visible | |

**User's choice:** Recommended for all.

---

## State handling (empty/loading/error/conflict)

| Option | Description | Selected |
| --- | --- | --- |
| A | Plain text | |
| B | Guided CTA: create first goal + brief explainer | ✓ |
| C | Example/mock goals | |

| Option | Description | Selected |
| --- | --- | --- |
| A | Spinner-only | |
| B | Skeletons for cards/list + progressive reveal | ✓ |
| C | Block whole page until all loaded | |

| Option | Description | Selected |
| --- | --- | --- |
| A | Generic toast only | |
| B | Inline recoverable errors + retry + toast | ✓ |
| C | Silent fallback stale data | |

| Option | Description | Selected |
| --- | --- | --- |
| A | Aggressive polling only | |
| B | Manual refresh only | |
| C | React-query refresh + mutation invalidation + updated cues | ✓ |

**User's choice:** Recommended for all.

---

## the agent's Discretion

- Visual micro-details (spacing/typography/copy).
- Exact urgency scoring mechanics.
- Exact badge styling details.

## Deferred Ideas

None.
