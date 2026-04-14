package service

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/engine"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// ErrPayScheduleRequired is returned when the user has not configured their pay schedule.
var ErrPayScheduleRequired = errors.New("PAY_SCHEDULE_REQUIRED")

// EngineResult holds the output of the CanIBuyIt decision.
type EngineResult struct {
	CanBuy                bool
	PurchasingPower       int64      // cents; balance - obligations - safety_buffer
	BufferRemaining       int64      // cents; purchasing_power - item_price (may be negative)
	RiskLevel             string     // "LOW" | "MEDIUM" | "HIGH" | "BLOCKED" | "WAIT"
	WillAffordAfterPayday bool       // true when WAIT verdict applies
	WaitUntil             *time.Time // non-nil only when RiskLevel == "WAIT"
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
//
//	purchasing_power = current_balance - sum(upcoming_obligations) - min_threshold
//	can_buy = purchasing_power >= item_price
//
// Upcoming obligations: recurring transactions where
//
//	next_occurrence > now AND next_occurrence <= earliest_next_payday  (D-02)
//
// The union window approach uses the earliest next payday across all schedules.
// Must complete in under 100ms.
func (s *EngineService) CanIBuyIt(accountID uuid.UUID, itemPrice int64) (EngineResult, error) {
	// Step 1: Load account.
	acc, err := s.accRepo.GetByID(accountID)
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: get account: %w", err)
	}

	// Step 2: Load ALL pay schedules for this account.
	schedules, err := s.psRepo.ListByAccountID(accountID)
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: list pay schedules: %w", err)
	}
	if len(schedules) == 0 {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: %w", ErrPayScheduleRequired)
	}

	// Step 3: Find earliest next payday across all schedules (union window approach).
	now := time.Now().UTC()
	var earliestPayday time.Time
	var earliestSchedule sqlite.PaySchedule
	for i, ps := range schedules {
		ep := engine.PaySchedule{
			Frequency:   ps.Frequency,
			AnchorDate:  ps.AnchorDate,
			DayOfMonth2: ps.DayOfMonth2,
		}
		np := engine.NextPayday(ep, now)
		if i == 0 || np.Before(earliestPayday) {
			earliestPayday = np
			earliestSchedule = ps
		}
	}

	// Step 4: Sum upcoming obligations (next_occurrence > now AND <= earliestPayday).
	obligations, err := s.txnsRepo.SumUpcomingObligations(accountID, now, earliestPayday)
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: sum obligations: %w", err)
	}
	// Obligations are stored as negative amounts (debits). Sum is negative or zero.
	// purchasing_power = balance + obligations (obligations <= 0) - threshold
	// Example: balance=50000, obligations=-20000, threshold=10000 → pp=20000

	// Step 5: Load safety buffer.
	buf, err := s.bufferRepo.Get()
	if err != nil {
		return EngineResult{}, fmt.Errorf("engine.CanIBuyIt: get buffer: %w", err)
	}

	// Step 6: Calculate purchasing power.
	purchasingPower := acc.CurrentBalance + obligations - buf.MinThreshold

	// Step 7: Determine can_buy and buffer_remaining.
	canBuy := purchasingPower >= itemPrice
	bufferRemaining := purchasingPower - itemPrice

	// Step 8: Classify risk — handle BLOCKED and WAIT inline; delegate LOW/MEDIUM/HIGH to classifyRisk.
	if canBuy {
		return EngineResult{
			CanBuy:          true,
			PurchasingPower: purchasingPower,
			BufferRemaining: bufferRemaining,
			RiskLevel:       classifyRisk(bufferRemaining, buf.MinThreshold),
		}, nil
	}

	// Cannot buy — check WAIT: will the user afford it after the earliest payday?
	projectedBalance := acc.CurrentBalance + earliestSchedule.Amount
	// obligations is already summed for the [now, earliestPayday] window (same window).
	projectedPurchasingPower := projectedBalance + obligations - buf.MinThreshold
	willAfford := projectedPurchasingPower >= itemPrice

	result := EngineResult{
		CanBuy:                false,
		PurchasingPower:       purchasingPower,
		BufferRemaining:       bufferRemaining,
		RiskLevel:             "BLOCKED",
		WillAffordAfterPayday: willAfford,
		WaitUntil:             nil,
	}
	if willAfford {
		result.RiskLevel = "WAIT"
		result.WaitUntil = &earliestPayday
	}
	return result, nil
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
//
//	HIGH:    remaining < 25% of min_threshold
//	MEDIUM:  remaining < 50% of min_threshold
//	LOW:     remaining >= 50% of min_threshold (or min_threshold == 0)
func classifyRisk(bufferRemaining, minThreshold int64) string {
	if minThreshold == 0 {
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
