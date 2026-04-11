# CIBI — Roadmap

**Project:** CIBI (Can I Buy It?)
**Last updated:** 2026-04-11
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

**Goal**: The codebase is restructured into a clean, testable monorepo with no global state, pure-Go SQLite, versioned migrations, and a wired App struct — ready to receive domain logic

**Depends on**: Nothing (first phase)

**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, SCHEMA-05, TXN-03

**Success Criteria** (what must be TRUE):
  1. `CGO_ENABLED=0 go build ./...` succeeds — no C compiler required, pure-Go SQLite driver in place
  2. `internal/app.New(cfg)` returns a fully wired App with all repos and services injected; no package-level global DB variable exists anywhere in the codebase
  3. Running the binary for the first time on a fresh machine creates the SQLite file and applies all goose migrations automatically; schema matches the defined entities (Account, Transaction, PaySchedule, SafetyBuffer)
  4. Money columns in the schema are declared as `INTEGER`; timestamp columns store RFC3339 UTC strings; `PRAGMA foreign_keys` returns 1 at runtime

**Plans**: TBD

---

### Phase 2: Domain + Engine

**Goal**: The recurring transaction engine correctly calculates upcoming obligations, and the Decision Engine produces an accurate "Can I Buy It?" answer in under 100ms

**Depends on**: Phase 1

**Requirements**: ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, TXN-01, TXN-02

**Success Criteria** (what must be TRUE):
  1. A recurring transaction anchored to January 31 produces a February occurrence of February 28 (not March 2 or 3) — `AddMonthClamped` prevents month-end overflow
  2. `Engine.CanIBuyIt(amount)` returns `CanBuy: true` when balance minus upcoming obligations minus safety buffer exceeds the item price; returns `CanBuy: false` and `RiskLevel: BLOCKED` when it does not
  3. Only transactions with `next_occurrence` strictly between now and next payday are included in the obligation sum — a transaction due after the next payday is correctly excluded
  4. After a recurring transaction is debited, `next_occurrence` advances exactly one period; re-running the engine does not double-count the same obligation
  5. `NextPayday` for a bi-weekly schedule always returns the next date in the correct alternating sequence derived from the anchor date

**Plans**: TBD

---

### Phase 3: CLI

**Goal**: Every domain operation is accessible from the terminal; `cibi check <amount>` delivers the verdict instantly without a running server

**Depends on**: Phase 2

**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04

**Success Criteria** (what must be TRUE):
  1. `cibi check 75` prints a verdict (YES/NO), purchasing power, buffer remaining, and risk level within 100ms — no HTTP server running required
  2. `cibi tx add --recurring --frequency monthly --anchor 2024-03-01 --amount -850.00 --description "Rent"` creates a recurring transaction and subsequent `cibi tx list` shows it with the correct next occurrence date
  3. `cibi account list` shows all accounts with balances formatted as decimal currency (not raw cents); `cibi account set-default <id>` changes which account the engine queries
  4. `cibi --config /path/to/config.yaml check 50` loads the specified config file and uses its safety buffer and database path values

**Plans**: 1 plan (4 tasks, Wave 1)

Plans:
- [x] 03-PLAN.md — AccountsService + App wiring + CLI (root, account, tx, check commands)

---

### Phase 4: API Layer

**Goal**: All domain operations are available as JSON endpoints over HTTP; the API is the access point for web and Tailscale clients

**Depends on**: Phase 3

**Requirements**: API-01, API-02, API-03

**Success Criteria** (what must be TRUE):
  1. `POST /check` with `{"amount": 75.00}` returns the same `EngineResult` as `cibi check 75` — identical logic, different transport
  2. `GET /accounts`, `POST /accounts`, `GET /transactions`, `POST /transactions`, `PATCH /transactions/:id`, `DELETE /transactions/:id` all return correct JSON responses with consistent error shape on bad input
  3. The API starts and stops cleanly (graceful shutdown on SIGTERM); a malformed request body returns a structured JSON error, not a 500

**Plans**: 3 plans (Wave 1 → Wave 2 → Wave 3)

Plans:
- [ ] 04-01-PLAN.md — Service gap (GetByID, UpdateAccount) + internal/handler/ scaffold + Wave 0 test stubs
- [ ] 04-02-PLAN.md — All route handlers (accounts, transactions, check) + app.go rewire + legacy package deletion + openapi.yaml
- [ ] 04-03-PLAN.md — Graceful shutdown in cmd/cibi-api/main.go + phase gate verification

---

### Phase 5: Web Dashboard

**Goal**: Users can see their financial position at a glance and get an animated verdict on any purchase from a browser

**Depends on**: Phase 4

**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04

**Success Criteria** (what must be TRUE):
  1. The dashboard loads in a browser and shows current balance, reserved funds (sum of upcoming obligations), liquid amount, and a list of upcoming recurring transactions — all pulled live from the API
  2. Entering an amount in the "Can I Buy It?" input and submitting produces an animated verdict card (Motion `motion/react`) showing YES in green or NO in red with the risk level
  3. Balance data refreshes automatically in the background (TanStack Query polling) without a full page reload
  4. The UI renders correctly on both mobile and desktop viewports (Tailwind responsive classes)

**Plans**: TBD

**UI hint**: yes

---

### Phase 6: MCP Server

**Goal**: Claude can query CIBI's financial state and check purchase feasibility through natural conversation using the official MCP Go SDK

**Depends on**: Phase 2

**Requirements**: MCP-01, MCP-02, MCP-03

**Success Criteria** (what must be TRUE):
  1. Claude Desktop connects to the CIBI MCP server via stdio transport; calling `get_financial_status` returns current balance, reserved funds, liquid amount, and next payday date as structured text
  2. `check_purchase_feasibility(75.00)` returns the same decision as `cibi check 75` — same service layer, same result
  3. `log_transaction(45.50, "Groceries")` creates a one-off transaction in the database and the response confirms the updated account balance
  4. The MCP server binary starts cleanly with `cmd/mcp/main.go`; it uses `app.New(cfg)` — no HTTP call is made to the API server

**Plans**: TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/? | Not started | - |
| 2. Domain + Engine | 0/? | Not started | - |
| 3. CLI | 1/1 | Complete | 2026-04-11 |
| 4. API Layer | 0/3 | Not started | - |
| 5. Web Dashboard | 0/? | Not started | - |
| 6. MCP Server | 0/? | Not started | - |
