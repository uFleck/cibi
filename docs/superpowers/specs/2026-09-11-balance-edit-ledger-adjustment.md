# Balance Edit → Ledger Adjustment

**Date**: 2026-09-11
**Status**: Ready to implement
**Branch**: implement from `main`

---

## Problem

`PATCH /api/accounts/:id` with `current_balance` calls `accRepo.UpdateBalance` directly, bypassing the ledger. This breaks the invariant established by the ledger layer: `SUM(ledger WHERE account_id = ?) = account.current_balance`. After a manual balance edit, the ledger is stale and the history is lost.

---

## Solution

Route balance edits through a `manual_adjustment` ledger entry. The entry amount is the delta (`target - current`). `LedgerService.RecordEntry` then updates `current_balance` via `SUM(ledger)` as it does for every other balance mutation.

---

## Design decisions (settled)

- Entry type: `manual_adjustment` (already in the ledger CHECK constraint).
- Amount stored: delta cents, not the target balance. Keeps ledger entries additive and auditable.
- If delta is zero: no-op — no entry created, no balance write.
- Description: `"Manual balance adjustment"` (hard-coded; no user input needed for now).
- Backward compat: accounts with no ledger rows (created before migration) get their first non-opening entry here. The opening balance row seeded by migration already anchors them, so this is safe.
- UI: no change needed. The accounts page already has an edit form for balance. The backend swap is transparent.

---

## Implementation

### 1. AccountsService — `UpdateAccount`

**File**: `internal/service/accounts.go`

Inject `ledgerSvc *LedgerService` into `AccountsService`. Update the constructor.

Current balance-update path:
```go
if balance != nil {
    if err := s.accRepo.UpdateBalance(id, *balance, nil); err != nil {
        return fmt.Errorf("service.UpdateAccount: balance: %w", err)
    }
}
```

Replace with:
```go
if balance != nil {
    // Read current balance to compute the delta.
    acc, err := s.accRepo.GetByID(id)
    if err != nil {
        return fmt.Errorf("service.UpdateAccount: get account: %w", err)
    }
    delta := *balance - acc.CurrentBalance
    if delta != 0 {
        if err := s.ledgerSvc.RecordEntry(sqlite.LedgerEntry{
            AccountID:   id,
            EntryType:   "manual_adjustment",
            Amount:      delta,
            Description: "Manual balance adjustment",
        }, nil); err != nil {
            return fmt.Errorf("service.UpdateAccount: record adjustment: %w", err)
        }
    }
}
```

Note: `delta` is in cents (int64). `*balance` coming from the handler is already cents (converted from dollars before calling the service — verify this in `accounts.go` handler and ensure the service receives cents, not dollars).

### 2. Handler — verify units

**File**: `internal/handler/accounts.go`

The `PatchAccountRequest.CurrentBalance` is `*float64` (dollars). The handler converts to cents before passing to the service. Confirm the conversion exists; if not, add:
```go
if req.CurrentBalance != nil {
    cents := int64(math.Round(*req.CurrentBalance * 100))
    balanceArg = &cents
}
```
Then pass `balanceArg` (cents) to `service.UpdateAccount`. The service must receive cents for the delta math to be correct.

### 3. App wiring

**File**: `internal/app/app.go`

`AccountsService` already exists. Inject `ledgerSvc`:
```go
accountsSvc := service.NewAccountsService(db, iAccRepo, ledgerSvc)
```
Update `NewAccountsService` signature accordingly.

---

## Files to modify

| File | Change |
|---|---|
| `internal/service/accounts.go` | Inject `ledgerSvc`, replace `accRepo.UpdateBalance` with `ledgerSvc.RecordEntry` |
| `internal/handler/accounts.go` | Verify dollars→cents conversion before service call |
| `internal/app/app.go` | Pass `ledgerSvc` to `NewAccountsService` |

---

## Verification

```bash
go build ./...
go test ./internal/...
make upd
```

Manual checks:
- Edit balance in UI → new `manual_adjustment` row appears in ledger tab on transactions page
- `GET /api/ledger?account_id=` shows the adjustment entry
- `GET /api/accounts` shows updated balance matching the edit
- Deleting the ledger adjustment entry via ledger tab reverts the balance correctly
