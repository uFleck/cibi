package service

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/payday"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// ErrPayScheduleRequired is returned when the user has not configured their pay schedule.
var ErrPayScheduleRequired = errors.New("PAY_SCHEDULE_REQUIRED")

// RiskLevel is the verdict class; its string value is part of the JSON API.
type RiskLevel string

const (
	RiskLow     RiskLevel = "LOW"
	RiskMedium  RiskLevel = "MEDIUM"
	RiskHigh    RiskLevel = "HIGH"
	RiskBlocked RiskLevel = "BLOCKED"
	RiskWait    RiskLevel = "WAIT"
)

// EngineResult holds the output of the CanIBuyIt decision.
type EngineResult struct {
	CanBuy                bool
	PurchasingPower       int64               // cents; balance - obligations - safety_buffer
	BufferRemaining       int64               // cents; purchasing_power - item_price (may be negative)
	RiskLevel             RiskLevel
	WillAffordAfterPayday bool                // true when WAIT verdict applies
	WaitUntil             *time.Time          // non-nil only when RiskLevel == "WAIT"
	GoalImpacts           []GoalImpact        // projected per-goal impact of this purchase
	GoalsCoveredThisWindow []GoalWindowCoverage // goals whose min contribution is already met in current window
}

type GoalImpact struct {
	GoalID                        uuid.UUID
	GoalName                      string
	RemainingBefore               int64
	RemainingAfter                int64
	ProgressBeforePct             float64
	ProgressAfterPct              float64
	MinContributionPerWindowCents int64
	Severity                      string // "low" | "medium" | "high"
}

type GoalWindowCoverage struct {
	GoalID                        uuid.UUID
	GoalName                      string
	ContributedThisWindowCents    int64
	MinContributionPerWindowCents int64
}

// EngineService implements the CanIBuyIt decision engine.
type EngineService struct {
	accRepo        sqlite.AccountsRepo
	txnsRepo       sqlite.TransactionsRepo
	psRepo         sqlite.PayScheduleRepo
	peerDebtRepo   sqlite.PeerDebtRepo
	groupEventRepo sqlite.GroupEventRepo
	goalsRepo      sqlite.GoalsRepo
}

// NewEngineService creates a new EngineService.
func NewEngineService(
	accRepo sqlite.AccountsRepo,
	txnsRepo sqlite.TransactionsRepo,
	psRepo sqlite.PayScheduleRepo,
	peerDebtRepo sqlite.PeerDebtRepo,
	groupEventRepo sqlite.GroupEventRepo,
	goalsRepo sqlite.GoalsRepo,
) *EngineService {
	return &EngineService{
		accRepo:        accRepo,
		txnsRepo:       txnsRepo,
		psRepo:         psRepo,
		peerDebtRepo:   peerDebtRepo,
		groupEventRepo: groupEventRepo,
		goalsRepo:      goalsRepo,
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
//	next_occurrence < earliest_next_payday
//
// Due/overdue recurring transactions stay counted until confirmed.
// The union window approach uses the earliest next payday across all schedules.
// Must complete in under 100ms.
func (s *EngineService) CanIBuyIt(accountID uuid.UUID, itemPrice int64) (EngineResult, error) {
	in, err := s.loadInputs(accountID)
	if err != nil {
		return EngineResult{}, err
	}
	return evaluate(in, itemPrice), nil
}

// engineInputs is everything evaluate needs; gathered by loadInputs so evaluate stays pure.
type engineInputs struct {
	balance        int64 // cents
	safetyBuffer   int64 // cents
	obligations    int64 // cents; recurring + peer + group, all <= 0
	paydayAmount   int64 // cents; income at earliestPayday
	earliestPayday time.Time
	contributed    map[uuid.UUID]int64
	goals          []sqlite.Goal
}

func (s *EngineService) loadInputs(accountID uuid.UUID) (engineInputs, error) {
	acc, err := s.accRepo.GetByID(accountID)
	if err != nil {
		return engineInputs{}, fmt.Errorf("engine.CanIBuyIt: get account: %w", err)
	}

	schedules, err := s.psRepo.ListByAccountID(accountID)
	if err != nil {
		return engineInputs{}, fmt.Errorf("engine.CanIBuyIt: list pay schedules: %w", err)
	}
	if len(schedules) == 0 {
		return engineInputs{}, fmt.Errorf("engine.CanIBuyIt: %w", ErrPayScheduleRequired)
	}

	// Earliest next payday across all schedules (union window approach).
	now := time.Now().UTC()
	var earliestPayday time.Time
	var earliestSchedule sqlite.PaySchedule
	for i, ps := range schedules {
		ep := payday.PaySchedule{
			Frequency:   ps.Frequency,
			AnchorDate:  ps.AnchorDate,
			DayOfMonth2: ps.DayOfMonth2,
		}
		np := payday.NextPayday(ep, now)
		if i == 0 || np.Before(earliestPayday) {
			earliestPayday = np
			earliestSchedule = ps
		}
	}

	// Obligations due before earliest payday (includes overdue until confirmed).
	// All are stored as negative amounts (debits), so adding them reduces purchasing power.
	obligations, err := s.txnsRepo.SumUpcomingObligations(accountID, now, earliestPayday)
	if err != nil {
		return engineInputs{}, fmt.Errorf("engine.CanIBuyIt: sum obligations: %w", err)
	}
	peerObligations, err := s.peerDebtRepo.SumUpcomingPeerObligations(&accountID, now, earliestPayday)
	if err != nil {
		return engineInputs{}, fmt.Errorf("engine.CanIBuyIt: sum peer obligations: %w", err)
	}
	groupObligations, err := s.groupEventRepo.SumUpcomingAdminObligations(&accountID, now, earliestPayday)
	if err != nil {
		return engineInputs{}, fmt.Errorf("engine.CanIBuyIt: sum group obligations: %w", err)
	}

	goals, err := s.goalsRepo.GetGoalsByAccount(accountID)
	if err != nil {
		return engineInputs{}, fmt.Errorf("engine.CanIBuyIt: list goals: %w", err)
	}
	windowStart := previousPayday(earliestSchedule, now)
	contributed, err := s.goalContributionsInWindow(goals, windowStart, earliestPayday)
	if err != nil {
		return engineInputs{}, fmt.Errorf("engine.CanIBuyIt: load goal window contributions: %w", err)
	}

	return engineInputs{
		balance:        acc.CurrentBalance,
		safetyBuffer:   acc.SafetyBuffer,
		obligations:    obligations + peerObligations + groupObligations,
		paydayAmount:   earliestSchedule.Amount,
		earliestPayday: earliestPayday,
		contributed:    contributed,
		goals:          goals,
	}, nil
}

// evaluate is the pure decision: no repos, no clock.
func evaluate(in engineInputs, itemPrice int64) EngineResult {
	purchasingPower := in.balance + in.obligations - in.safetyBuffer
	bufferRemaining := purchasingPower - itemPrice
	goalImpacts, coveredGoals := buildGoalImpacts(in.goals, purchasingPower, bufferRemaining, in.contributed)

	result := EngineResult{
		CanBuy:                 purchasingPower >= itemPrice,
		PurchasingPower:        purchasingPower,
		BufferRemaining:        bufferRemaining,
		GoalImpacts:            goalImpacts,
		GoalsCoveredThisWindow: coveredGoals,
	}
	if result.CanBuy {
		result.RiskLevel = classifyRisk(bufferRemaining, in.safetyBuffer)
		return result
	}

	// Cannot buy now: WAIT if the earliest payday's income would cover it.
	result.RiskLevel = RiskBlocked
	result.WillAffordAfterPayday = purchasingPower+in.paydayAmount >= itemPrice
	if result.WillAffordAfterPayday {
		result.RiskLevel = RiskWait
		result.WaitUntil = &in.earliestPayday
	}
	return result
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
func buildGoalImpacts(goals []sqlite.Goal, purchasingPower, bufferRemaining int64, contributedThisWindow map[uuid.UUID]int64) ([]GoalImpact, []GoalWindowCoverage) {
	impacts := make([]GoalImpact, 0, len(goals))
	covered := make([]GoalWindowCoverage, 0, len(goals))
	for _, g := range goals {
		if g.Status != "active" && g.Status != "draft" {
			continue
		}
		if g.TargetAmountCents <= 0 || g.MinContributionPerWindowCents <= 0 {
			continue
		}
		remaining := g.TargetAmountCents - g.InvestedTotalCents
		if remaining <= 0 {
			continue
		}
		if contributedThisWindow[g.ID] >= g.MinContributionPerWindowCents {
			covered = append(covered, GoalWindowCoverage{
				GoalID:                        g.ID,
				GoalName:                      g.Name,
				ContributedThisWindowCents:    contributedThisWindow[g.ID],
				MinContributionPerWindowCents: g.MinContributionPerWindowCents,
			})
			continue
		}
		if bufferRemaining >= g.MinContributionPerWindowCents {
			continue
		}

		progress := (float64(g.InvestedTotalCents) / float64(g.TargetAmountCents)) * 100
		deficitAfter := g.MinContributionPerWindowCents - bufferRemaining
		severity := "low"
		if deficitAfter >= g.MinContributionPerWindowCents/2 {
			severity = "high"
		} else if deficitAfter >= g.MinContributionPerWindowCents/4 {
			severity = "medium"
		}
		if purchasingPower < g.MinContributionPerWindowCents {
			severity = "high"
		}

		impacts = append(impacts, GoalImpact{
			GoalID:                        g.ID,
			GoalName:                      g.Name,
			RemainingBefore:               remaining,
			RemainingAfter:                remaining,
			ProgressBeforePct:             progress,
			ProgressAfterPct:              progress,
			MinContributionPerWindowCents: g.MinContributionPerWindowCents,
			Severity:                      severity,
		})
	}
	return impacts, covered
}

func (s *EngineService) goalContributionsInWindow(goals []sqlite.Goal, windowStart, windowEnd time.Time) (map[uuid.UUID]int64, error) {
	out := make(map[uuid.UUID]int64, len(goals))
	for _, g := range goals {
		entries, err := s.goalsRepo.ListLedgerByGoal(g.ID)
		if err != nil {
			return nil, err
		}
		var sum int64
		for _, e := range entries {
			ts := e.TimestampUTC.UTC()
			if ts.Before(windowStart) || !ts.Before(windowEnd) {
				continue
			}
			switch e.Type {
			case "contribution", "adjustment":
				sum += e.AmountCents
			case "withdrawal":
				sum -= e.AmountCents
			}
		}
		if sum > 0 {
			out[g.ID] = sum
		}
	}
	return out, nil
}

func previousPayday(ps sqlite.PaySchedule, from time.Time) time.Time {
	ep := payday.PaySchedule{Frequency: ps.Frequency, AnchorDate: ps.AnchorDate, DayOfMonth2: ps.DayOfMonth2}
	curr := payday.NextPayday(ep, ps.AnchorDate.Add(-time.Second))
	if !curr.Before(from) {
		return curr
	}
	for i := 0; i < 1000; i++ {
		next := payday.NextPayday(ep, curr)
		if !next.Before(from) {
			return curr
		}
		curr = next
	}
	return curr
}

func classifyRisk(bufferRemaining, minThreshold int64) RiskLevel {
	if minThreshold == 0 {
		return RiskLow
	}
	if bufferRemaining < minThreshold/4 {
		return RiskHigh
	}
	if bufferRemaining < minThreshold/2 {
		return RiskMedium
	}
	return RiskLow
}
