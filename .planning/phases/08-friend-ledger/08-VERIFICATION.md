---
phase: 08-friend-ledger
verified: 2026-04-14T00:00:00Z
status: human_needed
score: 19/19 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open browser to /friends; create a friend; confirm the public link copies to clipboard; expand friend row; add a peer debt; click Confirm"
    expected: "Friend appears in list with HandCoins icon in sidebar; debt row shows correct status badge after confirm"
    why_human: "DOM interaction, clipboard API, and animated state transitions cannot be verified by grep"
  - test: "Navigate to /public/friend/<valid-token> without logging in"
    expected: "Page renders under PublicLayout (no Sidebar, no MobileHeader); shows friend name, balance rows, debt history table; no redirect to login"
    why_human: "Auth bypass and layout isolation require live browser check"
  - test: "Navigate to /public/group/<valid-token> without logging in"
    expected: "Page renders under PublicLayout; shows event title, date, total amount, participant table with Host / Participant N labels"
    why_human: "Same as above"
  - test: "Create a group event on /friends; open participant editor; verify equal-split default; set one participant to $0; save"
    expected: "Equal split amounts populated automatically; $0 accepted without validation error; PUT /api/group-events/:id/participants returns 204"
    why_human: "Form interaction and split arithmetic require visual inspection"
  - test: "Dashboard shows FriendLedgerWidget card; with no friends the empty state reads 'No outstanding balances'"
    expected: "Widget renders below CheckWidget; no crash; loading skeleton appears then resolves"
    why_human: "Visual rendering and animated loading state"
---

# Phase 08: Friend Ledger Verification Report

**Phase Goal:** Full Friend Ledger feature — data layer, REST API, and React UI enabling friends management, peer debt tracking, group events, public read-only pages, and dashboard summary widget.
**Verified:** 2026-04-14T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Migration creates Friend, PeerDebt, GroupEvent, GroupEventParticipant tables | VERIFIED | `internal/migrations/20260414000002_friend_ledger.go` — all four CREATE TABLE statements present; idx_gep_host partial unique index present |
| 2 | FriendRepo, PeerDebtRepo, GroupEventRepo compile and satisfy interfaces | VERIFIED | Files exist at `internal/repo/sqlite/{friend,peer_debt,group_event}.go`; `go build ./...` exits 0 |
| 3 | FriendService, PeerDebtService, GroupEventService wired into app.go | VERIFIED | `internal/app/app.go` lines 55-57 construct the three services; line 63 passes all three to `SetupRoutes` |
| 4 | Engine's CanIBuyIt formula includes peer obligations | VERIFIED | `internal/service/engine.go` lines 109, 122: `peerDebtRepo.SumUpcomingPeerObligations()` fetched and folded into `purchasingPower` |
| 5 | GET /api/friends returns list of friends as JSON | VERIFIED | `internal/handler/friend.go` `List` handler; registered at `friends.GET("", fh.List)` in routes.go line 68 |
| 6 | POST /api/friends creates friend with generated public_token and returns 201 | VERIFIED | `friend.go` `Create` calls `svc.CreateFriend` which delegates to service; token generated via `crypto/rand` in service layer |
| 7 | GET /api/friends/summary returns global balance totals | VERIFIED | `friend.go` `Summary` handler calls `peerDebtSvc.GetGlobalBalance()`; registered BEFORE `/:id` at routes.go line 70 |
| 8 | POST /api/peer-debts/:id/confirm increments paid_installments or sets is_confirmed | VERIFIED | `peer_debt.go` `Confirm` handler calls `svc.ConfirmInstallment`; registered at `peerDebts.POST("/:id/confirm", pdh.Confirm)` |
| 9 | PUT /api/group-events/:id/participants atomically replaces participant set | VERIFIED | `group_event.go` `SetParticipants` parses `SetParticipantsRequest`, converts dollars→cents, calls `svc.SetParticipants` (DELETE+INSERT in tx) |
| 10 | GET /public/friend/:token returns friend name + balance + debts without auth | VERIFIED | `public.go` `GetFriendByToken`; registered on `e.Group("/public")` (not on `/api` group) — no auth middleware |
| 11 | GET /public/group/:token returns event title + participant shares without auth | VERIFIED | `public.go` `GetGroupByToken`; same `/public` group |
| 12 | All new routes registered; existing routes unchanged; go build ./... succeeds | VERIFIED | `routes.go` contains all 19 new routes (lines 61-93); original account/txn/check/pay-schedule routes intact; `CGO_ENABLED=0 go build ./...` exits 0; `go vet ./...` exits 0 |
| 13 | api.ts exports all Friend Ledger TS interfaces and fetch functions | VERIFIED | 12 interfaces (FriendResponse through SetParticipantsRequest) and 17 fetch functions exported from `web/src/lib/api.ts` |
| 14 | FriendLedgerWidget fetches /api/friends/summary and shows three balance rows on dashboard | VERIFIED | `FriendLedgerWidget.tsx` uses `useQuery({ queryKey: ['friend-summary'], queryFn: fetchFriendSummary })`; Dashboard in router.tsx line 127 renders `<FriendLedgerWidget />` between `<CheckWidget />` and `<ObligationsList />` |
| 15 | FriendsPage provides CRUD for friends + debts; lazy-loaded per-friend debt queries; confirm toggle | VERIFIED | `web/src/pages/friends.tsx` — `useQuery({ enabled: expanded })` per friend; `confirmDebt` mutation present; `deleteFriend` mutation present; `createPeerDebt` mutation present |
| 16 | Create friend form submits with copy-link button that copies public URL | VERIFIED | `friends.tsx` — copy button calls `navigator.clipboard.writeText(window.location.origin + '/public/friend/' + friend.public_token)` |
| 17 | /public/friend/:token and /public/group/:token render under PublicLayout (no Sidebar) | VERIFIED | `router.tsx` — `publicRootRoute` with `id: 'public-layout'` and `PublicLayout` component (just `<Outlet />`) is parent of both public routes; they are NOT children of the authenticated RootLayout path |
| 18 | Friends nav link appears in sidebar (HandCoins icon, between Transactions and Settings) | VERIFIED | `SidebarNav.tsx` navItems array has `{ to: '/friends', label: 'Friends', icon: HandCoins }` at index 3, after Transactions, before Settings |
| 19 | PEER-01 through PEER-06 requirements satisfied by implementation | VERIFIED | PEER-01: Friend entity with public_token in migration DDL; PEER-02: PeerDebt entity with all required fields; PEER-03: GroupEvent + GroupEventParticipant with nullable friend_id; PEER-04: /public/* endpoints without auth; PEER-05: FriendLedgerWidget on dashboard; PEER-06: FriendsPage with CRUD, debts per friend, group events, confirm toggle, copy links |

**Score: 19/19 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `internal/migrations/20260414000002_friend_ledger.go` | Goose migration for 4 tables | VERIFIED | Exists, substantive, wired via `migrations.Run` in app.go |
| `internal/repo/sqlite/friend.go` | FriendRepo + SqliteFriendRepo | VERIFIED | Exists, substantive, wired into app.go line 47 |
| `internal/repo/sqlite/peer_debt.go` | PeerDebtRepo + SqlitePeerDebtRepo | VERIFIED | Exists, substantive, wired into app.go line 48 |
| `internal/repo/sqlite/group_event.go` | GroupEventRepo + SqliteGroupEventRepo | VERIFIED | Exists, substantive, wired into app.go line 49 |
| `internal/service/token.go` | generatePublicToken helper | VERIFIED | Exists |
| `internal/service/friend.go` | FriendService | VERIFIED | Wired into app.go, consumed by handlers |
| `internal/service/peer_debt.go` | PeerDebtService | VERIFIED | Wired into app.go, engine, handlers |
| `internal/service/group_event.go` | GroupEventService | VERIFIED | Wired into app.go, handlers |
| `internal/handler/friend.go` | FriendsHandler CRUD + Summary | VERIFIED | All 6 methods present; compile-time interface check present |
| `internal/handler/peer_debt.go` | PeerDebtHandler CRUD + Confirm | VERIFIED | All 5 methods present; compile-time interface check present |
| `internal/handler/group_event.go` | GroupEventHandler CRUD + SetParticipants | VERIFIED | All 6 methods present; cents/dollars conversion correct |
| `internal/handler/public.go` | PublicHandler unauthenticated endpoints | VERIFIED | 2 methods; 3 mini-interfaces with compile-time checks |
| `internal/handler/routes.go` | Updated SetupRoutes with 19 new routes | VERIFIED | New 7-arg signature; all routes registered; public group on `e.Group("/public")` |
| `internal/app/app.go` | App struct with 3 new service fields | VERIFIED | FriendSvc, PeerDebtSvc, GroupEventSvc fields; all wired |
| `web/src/lib/api.ts` | TS types + fetch functions | VERIFIED | 12 interfaces, 17 functions all exported |
| `web/src/components/FriendLedgerWidget.tsx` | Dashboard summary card | VERIFIED | useQuery + 3 stat rows + loading skeleton + empty state |
| `web/src/pages/friends.tsx` | FriendsPage with CRUD | VERIFIED | Substantive — listFriends, createFriend, deleteFriend, listPeerDebts, createPeerDebt, confirmDebt, listGroupEvents, createGroupEvent, getGroupEvent, setParticipants all imported and used |
| `web/src/pages/friend-public.tsx` | Unauthenticated friend balance page | VERIFIED | useParams({ strict: false }), fetchPublicFriend, balance card, debt table, read-only footer |
| `web/src/pages/group-public.tsx` | Unauthenticated group event page | VERIFIED | useParams({ strict: false }), fetchPublicGroup, participants table, read-only footer |
| `web/src/router.tsx` | Routes for /friends + /public/* | VERIFIED | friendsRoute, publicRootRoute, publicFriendRoute, publicGroupRoute all defined and added to routeTree; FriendLedgerWidget rendered in Dashboard |
| `web/src/components/SidebarNav.tsx` | Friends nav item with HandCoins | VERIFIED | navItems[3] = { to: '/friends', label: 'Friends', icon: HandCoins } |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `routes.go` | `public.go` | `pub.GET("/friend/:token", ph.GetFriendByToken)` | WIRED | Line 92-93 of routes.go; pub group has no auth middleware |
| `routes.go` | `friend.go` | `FriendServiceIface` compile-time check | WIRED | `var _ FriendServiceIface = (*service.FriendService)(nil)` in friend.go line 25 |
| `app.go` | `routes.go` | `handler.SetupRoutes(e, ..., friendSvc, peerDebtSvc, groupEventSvc)` | WIRED | app.go line 63; 7-arg call matches 7-param signature |
| `FriendLedgerWidget.tsx` | `/api/friends/summary` | `useQuery fetchFriendSummary` | WIRED | FriendLedgerWidget.tsx lines 10-13 |
| `friends.tsx` | `/api/peer-debts/:id/confirm` | `confirmDebt(debt.id)` mutation | WIRED | friends.tsx imports `confirmDebt` from api.ts; mutation calls it |
| `router.tsx` | `friend-public.tsx` | `publicFriendRoute` with `PublicLayout` parent | WIRED | router.tsx lines 165-175; PublicLayout renders only `<Outlet />` — no Sidebar |
| `engine.go` | `peer_debt.go` repo | `peerDebtRepo.SumUpcomingPeerObligations()` | WIRED | engine.go line 109; result folded into purchasingPower formula |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `FriendLedgerWidget.tsx` | `data` (FriendSummaryResponse) | `fetchFriendSummary` → GET /api/friends/summary → `PeerDebtService.GetGlobalBalance()` → SQL query in `peer_debt.go` | Yes — two SQL SUM queries | FLOWING |
| `friends.tsx` | `friends` (FriendResponse[]) | `listFriends` → GET /api/friends → `FriendService.ListFriends()` → SQL SELECT in `friend.go` | Yes | FLOWING |
| `friend-public.tsx` | `data` (PublicFriendResponse) | `fetchPublicFriend(token)` → GET /public/friend/:token → PublicHandler → FriendService + PeerDebtService SQL | Yes | FLOWING |
| `group-public.tsx` | `data` (PublicGroupResponse) | `fetchPublicGroup(token)` → GET /public/group/:token → PublicHandler → GroupEventService SQL | Yes | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `go build ./...` exits 0 | `CGO_ENABLED=0 go build ./...` | No output (success) | PASS |
| `go vet ./...` exits 0 | `CGO_ENABLED=0 go vet ./...` | No output (success) | PASS |
| All 7 plan commits present in git log | `git log --oneline \| grep <hashes>` | 3f34b7a, a56776c, 40bf565, 9faaf8d, d28d004, d93f2b0, 14151e0 all found | PASS |
| api.ts exports complete (17 fetch functions) | `grep -c "^export function" web/src/lib/api.ts` | All friend ledger functions found in export listing | PASS |
| Frontend TypeScript build | Not run (no dev server) | SKIPPED — npm build not tested in this session | SKIP |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PEER-01 | 08-01 | Friend entity: id, name, public_token, notes | SATISFIED | Migration DDL + FriendRepo + FriendService all implement the full schema |
| PEER-02 | 08-01 | PeerDebt entity with installment + confirmation fields | SATISFIED | All fields in migration DDL; repo scans them; service updates them |
| PEER-03 | 08-01 | GroupEvent + GroupEventParticipant with nullable friend_id (null = user) | SATISFIED | Migration DDL; `idx_gep_host` partial unique index on null friend_id |
| PEER-04 | 08-02 | Public read-only endpoints (no auth) | SATISFIED | `/public/*` group on raw Echo instance, not /api group; two endpoints |
| PEER-05 | 08-03 | Dashboard summary widget | SATISFIED | FriendLedgerWidget rendered in Dashboard function in router.tsx |
| PEER-06 | 08-03 | Friends management page: CRUD, debts per friend, group events, equal split, public links | SATISFIED | friends.tsx implements all of these; confirmed by source inspection |

---

### Anti-Patterns Found

No blockers or warnings identified.

Scan notes:
- No `TODO`, `FIXME`, or placeholder comments in any of the 13 new files
- No `return null` stubs in handler files — all return proper HTTP responses
- No hardcoded empty arrays returned from API routes
- `return c.NoContent(http.StatusNoContent)` on DELETE/Confirm handlers is correct, not a stub
- `enabled: expanded` in friends.tsx debt queries is intentional lazy-loading, not a stub
- `"No outstanding balances"` in FriendLedgerWidget is the correct empty state when both totals are 0

---

### Human Verification Required

#### 1. Friends page CRUD and confirm flow

**Test:** Open browser to `/friends`; create a friend named "Alice"; expand her row; add a peer debt of $25 with description "Dinner"; click Confirm on the debt.
**Expected:** Friend appears in list; expanding shows debt table; Confirm button changes debt badge to "Paid"; toast success shown; HandCoins icon visible in sidebar.
**Why human:** DOM interaction, optimistic mutation invalidation, and badge state change require a live browser.

#### 2. FriendPublicPage renders without authentication

**Test:** Open browser to `/public/friend/<any-valid-token>` in an incognito window (no session).
**Expected:** Page loads under PublicLayout — no Sidebar, no MobileHeader; shows friend name, balance rows, debt history; no redirect to login.
**Why human:** Auth bypass and layout isolation require a live browser session check.

#### 3. GroupPublicPage renders without authentication

**Test:** Open browser to `/public/group/<any-valid-token>` in an incognito window.
**Expected:** Page loads under PublicLayout; shows event title, date, total amount, participants table with "Host" for null friend_id rows.
**Why human:** Same as above.

#### 4. Group event equal-split default in participant editor

**Test:** On `/friends`, create a group event for $60 with 3 participants (2 friends + yourself as host). Open participant editor.
**Expected:** Default share amounts auto-populated as $20 each; typing $0 for a participant is accepted without error; submitting calls PUT /api/group-events/:id/participants and returns 204.
**Why human:** Form interaction, Math.floor split arithmetic, and $0 allowance need visual confirmation.

#### 5. Copy-link button writes correct public URL to clipboard

**Test:** On `/friends`, click the copy-link icon next to a friend.
**Expected:** Sonner toast shows "Link copied!"; pasting yields `http[s]://[host]/public/friend/[32-char-hex-token]`.
**Why human:** Clipboard API requires a browser; output can only be verified by pasting.

---

### Gaps Summary

No gaps found. All 19 observable truths are verified by code inspection and `go build`/`go vet`. The 5 human verification items above are the only remaining checks — they require a running browser and cannot be verified statically.

---

_Verified: 2026-04-14T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
