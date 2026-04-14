# Phase 8: Friend Ledger — Context

## Goal

Track money owed between the user and friends. Two scenarios:
1. **Direct debts**: User borrowed money from a friend (or vice versa), possibly paid back in monthly installments.
2. **Group events**: User hosts pizza nights / game nights and pays upfront; friends owe their share.

Friends get public read-only URLs (Tailscale-accessible) to see their balance. User manages everything and is the only one who can confirm payments.

## User Decisions

- **Group split**: Default equal split, manual override per person. Wife or other non-paying guests can be assigned $0 (their share goes to user).
- **Public links**: Two types — per-friend URL (bilateral balance + history) and per-event URL (who owes what for that event).
- **Confirmation**: Only the user can acknowledge/confirm payments. Friend links are strictly read-only.
- **Phase order**: Depends on Phase 5 (Web Dashboard). Skip Phase 6 (MCP) and Phase 7 (Payment Schedules) — build this next.

## Scope

### Backend (Go)

- `Friend`: id, name, public_token, notes
- `PeerDebt`: id, friend_id, amount (+ = they owe me, − = I owe them), description, date, is_installment, total_installments, paid_installments, frequency, anchor_date, is_confirmed
- `GroupEvent`: id, title, date, total_amount, public_token, notes
- `GroupEventParticipant`: event_id, friend_id (nullable = user), share_amount, is_confirmed
- Full CRUD repos + services for all entities
- Public unauthenticated endpoints: `GET /public/friend/:token`, `GET /public/group/:token`
- Authenticated CRUD endpoints under `/api/friends`, `/api/peer-debts`, `/api/group-events`

### Frontend (React)

- Dashboard widget: totals (owed to me / I owe / net) with link to Friends tab
- Friends tab (dedicated page): friend list, per-friend debt history, group events, confirmation toggle
- Group event form: participant list with equal-split default + per-person override
- Public pages: `/friend/:token` and `/group/:token` — read-only, no auth, accessible via Tailscale

## Out of Scope

- Friends cannot create accounts or log in
- No push notifications to friends
- No currency conversion (single currency per CIBI instance)
- Tailscale tunnel setup itself (handled at OS/network level, not in-app)

## Dependencies

- Phase 5 (Web Dashboard): React app scaffold, routing, API layer, shadcn/ui, TanStack Query
- Phase 4 (API Layer): Echo server, middleware, error shapes

## Requirements

PEER-01, PEER-02, PEER-03, PEER-04, PEER-05, PEER-06
