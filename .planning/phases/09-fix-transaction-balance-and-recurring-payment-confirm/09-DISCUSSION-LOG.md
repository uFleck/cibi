# Phase 9: Fix Transaction Balance and Recurring Payment Confirm — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 09-fix-transaction-balance-and-recurring-payment-confirm
**Areas discussed:** Balance updates on transaction create/update, Recurring payment confirmation flow, Balance adjustment on transaction update

---

## Balance updates on transaction create/update

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic sync | Account balance automatically adjusts when transaction is created/updated | ✓ |
| Manual only | Balance is separate, transactions don't affect it until explicitly reconciled | |
| Hybrid per-transaction | User decides when creating, can toggle per-transaction | |

**User's choice:** Automatic sync
**Notes:** Recommended option. Balance should always reflect transactions automatically — aligns with core CIBI value that "Can I Buy It?" must always be correct.

---

## Recurring payment confirmation flow

| Option | Description | Selected |
|--------|-------------|----------|
| Manual confirm each | User manually clicks 'Confirm Paid' when each recurring transaction is due | ✓ |
| Automatic on due date | Auto-debit/confirm when next_occurrence date passes | |
| Auto-confirm recurring (opt-in) | User confirms once, all future debits handled automatically | |

**User's choice:** Manual confirm each
**Notes:** Recommended option. User wants full control over timing — no automatic debits.

## Where should the manual confirm appear in the UI?

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm button list | List of upcoming recurring transactions with a 'Confirm Paid' button next to each | ✓ |
| Modal detail view | Click on a transaction to open a modal with confirm option | |
| Dedicated confirm page | Dedicated page showing only pending confirmations with bulk actions | |

**User's choice:** Confirm button list
**Notes:** Quick one-click confirmation in the transactions list — no navigation needed.

---

## Balance adjustment on transaction update

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-sync | Balance automatically recalculates based on old and new amounts | ✓ |
| Manual only | User manually adjusts balance after editing a transaction | |

**User's choice:** Auto-sync
**Notes:** Recommended option. Consistent with create behavior — balance always stays in sync.

---

## the agent's Discretion

- Backend implementation approach (service method structure, repository changes)
- API endpoint design for confirmation action
- Frontend component styling and animation preferences

## Deferred Ideas

None