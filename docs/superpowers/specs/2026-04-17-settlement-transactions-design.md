# Settlement Transactions Design

**Date:** 2026-04-17
**Status:** Approved

## Problem

When a peer debt or group event participant payment is confirmed, the account `current_balance` is never updated. Confirmation only sets flags in the debt tables — no transaction is created, no balance moves.

## Solution

Confirming a peer debt or group event participant creates a settlement `Transaction` record and atomically updates the account balance. Un-confirming deletes the settlement transaction and reverses the balance. A new `origin` column on `Transaction` identifies the source, and `source_id` enables back-reference for auto-deletion.

---

## Migration

New nullable columns added to the `Transaction` table:

| Column | Type | Description |
|--------|------|-------------|
| `origin` | `TEXT` | Source of the transaction. NULL = manual user entry |
| `source_id` | `TEXT` | Back-reference to source row for auto-deletion |

**Origin values** (constants in `sqlite` package):

```go
const (
    TxnOriginPeerDebt   = "peer_debt_settlement"
    TxnOriginGroupEvent = "group_event_settlement"
)
```

**source_id format:**
- Peer debt: `peer_debt.id` (UUID string)
- Group event participant: `"<event_id>:<friend_id>"` (colon-separated UUIDs)

---

## Transaction struct

Add two fields to `sqlite.Transaction`:

```go
Origin   *string // nil = manual
SourceID *string // nil = manual; set for peer_debt/group_event settlements
```

---

## Description format

| Scenario | Description |
|----------|-------------|
| Peer debt lump-sum | `"Friend debt settlement – [FriendName]: [Description]"` |
| Peer debt installment | `"Friend installment [N]/[Total] – [FriendName]: [Description]"` |
| Group event (admin receives from friend) | `"Group event '[Title]': received [FriendName]'s share"` |
| Group event (admin pays host friend) | `"Group event '[Title]': paid share to [FriendName]"` |

---

## Amount direction

| Scenario | Amount |
|----------|--------|
| Peer debt: friend owes user (positive debt) | `+debt.Amount` (credit) |
| Peer debt: user owes friend (negative debt) | `debt.Amount` (debit, already negative) |
| Peer installment | `debt.Amount / total_installments` |
| Group event: admin is host, friend pays | `+share_amount` (credit) |
| Group event: friend is host, admin pays | `-share_amount` (debit) |

---

## Confirm flow (atomic)

Both peer debt and group event follow the same pattern:

```
BEGIN db transaction
  1. Fetch debt/participant row (amount, account_id, description/title)
  2. Fetch friend name (for description string)
  3. Fetch account (current balance)
  4. Mark as confirmed in DB (within tx)
  5. txnsRepo.Insert(settlement Transaction, tx)
  6. accRepo.UpdateBalance(accountID, balance + settlementAmount, tx)
COMMIT
```

---

## Un-confirm flow (atomic)

```
BEGIN db transaction
  1. Unmark confirmed in DB (within tx)
  2. SELECT settlement txn by source_id + origin
     (installment: ORDER BY timestamp DESC LIMIT 1 — delete most recent)
  3. accRepo.UpdateBalance(accountID, balance - txn.Amount, tx)
  4. txnsRepo.DeleteByID(txn.ID, tx)
COMMIT
```

---

## Repo interface changes

### PeerDebtRepo
- `ConfirmInstallment(id uuid.UUID, tx *sql.Tx) error` — add tx param
- `UnconfirmInstallment(id uuid.UUID, tx *sql.Tx) error` — new: `paid_installments = MAX(paid_installments - 1, 0)` for installment debts; `is_confirmed = 0` for lump-sum

### GroupEventRepo
- `SetParticipantConfirmed(eventID, friendID uuid.UUID, confirmed bool, tx *sql.Tx) error` — add tx param

### TransactionsRepo
- `FindBySourceID(sourceID, origin string) ([]Transaction, error)` — new: lookup for un-confirm

---

## Service dependency changes

Both services gain:

```go
db       *sql.DB
txnsRepo sqlite.TransactionsRepo
accRepo  sqlite.AccountsRepo
friendRepo sqlite.FriendRepo  // for friend name in description
```

Wired in `internal/app/app.go`.

---

## API changes

### New routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/peer-debts/:id/unconfirm` | Reverse a peer debt confirmation |
| `POST` | `/group-events/:id/participants/:friendId/confirm` | Admin confirms friend paid their share |
| `POST` | `/group-events/:id/participants/:friendId/unconfirm` | Admin reverses friend confirmation |

### Updated routes

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/peer-debts/:id/confirm` | Now creates settlement transaction + updates balance |

### Unchanged

- `POST /public/friend/:token/groups/:eventID/participants/:friendID/confirm` — no account context, no transaction created

---

## Out of scope

- Admin's own share confirmation for group events where friend is host via public API (no account context available)
- Retroactive settlement transactions for debts confirmed before this feature shipped
