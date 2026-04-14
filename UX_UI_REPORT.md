# CIBI Application - UX/UI Analysis Report

## Application Overview

Analyzed via source code at `web/src/`. The application is a personal finance dashboard with:
- **Dashboard (/)** - Balance stats, "Can I Buy It?" widget, upcoming obligations
- **Accounts (/accounts)** - Account CRUD with default selection
- **Transactions (/transactions)** - Transaction CRUD including recurring
- **Settings (/settings)** - Pay schedule configuration

---

## 🔴 Critical Issues

### 1. Native Browser Confirm Dialog Used for Deletions
**Files:** `web/src/pages/accounts.tsx:203`, `web/src/pages/transactions.tsx:255`

```tsx
if (window.confirm(`Delete "${account.name}"?`)) {
  deleteMutation.mutate(account.id)
}
```

**Problem:** Using `window.confirm()` is a native browser modal that:
- Styles vary by browser/OS (inconsistent with app design)
- Cannot be customized or themed
- Blocks the main thread poorly

**Recommendation:** Create a custom Modal component with proper styling consistent with the app's design system.

---

### 2. No Form Field Validation Highlighting
**Files:** `web/src/pages/accounts.tsx:105-116`, `web/src/pages/transactions.tsx:144-160`

**Problem:** Validation errors are shown via toast only. Users must mentally correlate error messages with form fields. There's no visual indication on invalid fields.

**Recommendation:** Add error state to Input components and display validation messages inline under each field:
```tsx
// Example improvement
<Input 
  error={errorMessage ? true : false} 
  {...}
 />
{errorMessage && <span className="text-xs text-red-500">{errorMessage}</span>}
```

---

### 3. No Loading States on Submit Buttons
**Files:** `web/src/pages/accounts.tsx`, `web/src/pages/transactions.tsx`

**Problem:** During mutation (create/update), buttons don't show loading indicators. The Buttons accept a `disabled` prop but don't have internal loading states. The CheckWidget (`CheckWidget.tsx:79-84`) correctly shows a spinner, but account/transaction forms don't.

**Recommendation:** Pass mutation pending state to Button:
```tsx
<Button 
  disabled={createMutation.isPending} 
  className={createMutation.isPending ? "opacity-50" : ""}
>
  {createMutation.isPending ? "Creating..." : "Create"}
</Button>
```

---

### 4. Application Has Placeholder Title
**File:** `web/index.html:7`

```html
<title>web</title>
```

**Recommendation:** Change to "Cibi" or "Cibi - Personal Finance"

---

## 🟠 Major UX Issues

### 5. Free-Text Currency Input (No Validation)
**File:** `web/src/pages/accounts.tsx:254-258`

```tsx
<Input
  value={formData.currency}
  onChange={e => setFormData({ ...formData, currency: e.target.value })}
  placeholder="USD"
/>
```

**Problem:** User can enter invalid currency codes (e.g., "foo", empty string). Currency dropdown options may be more appropriate.

**Recommendation:** Use a Select dropdown with common currencies (USD, EUR, GBP, CAD, AUD, JPY, etc.) or validate against ISO 4217.

---

### 6. Free-Text Category Input
**File:** `web/src/pages/transactions.tsx:321-328`

**Problem:** No category suggestions, misspellings create duplicates ("Food" vs "food" vs "Foods").

**Recommendation:** 
- Add a pre-defined list of common categories
- Add autocomplete/Combobox for category selection
- Normalize categories on save (title case)

---

### 7. Empty States Are Just Text
**Files:** `web/src/pages/accounts.tsx:160-163`, `web/src/pages/transactions.tsx:218-223`

```tsx
<CardContent className="text-center py-8 text-muted-foreground">
  No accounts yet. Create one to get started.
</CardContent>
```

**Problem:** Empty states lack visual appeal and clear CTAs.

**Recommendation:** Add icons and primary CTA buttons in empty states:
```tsx
<div className="text-center py-8">
  <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
  <p className="text-muted-foreground mb-4">No accounts yet</p>
  <Button onClick={handleCreateClick}>Create First Account</Button>
</div>
```

---

### 8. No Undo for Delete Operations
**Files:** `web/src/pages/accounts.tsx:202-205`, `web/src/pages/transactions.tsx:254-257`

**Problem:** Once deleted, users must re-create the item manually. No undo toast with "Undo" action.

**Recommendation:** Use sonner's toast with undo action:
```tsx
toast.success('Account deleted', {
  action: {
    label: 'Undo',
    onClick: () => restoreAccount(account)
  }
})
```

---

## 🟡 Minor Issues

### 9. Native Date Pickers
**Files:** `web/src/pages/transactions.tsx:357-361`, `web/src/components/PayScheduleForm.tsx:97-102`

```tsx
<Input type="date" value={anchorDate} ... />
```

**Problem:** Native date picker UI varies wildly across browsers.

**Recommendation:** Consider a cross-browser date picker library (e.g., react-day-picker) for consistent appearance.

---

### 10. No Account Selection After Transaction Edit
**File:** `web/src/pages/transactions.tsx:283-298`

```tsx
{!editingId && (
  <div>
    <label className="block text-xs font-medium mb-2">Account *</label>
    <select ...>
  </div>
)}
```

The account selector is hidden when editing, which makes sense, but users cannot reassign a transaction to a different account.

**Recommendation:** Allow account change during edit or clearly indicate which account the transaction belongs to.

---

### 11. Dashboard Doesn't Handle Missing Account Gracefully
**File:** `web/src/router.tsx:66-70`

When no account exists, it shows loading skeletons. Should show a prompt to create an account.

**Recommendation:** Add a "Get Started" card when `!account && !accounts.length`:
```tsx
{!account && !accounts.length && (
  <Card>
    <CardContent className="text-center py-8">
      <p className="mb-4">Create your first account to get started</p>
      <Link to="/accounts">
        <Button>Create Account</Button>
      </Link>
    </CardContent>
  </Card>
)}
```

---

### 12. Inconsistent Frequency Selection UI
**Comparison:**
- Transactions: Uses `<select>` with options (`transactions.tsx:345-353`)
- Pay Schedule: Uses custom toggle buttons (`PayScheduleForm.tsx:75-91`)

**Recommendation:** Choose one pattern and be consistent across the application.

---

### 13. Recurring Transaction Toggle Design
**File:** `web/src/pages/transactions.tsx:329-340`

```tsx
<div className="flex items-center gap-2">
  <input type="checkbox" ... />
  <label htmlFor="recurring" className="text-xs font-medium cursor-pointer">
    Recurring
  </label>
</div>
```

Uses raw checkbox with custom label. Should use a proper Switch/Toggle component for consistency.

---

## 🟣 Accessibility Issues

### 14. Missing Form Field Associations
Multiple inputs lack proper `id` attributes linked to labels (`accounts.tsx:232-258`, `transactions.tsx:301-328`).

**Current:**
```tsx
<label className="block text-xs font-medium mb-2">Name *</label>
<Input placeholder="Account name" />
```

**Problem:** Screen readers can't associate labels with inputs.

**Recommendation:** Use `htmlFor` / `id` or wrap inputs with labels.

---

### 15. Insufficient ARIA Labels on Icon-Only Buttons
**Files:** `web/src/pages/accounts.tsx:183-212`

```tsx
<Button variant="ghost" size="sm" title="Edit">
  <Edit2 size={14} />
</Button>
```

Relies on `title` attribute which has poor browser support. Should use `aria-label`:
```tsx
<Button variant="ghost" size="sm" aria-label="Edit account">
```

---

### 16. Loading States Use Skeleton but Lack ARIA
**File:** `web/src/pages/accounts.tsx:151-156`

```tsx
<div className="space-y-3">
  {[0, 1, 2].map(i => (
    <div key={i} className="h-16 rounded-xl bg-card/60 animate-pulse ..." />
  ))}
</div>
```

**Recommendation:** Add `role="status"` and `aria-label="Loading accounts..."` to skeleton containers.

---

## 🟩 Replace Custom UI with Professional Libraries

### 17. Use boneyard for Skeleton Loading States
**Reference:** https://github.com/0xGF/boneyard

Replace manual skeleton divs with boneyard's auto-generated pixel-perfect skeletons.

**Installation:**
```bash
npm install boneyard-js
```

**Usage:**
```tsx
import { Skeleton } from 'boneyard-js/react'

// Replace manual skeletons like this:
// {isLoading && [0,1,2].map(i => <div className="h-16 animate-pulse" />)}

// With:
<Skeleton name="account-card" loading={isLoading}>
  <AccountCard account={account} />
</Skeleton>
```

**Benefits:**
- Auto-captures exact pixel positions from real UI
- No manual height measurement or positioning
- Consistent skeleton appearance across breakpoints
- Supports pulse/shimmer/solid animations
- Works with React, Vue, Svelte, Angular, React Native

**CLI to generate bones:**
```bash
npx boneyard-js build
# or with Vite plugin for watch mode
npx boneyard-js build --watch
```

---

### 18. Use shadcn/ui for Components
**Reference:** https://ui.shadcn.com

Replace custom UI components with shadcn/ui component library. These are copy-paste components you own.

**Installation:**
```bash
npx shadcn@latest init
```

**Components to add (addressing issues in this report):**

| Issue | shadcn/ui Component |
|-------|----------------|
| #1 Delete confirmation | `Dialog` + `AlertDialog` |
| #2 Form validation | `Form` (with react-hook-form) |
| #5 Currency input | `Select` |
| #6 Category input | `Combobox` |
| #7 Empty states | Use with `Button` + icons |
| #9 Date picker | `Calendar` |
| #13 Checkbox toggle | `Switch` |
| #14 Form labels | `Form` component |

**Add specific components:**
```bash
npx shadcn@latest add dialog alert-dialog form select combobox switch calendar input button card
```

**Key shadcn/ui features:**
- Built on Radix UI primitives (accessible)
- Fully customizable Tailwind styles
- Copy-paste into your project (no black box)
- TypeScript support
- Consistent design system

---

## 🔵 Recommendations Summary

| Issue | Severity | Estimate |
|-------|----------|---------|
| Custom confirmation modal for delete | Critical | 2h |
| Form field validation highlighting | Critical | 1h |
| Loading states on mutation buttons | Critical | 30m |
| Fix page title | Critical | 5m |
| Currency dropdown | Major | 30m |
| Category autocomplete | Major | 2h |
| Better empty states | Major | 1h |
| Undo delete actions | Major | 1h |
| Native date picker replacement | Minor | 2h |
| Account reassignment | Minor | 30m |
| Dashboard get started state | Minor | 1h |
| Consistent UI patterns | Minor | 1h |
| Switch/Toggle components | Minor | 1h |
| Form label associations | Accessibility | 30m |
| ARIA labels | Accessibility | 30m |
| ARIA on skeletons | Accessibility | 15m |

---

## 📋 Implementation Priority

Based on combining severity with library solutions:

### High Priority (Immediate)
1. **#18** Install shadcn/ui + Dialog for #1 (delete confirmation)
2. **#4** Fix page title
3. **#3** Add button loading states

### Medium Priority (1-2 days)
4. **#18** Add shadcn/ui Form for #2/#14 (validation + accessibility)
5. **#7** Improve empty states with shadcn/ui Button
6. **#18** Add Select for #5 (currency)
7. **#17** Integrate boneyard (over manual skeleton tweaking)

### Low Priority (1 week)
8. **#18** Add Combobox for #6 (category)
9. **#18** Add Calendar for #9 (date picker)
10. **#18** Add Switch for #13 (toggle)
11. **#11** Dashboard get started state

---

*Report generated from source code analysis of web/src/*
*Updated: Added boneyard and shadcn/ui recommendations*