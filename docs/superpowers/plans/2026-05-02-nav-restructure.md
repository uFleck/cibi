# Nav Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Accounts entry point from the bottom nav into the floating header and replace it with a Goals tab.

**Architecture:** Two isolated component edits — no route changes, no API changes, no state changes. `MobileBottomNav` swaps one nav item. `MobileHeader` adds one icon button that navigates to `/accounts`.

**Tech Stack:** React 19, TanStack Router, lucide-react, shadcn/ui Button, Tailwind CSS v4

---

### Task 1: Swap Accts tab for Goals tab in MobileBottomNav

**Files:**
- Modify: `web/src/components/MobileBottomNav.tsx`

Current nav items array (line 5-11):
```tsx
const navItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accts', icon: Users },
  { to: '/transactions', label: 'Txns', icon: FileText },
  { to: '/friends', label: 'Friends', icon: HandCoins },
  { to: '/settings', label: 'Settings', icon: Settings },
]
```

- [ ] **Step 1: Update import — replace `Users` with `Target`**

Change line 3:
```tsx
import { LayoutDashboard, Target, FileText, HandCoins, Settings } from 'lucide-react'
```

- [ ] **Step 2: Replace Accounts nav item with Goals**

Change the navItems array:
```tsx
const navItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/transactions', label: 'Txns', icon: FileText },
  { to: '/friends', label: 'Friends', icon: HandCoins },
  { to: '/settings', label: 'Settings', icon: Settings },
]
```

- [ ] **Step 3: Verify build compiles cleanly**

```bash
cd web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/MobileBottomNav.tsx
git commit -m "feat: replace Accounts tab with Goals in bottom nav"
```

---

### Task 2: Add Wallet navigation button to MobileHeader

**Files:**
- Modify: `web/src/components/MobileHeader.tsx`

Current header (for reference — read this file before editing):
```tsx
import { useContext } from 'react'
import { Moon, Sun } from 'lucide-react'
import { AccountContext, ThemeContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'
import { Button } from '@/components/ui/button'

export function MobileHeader() {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)
  const { theme, toggleTheme } = useContext(ThemeContext)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-2 pt-[max(env(safe-area-inset-top),0.5rem)] sm:px-4">
      <div className="cibi-floating-nav pointer-events-auto mx-auto h-14 w-full max-w-2xl rounded-2xl border border-border/60 bg-background/90 shadow-lg backdrop-blur-md">
        <div className="flex h-full items-center justify-between gap-2 px-3">
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">CIBI</span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <AccountSelector
              selectedAccountId={selectedAccountId}
              onSelectAccount={setSelectedAccountId}
              compact
            />
          </div>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 1: Add Link import and Wallet icon**

Update the import lines:
```tsx
import { useContext } from 'react'
import { Moon, Sun, Wallet } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AccountContext, ThemeContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'
import { Button } from '@/components/ui/button'
```

- [ ] **Step 2: Add Wallet button after AccountSelector**

Replace the inner `<div className="flex items-center gap-1.5">` block:
```tsx
<div className="flex items-center gap-1.5">
  <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    onClick={toggleTheme}
  >
    {theme === 'dark' ? <Sun /> : <Moon />}
  </Button>
  <AccountSelector
    selectedAccountId={selectedAccountId}
    onSelectAccount={setSelectedAccountId}
    compact
  />
  <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    aria-label="Manage accounts"
    title="Manage accounts"
    asChild
  >
    <Link to="/accounts">
      <Wallet size={18} />
    </Link>
  </Button>
</div>
```

- [ ] **Step 3: Verify build compiles cleanly**

```bash
cd web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/MobileHeader.tsx
git commit -m "feat: add Wallet button to header for accounts navigation"
```
