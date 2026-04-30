# Phase 1: UI standardization: shared value - Research

**Researched:** 2026-04-17
**Domain:** Web frontend value/money display consistency (React + TypeScript)
**Confidence:** HIGH (repo-first evidence)

## Summary

Phase 1 should standardize **how numeric financial values are rendered** (format, sign, color, emphasis, and currency source) across dashboard, accounts, transactions, friends, and public pages.

Current code already has a shared formatter (`formatMoney`) but UI rendering is still fragmented: manual `toFixed(2)`, manual `+` prefixes, mixed positive/negative color classes, and many `formatMoney()` calls without explicit currency. This creates drift risk and inconsistent UX.

**Primary recommendation:** Introduce one shared display primitive (e.g., `MoneyValue`) plus a tiny semantic layer (value intent/tone), then migrate high-traffic screens first (dashboard + transactions + accounts) before friends/public pages.

---

## Project Constraints (from repository context)

- No `CLAUDE.md` found at repo root (no additional hard constraints from that file).
- Existing stack in `/web` should be reused:
  - React 19 + TypeScript + Vite
  - Tailwind CSS v4 + shadcn/ui
  - TanStack Query + Router
  - Vitest (jsdom)
- `workflow.nyquist_validation` is enabled in `.planning/config.json`.

---

## Current Frontend Structure (relevant to this phase)

- Routing/composition: `web/src/router.tsx`
- Shared format helpers: `web/src/lib/format.ts`
- Dashboard widgets:
  - `web/src/components/StatCards.tsx`
  - `web/src/components/CheckWidget.tsx`
  - `web/src/components/ObligationsList.tsx`
  - `web/src/components/ProjectionWidget.tsx`
  - `web/src/components/PayScheduleList.tsx`
  - `web/src/components/FriendLedgerWidget.tsx`
- Page-level value-heavy UIs:
  - `web/src/pages/accounts.tsx`
  - `web/src/pages/transactions.tsx`
  - `web/src/pages/friends.tsx`
  - `web/src/pages/friend-public.tsx`
  - `web/src/pages/group-public.tsx`

---

## Duplicated / Inconsistent Value-Display Patterns to Standardize

### 1) Raw decimal rendering (`toFixed`) bypasses money formatter

- `web/src/pages/accounts.tsx:394,454` → `account.current_balance.toFixed(2)`
- `web/src/pages/transactions.tsx:404,523` → `{txn.amount.toFixed(2)}`

Impact: loses locale/currency formatting and diverges from `formatMoney` behavior.

### 2) Manual sign decoration around formatted values

- `web/src/components/ProjectionWidget.tsx:127,131` (`+{formatMoney(...)}`, manual negative handling)
- `web/src/components/PayScheduleList.tsx:34`
- `web/src/pages/accounts.tsx:600,632`
- `web/src/pages/transactions.tsx:404,523` (manual `txn.amount >= 0 ? '+' : ''`)

Impact: sign behavior duplicated in many places; easy to mismatch with formatter or color tone.

### 3) Repeated color semantics for value polarity

- Many repeated `text-green-600` / `text-red-500` / `text-red-600` branches:
  - `transactions.tsx`, `friends.tsx`, `friend-public.tsx`, `ProjectionWidget.tsx`, `FriendLedgerWidget.tsx`

Impact: semantic meaning (income/expense, owed/owes, net result) encoded ad-hoc per file.

### 4) Default currency fallback often used implicitly

`formatMoney` default is BRL. Many calls omit currency argument in friend/public areas and some account schedule displays.

Examples:
- `web/src/components/FriendLedgerWidget.tsx`
- `web/src/pages/friends.tsx`
- `web/src/pages/friend-public.tsx`
- `web/src/pages/group-public.tsx`
- `web/src/pages/accounts.tsx` (pay schedule snippets)

Impact: if selected/default account currency diverges from BRL, display can become inconsistent.

### 5) Duplicate “mobile card + desktop table” amount rendering logic

Same amount display logic duplicated in both mobile and desktop branches in:
- `transactions.tsx`
- `friends.tsx`
- `friend-public.tsx`
- `accounts.tsx` (schedules)

Impact: any formatting/sign fix must be repeated twice unless extracted.

---

## Recommended Concrete Implementation Slices (for planning)

### Slice 1 — Define shared value-display contract (foundation)

**Goal:** Create one reusable primitive for value rendering.

Implement:
- `MoneyValue` component (new) with props like:
  - `amount: number`
  - `currency?: string`
  - `tone?: 'neutral' | 'positive' | 'negative' | 'auto'`
  - `showSign?: 'auto' | 'always' | 'never'`
  - `weight?`, `size?`, `className?`
- Optional helper in `lib/format.ts` for sign-normalized text if needed.

Outcome: all money presentation flows through one semantic layer.

### Slice 2 — Migrate dashboard widgets (low-risk, high-visibility)

Target:
- `StatCards.tsx`
- `ObligationsList.tsx`
- `PayScheduleList.tsx`
- `ProjectionWidget.tsx`
- `FriendLedgerWidget.tsx`
- `CheckWidget.tsx` (for value lines)

Outcome: dashboard becomes canonical for new pattern.

### Slice 3 — Migrate transactional/account screens

Target:
- `pages/transactions.tsx` (replace `toFixed` + manual sign/color)
- `pages/accounts.tsx` (replace balance `toFixed`; schedule amount display)

Outcome: removes raw numeric formatting and most duplicated sign logic.

### Slice 4 — Migrate friends/public pages + compact rows

Target:
- `pages/friends.tsx`
- `pages/friend-public.tsx`
- `pages/group-public.tsx`
- `components/ParticipantEditor.tsx`
- `components/CompactEntityTable.tsx` usage strings where applicable

Outcome: finishes cross-app consistency and public/share surfaces.

### Slice 5 — Test + lint-like guardrails

- Add/expand tests for value component and formatting behavior.
- Add grep-verifiable checks in validation docs/plan (see below).

---

## Exact Files Likely to be Modified

### New files (recommended)

- `web/src/components/ui/money-value.tsx` (shared display primitive)
- `web/src/__tests__/money-value.test.tsx` (behavioral tests)

### Existing files (high confidence)

- `web/src/lib/format.ts`
- `web/src/components/StatCards.tsx`
- `web/src/components/ObligationsList.tsx`
- `web/src/components/PayScheduleList.tsx`
- `web/src/components/ProjectionWidget.tsx`
- `web/src/components/FriendLedgerWidget.tsx`
- `web/src/components/CheckWidget.tsx`
- `web/src/components/ParticipantEditor.tsx`
- `web/src/pages/accounts.tsx`
- `web/src/pages/transactions.tsx`
- `web/src/pages/friends.tsx`
- `web/src/pages/friend-public.tsx`
- `web/src/pages/group-public.tsx`
- `web/src/__tests__/dashboard.test.tsx` (likely updates/expansion)
- `web/src/__tests__/verdict.test.tsx` (likely updates/expansion)

### Maybe modified

- `web/src/index.css` (if adding semantic value color tokens/util classes)

---

## Dependency / Order Guidance

1. **Contract first** (`money-value.tsx`, optional format helper updates).
2. **Dashboard migration second** (quick feedback, easy visual QA).
3. **Transactions + accounts third** (highest impact on money readability).
4. **Friends/public migration fourth** (cross-surface consistency pass).
5. **Tests and grep checks last** (gate completeness).

Reason: prevents multi-file churn without stable API and reduces rework.

---

## Risk Areas

1. **Sign semantics drift**
   - `+` can mean income, but in some places positive means “they owe me”.
   - Must support semantic tone independent from numeric sign where needed.

2. **Currency source ambiguity**
   - Many calls rely on BRL default. Need explicit currency strategy per view:
     - selected account currency for authenticated pages,
     - defined fallback for public pages.

3. **Double-sign bugs**
   - Existing manual `+` plus formatted negatives can create awkward strings if not normalized.

4. **Mobile/desktop divergence**
   - Same value appears in separate render branches; easy to miss one branch.

5. **Regression in tests expecting exact locale output**
   - Existing tests assert exact `pt-BR` strings; migration must preserve this unless intentionally changed.

---

## Verification Suggestions (including grep-verifiable checks)

### Functional checks

- Dashboard values still match existing computations (balance/reserved/liquid/projection).
- Transaction and account lists show locale-aware money format, not raw decimals.
- Positive/negative tone rules remain correct for debts and projections.

### Grep-verifiable checks

Run from repo root:

```bash
# 1) No raw decimal display in pages/components (except legitimate form-state transforms)
rg -n "\.toFixed\(2\)" web/src/pages web/src/components

# 2) No manual plus-prefix around formatted money in UI render
rg -n "\+\{formatMoney\(" web/src/pages web/src/components

# 3) No manual sign ternary in table/card amount render
rg -n "amount >= 0 \? '\+' : ''" web/src/pages web/src/components

# 4) Shared component adoption count (adjust name if different)
rg -n "<MoneyValue" web/src/pages web/src/components

# 5) Keep formatter centralized
rg -n "Intl\.NumberFormat" web/src
```

Expected direction:
- (1)-(3) trend to zero in display code.
- (4) present across main value surfaces.
- (5) remains centralized in `lib/format.ts` only.

### Test commands

```bash
cd web && npm test -- --run
cd web && npm run build
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest `^4.1.4` + Testing Library (jsdom) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npm test -- --run src/__tests__/dashboard.test.tsx src/__tests__/verdict.test.tsx` |
| Full suite command | `cd web && npm test -- --run` |

### Phase Requirements → Test Map

(Phase-specific IDs proposed for planning clarity, since `REQUIREMENTS.md` has no explicit new IDs for this roadmap phase.)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| UI-STD-01 | All money display uses shared primitive, no raw `toFixed` render | grep + unit | `rg -n "\.toFixed\(2\)" web/src/pages web/src/components` | ✅ (grep command) |
| UI-STD-02 | Sign rendering consistent (`showSign` behavior) | unit/component | `cd web && npm test -- --run src/__tests__/money-value.test.tsx` | ❌ Wave 0 |
| UI-STD-03 | Tone/color semantics consistent for positive/negative/neutral | component | `cd web && npm test -- --run src/__tests__/money-value.test.tsx` | ❌ Wave 0 |
| UI-STD-04 | Locale/currency formatting preserved (`pt-BR`) | unit | `cd web && npm test -- --run src/__tests__/dashboard.test.tsx src/__tests__/verdict.test.tsx` | ✅ |
| UI-STD-05 | Manual sign concatenation removed from migrated files | grep | `rg -n "\+\{formatMoney\(|amount >= 0 \? '\+' : ''" web/src/pages web/src/components` | ✅ (grep command) |

### Sampling Rate

- **Per task commit:** quick tests + grep checks (targeted files).
- **Per wave merge:** `cd web && npm test -- --run`.
- **Phase gate:** tests green + grep checks clean + visual pass on dashboard/transactions/friends.

### Wave 0 Gaps

- [ ] `web/src/__tests__/money-value.test.tsx` — covers sign/tone/formatter contract.
- [ ] Define canonical value semantics doc block in component (props contract).
- [ ] Optional: snapshot/DOM assertions for mobile+desktop duplicated sections after migration.

---

## Sources

### Primary (HIGH confidence)

- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `web/src/lib/format.ts`
- `web/src/router.tsx`
- `web/src/components/*` and `web/src/pages/*` files cited above
- `web/package.json`
- `web/vitest.config.ts`

### Secondary (MEDIUM confidence)

- None needed; repo evidence sufficient for this phase.

### Tertiary (LOW confidence)

- None.

---

## Confidence Breakdown

- Standardization slices: **HIGH** (direct code hotspots identified)
- File impact list: **HIGH** (line-level evidence from current code)
- Risk assessment: **MEDIUM-HIGH** (depends on intended sign/currency semantics per screen)

**Valid until:** 30 days (or until major frontend refactor)
