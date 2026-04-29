package service_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

func TestGoalsTracking_DeterministicUrgencyOrdering(t *testing.T) {
	db := openTestDB(t)
	accID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	targetSoon := now.AddDate(0, 0, 5)
	targetSoon2 := now.AddDate(0, 0, 5)
	targetLater := now.AddDate(0, 0, 10)

	g1 := sqlite.Goal{ID: uuid.New(), AccountID: accID, Name: "same-day-bigger-gap", Status: "active", TargetAmountCents: 100000, InvestedTotalCents: 10000, TargetDateUTC: &targetSoon, CreatedAtUTC: now.Add(2 * time.Hour)}
	g2 := sqlite.Goal{ID: uuid.New(), AccountID: accID, Name: "same-day-smaller-gap", Status: "active", TargetAmountCents: 50000, InvestedTotalCents: 45000, TargetDateUTC: &targetSoon2, CreatedAtUTC: now.Add(1 * time.Hour)}
	g3 := sqlite.Goal{ID: uuid.New(), AccountID: accID, Name: "later-date", Status: "active", TargetAmountCents: 200000, InvestedTotalCents: 1000, TargetDateUTC: &targetLater, CreatedAtUTC: now}

	repo := &mockGoalsRepo{goal: g1}
	repo.getGoalsByAccountFn = func(accountID uuid.UUID) ([]sqlite.Goal, error) {
		return []sqlite.Goal{g3, g2, g1}, nil
	}
	repo.listLedgerByGoalFn = func(goalID uuid.UUID) ([]sqlite.GoalLedgerEntry, error) { return nil, nil }
	accRepo := newScopedAccountRepo(t, accID, 0, nil, nil)
	svc := service.NewGoalsService(db, repo, accRepo)

	out, err := svc.BuildTracking(accID)
	if err != nil {
		t.Fatalf("BuildTracking: %v", err)
	}
	if len(out.TopGoals) != 3 {
		t.Fatalf("want 3 top goals, got %d", len(out.TopGoals))
	}
	if out.TopGoals[0].Name != "same-day-bigger-gap" || out.TopGoals[1].Name != "same-day-smaller-gap" || out.TopGoals[2].Name != "later-date" {
		t.Fatalf("unexpected order: %#v", []string{out.TopGoals[0].Name, out.TopGoals[1].Name, out.TopGoals[2].Name})
	}
}

func TestGoalsTracking_TopGoalsCappedAtFive(t *testing.T) {
	db := openTestDB(t)
	accID := uuid.New()
	now := time.Now().UTC()

	goals := make([]sqlite.Goal, 0, 6)
	for i := 0; i < 6; i++ {
		td := now.AddDate(0, 0, i+1)
		goals = append(goals, sqlite.Goal{
			ID:                 uuid.New(),
			AccountID:          accID,
			Name:               "goal",
			Status:             "active",
			TargetAmountCents:  10000,
			InvestedTotalCents: int64(i) * 100,
			TargetDateUTC:      &td,
			CreatedAtUTC:       now.Add(time.Duration(i) * time.Minute),
		})
	}

	repo := &mockGoalsRepo{goal: goals[0]}
	repo.getGoalsByAccountFn = func(accountID uuid.UUID) ([]sqlite.Goal, error) { return goals, nil }
	repo.listLedgerByGoalFn = func(goalID uuid.UUID) ([]sqlite.GoalLedgerEntry, error) { return nil, nil }
	accRepo := newScopedAccountRepo(t, accID, 0, nil, nil)
	svc := service.NewGoalsService(db, repo, accRepo)

	out, err := svc.BuildTracking(accID)
	if err != nil {
		t.Fatalf("BuildTracking: %v", err)
	}
	if len(out.TopGoals) != 5 {
		t.Fatalf("want top goals len=5, got %d", len(out.TopGoals))
	}
	if out.UpdatedAtUTC == "" {
		t.Fatalf("updated_at_utc should be set")
	}
}

var _ *sql.DB
