package service

import (
	"database/sql"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

type GoalsService struct {
	db      *sql.DB
	goals   sqlite.GoalsRepo
	accRepo sqlite.AccountsRepo
}

func NewGoalsService(db *sql.DB, goals sqlite.GoalsRepo, accRepo sqlite.AccountsRepo) *GoalsService {
	return &GoalsService{db: db, goals: goals, accRepo: accRepo}
}

type CreateGoalInput struct {
	AccountID                    uuid.UUID
	Name                         string
	TargetAmount                 float64
	MinContributionPerWindow     float64
	StartDateUTC                 time.Time
	TargetDateUTC                *time.Time
	Notes                        *string
}

type UpdateGoalInput struct {
	Name                         *string
	TargetAmount                 *float64
	TargetDateUTC                *time.Time
	Notes                        *string
	MinContributionPerWindow     *float64
}

type AddGoalLedgerInput struct {
	GoalID       uuid.UUID
	Amount       float64
	Type         string
	Source       string
	TimestampUTC time.Time
	Note         *string
}

func toCents(v float64) int64 { return int64(math.Round(v * 100)) }

func (s *GoalsService) CreateGoal(in CreateGoalInput) (sqlite.Goal, error) {
	acc, err := s.accRepo.GetByID(in.AccountID)
	if err != nil {
		return sqlite.Goal{}, fmt.Errorf("goals.CreateGoal: get account: %w", err)
	}
	now := time.Now().UTC()
	goal := sqlite.Goal{ID: uuid.New(), AccountID: in.AccountID, Name: in.Name, Status: "active", TargetAmountCents: toCents(in.TargetAmount), InvestedTotalCents: 0, MinContributionPerWindowCents: toCents(in.MinContributionPerWindow), StartDateUTC: in.StartDateUTC.UTC(), TargetDateUTC: in.TargetDateUTC, Notes: in.Notes, Currency: acc.Currency, CreatedAtUTC: now, UpdatedAtUTC: now}
	if goal.TargetAmountCents <= 0 {
		return sqlite.Goal{}, fmt.Errorf("validation: target amount must be > 0")
	}
	if err := s.goals.InsertGoal(goal, nil); err != nil {
		return sqlite.Goal{}, err
	}
	return goal, nil
}

func (s *GoalsService) ListGoals(accountID uuid.UUID) ([]sqlite.Goal, error) {
	return s.goals.GetGoalsByAccount(accountID)
}

func (s *GoalsService) UpdateGoal(goalID uuid.UUID, in UpdateGoalInput) error {
	goal, err := s.goals.GetGoalByID(goalID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	upd := sqlite.UpdateGoal{Name: in.Name, TargetDateUTC: in.TargetDateUTC, Notes: in.Notes, UpdatedAtUTC: &now}
	if in.MinContributionPerWindow != nil {
		minContributionCents := toCents(*in.MinContributionPerWindow)
		if minContributionCents < 0 {
			return fmt.Errorf("validation: min contribution per window must be >= 0")
		}
		upd.MinContributionPerWindowCents = &minContributionCents
	}
	if in.TargetAmount != nil {
		newTarget := toCents(*in.TargetAmount)
		if newTarget <= 0 {
			return fmt.Errorf("validation: target amount must be > 0")
		}
		upd.TargetAmountCents = &newTarget
		if goal.InvestedTotalCents >= newTarget {
			status := "completed"
			upd.Status = &status
		} else {
			status := "active"
			upd.Status = &status
		}
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		if err := s.goals.UpdateGoal(goalID, upd, tx); err != nil {
			return err
		}
		if err := s.goals.AddTargetAudit(sqlite.GoalTargetAudit{ID: uuid.New(), GoalID: goalID, PreviousTargetAmountCents: goal.TargetAmountCents, NewTargetAmountCents: newTarget, ChangedAtUTC: now}, tx); err != nil {
			return err
		}
		return tx.Commit()
	}
	return s.goals.UpdateGoal(goalID, upd, nil)
}

func (s *GoalsService) AddLedgerEntry(in AddGoalLedgerInput) (sqlite.GoalLedgerEntry, error) {
	goal, err := s.goals.GetGoalByID(in.GoalID)
	if err != nil {
		return sqlite.GoalLedgerEntry{}, err
	}
	acc, err := s.accRepo.GetByID(goal.AccountID)
	if err != nil {
		return sqlite.GoalLedgerEntry{}, err
	}
	amountCents := toCents(in.Amount)
	if amountCents <= 0 {
		return sqlite.GoalLedgerEntry{}, fmt.Errorf("validation: amount must be > 0")
	}
	if in.Source == "" {
		in.Source = "manual"
	}
	if in.TimestampUTC.IsZero() {
		in.TimestampUTC = time.Now().UTC()
	}

	balanceDelta := int64(0)
	investDelta := int64(0)
	switch in.Type {
	case "contribution":
		balanceDelta = -amountCents
		investDelta = amountCents
		if acc.CurrentBalance < amountCents {
			return sqlite.GoalLedgerEntry{}, fmt.Errorf("insufficient funds")
		}
	case "withdrawal":
		balanceDelta = amountCents
		investDelta = -amountCents
	case "adjustment":
		investDelta = amountCents
	default:
		return sqlite.GoalLedgerEntry{}, fmt.Errorf("validation: invalid type")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return sqlite.GoalLedgerEntry{}, err
	}
	defer tx.Rollback()

	entry := sqlite.GoalLedgerEntry{ID: uuid.New(), GoalID: in.GoalID, AmountCents: amountCents, Type: in.Type, Source: in.Source, Note: in.Note, TimestampUTC: in.TimestampUTC.UTC(), CreatedAtUTC: time.Now().UTC()}
	if err := s.goals.InsertLedgerEntry(entry, tx); err != nil {
		return sqlite.GoalLedgerEntry{}, err
	}
	if balanceDelta != 0 {
		if err := s.accRepo.UpdateBalance(goal.AccountID, acc.CurrentBalance+balanceDelta, tx); err != nil {
			return sqlite.GoalLedgerEntry{}, err
		}
	}
	newInvested := goal.InvestedTotalCents + investDelta
	status := goal.Status
	if newInvested >= goal.TargetAmountCents {
		status = "completed"
	} else if status == "completed" {
		status = "active"
	}
	now := time.Now().UTC()
	if err := s.goals.UpdateGoal(goal.ID, sqlite.UpdateGoal{InvestedTotalCents: &newInvested, Status: &status, UpdatedAtUTC: &now}, tx); err != nil {
		return sqlite.GoalLedgerEntry{}, err
	}
	if err := tx.Commit(); err != nil {
		return sqlite.GoalLedgerEntry{}, err
	}
	return entry, nil
}

func (s *GoalsService) ReverseLedgerEntry(goalID, entryID uuid.UUID, note *string) (sqlite.GoalLedgerEntry, error) {
	orig, err := s.goals.GetLedgerEntryByID(entryID)
	if err != nil {
		return sqlite.GoalLedgerEntry{}, err
	}
	reverseType := "adjustment"
	entry, err := s.AddLedgerEntry(AddGoalLedgerInput{GoalID: goalID, Amount: float64(orig.AmountCents) / 100, Type: reverseType, Source: "system", Note: note, TimestampUTC: time.Now().UTC()})
	if err != nil {
		return sqlite.GoalLedgerEntry{}, err
	}
	return entry, nil
}

func (s *GoalsService) ListLedger(goalID uuid.UUID) ([]sqlite.GoalLedgerEntry, error) {
	return s.goals.ListLedgerByGoal(goalID)
}
