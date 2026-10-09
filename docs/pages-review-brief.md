# Cibi Dashboard & Transactions Pages — Review Brief

> For an AI reviewer to assess functionality, UX effectiveness, and correctness of these two pages.

---

## 1. Domain Overview

**Cibi** ("Can I buy it?") is a personal finance decision-support app. It helps users answer: *given my balance, upcoming bills, peer debts, and goals — can I afford this purchase right now?*

### Core Entities

| Entity | Purpose |
|---|---|
| **Account** | A financial ledger (e.g. checking, savings). Has `current_balance`, `currency`, `safety_buffer`, `is_default`. |
| **Transaction** | A money movement. Can be one-time or **recurring** (weekly/bi-weekly/semi-monthly/monthly/yearly). Recurring txns have `frequency`, `anchor_date`, and a computed `next_occurrence`. One-time txns can have `requires_confirmation` (pending/confirmable). |
| **PaySchedule** | Defines the user's income rhythm — when money arrives. Each schedule has `frequency`, `anchor_date`, and an optional second day-of-month (semi-monthly). Multiple schedules supported (union window: uses earliest next payday). |
| **Friend** | Peer-to-peer debt tracking. Friends can owe the user or the user can owe friends. Ties to group events and PIX payments. |
| **Goal** | Savings target with `target_amount`, optional `target_date_utc`, and per-window minimum contribution. Tracked via ledger entries and auto-progress. |

### The Financial Window

The **pay window** is the period from the last payday to the next payday. Recurring obligations stay "visible" (counted against purchasing power) until their next occurrence passes the window boundary OR they are confirmed.

- `isInCurrentPayWindow(occurrence, now, nextPayday)` — checks if a recurring txn is due in the current window and hasn't been confirmed yet.
- When multiple pay schedules exist, the **earliest** next payday across all schedules defines the window.

### The Engine (`CanIBuyIt`)

This is the core decision algorithm. Input: `account_id` + `item_price` (cents). Output: `EngineResult`.

```
purchasing_power = current_balance
                 + sum(upcoming_obligations)        // obligations ≤ 0, debits
                 + sum(upcoming_peer_obligations)   // money user owes friends
                 + sum(upcoming_group_obligations)  // admin obligations from group events
                 - safety_buffer

can_buy = purchasing_power >= item_price
buffer_remaining = purchasing_power - item_price
```

**Risk Levels:**
- `BLOCKED` — can't buy even now; won't afford after payday either
- `WAIT` — can't buy now but *will* afford after next payday (payday income incoming)
- `LOW` — can buy, small impact (buffer_remaining ≥ safety_buffer)
- `MEDIUM` — can buy, moderate impact
- `HIGH` — can buy but tight (buffer_remaining < safety_buffer)

**Goal Impact:** Per-goal projection — how this purchase affects progress toward each goal.

**Performance constraint:** Must complete in <100ms.

---

## 2. Dashboard Page (`/`)

**Route:** Index route (`/`), component: `Dashboard` (defined in `./web/src/router.tsx`).

### Data Dependencies

```
fetchAccounts()           → allAccounts (account list)
fetchTransactions(id)     → transactions
listPaySchedules(id)       → paySchedules
fetchFriendBreakdown(id)  → friendBreakdown
fetchFriendReceivablesBreakdown(id) → friendReceivables
```

Account selection: uses `AccountContext.selectedAccountId`. Falls back to default account or first account. All queries are scoped to the selected account.

### Widget Composition (top to bottom)

1. **StatCards** (`./web/src/components/StatCards.tsx`)
   - **Balance** — raw `current_balance`
   - **Reserved** — sum of recurring obligations in current window + peer obligations (friend debts due before next payday)
   - **Liquid** = Balance - Reserved
   - Color coding: Liquid ≤ 0 shows red (`--color-verdict-no`), positive shows green

2. **GoalsSnapshotWidget** — compact overview of goal progress

3. **CheckWidget** (`./web/src/components/CheckWidget.tsx`)
   - "Can I buy it?" interactive: user enters a price → calls `POST /api/engine/check`
   - Displays verdict: risk badge (color-coded), purchasing power, buffer remaining
   - WaitUntil shows formatted date when risk=WAIT
   - Per-goal impact cards with progress before/after

4. **FriendLedgerWidget** — friend debt summary (what friends owe you / what you owe friends)

5. **ObligationsList** (`./web/src/components/ObligationsList.tsx`)
   - Filtered list of recurring transactions in current window
   - Sorted by `next_occurrence` ascending
   - Shows description, amount, date
   - Footer: total reserved

6. **ProjectionWidget** (`./web/src/components/ProjectionWidget.tsx`)
   - Bar chart (Recharts) showing next window cash flow
   - Toggles for "I owe friends" / "Friends owe me"
   - Bars: Incoming (pay schedule), Obligations (next window recurring), Net
   - Uses earliest payday after current window start as window end

7. **PayScheduleList** — lists configured pay schedules

### Edge Cases Handled
- Zero accounts → CTA card "Create your first account"
- Account loading → skeleton placeholders (3 cards, animate-pulse)
- Query errors → toast "Could not load financial data. Retrying in 30 seconds"
- No pay schedules → ObligationsList shows empty state; CheckWidget returns PAY_SCHEDULE_REQUIRED error
- Multi-account → account selector in header; dashboard re-queries on change
- No next payday → ProjectionWidget returns null (hidden)

---

## 3. Transactions Page (`/transactions`)

**Route:** `/transactions`, component: `TransactionsPage` (in `./web/src/pages/transactions.tsx`).

### Data Dependencies

```
fetchAccounts()
fetchTransactions(currentAccountId)
listPaySchedules(currentAccountId)
fetchFriendBreakdown(currentAccountId)
```

Mutations: `createTransaction`, `updateTransaction`, `deleteTransaction`, `confirmTransaction`.

### Page Structure

**Top bar:**
- "Transactions" heading
- "New Transaction" button (desktop) + FAB (mobile, fixed bottom-right)
- Filter toggle button (shows active filter count badge)

**Filters** (`./web/src/components/TransactionFilters.tsx`):
- **Presets:** `due-now`, `current-window`, `next-window`, `all-recurring`, `one-time-only`
- **Category** dropdown (from predefined CATEGORIES list)
- **Sort:** by description / date / amount, asc/desc
- Active filter badge: counts non-default filters

**Impact Summary** (when pay schedules exist):
- **Due now:** count and total amount of confirmable (one-time, unconfirmed) transactions due before earliest payday
- **Next window:** count and total amount of confirmable txns due between next payday and following payday
- Shows projected balance after each

**Transaction List** (via `SharedDebtList`):
- Each row: description, category, amount (color-coded: positive=green, negative=red), date
- Recurring indicator
- Confirmation status (pending/confirmed)
- Click → edit modal
- Swipe/tap → delete (confirm dialog)

### CRUD Operations

**Create** (`TransactionForm` modal):
- Fields: account_id, amount, description, category, is_recurring toggle
- When recurring: frequency + anchor_date
- One-time: `requires_confirmation` toggle
- Category autofill: `suggestCategoryFromDescription()` on description change
- Validation: amount required, account required, recurring requires anchor_date + frequency
- On success: toast + refetch queries + reset form

**Edit:** Same modal, pre-filled. Backend handles balance adjustment if amount changed and txn already applied to balance.

**Delete:** Confirm dialog → calls `deleteTransaction`. Backend reverses balance impact if already applied.

**Confirm:** For one-time txns with `requires_confirmation=true` — calls `confirmTransaction`. Backend marks `confirmed_at` and applies balance if not already applied.

### Impact Logic (`./web/src/lib/transactions-impact.ts`)

`buildImpactSummary()` computes:
- Confirmable txns in current window (due before next payday)
- Confirmable txns in next window (between next and following payday)
- Projected balance after each window

`matchesPresetFilter()` maps presets to window-based filtering.

### Edge Cases Handled
- Account switching → refetches transactions for new account
- No account selected → uses first account or default
- Loading state → skeleton rows
- Empty state → "No transactions yet" message
- Error state → error message with retry
- Optimistic updates via `useQueryClient.invalidateQueries`
- Form validation errors shown inline per field
- Amount parsing: handles locale-aware input (BRL: "1.234,56")

---

## 4. Architecture Notes

- **Frontend:** React + TypeScript, Vite, TanStack Router, TanStack Query v5, shadcn/ui, Recharts, Tailwind CSS
- **Backend:** Go + Echo framework, SQLite, embedded SPA
- **API:** REST via `apiFetch()` wrapper, error handling with code + status
- **State:** Account selection via React Context, server state via TanStack Query
- **Mobile-first:** responsive layout (grid-cols-1 sm:grid-cols-3), mobile bottom nav, FAB, safe-area-inset-bottom

### Key Review Dimensions

| Dimension | What to Check |
|---|---|
| **Correctness** | Window boundary math, purchasing power formula, balance updates, currency handling |
| **Loading states** | Skeletons present, no layout shift, SR-only loading text |
| **Error handling** | Toast on query errors, retry behavior, form validation errors, network failure |
| **Empty states** | Zero accounts CTA, zero transactions message, no-pay-schedule states |
| **Edge cases** | Multi-account, multi-schedule union window, semi-monthly day clamping, DST/UTC date handling |
| **Accessibility** | aria-label, role attributes, tabular-nums, form labels, focus management |
| **Performance** | Engine <100ms SLA, Query caching, no unnecessary refetches |
| **Mobile UX** | FAB position, safe-area-inset, touch targets, bottom nav |
