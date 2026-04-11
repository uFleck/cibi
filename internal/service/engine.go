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
