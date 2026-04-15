# Phase 9: Fix Transaction Balance and Recurring Payment Confirm — Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Fixes three related bugs in the transaction/account balance system:
1. Non-recurring transactions not deducted from balance on creation
2. Transaction value updates not adjusting balance
3. Recurring transactions need a confirmation mechanism before debiting

This phase focuses on correct balance synchronization and manual confirmation workflow for recurring payments.

</domain>

<decisions>
## Implementation Decisions

### Balance Synchronization (Create)
- **D-01:** Account balance automatically updates when a transaction is created
  - Debit (negative amount) reduces balance
  - Credit (positive amount) increases balance
  - Applies to both recurring and non-recurring transactions
  - Atomic with transaction insert

### Balance Synchronization (Update)
- **D-02:** When a transaction's amount changes, balance automatically recalculates
  - Formula: new_balance = old_balance - old_amount + new_amount
  - Handles both increase and decrease scenarios
  - Atomic with transaction update

### Recurring Payment Confirmation
- **D-03:** Manual confirmation per occurrence — user explicitly clicks "Confirm Paid"
  - No automatic debit when due date passes
  - User has full control over timing of confirmation
  - Only confirmed transactions advance next_occurrence

### UI Placement
- **D-04:** Confirm button appears inline in the recurring transactions list
  - Each transaction row has a "Confirm Paid" button
  - List shows all recurring transactions (upcoming and overdue)
  - Quick one-click confirmation without navigating away

### the agent's Discretion
- Backend implementation approach (service method structure, repository changes)
- API endpoint design for confirmation action
- Frontend component styling and animation preferences

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value: "Can I Buy It?" must always be correct
- `.planning/REQUIREMENTS.md` — TXN-01, TXN-02 define transaction CRUD and debit flow
- `.planning/ROADMAP.md` — Phase 9 depends on Phase 8 (Friend Ledger)

### Prior Phase Context
- `.planning/phases/03-cli/03-CONTEXT.md` — Safety buffer default 0 → 1000 cents
- `.planning/phases/05-web-dashboard/05-CONTEXT.md` — React + TanStack Query patterns

### Code Context
- `internal/service/transactions.go` — Existing CreateTransaction, RecordDebit methods
- `internal/repo/sqlite/transactions.go` — Transaction repo interface
- `internal/repo/sqlite/accounts.go` — AccountsRepo with UpdateBalance method
- `internal/handler/transactions.go` — Existing HTTP handlers

[No external specs — requirements captured in decisions above]

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AccountsRepo.UpdateBalance(id, balance, tx)` — Already exists, ready to use
- `TransactionsService.RecordDebit()` — Confirms recurring debit pattern, can adapt for confirm
- `TransactionsService.UpdateTransaction()` — Entry point for balance sync on updates

### Established Patterns
- Service layer orchestrates repo calls (see transactions.go)
- Atomic operations via sql.Tx passed through to repos
- Handler wraps service errors into structured JSON responses

### Integration Points
- `POST /transactions` handler → add balance sync
- `PATCH /transactions/:id` handler → add balance recalculation
- New endpoint: `POST /transactions/:id/confirm` for recurring confirmation
- Dashboard transactions list → add confirm button

</code_context>

<specifics>
## Specific Ideas

- Balance sync should be atomic — if transaction insert fails, balance shouldn't change
- Recurring confirm advances next_occurrence (same as RecordDebit logic)
- UI should show which recurring transactions are due/overdue for confirmation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-fix-transaction-balance-and-recurring-payment-confirm*
*Context gathered: 2026-04-14*