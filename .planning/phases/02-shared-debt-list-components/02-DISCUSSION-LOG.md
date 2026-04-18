# Phase 2: shared debt list components - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-04-18T00:15:15-03:00
**Phase:** 02-shared-debt-list-components
**Areas discussed:** responsive debt-list UX, shared component API contract, permission/action matrix, extraction boundary, navigation behavior

---

## Responsive debt-list UX

| Option | Description | Selected |
| --- | --- | --- |
| Unified component + variant props | One shared component with mobile/desktop/auto variants | ✓ |
| Separate components per breakpoint | Explicit mobile + desktop components |  |
| Table-first responsive collapse | Keep table canonical and collapse on mobile |  |

**User's choice:** Unified component + variant props.
**Notes:** User selected option 1.

| Option | Description | Selected |
| --- | --- | --- |
| Row primary-action + inline secondary actions | Tap row to open details while inline actions remain | ✓ |
| Actions-only | No row open action |  |
| Row opens menu/sheet | Secondary menu flow on row tap |  |

**User's choice:** Row primary-action + inline secondary actions.
**Notes:** User selected option 1.

| Option | Description | Selected |
| --- | --- | --- |
| Standardized shared states | Skeleton loading + empty CTA + inline retry | ✓ |
| Minimal states | Spinner + plain empty + toast-only errors |  |
| Page-owned states only | Shared list receives already-resolved view state |  |

**User's choice:** Standardized shared states.
**Notes:** User selected option 1.

| Option | Description | Selected |
| --- | --- | --- |
| Compact default | Description + date/status + amount/actions | ✓ |
| Detailed default | More metadata shown by default |  |
| Compact + expand | Compact with expandable details |  |

**User's choice:** Compact default.
**Notes:** User selected option 1.

---

## Shared component API contract

| Option | Description | Selected |
| --- | --- | --- |
| View-model contract | Page maps domain into shared list VM | ✓ |
| Raw domain objects | Pass domain entities directly into shared component |  |
| Hybrid | VM base with raw payload escape hatch |  |

**User's choice:** View-model contract.
**Notes:** User selected option 1.

| Option | Description | Selected |
| --- | --- | --- |
| Capability-based callbacks | Optional handlers control visible actions | ✓ |
| Explicit action config array | Declarative action metadata list per item |  |
| Generic onAction(type,id) | Single callback for all actions |  |

**User's choice:** Capability-based callbacks.
**Notes:** User selected option 1.

---

## Permission/action matrix

| Option | Description | Selected |
| --- | --- | --- |
| Strict read-only public | No mutating actions in public surfaces |  |
| Confirm-only in public | Allow non-destructive confirm actions only |  |
| Mirror owner actions | Full owner parity in public surfaces |  |
| Custom | Public read-only except friend-public host can confirm someone paid them | ✓ |

**User's choice:** Custom policy.
**Notes:** "public pages must be read-only. except for friend public page. if friend is host, friend should be able to confirm that someone has paid them."

| Option | Description | Selected |
| --- | --- | --- |
| Confirm-only toggle action | Only confirmation toggle exposed in exception path |  |
| Also allow edit/delete | Additional mutating operations |  |
| Custom | Confirmation is reversible toggle; toggle-off must undo toggle-on effects | ✓ |

**User's choice:** Custom toggle semantics.
**Notes:** "confirm someone paid them should be a toggle... everything that confirms paid does, can be undone if it toggles it off after."

| Option | Description | Selected |
| --- | --- | --- |
| Strict full rollback | Revert all financial/projection effects + keep audit trail | ✓ |
| Soft rollback UI-only | Status flip only |  |
| Custom rollback | User-defined custom rollback rules |  |

**User's choice:** Strict full rollback.
**Notes:** User selected option 1.

---

## Extraction boundary

| Option | Description | Selected |
| --- | --- | --- |
| UI-only extraction | Shared component owns presentation; domain/mutations stay page/service | ✓ |
| UI + domain helper extraction | Shared layer also owns status/date/amount helpers |  |
| Deep extraction | Shared layer owns presentation + mutation orchestration |  |

**User's choice:** UI-only extraction.
**Notes:** User selected option 1.

---

## Navigation behavior

| Option | Description | Selected |
| --- | --- | --- |
| Keep current surface behavior | Shared list triggers onOpen, each page decides presentation |  |
| Modal everywhere | Standardize owner/public row-open to modal | ✓ |
| Route navigation everywhere | Standardize on route transitions |  |

**User's choice:** Modal everywhere.
**Notes:** User selected option 2.

| Option | Description | Selected |
| --- | --- | --- |
| Full-screen mobile modal/sheet | Mobile-optimized full-screen detail surface | ✓ |
| Centered dialog on mobile | Desktop-style modal on mobile too |  |
| Custom | User-defined mobile modal behavior |  |

**User's choice:** Full-screen mobile modal/sheet.
**Notes:** User selected option 1.

---

## the agent's Discretion

- Naming of view-model and callback TypeScript interfaces.
- Concrete component split and file placement under `web/src/components/`.
- Final microcopy for empty/loading/retry states.

## Deferred Ideas

None.
