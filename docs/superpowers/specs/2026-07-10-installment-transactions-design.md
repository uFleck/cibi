# Installment Transactions Design

**Date:** 2026-07-10
**Status:** Approved

## Overview

Add installment support to regular transactions. Installment transactions represent a fixed-amount purchase paid over N periods (monthly or weekly), with progress confirmed manually — mirroring the existing peer debt installment pattern.

## Backend

### Migration

Add 3 columns to `transactions`:

```sql
is_installment     BOOLEAN NOT NULL DEFAULT FALSE
total_installments INTEGER NULL           -- null for non-installment rows
paid_installments  INTEGER NOT NULL DEFAULT 0
```

### Data model semantics

- `amount` = per-installment amount (negative for expenses)
- `anchor_date` = first due date (already exists on the table)
- `frequency` = `monthly` or `weekly` (already exists)
- `next_occurrence` = computed via existing `NextInstallmentDue(anchor_date, paid_installments, frequency)`
- When `paid_installments == total_installments`: `next_occurrence = null` (installment complete)

### API changes

`TransactionResponse` gains 3 fields:

```go
IsInstallment     bool   `json:"is_installment"`
TotalInstallments *int64 `json:"total_installments"`
PaidInstallments  int64  `json:"paid_installments"`
```

### New endpoint

`POST /transactions/:id/confirm-installment`
- Validates `is_installment=true` and `paid_installments < total_installments`
- Increments `paid_installments` by 1
- Returns updated transaction
- No decrement/undo (matches peer debt behaviour)

### Validation (create + update)

- `is_installment=true` requires: `total_installments > 0`, `anchor_date` set, `frequency` set
- `is_installment=true` is mutually exclusive with `is_recurring=true` (400 if both)
- On update: `total_installments` may be changed only if new value ≥ current `paid_installments`
- `paid_installments` is not user-editable via the standard update endpoint; only via confirm-installment

## Frontend

### `api.ts` — `TransactionResponse`

```ts
is_installment: boolean
total_installments: number | null
paid_installments: number
```

### `TransactionForm`

- New installment toggle (mutually exclusive with recurring toggle)
- When enabled: shows `total_installments` number input, `anchor_date`, `frequency` (monthly / weekly)
- `amount` field label updates to "Per installment amount"

### Transactions list

- Installment txns show progress badge: `3 / 12`
- "Confirm payment" button — increments progress; hidden when `paid == total`
- Completed installments (`paid == total`) rendered muted / marked done

### `StatCards` — reserved calculation

New `installmentObligations` term added to `reserved`:

```ts
const installmentObligations = recurringTxns
  .filter(t =>
    t.is_installment &&
    t.next_occurrence !== null &&
    (t.paid_installments ?? 0) < (t.total_installments ?? 0) &&
    isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
  )
  .reduce((sum, t) => sum + Math.abs(t.amount), 0)

const reserved = recurringReserved + peerObligations + installmentObligations
```

Reserved popover gets a new row: **"Installment obligations"** → `installmentObligations`.

### `ObligationsList`

Installment txns appear alongside recurring obligations, showing progress badge and confirm button.

## Edge cases

| Case | Behaviour |
|------|-----------|
| `is_installment=true` + `is_recurring=true` | 400 from API; form blocks both toggles being on |
| Confirm when `paid == total` | 400 from API; button hidden in UI |
| `total_installments` null on non-installment txn | Frontend guards with `?? 0` |
| Edit mid-installment | `paid_installments` preserved; `total_installments` editable if ≥ `paid` |
| Delete installment txn | Cascade; drops from reserved immediately |
| `next_occurrence=null` (complete) | Filtered from reserved; list marks as done |

## Files affected

**Backend**
- `internal/migrations/` — new migration file
- `internal/repo/sqlite/transaction.go` — read/write new columns
- `internal/service/transaction.go` — confirm-installment logic, validation
- `internal/handler/transaction.go` — new confirm-installment endpoint, response mapping
- `internal/handler/routes.go` — register new route
- `internal/engine/installment.go` — already handles `NextInstallmentDue`, no change needed

**Frontend**
- `web/src/lib/api.ts` — `TransactionResponse` type, confirm-installment fetch fn
- `web/src/components/TransactionForm.tsx` — installment toggle + fields
- `web/src/components/StatCards.tsx` — `installmentObligations` in reserved calc + popover row
- `web/src/components/ObligationsList.tsx` — show installment txns + confirm button
- `web/src/pages/transactions.tsx` — wire confirm-installment mutation
