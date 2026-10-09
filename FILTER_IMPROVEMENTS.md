# Transactions Page — Filter Improvements

## Root cause: `due-now` = `current-window` (identical preset behavior)

```ts
// transactions-impact.ts:173-176  (matchesPresetFilter)
if (preset === 'next-window') return isNextWindowDue(...)
// current-window and due-now share due classification
return isCurrentDue(...)
```

The `due-now` and `current-window` presets produce **identical results**. Both show all transactions due in the current pay window (recurring + pending one-time). This is confusing because the impact card's "Due now" button counts only pending one-time items, but clicking it sets a filter that also shows recurring.

---

## 1. Show the actual date window for each preset

**Problem:** "Current window" / "Next window" mean nothing without dates. Users can't tell what time range they're looking at.

**Fix:** Compute the date range from the pay schedule and display it inline.

| Instead of... | Show... |
|---|---|
| `Current window` | `Current (until Mar 31)` |
| `Next window` | `Next (Mar 31 – Apr 15)` |
| `Due now` | `Due now (before Mar 31)` |

Implementation: `getWindowBounds()` in `transactions-impact.ts` already computes `nextPaydayDay` and `followingPaydayDay`. Expose this, format the dates, and display them in the preset labels/chips.

---

## 2. Replace the preset `<Select>` dropdown with horizontal filter chips

**Problem:** 5 presets in a dropdown = 2 clicks (open → pick). Users don't see the options without opening.

**Fix:** Render a horizontal scrollable row of chips directly below the impact card:

```
[Due now (before Mar 31)] [Current window] [Next window (Mar 31–Apr 15)] [Recurring] [One-time]
```

Active chip = filled. Others = outline. Single click to switch.

Drop the `<Select>` for preset entirely. Keep `<Select>` only for Sort/Category — those benefit from dropdowns because they have many options.

---

## 3. Show active filter pills inline (not hidden behind Filters toggle)

**Problem:** Current flow: user clicks impact card → filter changes silently → must open "Filters" panel to see what's active. The only feedback is a badge with a count ("2" — not helpful).

**Fix:** Render active filter pills as a row between the impact card and the transaction list:

```
Active filters:  [Due now ✕]  [Category: Food ✕]  [Sorted: Amount ↓]  [Clear all]
```

Each pill has a dismiss button. The Filters toggle button still opens the full panel for configuration, but the active state is always visible.

Already partially implemented — `hasActiveFilters` exists and the count badge renders. Just need to surface the labels.

---

## 4. Fix the `due-now` → `current-window` semantic lie

**Problem:** Two UI elements with different names produce the same filter results. The impact summary card is specifically about unconfirmed one-time payments, but setting the filter to `due-now` adds recurring transactions.

**Fix (option A — clarify the preset):** Rename `due-now` to `All due this window` and keep its behavior (shows everything due). The impact card buttons stay "Due now" / "Next window" but the active chip reflects the broader filter.

**Fix (option B — split the preset):** Make `due-now` filter to ONLY pending one-time items with anchor_date in the current window (matching what the impact card displays). This gives users a way to filter exactly what the card promises.

**Fix (option C — add a sub-toggle):** Keep `due-now` as everything due, but add a toggle inside the filter panel: `☐ Include recurring`. Default: off for "Due now", on for "Current window".

Recommendation: **Option B** — least confusing. The impact card says "Due now: 3 pending · $150" → clicking it should show those 3 items, not 3 + 12 recurring.

---

## 5. Add text search filter

**Problem:** Can sort by description but can't filter by text. Finding "Netflix" in 50+ transactions requires eye-scanning.

**Fix:** Add an `<Input>` to the filter panel (or as a persistent search bar):

```
[🔍 Search transactions...                                    ]
```

Filters `description` by substring match. Keeps it simple — no fuzzy search needed. Combine with `filterCategory` and preset via AND logic.

---

## 6. Add amount range filter

**Problem:** No way to find "all transactions over $1,000" or "all small transactions under $10".

**Fix:** Two optional inputs in the filter panel:

```
Amount:  [Min: 0.00]  –  [Max: 0.00]
```

Only apply when values are set (> 0). Allow one-sided ranges (min-only or max-only).

---

## 7. Sync the impact card's visual state with the active filter

**Problem (from original analysis 1.A):** Clicking "Due now" on the impact card changes the preset but there's no visual link between the card and the active filter.

**Fix:** When `preset === 'due-now'`, add an active state to the "Due now" button in the impact card (accent border, filled background). Same for "Next window". Both buttons get `variant="outline"` normally, switching to `variant="secondary"` or a custom active class when the matching preset is selected.

Code already passes `setPreset` to the buttons:
```tsx
<Button size="sm" variant="outline" onClick={() => setPreset('due-now')}>Due now</Button>
<Button size="sm" variant="outline" onClick={() => setPreset('next-window')}>Next window</Button>
```

Just need:
```tsx
variant={preset === 'due-now' ? 'secondary' : 'outline'}
```

---

## 8. Explain what each preset means (tooltips)

**Problem:** "All recurring" vs "One-time only" — users may not know that recurring = scheduled repeating transactions, one-time = ad-hoc.

**Fix:** Add tooltips to each preset chip/label:

| Preset | Tooltip |
|---|---|
| Due now | Transactions with a date before your next payday |
| Current window | Everything due in the current pay period |
| Next window | Items falling in the next pay period only |
| All recurring | Scheduled repeating bills & subscriptions |
| One-time only | Ad-hoc transactions, including pending payments |

---

## 9. Filter state persistence across navigation

**Problem:** Navigate to `/goals` → back to `/transactions` → filters reset to `current-window` / `all`. Frustrating when you've configured a specific view.

**Fix:** Save `preset`, `filterCategory`, `sortField`, `sortDir` to `sessionStorage` keyed by account ID. Restore on mount. Reset on explicit "Clear" action.

Minimal implementation:
```ts
const FILTER_STATE_KEY = `cibi:filters:${currentAccountId}`
// on change: sessionStorage.setItem(FILTER_STATE_KEY, JSON.stringify(state))
// on mount: restore from sessionStorage
```

---

## 10. Summary table — implementation order

| # | Improvement | Impact | Effort | Depends on |
|---|------------|--------|--------|------------|
| 1 | Date labels on presets | High | Low | — |
| 7 | Impact card ↔ filter sync | High | Low | — |
| 4 | Fix `due-now` = `current-window` | High | Medium | — |
| 2 | Filter chips instead of dropdown | Medium | Medium | 1 |
| 3 | Active filter pills inline | Medium | Low | — |
| 5 | Text search filter | Medium | Medium | — |
| 8 | Preset tooltips | Low | Low | — |
| 9 | Filter state persistence | Medium | Low | — |
| 6 | Amount range filter | Low | Medium | — |
