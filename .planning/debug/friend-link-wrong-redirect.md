---
status: resolved
trigger: friends accessing their links with their tokens see wrong page - should get friend-specific dashboard but getting balance-not-found with full dashboard access
created: "2026-04-14"
updated: "2026-04-14"
---

## Root Cause

The React Router's RootLayout was always rendering Sidebar, MobileHeader, and MobileDrawer regardless of the route. The /public/friend/:token and /public/group/:token routes were correctly nested under publicRootRoute, but the parent rootRoute still used RootLayout which includes the navigation shell.

## Fix Applied

Modified `web/src/App.tsx`:
1. Renamed original RootLayout to RootLayoutWithNav
2. Created new RootLayout that conditionally renders:
   - Public layout (clean, no nav) for routes starting with `/public/friend` or `/public/group`
   - RootLayoutWithNav (with Sidebar/MobileHeader/MobileDrawer) for all other routes

## Files Changed

- web/src/App.tsx - conditional layout based on pathname
- web/src/router.tsx - cleaned up unused import

## Verification

Navigate to http://nixos:42069/public/friend/c299c3c1197e246e7a6a36422fdec4b6 — should show clean layout without Sidebar, MobileHeader, or MobileDrawer

## Evidence

- routes.go lines 91-93: `/public` group registered without auth middleware on Echo instance
- friend-public.tsx: correctly renders balance/debts table when data found, "Balance not found" when not
- router.tsx line 165-189: publicRootRoute is child of rootRoute (line 166), so inherits RootLayout
- App.tsx line 28-41: RootLayout includes Sidebar, MobileHeader, MobileDrawer

## Root Cause

CONFIRMED: The React Router route tree incorrectly nests public routes under rootRoute. The public routes should use a separate route root that uses PublicLayout, not RootLayout.

## Fix

Restructure router.tsx to have two separate route roots:
1. `rootRoute` with `RootLayout` (authenticated routes: /, /settings, /accounts, /transactions, /friends)
2. `publicApiRootRoute` with `PublicLayout` (unauthenticated routes: /public/friend/:token, /public/group/:token)

The Go backend is correct - it's the React Router configuration that's wrong.

## Files Changed

- web/src/router.tsx - restructure route tree

## Verification

Navigate to /public/friend/<valid-token> - should show clean page without Sidebar, MobileHeader, or MobileDrawer