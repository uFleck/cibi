# CIBI — Full UX Enhancement Implementation Prompt

You are implementing UX improvements for a personal finance dashboard (Go backend + React/TypeScript frontend).  
**Working directory:** `/home/fleck/Projects/cibi`  
**Frontend root:** `web/src/`  
**Stack:** React 19, TypeScript, Tailwind CSS v4, TanStack Router, TanStack Query v5, shadcn/ui, motion, recharts, sonner.

---

## Pre-work: Read these key files before starting

Required reading (in order):
1. `web/src/pages/transactions.tsx` — transactions page + mutations
2. `web/src/components/TransactionFilters.tsx` — filter controls
3. `web/src/lib/transactions-impact.ts` — filter logic, impact summary
4. `web/src/components/debt/shared-debt-list.tsx` — transaction table component
5. `web/src/components/debt/shared-debt-list.types.ts` — item type definition
6. `web/src/router.tsx` — dashboard component (Dashboard function)
7. `web/src/components/StatCards.tsx` — balance/reserved/liquid cards
8. `web/src/components/CheckWidget.tsx` — "Can I Buy It?" checker
9. `web/src/components/ProjectionWidget.tsx` — cash flow projection
10. `web/src/components/PayScheduleList.tsx` — pay schedule display
11. `web/src/lib/financial-window.ts` — `isInCurrentPayWindow`
12. `web/src/lib/pay-schedule.ts` — date utilities

Also note: `web/src/components/ui/tooltip.tsx` provides `<Tooltip>` wrapper. `web/src/components/ui/badge.tsx` provides `<Badge>`. Toast via `sonner` (`toast(...)`).

---

## Phase 1 — Filter Transparency (Transactions Page)

These are the highest-impact, lowest-effort changes. Implement in order.

### 1.1 Fix `due-now` = `current-window` semantic bug

**File:** `web/src/lib/transactions-impact.ts`

**Problem:** `matchesPresetFilter` treats `due-now` and `current-window` identically — both call `isCurrentDue`. The impact card says "Due now: 3 pending · $150" but clicking it filters to 3 pending + N recurring. Users think the filter shows what the card counted.

**Fix:** Option B (recommended) — make `due-now` filter to ONLY pending one-time items (matching what the impact card displays):

```ts
// In matchesPresetFilter, change the fallthrough at the end:
// CURRENT:
// current-window and due-now share due classification
return isCurrentDue(txn, now, nextPayday, nextPaydayDay)

// NEW:
if (preset === 'due-now') {
  // Only show pending one-time confirmations due in the current window
  if (txn.is_recurring) return false
  if (!txn.requires_confirmation || txn.confirmed_at) return false
  return isCurrentDue(txn, now, nextPayday, nextPaydayDay)
}
// current-window: everything due (recurring + pending one-time)
return isCurrentDue(txn, now, nextPayday, nextPaydayDay)
```

Add a comment explaining the distinction.

### 1.2 Show date ranges on preset labels

**Files touched:**
- `web/src/lib/transactions-impact.ts` — expose `getWindowBounds` or add a helper that returns formatted date strings
- `web/src/components/TransactionFilters.tsx` — accept date labels as props and display them

**Steps:**

a) In `transactions-impact.ts`, export a helper:

```ts
import { formatDate } from '@/lib/format'

export interface WindowLabels {
  dueNowLabel: string
  currentWindowLabel: string
  nextWindowLabel: string
}

export function getWindowLabels(
  nextPayday: string | null,
  paySchedules: PayScheduleResponse[],
): WindowLabels {
  const { nextPaydayDay, followingPaydayDay } = getWindowBounds(paySchedules, nextPayday)
  
  const fmtDay = (ts: number | null): string => {
    if (!ts) return '?'
    return formatDate(new Date(ts).toISOString())
  }

  const nextPaydayStr = nextPaydayDay ? fmtDay(nextPaydayDay) : '?'

  return {
    dueNowLabel: `Due now (before ${nextPaydayStr})`,
    currentWindowLabel: `Current (until ${nextPaydayStr})`,
    nextWindowLabel: followingPaydayDay
      ? `Next (${nextPaydayStr} – ${fmtDay(followingPaydayDay)})`
      : `Next window`,
  }
}
```

b) In `transaction.tsx`, compute window labels from pay schedule:

```ts
const windowLabels = useMemo(() => {
  return getWindowLabels(nextPayday, paySchedules)
}, [nextPayday, paySchedules])
```

Pass `windowLabels` to `TransactionFilters`.

c) In `TransactionFilters.tsx`, accept the new prop and use it in the preset dropdown or chips (see 1.4 for chip conversion):

```tsx
windowLabels: WindowLabels | null

// In the preset select, use windowLabels to show date context:
<SelectItem value="due-now">{windowLabels?.dueNowLabel ?? 'Due now'}</SelectItem>
<SelectItem value="current-window">{windowLabels?.currentWindowLabel ?? 'Current window'}</SelectItem>
<SelectItem value="next-window">{windowLabels?.nextWindowLabel ?? 'Next window'}</SelectItem>
```

### 1.3 Synchronize impact card buttons with active filter

**File:** `web/src/pages/transactions.tsx`

**Current:** Both buttons use `variant="outline"` unconditionally.

**Fix:** Make the active preset's button visually distinct:

```tsx
<Button
  size="sm"
  variant={preset === 'due-now' ? 'secondary' : 'outline'}
  onClick={() => setPreset('due-now')}
>
  Due now ({unconfirmedImpact.currentCount})
</Button>
<Button
  size="sm"
  variant={preset === 'next-window' ? 'secondary' : 'outline'}
  onClick={() => setPreset('next-window')}
>
  Next window ({unconfirmedImpact.nextCount})
</Button>
```

Also add the count to the button labels so users see how many items each represents.

### 1.4 Replace preset `<Select>` with horizontal filter chips

**File:** `web/src/components/TransactionFilters.tsx`

**Current:** Preset is a `<Select>` dropdown — 2 clicks to change, options invisible.

**Fix:** Render a scrollable chip row for presets. Keep `<Select>` for Sort and Category.

```tsx
// Inside TransactionFilters, between the Filter toggle and the main filter panel:
<div className="flex flex-wrap gap-1.5">
  {(['due-now', 'current-window', 'next-window', 'all-recurring', 'one-time-only'] as TransactionPreset[]).map(p => (
    <Button
      key={p}
      variant={preset === p ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => onPresetChange(p)}
      className="text-xs h-8"
    >
      {p === 'due-now' && windowLabels ? windowLabels.dueNowLabel : undefined}
      {p === 'current-window' && windowLabels ? windowLabels.currentWindowLabel : undefined}
      {p === 'next-window' && windowLabels ? windowLabels.nextWindowLabel : undefined}
      {p === 'all-recurring' && 'All recurring'}
      {p === 'one-time-only' && 'One-time only'}
    </Button>
  ))}
</div>
```

Remove the "Preset" section from the collapsible filter panel (lines 82-97 of TransactionFilters). The chips are always visible above the panel.

### 1.5 Active filter pills row

**File:** `web/src/pages/transactions.tsx`

**Fix:** Add a row of dismissible filter pills between the impact card and the transaction list, visible when filters are active:

```tsx
{hasActiveFilters && (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="text-xs text-muted-foreground mr-1">Filters:</span>
    {preset !== 'current-window' && (
      <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setPreset('current-window')}>
        {windowLabels?.[
          preset === 'due-now' ? 'dueNowLabel' :
          preset === 'next-window' ? 'nextWindowLabel' :
          preset === 'all-recurring' ? 'currentWindowLabel' : // fallback
          'currentWindowLabel'
        ] ?? preset}
        <X size={12} />
      </Badge>
    )}
    {filterCategory !== 'all' && (
      <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFilterCategory('all')}>
        {filterCategory}
        <X size={12} />
      </Badge>
    )}
    <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs h-7">
      Clear all
    </Button>
  </div>
)}
```

Define `handleClearFilters` to reset preset/category/sort.

### 1.6 Add text search filter

**File:** `web/src/pages/transactions.tsx`

**Fix:** Add a `searchQuery` state and filter in `filteredAndSortedTxns`:

```tsx
const [searchQuery, setSearchQuery] = useState('')

// In filteredAndSortedTxns useMemo, add:
if (searchQuery.trim()) {
  const q = searchQuery.toLowerCase()
  txns = txns.filter(t => t.description.toLowerCase().includes(q))
}
```

Render a search input in the TransactionFilters panel:

```tsx
<Input
  placeholder="Search descriptions..."
  value={searchQuery}
  onChange={e => setSearchQuery(e.target.value)}
  className="h-9"
/>
```

Add `searchQuery` to the clear/reset logic.

### 1.7 Add amount range filter

**File:** `web/src/pages/transactions.tsx`

```tsx
const [amountMin, setAmountMin] = useState('')
const [amountMax, setAmountMax] = useState('')

// In filteredAndSortedTxns useMemo, add:
const minVal = parseFloat(amountMin)
const maxVal = parseFloat(amountMax)
if (!isNaN(minVal)) {
  txns = txns.filter(t => Math.abs(t.amount) >= minVal)
}
if (!isNaN(maxVal)) {
  txns = txns.filter(t => Math.abs(t.amount) <= maxVal)
}
```

In TransactionFilters panel, add two `ValueInput` or `<Input type="number">` fields side by side:

```tsx
<div className="flex items-center gap-2">
  <Input placeholder="Min $" value={amountMin} onChange={e => setAmountMin(e.target.value)} className="h-9" />
  <span className="text-muted-foreground text-xs">–</span>
  <Input placeholder="Max $" value={amountMax} onChange={e => setAmountMax(e.target.value)} className="h-9" />
</div>
```

### 1.8 Add tooltips to preset chips

**File:** `web/src/components/TransactionFilters.tsx`

Wrap each chip in `<TooltipProvider><Tooltip><TooltipTrigger asChild>...</TooltipTrigger><TooltipContent>...</TooltipContent></Tooltip></TooltipProvider>`:

| Preset | Tooltip text |
|---|---|
| due-now | Pending payments with a date before your next payday |
| current-window | Everything due in the current pay period |
| next-window | Only items falling in the next pay period |
| all-recurring | All scheduled repeating bills and subscriptions |
| one-time-only | Ad-hoc transactions, including pending one-time payments |

### 1.9 Filter state persistence across navigation

**File:** `web/src/pages/transactions.tsx`

Save filter state to `sessionStorage` keyed by account ID. Restore on mount.

```ts
const FILTER_KEY = `cibi:filters:${currentAccountId}`

// Restore on mount:
useEffect(() => {
  if (!currentAccountId) return
  try {
    const saved = sessionStorage.getItem(FILTER_KEY)
    if (saved) {
      const state = JSON.parse(saved)
      if (state.preset) setPreset(state.preset)
      if (state.filterCategory) setFilterCategory(state.filterCategory)
      if (state.sortField) setSortField(state.sortField)
      if (state.sortDir) setSortDir(state.sortDir)
    }
  } catch { /* ignore */ }
}, [currentAccountId])

// Persist on change:
useEffect(() => {
  if (!currentAccountId) return
  sessionStorage.setItem(FILTER_KEY, JSON.stringify({
    preset, filterCategory, sortField, sortDir,
  }))
}, [preset, filterCategory, sortField, sortDir, currentAccountId])
```

### 1.10 Sort column indicator on table headers

**File:** `web/src/components/debt/shared-debt-list.tsx`

Add optional props for sort state:

```tsx
sortField?: string
sortDir?: 'asc' | 'desc'
```

In the desktop table `<thead>`, on the relevant `<th>` headers, render `▲` / `▼` when active:

```tsx
<th className="text-left px-3 py-2 font-medium">
  Item
  {sortField === 'description' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
</th>
```

Pass these props from `transactions.tsx` when rendering `SharedDebtList`.

---

## Phase 2 — Transactions Page General

### 2.1 Batch confirm "All Due Now"

**File:** `web/src/pages/transactions.tsx`

In the impact summary card, add a button that confirms all pending one-time items due now:

```tsx
{unconfirmedImpact.currentCount > 0 && (
  <Button
    size="sm"
    onClick={() => {
      const dueNowIds = transactions
        .filter(t => !t.is_recurring && t.requires_confirmation && !t.confirmed_at && 
          isCurrentDue(t, /* pass now, nextPayday, nextPaydayDay from getWindowBounds */))
        .map(t => t.id)
      dueNowIds.forEach(id => confirmMutation.mutate(id))
      toast.success(`Confirmed ${dueNowIds.length} payments`)
    }}
  >
    Confirm all {unconfirmedImpact.currentCount}
  </Button>
)}
```

**Refinement:** Only enable the button when `due-now` contains items. You'll need `isCurrentDue` exported from `transactions-impact.ts` (or recompute).

### 2.2 Differentiate peer debt vs standard transactions in list

**File(s):**
- `web/src/components/debt/shared-debt-list.types.ts`
- `web/src/components/debt/shared-debt-list.tsx`
- `web/src/pages/transactions.tsx`

**Steps:**

a) Add `type` field to `DebtListItemVM`:
```ts
type?: 'transaction' | 'peer_debt'
```

b) In `SharedDebtList`, render a type icon before the title:
```tsx
import { Receipt, Users } from 'lucide-react'

// In the title cell (desktop) and header (mobile):
{item.type === 'peer_debt' ? <Users size={12} className="inline mr-1 text-muted-foreground" /> :
 item.type === 'transaction' ? <Receipt size={12} className="inline mr-1 text-muted-foreground" /> :
 null}
```

c) In `transactions.tsx`, set `type: 'transaction'` for all transaction items in the `items.map(...)` call.

(Peer debts currently don't appear on the transactions page — they're in FriendLedgerWidget. This change pre-builds the infrastructure for when they do.)

### 2.3 Mobile row action simplification

**File:** `web/src/components/debt/shared-debt-list.tsx`

In the mobile layout (`showMobile` section), limit visible action buttons to 2:

```tsx
// Current: shows Copy, Confirm, Open, Edit, Delete (5 buttons)
// New: shows Confirm + Open only. Edit/Delete go behind a "More" button.
```

Add a cutoff prop:
```tsx
maxMobileActions?: number  // default 2
```

If `actions.length > maxMobileActions`, render the extras inside a dropdown/popover triggered by a `MoreHorizontal` button.

Pass `maxMobileActions={2}` from `transactions.tsx`.

---

## Phase 3 — Dashboard Page

### 3.1 Reserved breakdown popover on StatCard click

**File:** `web/src/components/StatCards.tsx`

Make the "Reserved" card clickable. On click, open a popover (shadcn `<Popover>`) with the breakdown:

```
Recurring obligations: $X.XX
Peer debts (owed):    $Y.YY
Safety buffer:        $Z.ZZ
─────────────────────
Total reserved:       $Sum
```

Pass the breakdown data as props:
```tsx
interface StatCardsProps {
  // ... existing props
  safetyBuffer?: number  // from account.safety_buffer or similar
}
```

Use shadcn's `<Popover>`, `<PopoverTrigger>`, `<PopoverContent>` from `@/components/ui/popover` (create if missing — follow existing patterns from tooltip/dialog).

### 3.2 Pay window progress bar

**File:** New component `web/src/components/PayWindowBar.tsx`

**Props:**
```tsx
interface PayWindowBarProps {
  nextPayday: string | null
  paySchedules: PayScheduleResponse[]
}
```

Compute:
- Previous payday (from schedule history or derive by shifting `nextPayday` back one period)
- Today's position as a percentage between prev and next payday
- Days remaining until next payday

Render a horizontal progress bar:
```
[Payday: Mar 15] ━━━━━━●━━━━━━ [Next: Mar 31]
                    Today (75%)
```
Below: "14 days remaining · Next income: $2,500"

Clicking opens a small card with details (days left, expected income, number of obligations remaining).

Add `<PayWindowBar>` to the `Dashboard` component in `router.tsx`, between `StatCards` and `CheckWidget`.

### 3.3 CheckWidget explainability

**File:** `web/src/components/CheckWidget.tsx`

After the verdict badge, add a plain-language explanation paragraph:

```tsx
{!result.can_buy && result.will_afford_after_payday && result.wait_until && (
  <p className="text-sm text-muted-foreground">
    You can't buy this today because it dips into your reserved bills. 
    But once your paycheck arrives on {formatDate(result.wait_until)}, 
    you'll have {formatMoney(result.purchasing_power, currency)} available.
  </p>
)}
{result.can_buy && result.risk_level === 'HIGH' && (
  <p className="text-sm text-muted-foreground">
    You can buy this, but doing so will temporarily dip into your Safety Buffer 
    by {formatMoney(Math.abs(result.buffer_remaining), currency)}.
  </p>
)}
```

For goal impact timeline, compute days delayed from the `goal_impacts` data (backend may need to provide this; if not available, add a note in the explanation).

### 3.4 PayScheduleList anchoring

**File:** `web/src/components/PayScheduleList.tsx`

If the component receives `nextPayday` as a prop, highlight the next-occurring schedule entry:

```tsx
{schedules.map(s => {
  const isNext = s.next_payday === nextPayday
  return (
    <div className={isNext ? 'border-primary/40 bg-primary/5 rounded-lg' : ''}>
      {/* existing content */}
      {isNext && <Badge>Next</Badge>}
    </div>
  )
})}
```

Pass `nextPayday` from the Dashboard in `router.tsx`.

### 3.5 Cross-widget linking

**File:** `web/src/router.tsx` (Dashboard function)

a) **ObligationsList → Transactions:** In `ObligationsList`, add a "View all →" link at the bottom that navigates to `/transactions`. Pass an optional `linkTo` prop.

b) **ProjectionWidget → PayScheduleList:** Add a small text link below the projection summary: "Based on your pay schedule ↘" that scrolls to `PayScheduleList` using `document.getElementById('pay-schedules')?.scrollIntoView()`. Add `id="pay-schedules"` to the `PayScheduleList` container.

c) **CheckWidget → GoalsSnapshotWidget:** When `result.goal_impacts.length > 0`, scroll to or highlight the affected goals section. Add `id="goals-snapshot"` to `GoalsSnapshotWidget`'s container. In `CheckWidget`, render: "This affects your goals — see impact below ↓" as a link that scrolls.

### 3.6 Dashboard empty state with progression guidance

**File:** `web/src/router.tsx` (Dashboard function)

After the `<Skeleton>` block, add:

```tsx
{account && transactions.length === 0 && paySchedules.length === 0 && (
  <Card>
    <CardContent className="py-6 text-center">
      <p className="font-semibold mb-2">Set up your finances</p>
      <div className="text-sm text-muted-foreground text-left space-y-1 max-w-xs mx-auto">
        <p>① <Link to="/settings" className="underline">Add a pay schedule</Link> — tell us when you get paid</p>
        <p>② <Link to="/transactions" className="underline">Create recurring bills</Link> — subscriptions, rent, etc.</p>
        <p>③ <span>Check what you can afford</span> — use "Can I Buy It?" above</p>
      </div>
    </CardContent>
  </Card>
)}
```

### 3.7 Skeleton loading hierarchy

**File:** `web/src/router.tsx` (Dashboard function)

Wrap all widgets in a single `<Skeleton>` block instead of per-widget:

```tsx
<Skeleton
  name="dashboard"
  loading={!account}
  fallback={/* combined skeleton view with all widget placeholders */}
>
  {account ? (
    <>
      <StatCards ... />
      <PayWindowBar ... />
      <CheckWidget ... />
      {/* etc */}
    </>
  ) : null}
</Skeleton>
```

Alternatively, use `placeholderData` on the account query to keep previous data visible during refetch when switching accounts.

---

## Phase 4 — Technical / UX Polish

### 4.1 Optimistic updates for mutations

**File:** `web/src/pages/transactions.tsx`

Add `onMutate` + `onError` rollback to all 4 mutations. Example for `confirmMutation`:

```ts
const confirmMutation = useMutation({
  mutationFn: (id: string) => confirmTransaction(id),
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
    const prev = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
    queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
      old?.map(t => t.id === id ? { ...t, confirmed_at: new Date().toISOString() } : t) ?? []
    )
    return { prev }
  },
  onError: (_err, _id, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(['transactions', currentAccountId], ctx.prev)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['transactions', currentAccountId] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
  },
})
```

Do the same for `deleteMutation` (optimistically remove from list), `createMutation` (optimistically add), `updateMutation` (optimistically patch).

Restore success toasts inside `onSuccess` (currently in `onSuccess`; keep them there).

### 4.2 Undo toast for deletions

**File:** `web/src/pages/transactions.tsx`

In `deleteMutation.onSuccess`, replace `toast.success(...)` with:

```ts
const deletedName = deletedTxn?.description ?? 'Transaction'
toast(`${deletedName} deleted`, {
  action: {
    label: 'Undo',
    onClick: () => {
      if (deletedTxn) {
        createMutation.mutate({
          account_id: deletedTxn.account_id,
          amount: deletedTxn.amount,
          description: deletedTxn.description,
          category: deletedTxn.category,
          is_recurring: deletedTxn.is_recurring,
          frequency: deletedTxn.frequency,
          anchor_date: deletedTxn.anchor_date,
          requires_confirmation: deletedTxn.requires_confirmation,
        })
      }
    },
  },
  duration: 5000,
})
```

Capture `deletedTxn` before the mutation fires (in `onMutate` or use the `variables` of `deleteMutation.mutate`).

### 4.3 Category autofill visual feedback

**File:** `web/src/pages/transactions.tsx`

In `handleTransactionChange`, when `suggestCategoryFromDescription` changes the category, trigger a brief visual pulse on the category select. Use a `categoryAutofilled` state:

```ts
const [categoryAutofilled, setCategoryAutofilled] = useState(false)

// In handleTransactionChange:
if (shouldAutofill) {
  const suggested = suggestCategoryFromDescription(description, formCategories)
  if (suggested && suggested !== formData.category) {
    setCategoryAutofilled(true)
    setTimeout(() => setCategoryAutofilled(false), 1500)
  }
  next.category = suggested
}
```

Pass `categoryAutofilled` to `TransactionForm` and add a CSS class or small indicator:

```tsx
<SelectTrigger className={cn('h-9', categoryAutofilled && 'ring-2 ring-primary/30 transition-all duration-300')}>
```

### 4.4 Keyboard shortcuts

**File:** New file `web/src/hooks/useKeyboardShortcuts.ts`

```ts
import { useEffect } from 'react'

export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      for (const [key, fn] of Object.entries(shortcuts)) {
        const [modKey, char] = key.split('+')
        const needsMod = modKey === 'mod'
        if ((needsMod && mod && e.key === char) || (!needsMod && !mod && e.key === key)) {
          e.preventDefault()
          fn()
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}
```

Use in `transactions.tsx`:
```ts
useKeyboardShortcuts({
  'n': handleCreateClick,
  'f': () => document.querySelector<HTMLInputElement>('[data-filter-search]')?.focus(),
})

// On dashboard:
useKeyboardShortcuts({
  'mod+k': () => document.querySelector<HTMLInputElement>('#check-amount')?.focus(),
})
```

Add `data-filter-search` attribute to the search input from Phase 1.6.

### 4.5 Tabular numbers audit

Audit these files for `formatMoney` usages that should use `<MoneyValue>` or add `tabular-nums`:

1. `web/src/components/ProjectionWidget.tsx` — lines using `formatMoney` directly
2. `web/src/components/ObligationsList.tsx` — (read and check)
3. `web/src/components/CheckWidget.tsx` — goal impact cards

Fix: wrap `formatMoney(...)` results in a `<span className="tabular-nums">` or convert to `<MoneyValue>` component usage.

### 4.6 Touch target audit

**File:** `web/src/components/debt/shared-debt-list.tsx`

In mobile layout, action buttons use `<Button variant="outline" size="sm">` with `size={14}` icons. Verify touch targets:
- Each button should be at least 44×44px
- If current size is too small, change to `size="default"` or add `className="min-h-[44px] min-w-[44px]"`

Also check filter chips in TransactionFilters — ensure they meet the 44px minimum.

### 4.7 Combine projection widget toggles

**File:** `web/src/components/ProjectionWidget.tsx`

Instead of separate toggles, split the Obligations bar into stacked segments:

```ts
const chartData = [
  { name: 'Income', value: incoming, fill: 'var(--color-verdict-yes)' },
  { name: 'Recurring bills', value: -nextRecurringObligations, fill: 'var(--color-verdict-no)' },
  { name: 'Peer debts', value: -nextPeerObligations, fill: 'var(--color-risk-medium)' },
  { name: 'Net', value: net, fill: net >= 0 ? 'var(--color-verdict-yes)' : 'var(--color-verdict-no)' },
]
```

Remove the two Switch toggles. Always include both obligations. Keep receivables in the "Incoming" bar as a separate visual segment (optional — if receivables data structure allows it).

---

## Phase 5 — Verification

After implementing each phase, run:

```bash
cd /home/fleck/Projects/cibi/web
npx tsc --noEmit          # TypeScript check
npx vitest run            # Unit tests
npm run build             # Vite production build
```

**Manual verification checklist:**

**Transactions page:**
- [ ] Click "Due now" impact card → filter chips show "Due now (before [date])" as active
- [ ] Filter shows only pending one-time items (not recurring)
- [ ] Impact card button has `secondary` variant when active
- [ ] Active filter pills appear below impact card
- [ ] Click X on a filter pill → that filter resets
- [ ] "Clear all" resets everything to defaults
- [ ] Text search filters descriptions in real time
- [ ] Amount range filters work (min only, max only, both)
- [ ] Navigate to /goals → back to /transactions → filters preserved
- [ ] Sort indicator visible on table header
- [ ] "Confirm all N" button batch-confirms items
- [ ] Confirm mutation updates row instantly (optimistic)
- [ ] Delete shows undo toast → clicking undo restores transaction
- [ ] Category autofill briefly pulses the select field

**Dashboard:**
- [ ] Reserved card clickable → popover shows breakdown
- [ ] Pay window progress bar shows dates + progress
- [ ] CheckWidget shows plain-language explanations under verdicts
- [ ] PayScheduleList highlights next payday entry
- [ ] "View all →" link in ObligationsList navigates to /transactions
- [ ] ProjectionWidget "based on your pay schedule" link scrolls to schedule list
- [ ] Onboarding card shows when account has zero transactions + zero schedules
- [ ] Dashboard loads as a single skeleton block (no widget-level jitter)
- [ ] Tabular numbers consistent across all money displays
- [ ] Touch targets at least 44×44px on mobile
- [ ] Projection chart shows combined obligations (no toggles needed)
- [ ] Ctrl+K / Cmd+K focuses CheckWidget amount input

---

## Files you will create

- `web/src/components/PayWindowBar.tsx` — pay window progress bar
- `web/src/hooks/useKeyboardShortcuts.ts` — keyboard shortcut hook

## Files you will modify (expected)

- `web/src/pages/transactions.tsx` — filter sync, batch confirm, search, range, state persistence, optimistic updates, undo toast, autofill feedback, shortcuts
- `web/src/components/TransactionFilters.tsx` — preset chips, date labels, tooltips, search input, amount inputs
- `web/src/lib/transactions-impact.ts` — `due-now` fix, export `getWindowLabels`, export `isCurrentDue`
- `web/src/components/debt/shared-debt-list.tsx` — type icon, mobile action simplification, sort indicator
- `web/src/components/debt/shared-debt-list.types.ts` — add `type` field
- `web/src/components/StatCards.tsx` — reserved popover
- `web/src/components/CheckWidget.tsx` — explainability paragraphs, goal scroll link
- `web/src/components/ProjectionWidget.tsx` — stacked bars, remove toggles
- `web/src/components/PayScheduleList.tsx` — next payday highlight, id anchor
- `web/src/components/ObligationsList.tsx` — "View all" link (read first)
- `web/src/components/GoalsSnapshotWidget.tsx` — id anchor (read first)
- `web/src/router.tsx` — PayWindowBar, cross-widget links, skeleton consolidation, empty state

## Files you should read but may not need to modify

- `web/src/components/ui/tooltip.tsx` — verify API
- `web/src/components/ui/popover.tsx` — may not exist; if missing, create following the pattern of `tooltip.tsx`
- `web/src/lib/format.ts` — `formatDate`, `formatMoney` signatures
- `web/src/lib/api.ts` — `TransactionResponse` type
- `web/src/lib/category-autofill.ts` — `suggestCategoryFromDescription` signature
- `web/src/components/FriendLedgerWidget.tsx` — understand peer debt rendering
- `web/src/components/ObligationsList.tsx` — understand obligations structure
- `web/src/components/GoalsSnapshotWidget.tsx` — understand goals structure

## Constraints

- Do NOT change Go backend code
- Do NOT modify `web/src/components/ui/` files except to create `popover.tsx` if needed
- All money values must retain `tabular-nums` class
- Maintain existing mobile/desktop responsive breakpoints
- Keep all existing test files passing
- Use sonner for toasts (already imported)
- Use motion/react for animations (already imported)
- Follow existing component patterns (Card, CardContent, Button, Badge, etc.)
