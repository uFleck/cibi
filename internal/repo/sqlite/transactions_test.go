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
	next_occurrence TEXT
);
`

func TestSumUpcomingObligations_IncludesOverdueUntilConfirmed(t *testing.T) {
	db := openSQLiteTestDB(t, txnSchema)
	repo := sqlite.NewSqliteTxnsRepo(db)

	accountID := uuid.New()
	otherAccountID := uuid.New()
	now := time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC)
	nextPayday := time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)

	insert := func(accountID uuid.UUID, amount int64, recurring bool, nextOccurrence string) {
		_, err := db.Exec(
			`INSERT INTO "Transaction" (id, account_id, amount, description, category, timestamp, is_recurring, next_occurrence)
			 VALUES (?, ?, ?, 'x', 'x', '2026-04-01T00:00:00Z', ?, ?)`,
			uuid.New().String(), accountID.String(), amount, recurring, nextOccurrence,
		)
		requireNoErr(t, "insert txn", err)
	}

	// Must count: overdue + due today + upcoming before payday.
	insert(accountID, -1000, true, "2026-04-10T00:00:00Z")
	insert(accountID, -2000, true, "2026-04-15T00:00:00Z")
	insert(accountID, -3000, true, "2026-04-19T00:00:00Z")

	// Must NOT count.
	insert(accountID, -4000, true, "2026-04-20T00:00:00Z")      // payday day excluded
	insert(accountID, -5000, true, "2026-04-25T00:00:00Z")      // after payday
	insert(accountID, -6000, false, "2026-04-10T00:00:00Z")     // non-recurring
	insert(otherAccountID, -7000, true, "2026-04-10T00:00:00Z") // other account

	sum, err := repo.SumUpcomingObligations(accountID, now, nextPayday)
	requireNoErr(t, "sum obligations", err)
	requireI64(t, "sum", sum, -6000)
}
