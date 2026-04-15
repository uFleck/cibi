# Phase 9: Fix Transaction Balance and Recurring Payment Confirm — Research

**Researched:** 2026-04-14
**Status:** Ready for planning

---

## 1. Technical Approach Analysis

### 1.1 Balance Sync on Transaction Create

**Current behavior (BUG):**
- `TransactionsService.CreateTransaction` only calls `txnsRepo.Insert(t)`
- Account balance is NOT updated when a transaction is created
- D-01 requires: Debit (negative amount) reduces balance, Credit (positive amount) increases balance

**Required changes:**
1. Service needs access to `AccountsRepo` (already has via `accRepo` field)
2. Insert must be atomic: transaction insert + balance update in same SQL transaction
3. Formula: `new_balance = current_balance + transaction.amount`

**Implementation options:**

| Option | Pros | Cons |
|--------|------|------|
| A: Service-level transaction | Simple, uses existing pattern | Requires passing `*sql.Tx` to repo methods that don't have it |
| B: Repo accepts tx param | Already pattern in accounts.go | Requires adding tx param to transaction insert |
| C: Two-phase commit | Independent operations | NOT atomic - violates D-01/D-02 |

**Recommendation:** Option B - Add `*sql.Tx` parameter to `TransactionsRepo.Insert` so service can wrap both in atomic transaction.

### 1.2 Balance Sync on Transaction Update

**Current behavior (BUG):**
- `TransactionsService.UpdateTransaction` only calls `txnsRepo.Update(id, upd)`
- When amount changes, balance is NOT recalculated
- D-02 requires: `new_balance = old_balance - old_amount + new_amount`

**Required changes:**
1. Fetch current transaction to get old amount
2. Fetch current account to get old balance
3. Calculate new balance
4. Update transaction AND balance atomically

### 1.3 Recurring Transaction Confirmation

**Current behavior:**
- `RecordDebit` advances next_occurrence but doesn't update balance
- No manual confirmation workflow exists
- D-03 requires: User explicitly clicks "Confirm Paid", no automatic debit

**Required changes:**
1. New service method: `ConfirmRecurring(transactionID)` or similar
2. Should behave like RecordDebit but ALSO apply the debit to balance
3. D-03 specifies: "Only confirmed transactions advance next_occurrence"
4. New API endpoint: `POST /transactions/:id/confirm` (or similar)

---

## 2. Code Context

### 2.1 Existing Service Pattern

```go
// TransactionsService has access to both repos
type TransactionsService struct {
    txnsRepo sqlite.TransactionsRepo
    accRepo  sqlite.AccountsRepo
}
```

### 2.2 Repo Methods Available

- `AccountsRepo.UpdateBalance(id, balance, tx)` - takes optional tx for atomic ops
- `TransactionsRepo.Insert(t)` - currently NO tx param
- `TransactionsRepo.Update(id, upd)` - currently NO tx param
- `TransactionsRepo.GetByID(id)` - for fetching old values

### 2.3 Handler Entry Points

- `POST /transactions` → `CreateTransaction` (needs balance sync)
- `PATCH /transactions/:id` → `UpdateTransaction` (needs balance recalc on amount change)
- New: `POST /transactions/:id/confirm` → confirmation endpoint

---

## 3. UI Requirements (from CONTEXT.md)

### D-04: Inline Confirm Button
- Each transaction row in recurring list has "Confirm Paid" button
- List shows all recurring transactions (upcoming and overdue)
- One-click confirmation without navigation

### Dashboard Integration
- Existing: Phase 5 CONTEXT mentions TanStack Query patterns
- Recurring transactions likely displayed in Dashboard transactions list
- Need to add confirm button to each row

---

## 4. Validation Architecture

### Dimension 8: Verification Criteria

This is a bug fix phase with three distinct fixes. Each fix should have specific verification:

1. **Balance sync on create:**
   - Create transaction with amount $50 → account balance increases by $50
   - Create transaction with amount -$30 → account balance decreases by $30

2. **Balance sync on update:**
   - Update transaction amount from $50 to $80 → balance increases by $30
   - Update transaction amount from $50 to $20 → balance decreases by $30

3. **Recurring confirmation:**
   - List shows recurring transactions needing confirmation
   - Clicking "Confirm Paid" applies debit AND advances next_occurrence
   - Unconfirmed recurring transactions do NOT auto-debit

---

## 5. Dependencies

- **Phase 8 (Friend Ledger):** No direct dependency - this is a standalone fix
- **Phase 5 (Web Dashboard):** UI patterns for adding confirm button to transactions list
- **TXN-01, TXN-02:** Requirements in REQUIREMENTS.md that define transaction CRUD

---

## 6. Implementation Notes

### Service Layer Changes

1. `TransactionsService.CreateTransaction`:
   - Begin SQL transaction
   - Insert transaction
   - Calculate new balance: `account.CurrentBalance + txn.Amount`
   - Update account balance
   - Commit

2. `TransactionsService.UpdateTransaction`:
   - If amount is being changed:
     - Begin SQL transaction
     - Fetch old transaction (for old amount)
     - Fetch account (for current balance)
     - Update transaction
     - Recalculate: `old_balance - old_amount + new_amount`
     - Update account balance
     - Commit

3. New method `ConfirmRecurring(id)`:
   - Similar to RecordDebit but also applies balance change
   - Advances next_occurrence (same logic as RecordDebit)

### Repo Changes

- `TransactionsRepo.Insert(t, tx *sql.Tx)` - add optional tx parameter
- `TransactionsRepo.Update(id, upd, tx *sql.Tx)` - add optional tx parameter

### API Changes

- `POST /transactions/:id/confirm` - confirm recurring transaction

### UI Changes

- Add "Confirm Paid" button to recurring transaction list rows

---

*Research complete - planning can proceed*
