# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 01-foundation
**Areas discussed:** Migration Format, Default database cave

---

## Migration Format

| Option | Description | Selected |
|--------|-------------|----------|
| Raw SQL | We write migrations as raw `.sql` files | |
| Go Files | We write migrations as `.go` files utilizing Goose's Go API | ✓ |

**User's choice:** let's use .go files for migrations
**Notes:** User requested normal caveman mode.

---

## Default DB cave

| Option | Description | Selected |
|--------|-------------|----------|
| User home | Put DB rock in system user data folder | |
| ./db/cibi.db | Keep DB rock in `./db/cibi.db` | ✓ |

**User's choice:** lets keep default db in ./db/cibi.db
**Notes:** User replied straight, no extra requirements.

---

## the agent's Discretion

The exact structure of the Go migrations within `internal/migrations/`.
App struct and DI setup specifics.

## Deferred Ideas
None.
