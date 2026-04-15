# CIBI — Roadmap

**Project:** CIBI (Can I Buy It?)
**Last updated:** 2026-04-12
**Granularity:** Coarse

---

## Milestones

- **Milestone 1 — Core:** Engine + CLI. No HTTP server. Local binary.
- **Milestone 2 — API + Dashboard:** Echo REST API + React web dashboard.
- **Milestone 3 — MCP:** Go MCP server exposing financial tools to Claude.

---

## Phases

### Milestone 1 — Core

- [ ] **Phase 1: Foundation** — Restructure the repo, eliminate the global DB connection, wire migrations, and establish the clean layered architecture that all other phases depend on
- [ ] **Phase 2: Domain + Engine** — Implement the PaySchedule entity, recurring transaction engine with month-end safety, and the Decision Engine that answers "Can I Buy It?"
- [ ] **Phase 3: CLI** — Cobra command tree that mirrors the full domain surface; `cibi check` as the primary user-facing command

### Milestone 2 — API + Dashboard

- [ ] **Phase 4: API Layer** — Echo HTTP server exposing all domain operations as JSON endpoints; the API becomes the gateway for web access over Tailscale
- [ ] **Phase 5: Web Dashboard** — React 19 + Vite 6 SPA showing balance, reserved funds, and the animated "Can I Buy It?" verdict card

### Milestone 3 — MCP

- [ ] **Phase 6: MCP Server** — Official Go SDK stdio server exposing financial status and purchase feasibility as Claude tools

---

## Phase Details

### Phase 1: Foundation

**Goal**: Clean monorepo. No global state, pure-Go SQLite, migrations, wired App. Ready for domain logic.

**Depends on**: Nothing

**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, SCHEMA-05, TXN-03

**Success Criteria**:
  1. `CGO_ENABLED=0 go build ./...` succeeds — pure-Go SQLite driver
  2. `internal/app.New(cfg)` returns wired App; no global DB variable
  3. Binary on fresh machine creates SQLite file, applies migrations; schema matches entities
  4. Money = `INTEGER`; timestamps = RFC3339 UTC; `PRAGMA foreign_keys` = 1

**Plans**: TBD

---

### Phase 2: Domain + Engine

**Goal**: Engine calculates obligations. Decision Engine answers "Can I Buy It?" in <100ms.

**Depends on**: Phase 1

**Requirements**: ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, TXN-01, TXN-02

**Success Criteria**:
  1. Jan 31 anchor → Feb 28 occurrence (not Mar 2/3). `AddMonthClamped` prevents overflow.
  2. `Engine.CanIBuyIt(amount)`: balance - obligations - buffer vs. price. Returns `CanBuy`/`RiskLevel`.
  3. Only obligations between now and next payday included. Post-payday excluded.
  4. Debited recurring txn advances one period. No double-count on re-run.
  5. `NextPayday` for bi-weekly returns correct alternating date from anchor.

**Plans**: TBD

---

### Phase 3: CLI

**Goal**: All domain ops accessible from terminal. `cibi check <amount>` delivers verdict instantly (no server).

**Depends on**: Phase 2

**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04

**Success Criteria**:
  1. `cibi check 75` prints verdict, purchasing power, buffer, risk within 100ms (no server).
  2. `cibi tx add --recurring --frequency monthly --anchor 2024-03-01 --amount -850.00 --description "Rent"` creates recurring txn. `cibi tx list` shows correct next occurrence.
  3. `cibi account list` shows balances (decimal currency). `cibi account set-default <id>` changes active account.
  4. `cibi --config /path/to/config.yaml check 50` loads config, uses safety buffer and DB path.

**Plans**: 1 plan (4 tasks, Wave 1)

Plans:
- [x] 03-PLAN.md — AccountsService + App wiring + CLI (root, account, tx, check commands)

---

### Phase 4: API Layer

**Goal**: All domain ops available as JSON/HTTP. API = gateway for web + Tailscale.

**Depends on**: Phase 3

**Requirements**: API-01, API-02, API-03

**Success Criteria**:
  1. `POST /check` with `{"amount": 75.00}` returns same `EngineResult` as CLI.
  2. `GET/POST /accounts`, `/transactions`, `PATCH/DELETE /transactions/:id` return correct JSON + consistent error shape.
  3. API starts/stops cleanly (graceful SIGTERM). Malformed body = structured JSON error.

**Plans**: 3 plans (Wave 1 → Wave 2 → Wave 3)

Plans:
- [x] 04-01-PLAN.md — Service gap (GetByID, UpdateAccount) + internal/handler/ scaffold + Wave 0 test stubs
- [x] 04-02-PLAN.md — All route handlers (accounts, transactions, check) + app.go rewire + legacy package deletion + openapi.yaml
- [x] 04-03-PLAN.md — Graceful shutdown in cmd/cibi-api/main.go + phase gate verification

---

### Phase 5: Web Dashboard

**Goal**: See financial position at glance. Animated verdict on purchases in browser. Full CRUD feature parity with API and CLI.

**Depends on**: Phase 4

**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04, WEB-05

**Success Criteria**:
  1. Dashboard loads, shows balance, reserved funds (upcoming obligations), liquid, recurring txn list (live from API).
  2. "Can I Buy It?" input + submit = animated verdict card (Motion). YES=green, NO=red + risk level.
  3. Balance refreshes background (TanStack Query polling), no full reload.
  4. UI renders mobile (375px) + desktop (1280px) (Tailwind responsive).
  5. Accounts page: create, read, update, delete, set default — matches API endpoints.
  6. Transactions page: create, read, update, delete — matches API endpoints.
  7. Account selector in header — switch active account context; dashboard recalculates.

**Plans**: 5 plans (Wave 1 parallel → Wave 2 → Wave 3 → Wave 4 checkpoint)

Plans:
- [x] 05-01-PLAN.md — Go: /api/ route prefix + go:embed web/dist + static middleware in main.go
- [x] 05-02-PLAN.md — React: Vite scaffold + all deps + shadcn init + data layer (api.ts, format.ts, router.ts, App.tsx) + Wave 0 tests
- [x] 05-03-PLAN.md — UI components: StatCards + CheckWidget (Motion verdict) + ObligationsList + Dashboard wiring
- [x] 05-04-PLAN.md — Human verify checkpoint: live browser confirmation of all dashboard behavior
- [ ] 05-05-PLAN.md — Full CRUD: AccountsPage + TransactionsPage + AccountSelector + feature parity

---

### Phase 6: MCP Server

**Goal**: Claude queries CIBI financial state + purchase feasibility via MCP Go SDK.

**Depends on**: Phase 2

**Requirements**: MCP-01, MCP-02, MCP-03

**Success Criteria**:
  1. Claude Desktop connects via stdio. `get_financial_status` returns balance, reserved, liquid, next payday.
  2. `check_purchase_feasibility(75.00)` returns same decision as CLI (same service layer).
  3. `log_transaction(45.50, "Groceries")` creates one-off txn, confirms updated balance.
  4. MCP server starts cleanly with `cmd/mcp/main.go` via `app.New(cfg)`. No HTTP to API.

**Plans**: TBD

### Phase 7: N Payment Schedules per Account

**Goal**: Each account can have N pay schedules (e.g., $3k on day 10 and $2k on day 20). Engine projects purchasing power using per-schedule obligation windows; returns WAIT verdict when user can afford after next payday. Settings page provides full CRUD for pay schedules.

**Requirements**: SCHEMA-03, ENGINE-02, ENGINE-03, ENGINE-04, API-01

**Depends on**: Phase 6

**Plans**: 3 plans (Wave 1 → Wave 2 → Wave 3)

Plans:
- [ ] 07-01-PLAN.md — Migration (amount column) + repo CRUD refactor + service refactor + engine multi-schedule loop + WAIT verdict
- [ ] 07-02-PLAN.md — Handler full CRUD (List/Create/Update/Delete) + routes update + frequency enum fix + check response WAIT fields
- [ ] 07-03-PLAN.md — React: api.ts CRUD functions + Settings page + CheckWidget WAIT amber card + CSS tokens

### Phase 9: fix transaction balance and recurring payment confirm

**Goal:** Fix transaction balance bugs: non-recurring not deducted on creation, value updates not adjusting balance, recurring need confirmation mechanism
**Requirements**: TXN-01, TXN-02
**Depends on:** Phase 8
**Plans:** 2 plans

Plans:
- [x] 09-01-PLAN.md — Backend: atomic balance sync + ConfirmRecurring endpoint
- [x] 09-02-PLAN.md — Frontend: Confirm Paid button in transactions list

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/? | Not started | - |
| 2. Domain + Engine | 3/3 | Complete | 2026-04-12 |
| 3. CLI | 1/1 | Complete | 2026-04-11 |
| 4. API Layer | 0/3 | Not started | - |
| 5. Web Dashboard | 0/4 | Not started | - |
| 6. MCP Server | 0/? | Not started | - |
| 7. N Payment Schedules | 0/3 | Not started | - |
