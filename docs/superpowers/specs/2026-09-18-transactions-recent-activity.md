# Transactions Page — Recent Activity Widget

**Date:** 2026-09-18
**Status:** Not started

---

## Problem

`/transactions` shows scheduled/planned transactions (recurring bills, pending payments). No chronological feed of what actually happened — confirmed payments, confirmed debts, payday receipts. User has to go to the home page to see `LedgerRecentWidget`.

---

## Solution

Add a **Recent activity** section to the Transactions tab (below the impact card, above the filter button).

Reuse `LedgerRecentWidget` — it already fetches `GET /api/ledger?account_id=` and renders the last 5 entries with date, description, and signed amount. No new API work needed.

### Placement in `transactions.tsx`

Insert `<LedgerRecentWidget account={currentAccount} />` inside the `{activeTab === 'transactions' && <>...</>}` block, between the unconfirmed impact card and the `<TransactionFilters />` line.

`currentAccount` = `accounts.find(a => a.id === currentAccountId)`.

Only render if account exists (already guarded by `currentAccountId` logic).

### LedgerRecentWidget API

```tsx
interface Props {
  account: AccountResponse
}
```

Already imported via `@/lib/api` — `AccountResponse` is exported there.

---

## Files to change

| File | Change |
|---|---|
| `web/src/pages/transactions.tsx` | Import `LedgerRecentWidget`, derive `currentAccount`, render widget in Transactions tab |

No backend changes. No new components.

---

## Verification

- Open `/transactions`, Transactions tab
- Recent activity card appears between impact summary and filter button
- Shows last 5 ledger entries for the selected account
- Each row: date · description · signed amount (green positive, red negative)
- "View all" link at bottom (already in `LedgerRecentWidget`) — navigates to `/transactions` (no-op on same page; acceptable)
