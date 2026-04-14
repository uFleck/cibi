---
phase: 08-friend-ledger
plan: "03"
subsystem: frontend-friend-ledger
tags: [react, tanstack-router, tanstack-query, shadcn, friend-ledger, public-routes]
dependency_graph:
  requires:
    - FriendsHandler (08-02)
    - PeerDebtHandler (08-02)
    - GroupEventHandler (08-02)
    - PublicHandler (08-02)
  provides:
    - Friend Ledger API client (types + fetch functions in api.ts)
    - FriendLedgerWidget (dashboard summary card)
    - FriendsPage (full CRUD — friends, debts, group events)
    - FriendPublicPage (unauthenticated read-only balance view)
    - GroupPublicPage (unauthenticated read-only event view)
    - TanStack Router routes for /friends, /public/friend/$token, /public/group/$token
  affects:
    - web/src/lib/api.ts (new types + fetch functions appended)
    - web/src/router.tsx (new imports, PublicLayout, 4 new routes, FriendLedgerWidget in Dashboard)
    - web/src/components/SidebarNav.tsx (Friends nav item added)
tech_stack:
  added: []
  patterns:
    - useQuery + useMutation + useQueryClient from @tanstack/react-query (mirrors settings.tsx)
    - useParams({ strict: false }) for TanStack Router dynamic segments in public pages
    - PublicLayout as intermediate route with no Sidebar/MobileHeader — just Outlet
    - Per-friend expandable rows with lazy-loaded debt queries (enabled: expanded)
    - Equal-split default in group participant editor via Math.floor
key_files:
  created:
    - web/src/components/FriendLedgerWidget.tsx
    - web/src/pages/friends.tsx
    - web/src/pages/friend-public.tsx
    - web/src/pages/group-public.tsx
  modified:
    - web/src/lib/api.ts
    - web/src/router.tsx
    - web/src/components/SidebarNav.tsx
    - web/tsconfig.json
decisions:
  - "useParams({ strict: false }) used in public pages — avoids needing to export Route constant from router.tsx while keeping type safety acceptable for public unauthenticated pages"
  - "PublicLayout registered as child of rootRoute (id: public-layout) with no path, then publicFriendRoute and publicGroupRoute as children — this keeps public routes out of the RootLayout (no Sidebar) while sharing the TanStack Router context"
  - "Debt queries for each friend are lazy (enabled: expanded) to avoid N+1 fetches on page load"
  - "tsconfig.json root file patched to add ignoreDeprecations 6.0 — TypeScript 6.0 treats baseUrl as deprecated error; tsconfig.app.json already had the flag but root file did not"
metrics:
  duration: ~6m
  completed: "2026-04-14"
  tasks_completed: 2
  files_created: 4
  files_modified: 4
---

# Phase 08 Plan 03: Friend Ledger — React Frontend Summary

React frontend for the Friend Ledger: API client types and fetch functions, a dashboard summary widget, a full-featured Friends management page (debts + group events), and two unauthenticated public read-only pages. All routes wired into TanStack Router with a PublicLayout that excludes the Sidebar.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | API client extensions + FriendLedgerWidget | d93f2b0 | web/src/lib/api.ts, web/src/components/FriendLedgerWidget.tsx |
| 2 | FriendsPage + public pages + router wiring | 14151e0 | web/src/pages/friends.tsx, friend-public.tsx, group-public.tsx, router.tsx, SidebarNav.tsx |

## Route Table

| Path | Component | Layout | Auth |
|------|-----------|--------|------|
| /friends | FriendsPage | RootLayout (Sidebar) | yes |
| /public/friend/$token | FriendPublicPage | PublicLayout (no Sidebar) | NO |
| /public/group/$token | GroupPublicPage | PublicLayout (no Sidebar) | NO |

## TanStack Router Route Tree Shape

```
rootRoute (RootLayout)
  indexRoute        /
  settingsRoute     /settings
  accountsRoute     /accounts
  transactionsRoute /transactions
  friendsRoute      /friends
  publicRootRoute   (id: public-layout, PublicLayout — no path)
    publicFriendRoute  /public/friend/$token
    publicGroupRoute   /public/group/$token
```

## Notable Implementation Choices

**Token param access:** Public pages use `useParams({ strict: false })` cast to `{ token: string }`. This avoids exporting `Route` constants from router.tsx into each page file, keeping the pages self-contained. The cast is safe because the route only matches when the token segment is present.

**Lazy debt queries:** Each `FriendCard` runs `useQuery({ enabled: expanded })` — debts for a friend only load when the user expands that friend's row. Avoids N+1 fetches on initial page load.

**Equal split default:** When opening the participant editor for a new group event, the default is `Math.floor(totalAmount / count * 100) / 100` per person (matches CONTEXT.md requirement). $0 share is allowed — user can set their own row to 0 for non-paying guests.

**PublicLayout:** Registered as an intermediate route (`id: 'public-layout'`, no `path`) child of rootRoute. Child routes inherit router context (query client, etc.) but render through `PublicLayout` which only renders `<Outlet />` inside a `min-h-screen bg-background` div — no Sidebar, no MobileHeader.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript 6.0 baseUrl deprecation error in root tsconfig.json**
- **Found during:** Task 1 verification
- **Issue:** `tsconfig.json` root file was missing `"ignoreDeprecations": "6.0"`. TypeScript 6.0 treats `baseUrl` without this flag as a hard error (TS5101). `tsconfig.app.json` already had the flag but it didn't apply to the composite root.
- **Fix:** Added `"ignoreDeprecations": "6.0"` to the `compilerOptions` in `tsconfig.json`.
- **Files modified:** `web/tsconfig.json`
- **Commit:** d93f2b0

## Known Stubs

None — all components fetch from live API endpoints. FriendLedgerWidget shows "No outstanding balances" when the API returns zeros, which is correct behavior for a new install.

## Threat Flags

None — mitigations from threat model are implemented:
- T-08-03-02: Confirm mutation (FriendsPage) calls authenticated `/api/peer-debts/:id/confirm`; public pages have no confirm button — read-only enforced at UI layer.
- T-08-03-01: FriendPublicPage is intentionally public; token is the access credential.

## Self-Check: PASSED

All 4 created files exist. Task commits d93f2b0 and 14151e0 present in git log. `npx tsc --noEmit` and `npm run build` both exit 0.
