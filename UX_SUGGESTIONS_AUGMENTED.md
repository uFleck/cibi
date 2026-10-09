# CIBI UX Suggestions — Augmented

> Original analysis (Sections 1–3) preserved. New entries marked **`[NEW]`**.

---

## 1. Transactions Page (`/transactions`)

### A. Bridging the "Impact Summary" and "Filters" Disconnect

**Current:** Clicking "Due now" / "Next window" impact cards sets the preset filter, but cards feel visually isolated from the actual `TransactionFilters` controls below.

**Solution:**
- **Selected states for cards:** When a user clicks "Due now", give the card itself an active visual state (border highlight or background shift to accent color).
- **Synchronized filter badge:** Simultaneously highlight the matching preset chip in `TransactionFilters`. If the filter bar is collapsed, show a dismissible badge like `Filtering by: Due Now [x]` next to the list header.

**Why:** Closes the feedback loop. User immediately sees the card they clicked is driving the table state.

---

### B. One-Tap / Swipe Confirmations

**Current:** Marking pending one-time transactions as confirmed requires opening a full modal.

**Solution:**
- **Desktop:** Inline checkmark button on unconfirmed rows → calls `confirmTransaction` in one click. Already partially wired — `SharedDebtList` renders a `<Check>` button when `canConfirm` is true. Need to ensure it's always visible (not hidden behind `<Eye>` for pending one-time items).
- **Mobile:** Right-swipe → green "Confirm" action; left-swipe → red "Delete".

**Why:** Keeping the ledger current is key for accurate Liquid Balance; reduce friction to help users maintain records.

---

### C. Differentiating Peer Debt and Standard Transactions

**Current:** Standard transactions and peer debts live in the same `SharedDebtList` table on `/transactions`, all rendered identically. Confusing to distinguish bank-ledger items from peer-to-peer adjustments.

**Solution:**
- Add a `DebtListItemVM.type` field (`'transaction' | 'peer_debt'`).
- Render a distinct icon badge per type (e.g., `Receipt` for standard, `Users` for peer).
- Minor visual differentiation: dashed border or subtle tag on peer debt rows.

**Why:** Users understand at a glance what impacts their bank balance vs. what is an informal agreement.

---

### D. `[NEW]` — Batch Confirm "All Due Now"

**Current:** ObligationsList on the dashboard shows recurring obligations due in the current pay window. Transactions page shows unconfirmed payments with individual `<Check>` buttons. No way to confirm everything at once.

**Solution:** Add a "Confirm all N due" button inside the "Unconfirmed payment impact" card (at `/transactions`). Calls `confirmTransaction` in sequence (or a single batch endpoint). Show a toast: "Confirmed 3 payments."

**Why:** Users with 5+ recurring obligations tap confirm five times. A single batch action cuts friction and makes pay-window settlement feel intentional.

---

### E. `[NEW]` — Sort Column Indicator on Table

**Current:** `TransactionFilters` provides sort controls (`sortField`, `sortDir`) but the `SharedDebtList` table has no visual indicator of which column is sorted or in which direction.

**Solution:** Render a small `ArrowUp` / `ArrowDown` icon next to the active column header. Align the filter dropdown selection with the table column header state.

**Why:** Users sort → look at the table → forget which column they sorted by. A simple visual anchor confirms the active sort axis.

---

### F. `[NEW]` — Quick-Action Row on Mobile

**Current:** Mobile transaction rows in `SharedDebtList` show a horizontal bar of icon buttons (Copy, Confirm, Open, Edit, Delete). Dense rows challenge tap accuracy.

**Solution:** Limit primary row actions to 2 visible: **Confirm** and **Open**. Move Edit/Delete into a long-press context menu or a trailing `...` overflow on mobile. Keep the same actions, just less visual clutter.

**Why:** Reduces cognitive load per row, improves tap target accuracy, and aligns with mobile OS conventions.

---

## 2. Dashboard Page (`/`)

### A. Demystify the "Reserved" Figure

**Current:** High Balance + low Liquid → user asks "Where is my money reserved?"

**Solution:** Clicking the "Reserved" `StatCard` opens a popover / bottom sheet:
- 📋 Recurring Obligations: $X.XX
- 🤝 Peer Debts (Owed): $Y.YY
- 🛡️ Safety Buffer: $Z.ZZ
- Total Reserved: $Sum

**Why:** Transitions Reserved from a black-box number to an auditable breakdown.

---

### B. Visualize the "Financial Pay Window"

**Current:** The engine uses `isInCurrentPayWindow` to decide what is reserved. Users track their progress through this abstract window mentally.

**Solution:** Add a Pay Window Progress Bar at the top of the dashboard:
```
[Payday: Oct 1] ──────● (Today: Oct 10) ────── [Next Payday: Oct 15]
```
Clicking opens a summary: days remaining, expected income next.

**Why:** Grounds the engine's timeline in a visual format matching how people budget.

---

### C. Humanize the "CheckWidget" Results

**Current:** Risk badges like `WAIT` or `HIGH` tell the verdict without explaining why.

**Solution:** Add a plain-language engine explanation beneath the risk level:
- **WAIT:** "You can't buy this today — it dips into reserved bills. After your paycheck arrives on [Date], you'll have $X available."
- **HIGH:** "You can buy this, but it temporarily dips into your Safety Buffer by $X."
- Translate before/after bars into timeline impact: "Buying this delays your 'New Laptop' goal by 12 days."

**Why:** Specific, plain-language feedback builds trust in the app's recommendations.

---

### D. `[NEW]` — Pay Schedule List Anchoring

**Current:** `PayScheduleList` sits at the bottom of the dashboard with no visual connection to the Pay Window concept above. It's a flat list of schedules with no "next payday" emphasis.

**Solution:** Pin the next payday entry at the top of `PayScheduleList` with a highlighted row (accented border or badge: "Next: Oct 15 · $2,500"). Dim future schedules relative to the imminent one.

**Why:** The pay schedule drives every engine calculation; the dashboard should visually center it as the "heartbeat" of the financial model.

---

### E. `[NEW]` — Cross-Widget Linking

**Current:** Dashboard widgets (`StatCards`, `CheckWidget`, `ObligationsList`, `ProjectionWidget`, `FriendLedgerWidget`, `GoalsSnapshotWidget`) are independent silos. No widget references another's data.

**Solution:**
- **ObligationsList → Transactions:** Add a "View all" link that navigates to `/transactions` with the "Due now" preset applied.
- **CheckWidget verdict → GoalsSnapshotWidget:** When a goal impact is shown, highlight the affected goal in the snapshot widget below.
- **ProjectionWidget → PayScheduleList:** Show a small inline "based on your pay schedule" link that scrolls to the schedule list.

**Why:** The dashboard becomes a navigable financial cockpit rather than a report dump. Each insight leads to an action.

---

### F. `[NEW]` — Skeleton Loading Hierarchy

**Current:** Each widget shows its own `<Skeleton>` independently. Widgets pop in at different times depending on query resolution order.

**Solution:** Group independent queries and render all dashboard content in a single transition. Or use `placeholderData` / `keepPreviousData` on `@tanstack/react-query` to avoid layout thrash when switching accounts.

**Why:** Reduces perceived jank and gives the impression of a cohesive, fast-loading application.

---

## 3. Usage & Technical UX Improvements

### A. Prevent Layout Shifts with Tabular Numbers

**Solution:** ✅ **Already implemented** — `StatCards.tsx:33` uses `tabular-nums`. `SharedDebtList` table columns also use `tabular-nums`. No further action needed for core balance displays. Ensure `MoneyValue` usages in `CheckWidget`, `ProjectionWidget`, and `ObligationsList` also apply `tabular-nums` where they currently use `formatMoney` directly.

---

### B. Combine Projection Toggles

**Current:** `ProjectionWidget` has separate "I owe friends" / "Friends owe me" toggles. Toggling back and forth hides the combined cash flow reality.

**Solution:** Display obligations as a stacked bar: recurring bills in one color, peer debts in another. Show receivables as a segmented portion of the Incoming bar.

**Why:** Absolute cash flow view without requiring manual toggle juggling.

---

### C. Mobile Touch Targets & FAB Safety Zones

**Current:** Bottom nav uses `bottom-[calc(env(safe-area-inset-bottom)+0.6rem)]` (good). FAB on transactions page uses `bottom-[calc(env(safe-area-inset-bottom)+5.25rem)]` — sits above the nav. No FAB on dashboard.

**Solution:** ✅ **Already correctly positioned** — FAB clears the bottom nav. Ensure all interactive elements (filter chips, checkboxes, swipe triggers) meet 44×44px minimum touch targets. Audit `SharedDebtList` mobile action buttons — currently `<Button variant="outline" size="sm">` with `<Check size={14} />` may be too small on some devices.

---

### D. `[NEW]` — Optimistic Updates for Mutations

**Current:** All mutations (`createTransaction`, `updateTransaction`, `deleteTransaction`, `confirmTransaction`) follow a `mutate → onSuccess → invalidateQueries` pattern. User sees a brief flash of stale data while queries refetch.

**Solution:** Use `onMutate` to snapshot and optimistically update the cache via `queryClient.setQueryData`, then roll back on `onError`. Example pattern:
```ts
useMutation({
  mutationFn: confirmTransaction,
  onMutate: async (id) => {
    await queryClient.cancelQueries(['transactions'])
    const prev = queryClient.getQueryData(['transactions'])
    queryClient.setQueryData(['transactions'], old =>
      old.map(t => t.id === id ? { ...t, confirmed_at: new Date().toISOString() } : t)
    )
    return { prev }
  },
  onError: (_err, _id, ctx) => {
    queryClient.setQueryData(['transactions'], ctx?.prev)
  },
  onSettled: () => {
    queryClient.invalidateQueries(['transactions'])
    queryClient.invalidateQueries(['accounts'])
  },
})
```

**Why:** Instant visual feedback. Users perceive the app as faster and more responsive. Financial apps benefit strongly from this — confirming a payment should feel immediate.

---

### E. `[NEW]` — Undo Toast for Deletions

**Current:** Delete uses `ConfirmDialog` (good improvement over `window.confirm`), then `deleteMutation.mutate(id)`. No undo path.

**Solution:** After delete, show a `sonner` toast with an "Undo" action button. Undoing calls the create endpoint to reconstruct the transaction. The toast auto-dismisses after 5 seconds. Example:
```ts
toast('Transaction deleted', {
  action: { label: 'Undo', onClick: () => createMutation.mutate(deletedTxn) },
  duration: 5000,
})
```

**Why:** Accidental deletions happen. An undo path prevents data loss without requiring a confirmation modal that stalls the flow.

---

### F. `[NEW]` — Empty State Guidance on Dashboard

**Current:** The dashboard shows a "Create your first account" card when `allAccounts.length === 0` (good). But when an account exists with zero transactions, `ObligationsList` shows "No items" and `PayScheduleList` shows an empty state. No connective guidance.

**Solution:** When an account has zero transactions and zero pay schedules, show a single onboarding card: "Set up your finances: ① Add a pay schedule → ② Create recurring bills → ③ Check what you can afford." Link to `/settings` and `/transactions`.

**Why:** First-time experience. Users understand the progression: pay schedule → transactions → insights.

---

### G. `[NEW]` — Keyboard Shortcuts (Desktop Power Users)

**Current:** No keyboard shortcuts. All navigation requires mouse.

**Solution:** Minimal set:
- `Ctrl+K` / `Cmd+K`: Focus the "Can I Buy It?" amount input.
- `N`: New transaction (when on `/transactions`).
- `F`: Focus filter search.
- `?`: Show keyboard shortcut overlay.

Use a lightweight hook like `react-hotkeys-hook` or a raw `useEffect` with `keydown`.

**Why:** Power users entering transactions daily benefit from keyboard flow. Low implementation cost, high perceived quality.

---

### H. `[NEW]` — Account Balance Trend Mini-Chart

**Current:** Dashboard shows current Balance / Reserved / Liquid as point-in-time numbers. No historical context.

**Solution:** Add a tiny sparkline (or just a 7-day/30-day change indicator) next to the Balance `StatCard`. Example: "+$340.50 this month" or a 4-point mini-line. Data would need the backend to track balance history (or derive it from transaction timestamps).

**Why:** A single number without context breeds anxiety ("Was this higher last week?"). A simple trend indicator provides reassurance.

---

### I. `[NEW]` — Category Autofill Feedback

**Current:** `handleTransactionChange` calls `suggestCategoryFromDescription` silently. User types "Netflix" → category changes to "Subscriptions" with no visual confirmation.

**Solution:** Briefly pulse the category select field (subtle border glow or a small "Auto-filled" tooltip) when autofill fires. Let the user override without confusion.

**Why:** Silent autofill can feel like a bug ("Why did my category change?"). A gentle feedback pulse confirms the app understood the description.

---

## Summary — Implementation Priority

| # | Suggestion | Impact | Effort |
|---|-----------|--------|--------|
| 1.D | Batch confirm | High | Low |
| 2.D | Pay schedule anchoring | Medium | Low |
| 3.D | Optimistic updates | High | Medium |
| 1.A | Filter-card sync | High | Medium |
| 2.A | Reserved breakdown popover | High | Medium |
| 2.C | CheckWidget explainability | High | Medium |
| 3.E | Undo toast for deletes | Medium | Low |
| 2.E | Cross-widget linking | Medium | Low |
| 3.I | Category autofill feedback | Low | Low |
| 3.G | Keyboard shortcuts | Medium | Low |
| 1.B | Swipe confirm | Medium | Medium |
| 3.F | Empty state guidance | Medium | Medium |
| 2.B | Pay window progress bar | Medium | Medium |
| 3.H | Balance trend chart | Medium | High |
| 1.C | Peer debt differentiation | Low | Medium |
| 1.E | Sort column indicator | Low | Low |
| 1.F | Mobile row simplification | Low | Low |
| 3.A | tabular-nums audit | High | Low |
| 3.C | Touch target audit | Medium | Low |
