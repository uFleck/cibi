# CIBI — Can I Buy It?

## What This Is

CIBI is a local-first personal finance decision system. It answers:

> "Can I buy this now and still be safe until next payday?"

Decision is based on account balance, projected obligations, and safety buffer.

## Core Value

Decision correctness over everything else.

## Current Delivery Status (2026-04-17)

### Completed

- ✅ Core architecture, config, migrations, and SQLite wiring
- ✅ Decision engine (`CanIBuyIt`) with recurring obligation projection
- ✅ Full CLI surface (accounts, transactions, check)
- ✅ REST API + structured validation/error flow
- ✅ React dashboard with animated verdict card
- ✅ Multi pay schedules per account + WAIT verdict
- ✅ Friend Ledger (friends, peer debts, group events, public token views)
- ✅ Transaction balance synchronization fixes + recurring confirm-paid flow
- ✅ Codebase simplification, logic centralization, and test hardening
- ✅ Human verification completed for latest phase

### Pending

- ⏳ MCP server (Phase 6)

## Scope Boundaries

### In Scope

- Local-only operation
- SQLite persistence
- API + Web + CLI for personal usage
- Tailscale-accessible deployment

### Out of Scope

- Cloud sync / multi-tenant auth
- Bank integrations
- Spreadsheet imports
- Currency conversion

## Constraints

- Privacy-first: no cloud dependency
- Money stored as integer cents
- UTC/RFC3339 timestamps
- Layered architecture (handlers → services → repos)
- Business rules centralized in services/engine

## Key Decisions (Locked)

| Decision | Outcome |
|---|---|
| Keep Go stack end-to-end | Accepted |
| Keep repository abstraction over SQLite | Accepted |
| Use React + Vite web frontend | Accepted |
| Keep CLI first-class (no HTTP dependency for check) | Accepted |
| Add friend-ledger public read-only token pages | Accepted |
| Add WAIT verdict for near-future affordability | Accepted |
| Keep MCP as next isolated phase | Accepted |

---
*Last updated: 2026-04-17*
