# Transactions Restructure — Full Spec

**Date:** 2026-09-10
**Updated:** 2026-09-18
**Status:** Phase 1 partially done. Phase 2 not started.

---

## Status by phase

| Phase | Item | Status |
|---|---|---|
| 1A | DB migration (merge peer_debts → Transaction, drop category) | ✅ Done (`20260910000001_merge_peer_debts.go`) |
| 1B | Peer debt repo retargeted to Transaction table | ❌ Not done — still queries `PeerDebt` directly |
| 1C | Category removed from handler/service/repo/TS types | ✅ Done |
| 1D | Pay schedule bug fixes (advance-by-2, business day, income txn) | ⚠️ Partial — advance logic intact, no holiday adjustment, income row superseded by ledger |
| 2A | Offcanvas sheets everywhere | ❌ Not done |
| 2B | Transactions page two tabs (Transactions \| Friend Debts) | ❌ Not done |
| 2C | Friends page cleanup (remove debt list) | ❌ Not done |
| 2D | Accounts page redesign (smart payday banner) | ❌ Not done |
| 2E | Delete category autofill | ❌ Not done |

**Branch situation:** `feat/recurrent-friend-debts` is fully merged into main (all its commits are ancestors of HEAD). It can be deleted. No rebase needed.

---

## What remains

### 1B. Peer debt repo — retarget to Transaction table

The migration copied all existing `PeerDebt` rows into `Transaction` (type=`'peer'`) and created a backward-compat `peer_debts` VIEW. But `internal/repo/sqlite/peer_debt.go` still reads/writes the original `PeerDebt` table. New peer debts are NOT going into the Transaction table — data is diverging.

All queries in `peer_debt.go` must target `"Transaction" WHERE type = 'peer'`. Key column mapping:

| PeerDebt column | Transaction column |
|---|---|
| `date` | `timestamp` |
| `is_confirmed` | `confirmed_at IS NOT NULL` |
| (none) | `type = 'peer'` filter on every query |

Once done, `PeerDebt` table and `peer_debts` view can stay (they're harmless).

### 1D. Pay schedule — remaining items

**Business day adjustment.** `internal/holidays/` directory exists. When a computed payday falls on a weekend or Brazilian national holiday, shift backward to the previous business day. Affects `NextPayday` in `internal/engine/engine.go`.

**Income transaction row.** Originally wanted an INSERT into Transaction on confirm. Superseded by the ledger system — `ConfirmPayday` already records a ledger entry (type: `income`). No action needed.

### 2A. Offcanvas (Sheet) everywhere

Replace `AppModal` (dialog-based) with `Sheet` from `web/src/components/ui/sheet.tsx` for all edit forms. `EditSheet.tsx` wrapper exists at `web/src/components/EditSheet.tsx` — wire it into transaction, peer debt, and account forms.

- Desktop: `side="right"`, ~480px wide
- Mobile (`< md`): `side="bottom"`, full width, ~85vh
- Keep `Dialog`/`AlertDialog` only for destructive confirmations

### 2B. Transactions page — two tabs

**File:** `web/src/pages/transactions.tsx`

Add tabs: **Transactions** (type=`personal`) and **Friend Debts** (type=`peer`). Tab state in URL param or local state.

`GET /api/transactions` already returns all rows including type=`peer`. Frontend filters by `type`. No backend change needed beyond 1B being done.

Filter bar on Friend Debts tab:
- Friend selector dropdown (from `/api/friends`)
- Direction: "I owe" / "They owe"
- Status: confirmed / pending
- No category filter (category is gone)

### 2C. Friends page cleanup

Remove debt creation form and debt list from `web/src/pages/friends.tsx`. Friends page = friend list + group events only. All debt management moves to Transactions → Friend Debts tab.

### 2D. Accounts page — smart payday banner

Show banner when `next_payday` date = today:

```tsx
{isToday(nextPayday) && (
  <Alert>
    <p>Today is payday! Did you receive it?</p>
    <Button onClick={() => confirmPayday(scheduleId)}>Mark as received</Button>
  </Alert>
)}
```

Pay schedule edit: replace inline always-open form with edit icon → Sheet offcanvas.

### 2E. Delete category autofill

- Delete `web/src/lib/category-autofill.ts` and `web/src/__tests__/category-autofill.test.ts`
- Remove all usages of `suggestCategoryFromDescription`, `categoryAutofilled`
- Remove category filter from transaction form and filter panel

---

## Execution order

```
1B (peer debt repo) ──────────────────────────────────────────────────────┐
1D (holiday adjustment, independent)                                       │
                                                                           ↓
                                              2B (tabs) → 2C (friends) → done
2A (sheets, independent of 1B) ───────────────────────────────────────────┘
2E (category cleanup, independent) ─── any time
2D (accounts banner, independent) ──── any time
```

2B depends on 1B so peer debt data flows through Transaction.

---

## Verification after 2B

- `GET /api/transactions?account_id=X` returns rows with `type: "personal"` and `type: "peer"`
- Transactions tab shows only `personal` rows; Friend Debts tab shows only `peer` rows
- Creating a new peer debt inserts into `Transaction` (type=`peer`), NOT `PeerDebt`
- Existing peer debts visible on Friend Debts tab
- Peer debt confirmation flows through ledger (`manual_adjustment`)
