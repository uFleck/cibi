package sqlite_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/ufleck/cibi/internal/repo/sqlite"
)

const txnSchema = `
CREATE TABLE "Transaction" (
	id TEXT PRIMARY KEY,
	account_id TEXT NOT NULL,
	amount INTEGER NOT NULL,
	description TEXT NOT NULL,
	category TEXT NOT NULL,
	timestamp TEXT NOT NULL,
	is_recurring BOOLEAN NOT NULL,
	frequency TEXT,
	anchor_date TEXT,
	next_occurrence TEXT,
	requires_confirmation BOOLEAN NOT NULL DEFAULT 0,
	confirmed_at TEXT
);
`

func TestSumUpcomingObligations_IncludesOverdueUntilConfirmed(t *testing.T) {
	db := openSQLiteTestDB(t, txnSchema)
	repo := sqlite.NewSqliteTxnsRepo(db)

	accountID := uuid.New()
	otherAccountID := uuid.New()
	now := time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC)
	nextPayday := time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)

	insertRecurring := func(accountID uuid.UUID, amount int64, nextOccurrence string) {
		_, err := db.Exec(
			`INSERT INTO "Transaction" (id, account_id, amount, description, category, timestamp, is_recurring, next_occurrence, requires_confirmation, confirmed_at)
			 VALUES (?, ?, ?, 'x', 'x', '2026-04-01T00:00:00Z', 1, ?, 0, NULL)`,
			uuid.New().String(), accountID.String(), amount, nextOccurrence,
		)
		requireNoErr(t, "insert recurring txn", err)
	}
	insertPending := func(accountID uuid.UUID, amount int64, timestamp string, anchorDate *string) {
		_, err := db.Exec(
			`INSERT INTO "Transaction" (id, account_id, amount, description, category, timestamp, is_recurring, anchor_date, requires_confirmation, confirmed_at)
			 VALUES (?, ?, ?, 'x', 'x', ?, 0, ?, 1, NULL)`,
			uuid.New().String(), accountID.String(), amount, timestamp, anchorDate,
		)
		requireNoErr(t, "insert pending txn", err)
	}

	// Must count: overdue + due today + upcoming before payday.
	insertRecurring(accountID, -1000, "2026-04-10T00:00:00Z")
	insertRecurring(accountID, -2000, "2026-04-15T00:00:00Z")
	insertRecurring(accountID, -3000, "2026-04-19T00:00:00Z")
	futureBeforePayday := "2026-04-18T00:00:00Z"
	insertPending(accountID, -2500, "2026-04-01T00:00:00Z", &futureBeforePayday)
	insertPending(accountID, -500, "2026-04-10T00:00:00Z", nil)

	// Must NOT count.
	insertRecurring(accountID, -4000, "2026-04-20T00:00:00Z") // payday day excluded
	insertRecurring(accountID, -5000, "2026-04-25T00:00:00Z") // after payday
	futureAfterPayday := "2026-04-25T00:00:00Z"
	insertPending(accountID, -6000, "2026-04-01T00:00:00Z", &futureAfterPayday) // pending date after payday
	insertPending(otherAccountID, -7000, "2026-04-10T00:00:00Z", nil)           // other account

	sum, err := repo.SumUpcomingObligations(accountID, now, nextPayday)
	requireNoErr(t, "sum obligations", err)
	requireI64(t, "sum", sum, -9000)
}
