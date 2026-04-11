# CIBI — Can I Buy It?

## What This Is

CIBI is a personal, hyper-local financial decision engine for a household of two. It answers one question instantly: *"If I buy this right now, will I be okay until my next paycheck?"* It does this by calculating purchasing power as current balance minus upcoming recurring obligations minus a safety buffer — no cloud, no tracking, just a fast and honest answer.

## Core Value

The "Can I Buy It?" query must always return a correct answer — if a recurring transaction exists, it must be accounted for, no exceptions.

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

- Existing Go codebase (`github.com/ufleck/cibi-api`) has the foundational layers built: Echo, SQLite via go-sqlite3, repository interfaces, domain models for Account and Transaction
- Repo currently named `cibi-api` but should become `cibi` — internal restructure planned for Phase 1
- Web dashboard (React + Vite + Framer Motion) is Milestone 2; CLI is the primary interface for Milestone 1
- MCP server (Go, using `github.com/mark3labs/mcp-go`) is Milestone 3 — wraps the same domain/service layer
- Accessible via Tailscale from any device; no auth needed (personal use only)

## Constraints

- **Privacy:** Zero cloud dependency — all data stays local; SQLite file never leaves the machine
- **DB:** Must remain swappable — domain/service layers never import SQLite directly; only repository interfaces are used
- **Interfaces:** All interfaces (CLI, Web, MCP) must route through the API layer — Decision Engine logic is centralized, never duplicated
- **Performance:** "Can I Buy It?" query must return in under 100ms
- **Stack:** Go for all backend/CLI/MCP; React + Vite + Framer Motion for web dashboard

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
