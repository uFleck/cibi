---
phase: 08-friend-ledger
plan: "02"
subsystem: backend-http-handlers
tags: [go, echo, handler, rest, friend-ledger, public-routes]
dependency_graph:
  requires:
    - FriendService (08-01)
    - PeerDebtService (08-01)
    - GroupEventService (08-01)
  provides:
    - FriendsHandler (CRUD + Summary)
    - PeerDebtHandler (CRUD + Confirm)
    - GroupEventHandler (CRUD + SetParticipants)
    - PublicHandler (unauthenticated friend/group token endpoints)
    - Updated SetupRoutes with all friend ledger routes
  affects:
    - internal/handler/routes.go (new signature + 13 new routes)
    - internal/app/app.go (SetupRoutes call updated)
tech_stack:
  added: []
  patterns:
    - local service interface per handler (testable, compile-time checked)
    - dollars<->cents conversion in handler boundary (math.Round x100 / ÷100)
    - public routes on e.Group("/public") — no auth middleware
    - PeerDebtSummaryIface injected into FriendsHandler for /friends/summary
    - PublicHandler uses two mini-interfaces (PublicFriendTokenSvc + PublicPeerDebtSvc)
key_files:
  created:
    - internal/handler/friend.go
    - internal/handler/peer_debt.go
    - internal/handler/group_event.go
    - internal/handler/public.go
  modified:
    - internal/handler/routes.go
    - internal/app/app.go
decisions:
  - FriendsHandler takes both FriendService and PeerDebtService to serve /friends/summary via PeerDebtSummaryIface
  - PublicHandler uses two separate mini-interfaces (PublicFriendTokenSvc, PublicPeerDebtSvc) instead of one combined interface — cleaner dependency boundary
  - /public/* registered on e.Group("/public") directly on the Echo instance, not the /api group, ensuring no auth middleware applies
  - GET /friends/summary registered before GET /friends/:id to prevent route conflict
metrics:
  duration: ~20m
  completed: "2026-04-14"
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 08 Plan 02: Friend Ledger — HTTP Handlers Summary

Four new Echo handler files exposing the full Friend Ledger API: CRUD for friends, peer debts, and group events; a global balance summary endpoint; atomic participant replacement; and two unauthenticated public token endpoints. All amounts flow through the handler boundary as float64 dollars and are stored as int64 cents.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Friend, PeerDebt, GroupEvent handlers | 9faaf8d | internal/handler/friend.go, peer_debt.go, group_event.go |
| 2 | Public handler + routes.go update + app.go update | d28d004 | internal/handler/public.go, routes.go, internal/app/app.go |

## Route Table

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| GET | /api/friends | FriendsHandler.List | yes |
| POST | /api/friends | FriendsHandler.Create | yes |
| GET | /api/friends/summary | FriendsHandler.Summary | yes |
| GET | /api/friends/:id | FriendsHandler.GetByID | yes |
| PATCH | /api/friends/:id | FriendsHandler.Update | yes |
| DELETE | /api/friends/:id | FriendsHandler.Delete | yes |
| GET | /api/peer-debts | PeerDebtHandler.List | yes |
| POST | /api/peer-debts | PeerDebtHandler.Create | yes |
| PATCH | /api/peer-debts/:id | PeerDebtHandler.Update | yes |
| DELETE | /api/peer-debts/:id | PeerDebtHandler.Delete | yes |
| POST | /api/peer-debts/:id/confirm | PeerDebtHandler.Confirm | yes |
| GET | /api/group-events | GroupEventHandler.List | yes |
| POST | /api/group-events | GroupEventHandler.Create | yes |
| GET | /api/group-events/:id | GroupEventHandler.GetByID | yes |
| PATCH | /api/group-events/:id | GroupEventHandler.Update | yes |
| DELETE | /api/group-events/:id | GroupEventHandler.Delete | yes |
| PUT | /api/group-events/:id/participants | GroupEventHandler.SetParticipants | yes |
| GET | /public/friend/:token | PublicHandler.GetFriendByToken | NO |
| GET | /public/group/:token | PublicHandler.GetGroupByToken | NO |

## Response JSON Shapes (for Plan 08-03 reference)

### FriendResponse
```json
{
  "id": "uuid-string",
  "name": "Alice",
  "public_token": "32-char-hex",
  "notes": null
}
```

### FriendSummaryResponse (GET /api/friends/summary)
```json
{
  "total_owed_to_user": 150.00,
  "total_user_owes": 50.00,
  "net": 100.00
}
```

### PeerDebtResponse
```json
{
  "id": "uuid-string",
  "friend_id": "uuid-string",
  "amount": 25.50,
  "description": "Dinner",
  "date": "2026-04-01T00:00:00Z",
  "is_installment": false,
  "total_installments": null,
  "paid_installments": 0,
  "frequency": null,
  "anchor_date": null,
  "is_confirmed": false
}
```

### GroupEventResponse (List — no participants)
```json
{
  "id": "uuid-string",
  "title": "Pizza Night",
  "date": "2026-04-10",
  "total_amount": 60.00,
  "public_token": "32-char-hex",
  "notes": null
}
```

### GroupEventResponse (GetByID — with participants)
```json
{
  "id": "uuid-string",
  "title": "Pizza Night",
  "date": "2026-04-10",
  "total_amount": 60.00,
  "public_token": "32-char-hex",
  "notes": null,
  "participants": [
    { "friend_id": "uuid-string", "share_amount": 20.00, "is_confirmed": false },
    { "friend_id": null, "share_amount": 20.00, "is_confirmed": false }
  ]
}
```

### PublicFriendResponse (GET /public/friend/:token)
```json
{
  "name": "Alice",
  "balance": {
    "friend_owes_user": 50.00,
    "user_owes_friend": 0.00,
    "net": 50.00
  },
  "debts": [ /* []PeerDebtResponse */ ]
}
```

### PublicGroupResponse (GET /public/group/:token)
```json
{
  "title": "Pizza Night",
  "date": "2026-04-10",
  "total_amount": 60.00,
  "notes": null,
  "participants": [
    { "friend_id": "uuid-string", "share_amount": 20.00, "is_confirmed": false }
  ]
}
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all handler endpoints are fully wired to service layer methods from 08-01.

## Threat Flags

None — all mitigations from the plan threat model are implemented:
- T-08-02-02: POST /api/peer-debts/:id/confirm is in the authenticated /api group
- T-08-02-04: SetParticipants delegates to service.SetParticipants which does atomic DELETE+INSERT

## Self-Check: PASSED

All 4 created files exist. Task commits 9faaf8d and d28d004 present in git log. `go build ./...` and `go vet ./...` exit 0.
