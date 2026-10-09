# Installment Filter & Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs: (A) backend skips installment required-field validation for already-installment transactions; (B) installments appear correctly in filter presets; (C) installments are counted in balance projection.

**Architecture:** Backend fix is isolated to `UpdateTransaction` in the service layer. Frontend fixes are in `transactions-impact.ts` (logic), `TransactionFilters.tsx` (UI props), `transactions.tsx` (state), and `ProjectionWidget.tsx` (display).

**Tech Stack:** Go (backend), React + TypeScript + Vitest (frontend)

## Global Constraints

- No new dependencies
- All existing tests must still pass after each task
- Run `make upd` after all tasks are complete

---

## File Map

| File | What changes |
|------|-------------|
| `internal/service/transactions.go:130-148` | Fetch existing txn before validating installment required fields; skip validation if already installment |
| `internal/service/transactions_test.go` | Add two tests for the validation fix |
| `web/src/lib/transactions-impact.ts` | `isCurrentDue` gets installment branch; `matchesPresetFilter` gets null support + installment branches in due-now/next-window + one-time-only fix; `computeProjectedBalanceAfterNextWindow` includes installment obligations |
| `web/src/__tests__/transactions-impact.test.ts` | Add installment filter tests |
| `web/src/components/TransactionFilters.tsx` | Props accept `TransactionPreset \| null`; chip toggles on re-click; badge count uses `preset !== null` |
| `web/src/pages/transactions.tsx` | `preset` state is `TransactionPreset \| null`, default `null`; `hasActiveFilters` uses `preset !== null`; active filter badge display updated |
| `web/src/components/ProjectionWidget.tsx` | Add `currentInstallmentReserved` and `nextInstallmentObligations`; update chart |

---

## Task 1: Backend — skip installment required-field validation for existing installments

**Files:**
- Modify: `internal/service/transactions.go:130-148`
- Test: `internal/service/transactions_test.go`

**Interfaces:**
- Produces: `UpdateTransaction` no longer errors when `is_installment: true` is in a PATCH for a txn that is already an installment

- [ ] **Step 1: Write the failing test**

Add this test to `internal/service/transactions_test.go`, after the existing tests:

```go
func TestUpdateTransaction_ExistingInstallment_SkipsRequiredFieldValidation(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()

	// Transaction is already an installment — PATCH sends is_installment: true
	// but does NOT include total_installments, anchor_date, or frequency.
	isInstallment := true
	newDesc := "Updated description"

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:               txnID,
				AccountID:        accountID,
				IsInstallment:    true,
				PaidInstallments: 1,
				Amount:           -5000,
			}, nil
		},
		updateFn: func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error {
			return nil
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.UpdateTransaction(txnID, sqlite.UpdateTransaction{
		IsInstallment: &isInstallment,
		Description:   &newDesc,
	})

	if err != nil {
		t.Fatalf("expected no error editing existing installment, got: %v", err)
	}
}

func TestUpdateTransaction_SwitchToInstallment_StillValidates(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()

	// Transaction is NOT an installment — switching to installment must validate.
	isInstallment := true

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:            txnID,
				AccountID:     accountID,
				IsInstallment: false,
			}, nil
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.UpdateTransaction(txnID, sqlite.UpdateTransaction{
		IsInstallment: &isInstallment,
		// Missing total_installments, anchor_date, frequency
	})

	if err == nil {
		t.Fatal("expected validation error when switching non-installment to installment without required fields")
	}
	if !strings.Contains(err.Error(), "total_installments") {
		t.Fatalf("expected total_installments error, got: %v", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/fleck/Projects/cibi
go test ./internal/service/... -run "TestUpdateTransaction_ExistingInstallment|TestUpdateTransaction_SwitchToInstallment" -v
```

Expected: FAIL — first test errors with "installment transaction requires total_installments > 0"

- [ ] **Step 3: Fix `UpdateTransaction` in `internal/service/transactions.go`**

Replace lines 137-148 (the `if setInstallment` block):

```go
	// When switching to installment, required fields must be present in this patch.
	// If transaction is already installment, skip — fields are already in the DB.
	if setInstallment {
		oldTxn, err := s.txnsRepo.GetByID(id)
		if err != nil {
			return fmt.Errorf("service.UpdateTransaction: get old transaction: %w", err)
		}
		if !oldTxn.IsInstallment {
			if upd.TotalInstallments == nil || *upd.TotalInstallments <= 0 {
				return fmt.Errorf("installment transaction requires total_installments > 0")
			}
			if upd.AnchorDate == nil {
				return fmt.Errorf("installment transaction requires anchor_date")
			}
			if upd.Frequency == nil || (*upd.Frequency != engine.FreqMonthly && *upd.Frequency != engine.FreqWeekly) {
				return fmt.Errorf("installment transaction requires frequency of monthly or weekly")
			}
		}
	}
```

The `TotalInstallments` paid_installments constraint block below (lines 150-159) stays unchanged — it has its own `GetByID` call.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/fleck/Projects/cibi
go test ./internal/service/... -run "TestUpdateTransaction_ExistingInstallment|TestUpdateTransaction_SwitchToInstallment" -v
```

Expected: PASS both tests

- [ ] **Step 5: Run full backend test suite**

```bash
cd /home/fleck/Projects/cibi
go test ./... 2>&1 | tail -20
```

Expected: all PASS (or only pre-existing failures)

- [ ] **Step 6: Commit**

```bash
git add internal/service/transactions.go internal/service/transactions_test.go
git commit -m "fix: skip installment required-field validation when transaction is already installment"
```

---

## Task 2: Frontend logic — installment support in isCurrentDue, matchesPresetFilter, computeProjectedBalanceAfterNextWindow

**Files:**
- Modify: `web/src/lib/transactions-impact.ts`
- Test: `web/src/__tests__/transactions-impact.test.ts`

**Interfaces:**
- `isCurrentDue(t, now, nextPayday, nextPaydayDay)` — now also returns true for installment txns whose `next_occurrence` falls in the current pay window
- `matchesPresetFilter(params)` — `preset` now accepts `TransactionPreset | null`; installment txns appear in due-now, current-window, next-window; excluded from one-time-only
- `computeProjectedBalanceAfterNextWindow(params)` — now subtracts current-window installment obligations from start balance and adds next-window installment obligations

- [ ] **Step 1: Write the failing tests**

Add these tests to `web/src/__tests__/transactions-impact.test.ts` (inside the existing `describe` block):

```ts
  it('installment with next_occurrence in current window matches current-window preset', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-15T00:00:00Z',
        anchor_date: '2026-03-15T00:00:00Z',
        frequency: 'monthly',
      }),
      preset: 'current-window',
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('installment with next_occurrence in current window matches due-now preset', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-15T00:00:00Z',
        anchor_date: '2026-03-15T00:00:00Z',
        frequency: 'monthly',
      }),
      preset: 'due-now',
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('installment is excluded from one-time-only preset', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-15T00:00:00Z',
      }),
      preset: 'one-time-only',
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(false)
  })

  it('installment with next_occurrence in next window matches next-window preset', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-22T00:00:00Z',
        anchor_date: '2026-03-22T00:00:00Z',
        frequency: 'monthly',
      }),
      preset: 'next-window',
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('null preset returns recurring transactions', () => {
    expect(matchesPresetFilter({
      txn: txn({ is_recurring: true, requires_confirmation: false }),
      preset: null,
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('null preset returns in-progress installment transactions', () => {
    expect(matchesPresetFilter({
      txn: txn({
        is_installment: true,
        is_recurring: false,
        requires_confirmation: false,
        next_occurrence: '2026-04-22T00:00:00Z',
      }),
      preset: null,
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(true)
  })

  it('null preset excludes one-time transactions', () => {
    expect(matchesPresetFilter({
      txn: txn({ is_recurring: false, is_installment: false }),
      preset: null,
      now: new Date('2026-04-10T12:00:00Z'),
      nextPayday: '2026-04-20',
      paySchedules,
    })).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/fleck/Projects/cibi/web
npx vitest run src/__tests__/transactions-impact.test.ts 2>&1 | tail -30
```

Expected: multiple FAILs — type error on `preset: null` and installment filter assertions failing

- [ ] **Step 3: Update `isCurrentDue` in `web/src/lib/transactions-impact.ts`**

Replace lines 90-101:

```ts
export const isCurrentDue = (t: TransactionResponse, now: Date, nextPayday: string | null, nextPaydayDay: number | null) => {
  if (t.is_recurring) {
    const recurringDate = t.next_occurrence || t.anchor_date
    if (!recurringDate) return false
    return isInCurrentPayWindow(recurringDate, now, nextPayday)
  }

  if (t.is_installment) {
    if (!t.next_occurrence) return false
    return isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
  }

  if (!(t.requires_confirmation && !t.confirmed_at)) return false
  const oneTimeDay = parseDay(t.anchor_date || t.timestamp)
  if (oneTimeDay === null) return false
  return nextPaydayDay === null ? true : oneTimeDay < nextPaydayDay
}
```

- [ ] **Step 4: Update `matchesPresetFilter` in `web/src/lib/transactions-impact.ts`**

Replace lines 224-246:

```ts
export function matchesPresetFilter(params: {
  txn: TransactionResponse
  preset: 'current-window' | 'due-now' | 'next-window' | 'all-recurring' | 'one-time-only' | null
  now: Date
  nextPayday: string | null
  paySchedules: PayScheduleResponse[]
}): boolean {
  const { txn, preset, now, nextPayday, paySchedules } = params
  const { nextPaydayDay, followingPaydayDay } = getWindowBounds(paySchedules, nextPayday)

  // null = default: all recurring + all in-progress installments
  if (preset === null) return txn.is_recurring || (txn.is_installment && txn.next_occurrence !== null)

  if (preset === 'all-recurring') return txn.is_recurring
  if (preset === 'one-time-only') return !txn.is_recurring && !txn.is_installment
  if (preset === 'next-window') {
    if (txn.is_installment) {
      if (!txn.next_occurrence || nextPaydayDay === null || followingPaydayDay === null) return false
      const occDay = parseDay(txn.next_occurrence)
      return occDay !== null && occDay >= nextPaydayDay && occDay < followingPaydayDay
    }
    return isNextWindowDue(txn, nextPaydayDay, followingPaydayDay)
  }

  // due-now
  if (preset === 'due-now') {
    if (txn.is_installment) {
      return txn.next_occurrence !== null && isInCurrentPayWindow(txn.next_occurrence, now, nextPayday)
    }
    if (txn.is_recurring) return false
    if (!txn.requires_confirmation || txn.confirmed_at) return false
    return isCurrentDue(txn, now, nextPayday, nextPaydayDay)
  }

  // current-window: recurring + installment + pending one-time
  return isCurrentDue(txn, now, nextPayday, nextPaydayDay)
}
```

- [ ] **Step 5: Update `computeProjectedBalanceAfterNextWindow` in `web/src/lib/transactions-impact.ts`**

Replace lines 143-168 (the two reserved/obligations blocks and the final return):

```ts
  const currentRecurringReserved = transactions
    .filter(
      t => t.is_recurring && t.next_occurrence !== null
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const currentInstallmentReserved = transactions
    .filter(
      t => t.is_installment && t.next_occurrence !== null
        && t.amount < 0
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const currentPeerReserved = friendBreakdown.reduce((sum, debt) => {
    if (!debt.next_payment_date) return sum + debt.next_payment
    if (isInCurrentPayWindow(debt.next_payment_date, now, nextPayday)) {
      return sum + debt.next_payment
    }
    return sum
  }, 0)

  const projectedStartBalance = currentBalance - currentRecurringReserved - currentInstallmentReserved - currentPeerReserved

  const nextRecurringObligations = transactions
    .filter(t => t.is_recurring && t.next_occurrence !== null && isInWindow(t.next_occurrence, windowStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const nextInstallmentObligations = transactions
    .filter(t => t.is_installment && t.next_occurrence !== null
      && t.amount < 0
      && isInWindow(t.next_occurrence, windowStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const nextPeerObligations = friendBreakdown
    .filter(d => d.next_payment_date !== null && isInWindow(d.next_payment_date, windowStart, windowEnd))
    .reduce((sum, d) => sum + d.next_payment, 0)

  const nextObligations = nextRecurringObligations + nextInstallmentObligations + nextPeerObligations
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/fleck/Projects/cibi/web
npx vitest run src/__tests__/transactions-impact.test.ts 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 7: Type-check**

```bash
cd /home/fleck/Projects/cibi/web
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to these files)

- [ ] **Step 8: Commit**

```bash
cd /home/fleck/Projects/cibi
git add web/src/lib/transactions-impact.ts web/src/__tests__/transactions-impact.test.ts
git commit -m "feat: add installment support to isCurrentDue, matchesPresetFilter, and computeProjectedBalance"
```

---

## Task 3: Frontend UI — null preset state, deselectable chips, updated hasActiveFilters

**Files:**
- Modify: `web/src/components/TransactionFilters.tsx`
- Modify: `web/src/pages/transactions.tsx`

**Interfaces:**
- Consumes: `matchesPresetFilter` now accepts `preset: TransactionPreset | null` (from Task 2)
- Produces: `TransactionPreset | null` as valid preset state throughout the UI

- [ ] **Step 1: Update `TransactionFilters.tsx`**

Replace lines 10-16 (the `TransactionPreset` type and `TransactionFiltersProps` interface `preset` and `onPresetChange`):

```ts
export type TransactionPreset =
  | 'due-now'
  | 'current-window'
  | 'next-window'
  | 'all-recurring'
  | 'one-time-only'

export interface TransactionFiltersProps {
  showFilters: boolean
  hasActiveFilters: boolean
  preset: TransactionPreset | null
  categories: string[]
  filterCategory: string
  sortField: 'description' | 'date' | 'amount'
  sortDir: 'asc' | 'desc'
  searchQuery: string
  amountMin: string
  amountMax: string
  windowLabels: WindowLabels | null
  onToggleFilters: () => void
  onPresetChange: (value: TransactionPreset | null) => void
  onFilterCategoryChange: (value: string) => void
  onSortFieldChange: (value: 'description' | 'date' | 'amount') => void
  onSortDirChange: (value: 'asc' | 'desc') => void
  onSearchQueryChange: (value: string) => void
  onAmountMinChange: (value: string) => void
  onAmountMaxChange: (value: string) => void
  onResetFilters: () => void
}
```

Replace the badge count on line 83 (inside the Filters button):
```tsx
{[filterCategory !== 'all', preset !== null, !!searchQuery, !!(amountMin || amountMax)].filter(Boolean).length}
```

Replace the chip `onClick` (line 97) and `variant` (line 95):
```tsx
<Button
  variant={preset === p.key ? 'secondary' : 'outline'}
  size="sm"
  onClick={() => onPresetChange(preset === p.key ? null : p.key)}
  className="text-xs h-8"
>
```

- [ ] **Step 2: Update `transactions.tsx`**

Change line 85 — preset initial state and type:
```ts
const [preset, setPreset] = useState<TransactionPreset | null>(null)
```

Change line 215 — hasActiveFilters:
```ts
const hasActiveFilters = filterCategory !== 'all' || preset !== null || !!searchQuery.trim() || !!(amountMin || amountMax)
```

Change line 432 — handleClearFilters (setPreset):
```ts
setPreset(null)
```

Change lines 667-675 — active filter badge for preset:
```tsx
{preset !== null && (
  <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setPreset(null)}>
    {preset === 'due-now' ? windowLabels?.dueNowLabel :
     preset === 'current-window' ? windowLabels?.currentWindowLabel :
     preset === 'next-window' ? windowLabels?.nextWindowLabel :
     preset === 'all-recurring' ? 'All recurring' :
     preset === 'one-time-only' ? 'One-time only' : preset}
    <X size={12} />
  </Badge>
)}
```

Change `onPresetChange={setPreset}` on line 654 — the type now accepts null so no change needed there (TypeScript will verify).

Session storage restore (lines 538-540) — keep `setPreset(state.preset)` but add null guard:
```ts
if (state.preset !== undefined) setPreset(state.preset as TransactionPreset | null)
```

- [ ] **Step 3: Type-check**

```bash
cd /home/fleck/Projects/cibi/web
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in TransactionFilters.tsx or transactions.tsx

- [ ] **Step 4: Run existing tests**

```bash
cd /home/fleck/Projects/cibi/web
npx vitest run 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd /home/fleck/Projects/cibi
git add web/src/components/TransactionFilters.tsx web/src/pages/transactions.tsx
git commit -m "feat: null preset default, deselectable filter chips, updated active filter logic"
```

---

## Task 4: Frontend — installment obligations in ProjectionWidget

**Files:**
- Modify: `web/src/components/ProjectionWidget.tsx`

**Interfaces:**
- Consumes: existing `isInCurrentPayWindow` from `@/lib/financial-window`, existing `isInWindow` (local function)
- No interface changes — `ProjectionWidgetProps` is unchanged

- [ ] **Step 1: Add `currentInstallmentReserved` after `currentRecurringReserved` (line 44 in ProjectionWidget.tsx)**

After:
```ts
  const currentRecurringReserved = transactions
    .filter(
      t => t.is_recurring && t.next_occurrence !== null
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
```

Add:
```ts
  const currentInstallmentReserved = transactions
    .filter(
      t => t.is_installment && t.next_occurrence !== null
        && t.amount < 0
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
```

- [ ] **Step 2: Update `projectedStartBalance` (line 54)**

Replace:
```ts
  const projectedStartBalance = account.current_balance - currentRecurringReserved - currentPeerReserved
```

With:
```ts
  const projectedStartBalance = account.current_balance - currentRecurringReserved - currentInstallmentReserved - currentPeerReserved
```

- [ ] **Step 3: Add `nextInstallmentObligations` after `nextRecurringObligations` (lines 56-58)**

After the `nextRecurringObligations` block, add:
```ts
  const nextInstallmentObligations = transactions
    .filter(t => t.is_installment && t.next_occurrence !== null
      && t.amount < 0
      && isInWindow(t.next_occurrence, windowStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
```

- [ ] **Step 4: Update `nextObligations` (line 64)**

Replace:
```ts
  const nextObligations = nextRecurringObligations + nextPeerObligations
```

With:
```ts
  const nextObligations = nextRecurringObligations + nextInstallmentObligations + nextPeerObligations
```

- [ ] **Step 5: Add Installments bar to `chartData` (line 82)**

Replace the `chartData` array:
```ts
  const chartData = [
    { name: 'Income', value: incoming, fill: 'var(--color-verdict-yes)' },
    { name: 'Bills', value: -nextRecurringObligations, fill: 'var(--color-verdict-no)' },
    ...(nextInstallmentObligations > 0 ? [{ name: 'Installments', value: -nextInstallmentObligations, fill: 'var(--color-risk-medium)' }] : []),
    ...(nextPeerObligations > 0 ? [{ name: 'Peer debts', value: -nextPeerObligations, fill: 'var(--color-risk-medium)' }] : []),
    { name: 'Net', value: net, fill: net >= 0 ? 'var(--color-verdict-yes)' : 'var(--color-verdict-no)' },
  ]
```

- [ ] **Step 6: Type-check**

```bash
cd /home/fleck/Projects/cibi/web
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in ProjectionWidget.tsx

- [ ] **Step 7: Run tests**

```bash
cd /home/fleck/Projects/cibi/web
npx vitest run 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
cd /home/fleck/Projects/cibi
git add web/src/components/ProjectionWidget.tsx
git commit -m "feat: include installment obligations in ProjectionWidget balance projection"
```

---

## Final Step: Post-ship

- [ ] **Run `make upd`**

```bash
cd /home/fleck/Projects/cibi
make upd
```

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| Editing existing installment succeeds without error | Task 1 |
| Switching non-installment to installment still validates | Task 1 |
| Default list (no chip) shows recurring + in-progress installment | Task 2 + Task 3 |
| Due/overdue installment in "due-now" and "current-window" | Task 2 |
| Installment in next pay window in "next-window" | Task 2 |
| "one-time-only" excludes installment | Task 2 |
| Clicking active chip deselects it (returns to null) | Task 3 |
| ProjectionWidget next-window bar includes installments | Task 4 |
| `computeProjectedBalanceAfterNextWindow` accounts for installments | Task 2 |
