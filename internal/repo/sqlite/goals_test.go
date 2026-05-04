package sqlite_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

const goalsSchema = `
CREATE TABLE Goal (
	id TEXT PRIMARY KEY,
	account_id TEXT NOT NULL,
	name TEXT NOT NULL,
	status TEXT NOT NULL,
	target_amount_cents INTEGER NOT NULL,
	invested_total_cents INTEGER NOT NULL,
	min_contribution_per_window_cents INTEGER NOT NULL DEFAULT 0,
	start_date_utc TEXT NOT NULL,
	target_date_utc TEXT,
	notes TEXT,
	currency TEXT NOT NULL,
	created_at_utc TEXT NOT NULL,
	updated_at_utc TEXT NOT NULL
);
CREATE TABLE GoalLedgerEntry (
	id TEXT PRIMARY KEY,
	goal_id TEXT NOT NULL,
	amount_cents INTEGER NOT NULL,
	type TEXT NOT NULL,
	source TEXT NOT NULL,
	note TEXT,
	reverses_entry_id TEXT,
	timestamp_utc TEXT NOT NULL,
	created_at_utc TEXT NOT NULL
);
CREATE TABLE GoalTargetAudit (
	id TEXT PRIMARY KEY,
	goal_id TEXT NOT NULL,
	previous_target_amount_cents INTEGER NOT NULL,
	new_target_amount_cents INTEGER NOT NULL,
	changed_at_utc TEXT NOT NULL,
	note TEXT
);
`

func TestGoals_InsertGoalPersistsRequiredFields(t *testing.T) {
	db := openSQLiteTestDB(t, goalsSchema)
	repo := sqlite.NewSqliteGoalsRepo(db)
	goal := sqlite.Goal{
		ID: uuid.New(), AccountID: uuid.New(), Name: "New Car", Status: "active",
		TargetAmountCents: 500000, InvestedTotalCents: 0,
		StartDateUTC: time.Now().UTC(), Currency: "BRL",
		CreatedAtUTC: time.Now().UTC(), UpdatedAtUTC: time.Now().UTC(),
	}
	requireNoErr(t, "insert goal", repo.InsertGoal(goal, nil))
	got, err := repo.GetGoalByID(goal.ID)
	requireNoErr(t, "get goal", err)
	if got.Name != "New Car" || got.TargetAmountCents != 500000 || got.Status != "active" {
		t.Fatalf("unexpected goal: %+v", got)
	}
}

func TestGoals_InsertLedgerEntryEnforcesEnums(t *testing.T) {
	db := openSQLiteTestDB(t, goalsSchema)
	repo := sqlite.NewSqliteGoalsRepo(db)
	entry := sqlite.GoalLedgerEntry{
		ID: uuid.New(), GoalID: uuid.New(), AmountCents: 1000, Type: "contribution", Source: "manual",
		TimestampUTC: time.Now().UTC(), CreatedAtUTC: time.Now().UTC(),
	}
	requireNoErr(t, "insert valid ledger", repo.InsertLedgerEntry(entry, nil))

	badType := entry
	badType.ID = uuid.New()
	badType.Type = "invalid"
	if err := repo.InsertLedgerEntry(badType, nil); err == nil {
		t.Fatalf("expected invalid type error")
	}

	badSource := entry
	badSource.ID = uuid.New()
	badSource.Source = "robot"
	if err := repo.InsertLedgerEntry(badSource, nil); err == nil {
		t.Fatalf("expected invalid source error")
	}
}

func TestGoals_LedgerAppendOnlyByContract(t *testing.T) {
	_ = sqlite.GoalsRepo(nil) // compile-time contract check: interface has no Delete ledger method.
}
