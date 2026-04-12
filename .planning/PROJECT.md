# CIBI — Can I Buy It?

## What This Is

CIBI: Personal financial decision engine. Answers instantly: *"If I buy this now, am I okay until next paycheck?"* Calculates purchasing power = balance - recurring obligations - safety buffer. No cloud. Local only.

## Core Value

"Can I Buy It?" must always be correct. If a recurring transaction exists, it's accounted for. No exceptions.

## Requirements

### Validated

- ✓ Account model with balance tracking — existing
- ✓ Transaction model with one-off and evaluation logic — existing
- ✓ Repository pattern with interface-based DB abstraction — existing
- ✓ Layered architecture (Handlers → Services → Repos → DB) — existing
- ✓ SQLite storage via swappable repository interfaces — existing
- ✓ Echo HTTP server with CRUD routes for accounts and transactions — existing

### Active

- [ ] Repo renamed from `cibi-api` to `cibi` with restructured layout (`cmd/`, `internal/`)
- [ ] Recurring transaction support (weekly, bi-weekly, monthly, yearly) with next-occurrence tracking
- [ ] Decision Engine — calculates purchasing power: balance minus projected recurring obligations until next payday minus safety buffer
- [ ] Safety buffer — global config for minimum account threshold
- [ ] CLI — full CRUD + the "Can I Buy It?" query via Typer-equivalent (Cobra or similar)
- [ ] MCP server — Go implementation exposing financial status and purchase feasibility to Claude

### Out of Scope

- Python rewrite — existing Go codebase already has clean architecture and swappable repos; rewrite cost not justified
- HTMX or server-rendered web — user wants beautifully animated UI; React + Vite is the right fit
- Cloud sync or multi-user — privacy-first, local-only; just two users on Tailscale with no concurrent write pressure
- Data import from Google Sheets — user will enter data manually at launch
- Automated bank sync — out of scope for personal, privacy-first tool

## Context

- Go codebase (`github.com/ufleck/cibi-api`): Echo, SQLite, repo interfaces, Account/Transaction models
- Repo `cibi-api` → `cibi` (Phase 1 restructure)
- M1: CLI primary. M2: React + Vite + Framer Motion dashboard. M3: Go MCP server (`mark3labs/mcp-go`)
- Tailscale accessible, no auth (personal use)

## Constraints

- **Privacy**: Zero cloud. Local only. SQLite never leaves machine.
- **DB**: Swappable via repo interfaces. No direct SQLite imports in domain/service.
- **Interfaces**: CLI, Web, MCP route through API. Decision Engine centralized.
- **Performance**: "Can I Buy It?" <100ms.
- **Stack**: Go (backend/CLI/MCP). React + Vite + Framer Motion (web).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep Go (not Python rewrite) | Existing codebase already has clean layered arch + repo pattern; Go single binary is ideal for CLI | — Pending |
| Repository pattern for DB | Domain and service layers depend only on interfaces; SQLite is the default impl but swappable | — Pending |
| Monorepo named `cibi` | Houses API, CLI, and MCP — `cibi-api` was too narrow | — Pending |
| React + Vite + Framer Motion | User wants beautiful animated UI; JS framework ecosystem is far ahead of HTMX for this | — Pending |
| CLI mirrors full API | Every API operation available in CLI (except graph/visual outputs) | — Pending |
| MCP in Go | Single language across entire stack; `mcp-go` SDK is solid | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-11 after initialization*
