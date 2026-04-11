# Architecture

**Analysis Date:** 2026-04-11

## Pattern Overview

**Overall:** Layered architecture (Handlers → Services → Repos → DB), manually wired via dependency injection in `main.go`.

**Key Characteristics:**
- Each layer depends only on the layer below it via Go interfaces
- Repository interfaces (`AccountsRepo`, `TransactionsRepo`) decouple services from SQLite specifics
- No dependency injection framework — all wiring is explicit in `main.go`
- Single binary, single SQLite database file
- No middleware, no auth, no request logging beyond Echo defaults

## Layers

**Handler Layer:**
- Purpose: Parse HTTP requests, delegate to services, return HTTP responses
- Location: `handlers/`
- Contains: `AccountsHandler`, `TransactionsHandler`, route setup
- Depends on: `services` package (via concrete structs), `types` package for request shapes
- Used by: Echo router (`handlers/routes.go`)

**Service Layer:**
- Purpose: Orchestrate business logic across repos; enforce domain rules
- Location: `services/`
- Contains: `AccountsSrvc`, `TransactionsSrvc`
- Depends on: `repos` interfaces, `data` package for domain entities
- Used by: handlers

**Repository Layer:**
- Purpose: Provide typed interfaces for all database operations; execute SQL
- Location: `repos/`
- Contains: `SqliteAccRepo` (implements `AccountsRepo`), `SqliteTxnsRepo` (implements `TransactionsRepo`)
- Depends on: `db.Conn` global, `data` package for entity types
- Used by: services

**Domain Data Layer:**
- Purpose: Define core entity structs and their constructors/methods
- Location: `data/`
- Contains: `Account`, `Transaction`, `Accounts`, `Transactions`, factory functions (`NewAccount`, `NewTransaction`), domain methods (`Evaluate`, `AddTransaction`)
- Depends on: nothing in this module
- Used by: repos and services

**Types Layer:**
- Purpose: Define HTTP request/response shapes (DTOs) separate from domain entities
- Location: `types/`
- Contains: `NewAccount`, `UpdateAccount`, `NewTransaction`
- Depends on: nothing in this module
- Used by: handlers (decode request bodies) and services (receive from handlers)

**Database Layer:**
- Purpose: Initialize SQLite connection and create schema
- Location: `db/`
- Contains: `Conn *sql.DB` package-level global, `Init()` function
- Depends on: `github.com/mattn/go-sqlite3` CGO driver
- Used by: `main.go` for initialization; `repos` for all queries

## Data Flow

**Create Transaction (POST /transactions/):**

1. Echo routes request to `TransactionsHandler.HandleCreateTxn` (`handlers/transactions.go`)
2. Handler decodes JSON body into `types.NewTransaction`
3. Handler calls `TransactionsSrvc.CreateTransaction` (`services/transactions.go`)
4. Service fetches the target account via `AccountsRepo.GetById`
5. Service builds a `data.Transaction` via `data.NewTransaction`
6. Service calls `TransactionsRepo.Insert(t, acc)`
7. Repo begins a SQLite transaction; if `EvaluatesAt` is in the past, calls `AccountsRepo.UpdateBalance` within the same `*sql.Tx`
8. Repo calls `t.Evaluate()` to mark the transaction as applied, then inserts it
9. Repo commits; handler returns 201 No Content

**Get Account By ID (GET /accounts/:id):**

1. Handler parses UUID path param, calls `AccountsSrvc.GetAccountById`
2. Service fetches `Account` via `AccountsRepo.GetById`
3. Service fetches account's transactions via `TransactionsSrvc.GetAccTransactions`
4. Service attaches transactions to the account struct (`acc.Transactions = txns`)
5. Handler returns 200 JSON

**Update Account Balance (PATCH /accounts/?id=):**

1. Handler parses query param `id`, decodes `types.UpdateAccount` body
2. Service calls `AccountsSrvc.UpdateAccount`
3. For balance updates: service computes delta, creates a synthetic "Balance Adjust" `data.Transaction`, and inserts it via `txnsSrvc.repo.Insert` — the repo recalculates balance as part of insert
4. For name/isDefault updates: service calls targeted repo methods directly

**State Management:**
- All state is persisted in `db/cibi.db` (SQLite file, committed to repo — note: should be gitignored)
- Account balance is a stored column updated atomically within SQL transactions when a `Transaction` is evaluated
- No in-memory cache or application-level state beyond the wired service/repo structs

## Key Abstractions

**`AccountsRepo` interface (`repos/accounts.go`):**
- Purpose: Decouple services from SQLite implementation for account operations
- Implementation: `SqliteAccRepo` struct (zero-value, no fields)
- Key methods: `Insert`, `GetAll`, `GetDefault`, `GetById`, `UpdateBalance`, `UpdateName`, `UpdateIsDefault`, `DeleteById`, `UnsetDefaults`

**`TransactionsRepo` interface (`repos/transactions.go`):**
- Purpose: Decouple services from SQLite implementation for transaction operations
- Implementation: `SqliteTxnsRepo` (holds an `AccountsRepo` to update balance atomically on insert)
- Key methods: `Insert`, `GetAccTxns`, `Update`

**`data.Transaction.Evaluate()` (`data/transactions.go`):**
- Purpose: Mark a transaction as applied and record evaluation timestamp
- Called by: `SqliteTxnsRepo.Insert` when `EvaluatesAt` is past or present

**Constructor Functions:**
- `data.NewAccount` — creates Account with new UUID, zero balance
- `data.NewTransaction` — creates Transaction with new UUID, `Evaluated: false`
- `services.NewAccountsSrvc` — wires service with repo dependencies
- `services.NewTransactionsSrvc` — wires service with repo dependencies

## Entry Points

**`main.go`:**
- Location: `/main.go`
- Triggers: `go run main.go` or compiled binary
- Responsibilities:
  1. Call `db.Init()` — opens SQLite, creates tables if not exist
  2. Instantiate repos (`SqliteAccRepo`, `SqliteTxnsRepo`)
  3. Instantiate services (`TransactionsSrvc`, `AccountsSrvc`)
  4. Instantiate handlers (`AccountsHandler`, `TransactionsHandler`)
  5. Call `handlers.SetupRoutes` to register all routes
  6. Start Echo HTTP server on port `:42069`

**`handlers/routes.go`:**
- Location: `handlers/routes.go`
- Triggers: called from `main.go` at startup
- Responsibilities: Register all API route groups (`/accounts`, `/transactions`) and map HTTP methods to handler functions

## Error Handling

**Strategy:** Errors are propagated up via `error` return values. Each layer wraps errors with `fmt.Errorf("context: %w", err)`. Handlers convert errors to HTTP string responses.

**Patterns:**
- Repos return raw `database/sql` errors, sometimes wrapped with context
- Services wrap repo errors: `fmt.Errorf("Could not create account. Error when inserting: %w", err)`
- Handlers return `c.String(http.StatusBadRequest, err.Error())` or `c.String(http.StatusInternalServerError, err.Error())` — no structured error response format
- SQL transactions use explicit `tx.Rollback()` on error before returning

## Cross-Cutting Concerns

**Logging:** `fmt.Println` and `println` used directly in service and repo layers (not structured; debug artifacts left in code)

**Validation:** Minimal — UUID parsing in handlers, JSON decode errors surfaced as 400. No input validation on field values (e.g., empty name, negative balance)

**Authentication:** None — all endpoints are publicly accessible

**Database Transactions:** Used explicitly in repos via `db.Conn.Begin()` / `tx.Commit()` / `tx.Rollback()` for multi-step atomic operations (e.g., insert account + unset defaults, insert transaction + update balance)

---

*Architecture analysis: 2026-04-11*
