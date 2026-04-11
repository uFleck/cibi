# Codebase Structure

**Analysis Date:** 2026-04-11

## Directory Layout

```
cibi-api/
├── main.go             # Entry point: wires all layers, starts Echo server on :42069
├── go.mod              # Module: github.com/ufleck/cibi-api, Go 1.22
├── go.sum              # Dependency lockfile
├── CIBI_SPEC.md        # Product spec and domain rules (read before implementing features)
├── handlers/           # HTTP layer: request parsing, response encoding, route registration
│   ├── accounts.go     # AccountsHandler with CRUD handlers
│   ├── transactions.go # TransactionsHandler with create handler
│   └── routes.go       # SetupRoutes: registers /accounts and /transactions groups
├── services/           # Business logic layer
│   ├── accounts.go     # AccountsSrvc: account CRUD + balance adjustment via transactions
│   └── transactions.go # TransactionsSrvc: create and fetch transactions
├── repos/              # Data access layer: interfaces + SQLite implementations
│   ├── accounts.go     # AccountsRepo interface + SqliteAccRepo implementation
│   └── transactions.go # TransactionsRepo interface + SqliteTxnsRepo implementation
├── data/               # Domain entities and constructors
│   ├── accounts.go     # Account struct, Accounts type, NewAccount, AddTransaction
│   └── transactions.go # Transaction struct, Transactions type, NewTransaction, Evaluate
├── types/              # HTTP request/response DTOs (separate from domain entities)
│   └── types.go        # NewAccount, UpdateAccount, NewTransaction request shapes
├── db/                 # Database initialization
│   ├── sqlite.go       # db.Conn global, Init() creates tables
│   └── cibi.db         # SQLite database file (runtime artifact — should be gitignored)
├── tmp/                # Empty; likely for air (live reload) build artifacts
├── .planning/          # GSD planning documents
│   └── codebase/       # Codebase analysis documents (this directory)
├── .gitignore
└── LICENSE
```

## Directory Purposes

**`handlers/`:**
- Purpose: HTTP boundary — decode requests, call services, encode responses
- Contains: One handler struct per domain resource, plus `routes.go`
- Key files: `handlers/routes.go` (all routes in one place), `handlers/accounts.go` (most complete handler example)
- Rule: Handlers must not contain business logic; delegate everything to services

**`services/`:**
- Purpose: Business logic and orchestration across repos
- Contains: One service struct per domain resource
- Key files: `services/accounts.go` (most complex — balance adjustment pattern), `services/transactions.go`
- Rule: Services depend on `repos` interfaces (not concrete types) and `data` entities

**`repos/`:**
- Purpose: All SQL queries and database interaction
- Contains: Interface definitions and their SQLite implementations
- Key files: `repos/accounts.go` (defines `AccountsRepo` interface used across the codebase)
- Rule: Repo methods accept and return `data` package types; use `db.Conn` or `*sql.Tx` directly

**`data/`:**
- Purpose: Core domain model — the canonical representation of entities
- Contains: Structs, type aliases, factory constructors, domain behavior methods
- Key files: `data/accounts.go`, `data/transactions.go`
- Rule: No imports from `handlers`, `services`, `repos`, or `types` — this package must remain dependency-free within the module

**`types/`:**
- Purpose: HTTP input shapes (DTOs) that differ from domain entities
- Contains: Request structs with JSON tags
- Key files: `types/types.go`
- Rule: Use pointer fields (`*float64`, `*bool`) for optional update fields to distinguish "not provided" from zero value

**`db/`:**
- Purpose: SQLite connection management and schema creation
- Contains: Package-level `Conn *sql.DB` global, `Init()` function
- Key files: `db/sqlite.go`
- Rule: All repos access `db.Conn` directly; `Init()` must be called before any repo is used

## Key File Locations

**Entry Points:**
- `main.go`: Application bootstrap — dependency wiring and server start

**Route Registration:**
- `handlers/routes.go`: All HTTP routes defined in one place

**Repository Interfaces:**
- `repos/accounts.go`: `AccountsRepo` interface (lines 12-22)
- `repos/transactions.go`: `TransactionsRepo` interface (lines 13-17)

**Domain Entities:**
- `data/accounts.go`: `Account` struct and `NewAccount` constructor
- `data/transactions.go`: `Transaction` struct, `NewTransaction`, `Evaluate` method

**Database Schema:**
- `db/sqlite.go`: `accounts` and `transactions` table DDL (in `Init()`)

**Product Specification:**
- `CIBI_SPEC.md`: Domain rules, decision engine logic, planned features — consult before implementing

## Naming Conventions

**Files:**
- Singular noun matching the domain resource: `accounts.go`, `transactions.go`
- One file per resource per layer (e.g., `handlers/accounts.go`, `services/accounts.go`, `repos/accounts.go`)

**Packages:**
- Lowercase, single-word: `handlers`, `services`, `repos`, `data`, `types`, `db`

**Types:**
- Structs: PascalCase — `AccountsHandler`, `AccountsSrvc`, `SqliteAccRepo`, `SqliteTxnsRepo`
- Interfaces: PascalCase with noun — `AccountsRepo`, `TransactionsRepo`
- Domain entities: PascalCase nouns — `Account`, `Transaction`
- DTO types: PascalCase with action prefix — `NewAccount`, `UpdateAccount`, `NewTransaction`

**Functions and Methods:**
- Constructors: `New` prefix — `NewAccount`, `NewAccountsSrvc`, `NewSqliteTxnsRepo`
- Handler methods: `Handle` prefix — `HandleCreateAcc`, `HandleGetAccById`, `HandleDeleteAcc`
- Service methods: verb + noun — `CreateAccount`, `GetDefaultAccount`, `UpdateAccount`
- Repo methods: short verbs — `Insert`, `GetAll`, `GetById`, `GetDefault`, `DeleteById`, `UpdateBalance`

**Variables:**
- camelCase: `accSrvc`, `txnsRepo`, `accHandler`
- Abbreviations used consistently: `acc` (account), `txn`/`tx`/`txns` (transaction/s), `srvc` (service), `repo` (repository)

## Where to Add New Code

**New Domain Resource (e.g., `Budget`):**
- Domain entity: `data/budgets.go`
- DTO types: add to `types/types.go` or create `types/budgets.go`
- Repo interface + SQLite impl: `repos/budgets.go`
- Service: `services/budgets.go`
- Handler: `handlers/budgets.go`
- Routes: add group to `handlers/routes.go`
- Wire in: `main.go` (instantiate repo → service → handler, pass to `SetupRoutes`)
- Schema: add `CREATE TABLE IF NOT EXISTS` block in `db/sqlite.go:Init()`

**New Endpoint on Existing Resource:**
- Add handler method to `handlers/accounts.go` or `handlers/transactions.go`
- Register route in `handlers/routes.go`
- Add service method if business logic is needed
- Add repo method if new SQL is needed

**New Utility/Helper:**
- Shared helpers with no layer affiliation: create a new top-level package (e.g., `utils/`)
- Domain logic helpers: add method to the relevant `data/` type

## Special Directories

**`tmp/`:**
- Purpose: Intended for `air` live-reload tool build artifacts
- Generated: Yes (at runtime by `air`)
- Committed: No (should be in `.gitignore`)

**`.planning/codebase/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: Yes (by GSD mapping agents)
- Committed: Yes (planning artifacts tracked in repo)

**`db/` (the `cibi.db` file):**
- Purpose: Runtime SQLite database
- Generated: Yes (created by `db.Init()` on first run)
- Committed: Currently committed (should be gitignored — contains live data)

---

*Structure analysis: 2026-04-11*
