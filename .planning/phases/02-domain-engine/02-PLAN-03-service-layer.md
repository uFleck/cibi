---
plan: "02-03"
title: "Service Layer — Transactions + Engine"
phase: 2
wave: 2
depends_on:
  - "02-01"
  - "02-02"
files_modified:
  - internal/service/transactions.go
  - internal/service/engine.go
  - internal/app/app.go
autonomous: true
requirements:
  - ENGINE-03
  - ENGINE-04
  - TXN-01
  - TXN-02
must_haves:
  - CanIBuyIt returns CanBuy=true when purchasing_power >= item_price and CanBuy=false with RiskLevel=BLOCKED when not
  - next_occurrence advances exactly one period after debit — weekly/bi-weekly uses fixed days, monthly/yearly uses AddMonthClamped
  - app.go wires internal/ repos and services (old repos/ remain but are not re-wired)
  - All four RiskLevel values (LOW, MEDIUM, HIGH, BLOCKED) are reachable
---

# Plan 02-03: Service Layer — Transactions + Engine

## Goal

Create the service layer (`internal/service/`) on top of the repo layer built in Plan 02-02, and wire everything into `internal/app/app.go`. This plan delivers the core business logic: full transaction CRUD with validation, atomic next_occurrence advancement, and the CanIBuyIt decision engine.

---

## Wave 2

### Task 02-03-01: Create `internal/service/transactions.go`

<read_first>
- `internal/repo/sqlite/transactions.go` — TransactionsRepo interface + UpdateTransaction struct
- `internal/repo/sqlite/accounts.go` — AccountsRepo interface (needed for balance updates)
- `internal/engine/engine.go` — AddMonthClamped, frequency constants (FreqWeekly, FreqBiWeekly, FreqMonthly, FreqYearly)
- `.planning/REQUIREMENTS.md` — TXN-01 (CRUD + validation) and TXN-02 (advance next_occurrence)
- `.planning/phases/02-domain-engine/02-CONTEXT.md` — D-01 (strict UTC)
</read_first>

<action>
Create `internal/service/transactions.go` with the following exact content:

```go
package service

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/engine"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// TransactionsService handles business logic for transactions.
type TransactionsService struct {
	txnsRepo sqlite.TransactionsRepo
	accRepo  sqlite.AccountsRepo
}

// NewTransactionsService creates a new TransactionsService.
func NewTransactionsService(txnsRepo sqlite.TransactionsRepo, accRepo sqlite.AccountsRepo) *TransactionsService {
	return &TransactionsService{txnsRepo: txnsRepo, accRepo: accRepo}
}

// CreateTransaction validates and inserts a new transaction.
// anchor_date is required when is_recurring is true.
// frequency must be one of the defined FreqXxx constants when is_recurring is true.
func (s *TransactionsService) CreateTransaction(t sqlite.Transaction) error {
	if t.IsRecurring {
		if t.Frequency == nil || !sqlite.ValidFrequencies[*t.Frequency] {
			return fmt.Errorf("recurring transaction requires a valid frequency (weekly, bi-weekly, monthly, yearly)")
		}
		if t.AnchorDate == nil {
			return fmt.Errorf("recurring transaction requires anchor_date")
		}
		// Set initial next_occurrence = anchor_date if not provided.
		if t.NextOccurrence == nil {
			anchor := t.AnchorDate.UTC()
			t.NextOccurrence = &anchor
		}
	}

	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	if t.Timestamp.IsZero() {
		now := time.Now().UTC()
		t.Timestamp = now
	}

	if err := s.txnsRepo.Insert(t); err != nil {
		return fmt.Errorf("service.CreateTransaction: %w", err)
	}
	return nil
}

// ListTransactions returns all transactions for an account.
func (s *TransactionsService) ListTransactions(accountID uuid.UUID) ([]sqlite.Transaction, error) {
	txns, err := s.txnsRepo.GetByAccount(accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListTransactions: %w", err)
	}
	return txns, nil
}

// GetTransaction returns a single transaction by ID.
func (s *TransactionsService) GetTransaction(id uuid.UUID) (sqlite.Transaction, error) {
	t, err := s.txnsRepo.GetByID(id)
	if err != nil {
		return t, fmt.Errorf("service.GetTransaction: %w", err)
	}
	return t, nil
}

// UpdateTransaction patches the mutable fields of a transaction.
func (s *TransactionsService) UpdateTransaction(id uuid.UUID, upd sqlite.UpdateTransaction) error {
	if err := s.txnsRepo.Update(id, upd); err != nil {
		return fmt.Errorf("service.UpdateTransaction: %w", err)
	}
	return nil
}

// DeleteTransaction removes a transaction by ID.
func (s *TransactionsService) DeleteTransaction(id uuid.UUID) error {
	if err := s.txnsRepo.DeleteByID(id); err != nil {
		return fmt.Errorf("service.DeleteTransaction: %w", err)
	}
	return nil
}

// RecordDebit records a debit against a recurring transaction and atomically
// advances next_occurrence by one period. Guards against double-debit by
// requiring next_occurrence > now before advancing.
//
// Formula per TXN-02:
//   - weekly:    next = current_next + 7 days
//   - bi-weekly: next = current_next + 14 days
//   - monthly:   next = AddMonthClamped(current_next, 1)
//   - yearly:    next = AddMonthClamped(current_next, 12)
func (s *TransactionsService) RecordDebit(transactionID uuid.UUID) error {
	t, err := s.txnsRepo.GetByID(transactionID)
	if err != nil {
		return fmt.Errorf("service.RecordDebit: get transaction: %w", err)
	}
	if !t.IsRecurring {
		return fmt.Errorf("service.RecordDebit: transaction %v is not recurring", transactionID)
	}
	if t.Frequency == nil {
		return fmt.Errorf("service.RecordDebit: transaction %v has no frequency", transactionID)
	}
	if t.NextOccurrence == nil {
		return fmt.Errorf("service.RecordDebit: transaction %v has no next_occurrence", transactionID)
	}

	now := time.Now().UTC()

	// Double-debit guard: next_occurrence must be in the future (> now).
	if !t.NextOccurrence.After(now) {
		return fmt.Errorf("service.RecordDebit: next_occurrence is not in the future — possible double debit on %v", transactionID)
	}

	next := advanceOccurrence(*t.NextOccurrence, *t.Frequency)

	if err := s.txnsRepo.AdvanceNextOccurrence(transactionID, next, nil); err != nil {
		return fmt.Errorf("service.RecordDebit: advance next_occurrence: %w", err)
	}
	return nil
}

// advanceOccurrence computes the next occurrence after current based on frequency.
func advanceOccurrence(current time.Time, frequency string) time.Time {
	switch frequency {
	case engine.FreqWeekly:
		return current.AddDate(0, 0, 7)
	case engine.FreqBiWeekly:
		return current.AddDate(0, 0, 14)
	case engine.FreqMonthly:
		return engine.AddMonthClamped(current, 1)
	case engine.FreqYearly:
		return engine.AddMonthClamped(current, 12)
	default:
		// Fallback — treat as monthly
		return engine.AddMonthClamped(current, 1)
	}
}
```
</action>

<acceptance_criteria>
- `internal/service/transactions.go` exists with `package service`
- Contains `func (s *TransactionsService) CreateTransaction`
- Contains `func (s *TransactionsService) RecordDebit`
- Contains `func advanceOccurrence` using `engine.AddMonthClamped` for monthly/yearly
- `grep "engine.AddMonthClamped" internal/service/transactions.go` returns matches
- `grep "double debit" internal/service/transactions.go` returns match (double-debit guard present)
- `go build ./internal/service/...` exits 0
</acceptance_criteria>

---

### Task 02-03-02: Create `internal/service/engine.go`

<read_first>
- `internal/repo/sqlite/accounts.go` — AccountsRepo (GetDefault, GetByID)
- `internal/repo/sqlite/transactions.go` — TransactionsRepo (SumUpcomingObligations)
- `internal/repo/sqlite/pay_schedule.go` — PayScheduleRepo (GetByAccountID)
- `internal/repo/sqlite/safety_buffer.go` — SafetyBufferRepo (Get)
- `internal/engine/engine.go` — NextPayday, PaySchedule struct
- `.planning/REQUIREMENTS.md` — ENGINE-03 (formula), ENGINE-04 (EngineResult, risk tiers)
- `.planning/phases/02-domain-engine/02-CONTEXT.md` — D-02 (next_occurrence <= next_payday boundary)
- `.planning/phases/02-domain-engine/02-RESEARCH.md` — Section 4 (Risk tier proposed thresholds)
</read_first>

<action>
Create `internal/service/engine.go` with the following exact content:

```go
package service

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/engine"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// EngineResult holds the output of the CanIBuyIt decision.
type EngineResult struct {
	CanBuy          bool
	PurchasingPower int64  // cents; balance - obligations - safety_buffer
	BufferRemaining int64  // cents; purchasing_power - item_price (may be negative)
	RiskLevel       string // "LOW" | "MEDIUM" | "HIGH" | "BLOCKED"
}

// EngineService implements the CanIBuyIt decision engine.
type EngineService struct {
	accRepo    sqlite.AccountsRepo
	txnsRepo   sqlite.TransactionsRepo
	psRepo     sqlite.PayScheduleRepo
	bufferRepo sqlite.SafetyBufferRepo
}

// NewEngineService creates a new EngineService.
func NewEngineService(
	accRepo sqlite.AccountsRepo,
	txnsRepo sqlite.TransactionsRepo,
	psRepo sqlite.PayScheduleRepo,
	bufferRepo sqlite.SafetyBufferRepo,
) *EngineService {
	return &EngineService{
		accRepo:    accRepo,
		txnsRepo:   txnsRepo,
		psRepo:     psRepo,
		bufferRepo: bufferRepo,
	}
}

// CanIBuyIt answers whether the user can afford itemPrice (in cents) given
// their current balance, upcoming obligations until next payday, and safety buffer.
//
// Formula (ENGINE-03):
//   purchasing_power = current_balance - sum(upcoming_obligations) - min_threshold
//   can_buy = purchasing_power >= item_price
//
// Upcoming obligations: recurring transactions where
//   next_occurrence > now AND next_occurrence <= next_payday  (D-02)
//
// Must complete in under 100ms.
func (s *EngineService) CanIBuyIt(accountID uuid.UUID, itemPrice int64) (EngineResult, error) {
	// Step 1: Load account.
	acc, err := s.accRepo.GetByID(accountID)
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: get account: %w", err)
	}

	// Step 2: Load PaySchedule for this account.
	ps, err := s.psRepo.GetByAccountID(accountID)
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: get pay schedule: %w", err)
	}

	// Step 3: Compute next payday strictly after now (UTC).
	now := time.Now().UTC()
	engineSchedule := engine.PaySchedule{
		Frequency:   ps.Frequency,
		AnchorDate:  ps.AnchorDate,
		DayOfMonth2: ps.DayOfMonth2,
	}
	nextPayday := engine.NextPayday(engineSchedule, now)

	// Step 4: Sum upcoming obligations (next_occurrence > now AND <= next_payday).
	obligations, err := s.txnsRepo.SumUpcomingObligations(accountID, now, nextPayday)
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: sum obligations: %w", err)
	}
	// Obligations are stored as negative amounts (debits). Sum is negative.
	// We subtract obligations as an absolute value: purchasing_power = balance - abs(obligations).
	// However, to keep it symmetric with SUM(amount) where debits are negative cents,
	// we add the (negative) sum, which reduces the balance.
	// If the repo stores debits as negative: obligations < 0.
	// purchasing_power = balance + obligations (obligations <= 0) - threshold
	// Example: balance=50000, obligations=-20000, threshold=10000 → pp=20000

	// Step 5: Load safety buffer.
	buf, err := s.bufferRepo.Get()
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: get buffer: %w", err)
	}

	// Step 6: Calculate purchasing power.
	// obligations is the SUM(amount) — debits should be negative cents.
	purchasingPower := acc.CurrentBalance + obligations - buf.MinThreshold

	// Step 7: Determine can_buy and buffer_remaining.
	canBuy := purchasingPower >= itemPrice
	bufferRemaining := purchasingPower - itemPrice

	// Step 8: Classify risk.
	riskLevel := classifyRisk(canBuy, bufferRemaining, buf.MinThreshold)

	return EngineResult{
		CanBuy:          canBuy,
		PurchasingPower: purchasingPower,
		BufferRemaining: bufferRemaining,
		RiskLevel:       riskLevel,
	}, nil
}

// CanIBuyItDefault runs CanIBuyIt against the account marked is_default = 1.
func (s *EngineService) CanIBuyItDefault(itemPrice int64) (EngineResult, error) {
	acc, err := s.accRepo.GetDefault()
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyItDefault: get default account: %w", err)
	}
	return s.CanIBuyIt(acc.ID, itemPrice)
}

// classifyRisk determines the RiskLevel based on buffer_remaining vs min_threshold.
//
// Tiers (ENGINE-04 — thresholds are agent's discretion):
//   BLOCKED: can't afford it
//   HIGH:    remaining < 25% of min_threshold
//   MEDIUM:  remaining < 50% of min_threshold
//   LOW:     remaining >= 50% of min_threshold (or min_threshold == 0)
func classifyRisk(canBuy bool, bufferRemaining, minThreshold int64) string {
	if !canBuy {
		return "BLOCKED"
	}
	if minThreshold == 0 {
		// No buffer defined — any positive purchasing_power is LOW.
		return "LOW"
	}
	if bufferRemaining < minThreshold/4 {
		return "HIGH"
	}
	if bufferRemaining < minThreshold/2 {
		return "MEDIUM"
	}
	return "LOW"
}
```
</action>

<acceptance_criteria>
- `internal/service/engine.go` exists with `package service`
- Contains `type EngineResult struct` with fields `CanBuy bool`, `PurchasingPower int64`, `BufferRemaining int64`, `RiskLevel string`
- Contains `func (s *EngineService) CanIBuyIt`
- Contains `func classifyRisk` with all four return values: "LOW", "MEDIUM", "HIGH", "BLOCKED"
- `grep "BLOCKED" internal/service/engine.go` returns match
- `grep "NextPayday" internal/service/engine.go` returns match
- `grep "SumUpcomingObligations" internal/service/engine.go` returns match
- `go build ./internal/service/...` exits 0
</acceptance_criteria>

---

### Task 02-03-03: Wire new internal repos + services into `internal/app/app.go`

<read_first>
- `internal/app/app.go` — current wiring (imports old repos/ and services/ packages)
- `internal/repo/sqlite/accounts.go` — NewSqliteAccountsRepo
- `internal/repo/sqlite/transactions.go` — NewSqliteTxnsRepo
- `internal/repo/sqlite/pay_schedule.go` — NewSqlitePayScheduleRepo
- `internal/repo/sqlite/safety_buffer.go` — NewSqliteSafetyBufferRepo
- `internal/service/transactions.go` — NewTransactionsService
- `internal/service/engine.go` — NewEngineService
</read_first>

<action>
Update `internal/app/app.go` to add the new internal repos and services while keeping the existing Echo routing intact. Add three new exported fields to the App struct: `TxnsSvc`, `EngineSvc`, and `PaySchedRepo`. The existing `AccHandler` and `TxnsHandler` (from the old `handlers/` package) remain wired so the Echo server still starts.

Replace the entire content of `internal/app/app.go` with:

```go
package app

import (
	"database/sql"
	"fmt"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/db"
	"github.com/ufleck/cibi/handlers"
	"github.com/ufleck/cibi/internal/config"
	"github.com/ufleck/cibi/internal/migrations"
	reposqlite "github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
	"github.com/ufleck/cibi/repos"
	"github.com/ufleck/cibi/services"
)

// App is the fully wired application graph.
type App struct {
	cfg         config.Config
	db          *sql.DB
	Echo        *echo.Echo

	// Legacy handlers (Echo routing — not modified in Phase 2).
	AccHandler  *handlers.AccountsHandler
	TxnsHandler *handlers.TransactionsHandler

	// Phase 2: internal service layer (used by CLI in Phase 3).
	TxnsSvc    *service.TransactionsService
	EngineSvc  *service.EngineService
}

// New creates and wires the entire application graph.
func New(cfg config.Config) (*App, error) {
	database, err := db.Init(cfg.DatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to init db: %w", err)
	}

	if err := migrations.Run(database); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	// --- Legacy wiring (repos/, services/, handlers/) ---
	accRepo := repos.NewSqliteAccRepo(database)
	txnsRepo := repos.NewSqliteTxnsRepo(accRepo, database)

	txnsSrvc := services.NewTransactionsSrvc(txnsRepo, accRepo)
	accSrvc := services.NewAccountsSrvc(accRepo, txnsRepo, txnsSrvc)

	accHandler := handlers.AccountsHandler{AccSrvc: &accSrvc}
	txnsHandler := handlers.TransactionsHandler{TxnsSrvc: txnsSrvc}

	e := echo.New()
	handlers.SetupRoutes(e, &accHandler, &txnsHandler)

	// --- Phase 2: internal repo + service wiring ---
	iAccRepo := reposqlite.NewSqliteAccountsRepo(database)
	iTxnsRepo := reposqlite.NewSqliteTxnsRepo(database)
	iPsRepo := reposqlite.NewSqlitePayScheduleRepo(database)
	iBufRepo := reposqlite.NewSqliteSafetyBufferRepo(database)

	txnsSvc := service.NewTransactionsService(iTxnsRepo, iAccRepo)
	engineSvc := service.NewEngineService(iAccRepo, iTxnsRepo, iPsRepo, iBufRepo)

	return &App{
		cfg:         cfg,
		db:          database,
		Echo:        e,
		AccHandler:  &accHandler,
		TxnsHandler: &txnsHandler,
		TxnsSvc:     txnsSvc,
		EngineSvc:   engineSvc,
	}, nil
}

// Start starts the Echo HTTP server.
func (a *App) Start() error {
	return a.Echo.Start(a.cfg.ServerPort)
}
```
</action>

<acceptance_criteria>
- `internal/app/app.go` contains `TxnsSvc *service.TransactionsService`
- `internal/app/app.go` contains `EngineSvc *service.EngineService`
- `internal/app/app.go` imports `reposqlite "github.com/ufleck/cibi/internal/repo/sqlite"`
- `internal/app/app.go` imports `"github.com/ufleck/cibi/internal/service"`
- `go build ./...` exits 0 (entire project compiles cleanly)
- `grep "NewEngineService" internal/app/app.go` returns match
</acceptance_criteria>

---

## Verification

```bash
go build ./...
go test ./internal/engine/... -v
go vet ./internal/...
```

Expected: all exit 0, all engine tests pass.

**must_haves:**
- [ ] `go build ./...` exits 0
- [ ] `CanIBuyIt` formula: `purchasing_power = current_balance + obligations - min_threshold` (obligations are negative cents)
- [ ] `RecordDebit` advances `next_occurrence` and guards against double debit
- [ ] All four RiskLevel values reachable in `classifyRisk`
- [ ] `internal/app/app.go` exposes both `TxnsSvc` and `EngineSvc`
