# Nav Restructure: Accounts to Header, Goals to Bottom Nav

Date: 2026-05-02

## Summary

Move the Accounts navigation entry point from the bottom nav into the floating header, and add Goals as a bottom nav tab in the freed slot.

## Changes

### MobileHeader.tsx

Add a `Wallet` icon button (always visible) after the `AccountSelector` in the header. Clicking it navigates to `/accounts`.

Header layout after change:
```
CIBI  |  [dark mode toggle]  |  [AccountSelector]  |  [Wallet button -> /accounts]
```

### MobileBottomNav.tsx

Replace the Accounts entry with Goals:

| Before | After |
|--------|-------|
| Home, Accts (/accounts), Txns, Friends, Settings | Home, Goals (/goals), Txns, Friends, Settings |

Icon: `Target` from lucide-react for Goals.

## Non-changes

- `/accounts` route and `AccountsPage` component are untouched.
- `/goals` route already exists.
- No data model or API changes.

## Files

- `web/src/components/MobileHeader.tsx`
- `web/src/components/MobileBottomNav.tsx`
