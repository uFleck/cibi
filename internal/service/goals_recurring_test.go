package service_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type recurringRepo struct {
	mockGoalsRepo
	recurringByAccount []sqlite.GoalRecurringContribution
	recurringByID      sqlite.GoalRecurringContribution
	updateRecurring    sqlite.UpdateGoalRecurringContribution
}

func (m *recurringRepo) ListRecurringByAccount(accountID uuid.UUID) ([]sqlite.GoalRecurringContribution, error) {
	return m.recurringByAccount, nil
}
func (m *recurringRepo) GetRecurringByID(id uuid.UUID) (sqlite.GoalRecurringContribution, error) {
	return m.recurringByID, nil
}
func (m *recurringRepo) InsertRecurring(r sqlite.GoalRecurringContribution, tx *sql.Tx) error {
	return nil
}
func (m *recurringRepo) UpdateRecurring(id uuid.UUID, upd sqlite.UpdateGoalRecurringContribution, tx *sql.Tx) error {
	m.updateRecurring = upd
	return nil
}

func TestGoalsRecurring_ListDue_OverdueAndNoAutoPost(t *testing.T) {
	db := openTestDB(t)
	accountID := uuid.New()
	goalID := uuid.New()
	now := time.Date(2026, 4, 29, 12, 0, 0, 0, time.UTC)
	repo := &recurringRepo{mockGoalsRepo: mockGoalsRepo{goal: sqlite.Goal{ID: goalID, AccountID: accountID, Name: "Trip", TargetAmountCents: 100000, InvestedTotalCents: 1000, Status: "active"}}}
	repo.recurringByAccount = []sqlite.GoalRecurringContribution{
		{ID: uuid.New(), GoalID: goalID, AmountCents: 1000, Frequency: "monthly", AnchorDateUTC: now.AddDate(0, -2, 0), NextDueUTC: now.Add(-time.Hour), Active: true},
		{ID: uuid.New(), GoalID: goalID, AmountCents: 1000, Frequency: "monthly", AnchorDateUTC: now, NextDueUTC: now.Add(time.Hour), Active: true},
	}
	accRepo := newScopedAccountRepo(t, accountID, 100000, nil, nil)
	svc := service.NewGoalsService(db, repo, accRepo)

	out, err := svc.ListRecurringDue(accountID, now)
	if err != nil {
		t.Fatalf("ListRecurringDue: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("want 1 due item, got %d", len(out))
	}
	if !out[0].IsOverdue {
		t.Fatalf("expected overdue=true")
	}
	if repo.entry.ID != uuid.Nil {
		t.Fatalf("list should not post ledger entries")
	}
}

func TestGoalsRecurring_ConfirmDue_PostsRecurringAndAdvancesSinglePeriod(t *testing.T) {
	db := openTestDB(t)
	accountID := uuid.New()
	goalID := uuid.New()
	itemID := uuid.New()
	due := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	repo := &recurringRepo{mockGoalsRepo: mockGoalsRepo{goal: sqlite.Goal{ID: goalID, AccountID: accountID, TargetAmountCents: 100000, InvestedTotalCents: 1000, Status: "active"}}, recurringByID: sqlite.GoalRecurringContribution{ID: itemID, GoalID: goalID, AmountCents: 2000, Frequency: "monthly", NextDueUTC: due, Active: true}}
	accRepo := newScopedAccountRepo(t, accountID, 100000, nil, nil)
	svc := service.NewGoalsService(db, repo, accRepo)

	confirmAt := time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC)
	if err := svc.ConfirmRecurringDue(itemID, confirmAt); err != nil {
		t.Fatalf("ConfirmRecurringDue: %v", err)
	}
	if repo.entry.Source != "recurring" {
		t.Fatalf("want recurring source, got %s", repo.entry.Source)
	}
	wantNext := due.AddDate(0, 1, 0)
	if repo.updateRecurring.NextDueUTC == nil || !repo.updateRecurring.NextDueUTC.Equal(wantNext) {
		t.Fatalf("next due mismatch want=%s got=%v", wantNext, repo.updateRecurring.NextDueUTC)
	}
}
