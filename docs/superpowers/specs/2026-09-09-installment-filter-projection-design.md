# Installment Filter & Projection Design

**Date:** 2026-09-09
**Status:** Approved

## Problem

Three bugs affecting installment transactions:

1. **Update validation bug**: `UpdateTransaction` in the service fires required-field validation (`total_installments > 0`, `anchor_date`, `frequency`) whenever `is_installment: true` is present in a PATCH — even for existing installment transactions. This breaks any edit to an already-installment transaction since the frontend always sends the full form state including `is_installment: true`.

2. **Filter classification bug**: Installment transactions are treated as "one-time-only" by `matchesPresetFilter`. They do not appear in `due-now`, `current-window`, or `next-window` presets. `one-time-only` is currently `!is_recurring`, which wrongly includes installment.

3. **Projection gap**: `ProjectionWidget` and `computeProjectedBalanceAfterNextWindow` only count recurring and peer-debt obligations. Upcoming installment payments are invisible to the balance projection.

---

## Changeset A — Backend bug fix (committed as checkpoint)

### `internal/service/transactions.go` — `UpdateTransaction`

**Current behavior:** `setInstallment := upd.IsInstallment != nil && *upd.IsInstallment`. When true, validates that `TotalInstallments`, `AnchorDate`, and `Frequency` are all present in the same PATCH.

**Fix:** When `setInstallment` is true, fetch the existing transaction. Only enforce required-field validation if `!oldTxn.IsInstallment` (i.e., actually switching from non-installment to installment). If already installment, skip the required-field check — the fields are already in the DB.

Implementation note: the existing `GetByID` call at line 152 (for the paid_installments constraint) can be reused or the two fetches consolidated.

**Commit message:** `fix: skip installment required-field validation when transaction is already installment`

---

## Changeset B — Filter + projection rework

### B1. Preset state

**File:** `web/src/pages/transactions.tsx`

- State type changes from `TransactionPreset` to `TransactionPreset | null`
- Default changes from `'current-window'` to `null`
- `hasActiveFilters`: `preset !== 'current-window'` → `preset !== null`
- Badge count in `TransactionFilters`: same change

**File:** `web/src/components/TransactionFilters.tsx`

- Props type: `preset: TransactionPreset | null`
- `onPresetChange` handler type: `(value: TransactionPreset | null) => void`
- Chip `onClick`: if chip is already active (`preset === p.key`), call `onPresetChange(null)` (deselect). Otherwise call `onPresetChange(p.key)`.
- Chip `variant`: `preset === p.key ? 'secondary' : 'outline'`

### B2. `matchesPresetFilter` — `web/src/lib/transactions-impact.ts`

Updated preset behaviors:

| Preset | Behavior |
|--------|----------|
| `null` | `is_recurring \|\| (is_installment && next_occurrence !== null)` — all in-progress scheduled items |
| `'due-now'` | Recurring: unchanged. Installment: `next_occurrence !== null && isInCurrentPayWindow(next_occurrence, now, nextPayday)`. One-time: unchanged. |
| `'current-window'` | Same as `isCurrentDue`, with installment added to `isCurrentDue` (see B3). |
| `'next-window'` | Unchanged for recurring/one-time. Installment: `next_occurrence` falls in `[nextPaydayDay, followingPaydayDay)`. |
| `'all-recurring'` | Unchanged: `is_recurring` only. |
| `'one-time-only'` | `!is_recurring && !is_installment` (was `!is_recurring`). |

Function signature gains `null` as a valid preset value:
```ts
export function matchesPresetFilter(params: {
  txn: TransactionResponse
  preset: TransactionPreset | null
  now: Date
  nextPayday: string | null
  paySchedules: PayScheduleResponse[]
}): boolean
```

### B3. `isCurrentDue` — `web/src/lib/transactions-impact.ts`

Add installment branch before the one-time branch:

```ts
if (t.is_installment) {
  if (!t.next_occurrence) return false
  return isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
}
```

`isInCurrentPayWindow` uses `occurrenceDay < nextPaydayDay` with no lower bound, so overdue installments (next_occurrence in the past) are included — consistent with existing recurring behavior.

### B4. Projection — `web/src/components/ProjectionWidget.tsx`

Add two new obligation totals alongside the existing recurring ones:

**Current window installment reserved:**
```ts
const currentInstallmentReserved = transactions
  .filter(t => t.is_installment && t.next_occurrence !== null
    && t.amount < 0
    && isInCurrentPayWindow(t.next_occurrence, now, nextPayday))
  .reduce((sum, t) => sum + Math.abs(t.amount), 0)
```

**Next window installment obligations:**
```ts
const nextInstallmentObligations = transactions
  .filter(t => t.is_installment && t.next_occurrence !== null
    && t.amount < 0
    && isInWindow(t.next_occurrence, windowStart, windowEnd))
  .reduce((sum, t) => sum + Math.abs(t.amount), 0)
```

Update derived values:
- `projectedStartBalance`: subtract `currentInstallmentReserved` alongside `currentRecurringReserved`
- `nextObligations`: add `nextInstallmentObligations`
- `net`: recalculated from updated `nextObligations`
- Chart: add `{ name: 'Installments', value: -nextInstallmentObligations, fill: 'var(--color-risk-medium)' }` bar when `nextInstallmentObligations > 0`, alongside the existing Bills bar

### B5. Projection — `web/src/lib/transactions-impact.ts` (`computeProjectedBalanceAfterNextWindow`)

Apply the same additions as B4 to `computeProjectedBalanceAfterNextWindow` so the balance used by `buildImpactSummary` is also correct.

---

## Acceptance criteria

- Editing an existing installment transaction (any field) succeeds without error
- Switching a non-installment transaction to installment still validates required fields
- Default transaction list (no chip selected) shows all recurring + all in-progress installment transactions
- Due/overdue installment appears in "due-now" and "current-window" presets
- Installment in next pay window appears in "next-window" preset
- "one-time-only" preset excludes installment transactions
- Clicking an active chip deselects it (returns to null/default)
- `ProjectionWidget` next-window obligations bar includes upcoming installment payments
- `computeProjectedBalanceAfterNextWindow` accounts for installment obligations
