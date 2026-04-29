package service_test

import (
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type mockGoalsRepo struct {
	goal                sqlite.Goal
	entry               sqlite.GoalLedgerEntry
	insertLedgerFn      func(e sqlite.GoalLedgerEntry, tx *sql.Tx) error
	updateGoalFn        func(id uuid.UUID, upd sqlite.UpdateGoal, tx *sql.Tx) error
	getGoalsByAccountFn func(accountID uuid.UUID) ([]sqlite.Goal, error)
	listLedgerByGoalFn  func(goalID uuid.UUID) ([]sqlite.GoalLedgerEntry, error)
}

func (m *mockGoalsRepo) InsertGoal(g sqlite.Goal, tx *sql.Tx) error { m.goal = g; return nil }
func (m *mockGoalsRepo) GetGoalsByAccount(accountID uuid.UUID) ([]sqlite.Goal, error) {
	if m.getGoalsByAccountFn != nil {
		return m.getGoalsByAccountFn(accountID)
	}
	return []sqlite.Goal{m.goal}, nil
}
func (m *mockGoalsRepo) GetGoalByID(id uuid.UUID) (sqlite.Goal, error) { return m.goal, nil }
func (m *mockGoalsRepo) UpdateGoal(id uuid.UUID, upd sqlite.UpdateGoal, tx *sql.Tx) error {
	if m.updateGoalFn != nil {
		return m.updateGoalFn(id, upd, tx)
	}
	if upd.InvestedTotalCents != nil {
		m.goal.InvestedTotalCents = *upd.InvestedTotalCents
	}
	if upd.Status != nil {
		m.goal.Status = *upd.Status
	}
	if upd.TargetAmountCents != nil {
		m.goal.TargetAmountCents = *upd.TargetAmountCents
	}
	return nil
}
func (m *mockGoalsRepo) InsertLedgerEntry(e sqlite.GoalLedgerEntry, tx *sql.Tx) error {
	m.entry = e
	if m.insertLedgerFn != nil {
		return m.insertLedgerFn(e, tx)
	}
	return nil
}
func (m *mockGoalsRepo) ListLedgerByGoal(goalID uuid.UUID) ([]sqlite.GoalLedgerEntry, error) {
	if m.listLedgerByGoalFn != nil {
		return m.listLedgerByGoalFn(goalID)
	}
	return []sqlite.GoalLedgerEntry{m.entry}, nil
}
func (m *mockGoalsRepo) GetLedgerEntryByID(id uuid.UUID) (sqlite.GoalLedgerEntry, error) {
	return m.entry, nil
}
func (m *mockGoalsRepo) AddTargetAudit(a sqlite.GoalTargetAudit, tx *sql.Tx) error { return nil }

func TestGoals_AddLedgerEntry_ContributionDebitsBalanceAtomically(t *testing.T) {
	db := openTestDB(t)
	goalID, accID := uuid.New(), uuid.New()
	repo := &mockGoalsRepo{goal: sqlite.Goal{ID: goalID, AccountID: accID, TargetAmountCents: 10000, InvestedTotalCents: 0, Status: "active"}}
	var newBal int64
	accRepo := newScopedAccountRepo(t, accID, 5000, &newBal, nil)
	svc := service.NewGoalsService(db, repo, accRepo)
	_, err := svc.AddLedgerEntry(service.AddGoalLedgerInput{GoalID: goalID, Amount: 10, Type: "contribution", Source: "manual", TimestampUTC: time.Now().UTC()})
	if err != nil {
		t.Fatalf("AddLedgerEntry: %v", err)
	}
	if newBal != 4000 {
		t.Fatalf("want 4000 got %d", newBal)
	}
}

func TestGoals_AddLedgerEntry_WithdrawalCreditsBalance(t *testing.T) {
	db := openTestDB(t)
	goalID, accID := uuid.New(), uuid.New()
	repo := &mockGoalsRepo{goal: sqlite.Goal{ID: goalID, AccountID: accID, TargetAmountCents: 10000, InvestedTotalCents: 2000, Status: "active"}}
	var newBal int64
	accRepo := newScopedAccountRepo(t, accID, 1000, &newBal, nil)
	svc := service.NewGoalsService(db, repo, accRepo)
	_, err := svc.AddLedgerEntry(service.AddGoalLedgerInput{GoalID: goalID, Amount: 5, Type: "withdrawal", Source: "manual", TimestampUTC: time.Now().UTC()})
	if err != nil {
		t.Fatalf("AddLedgerEntry: %v", err)
	}
	if newBal != 1500 {
		t.Fatalf("want 1500 got %d", newBal)
	}
}

func TestGoals_AddLedgerEntry_InsufficientFunds(t *testing.T) {
	db := openTestDB(t)
	goalID, accID := uuid.New(), uuid.New()
	repo := &mockGoalsRepo{goal: sqlite.Goal{ID: goalID, AccountID: accID, TargetAmountCents: 10000, InvestedTotalCents: 0, Status: "active"}}
	accRepo := newScopedAccountRepo(t, accID, 300, nil, nil)
	svc := service.NewGoalsService(db, repo, accRepo)
	_, err := svc.AddLedgerEntry(service.AddGoalLedgerInput{GoalID: goalID, Amount: 10, Type: "contribution", Source: "manual", TimestampUTC: time.Now().UTC()})
	if err == nil || !strings.Contains(err.Error(), "insufficient") {
		t.Fatalf("expected insufficient funds, got %v", err)
	}
}

func TestGoals_AddLedgerEntry_AutoCompletesOnTarget(t *testing.T) {
	db := openTestDB(t)
	goalID, accID := uuid.New(), uuid.New()
	repo := &mockGoalsRepo{goal: sqlite.Goal{ID: goalID, AccountID: accID, TargetAmountCents: 1000, InvestedTotalCents: 900, Status: "active"}}
	accRepo := newScopedAccountRepo(t, accID, 5000, nil, nil)
	svc := service.NewGoalsService(db, repo, accRepo)
	_, err := svc.AddLedgerEntry(service.AddGoalLedgerInput{GoalID: goalID, Amount: 1, Type: "contribution", Source: "manual", TimestampUTC: time.Now().UTC()})
	if err != nil {
		t.Fatalf("AddLedgerEntry: %v", err)
	}
	if repo.goal.Status != "completed" {
		t.Fatalf("want completed got %s", repo.goal.Status)
	}
}

func TestGoals_UpdateTarget_AuditsAndRecomputesStatus(t *testing.T) {
	db := openTestDB(t)
	goalID, accID := uuid.New(), uuid.New()
	repo := &mockGoalsRepo{goal: sqlite.Goal{ID: goalID, AccountID: accID, TargetAmountCents: 1000, InvestedTotalCents: 900, Status: "active"}}
	accRepo := newScopedAccountRepo(t, accID, 5000, nil, nil)
	svc := service.NewGoalsService(db, repo, accRepo)
	v := 8.0
	if err := svc.UpdateGoal(goalID, service.UpdateGoalInput{TargetAmount: &v}); err != nil {
		t.Fatalf("UpdateGoal: %v", err)
	}
	if repo.goal.Status != "completed" {
		t.Fatalf("want completed got %s", repo.goal.Status)
	}
}
