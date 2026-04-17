package sqlite_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

const groupEventSchema = `
CREATE TABLE Friend (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL
);
CREATE TABLE GroupEvent (
	id TEXT PRIMARY KEY,
	account_id TEXT,
	title TEXT NOT NULL,
	date TEXT NOT NULL,
	total_amount INTEGER NOT NULL,
	public_token TEXT NOT NULL,
	notes TEXT,
	host_friend_id TEXT
);
CREATE TABLE GroupEventParticipant (
	event_id TEXT NOT NULL,
	friend_id TEXT,
	share_amount INTEGER NOT NULL,
	is_confirmed INTEGER NOT NULL
);
`

func TestGroupEventRepo_GetAll_OptionalAccountFilter(t *testing.T) {
	db := openSQLiteTestDB(t, groupEventSchema)
	repo := sqlite.NewSqliteGroupEventRepo(db)

	accountA := uuid.New()
	accountB := uuid.New()

	_, err := db.Exec(`
		INSERT INTO GroupEvent (id, account_id, title, date, total_amount, public_token, notes, host_friend_id)
		VALUES
		  (?, ?, 'a1', '2026-01-01T00:00:00Z', 1000, 't1', NULL, NULL),
		  (?, ?, 'a2', '2026-01-02T00:00:00Z', 2000, 't2', NULL, NULL),
		  (?, ?, 'b1', '2026-01-03T00:00:00Z', 3000, 't3', NULL, NULL)
	`, uuid.New().String(), accountA.String(), uuid.New().String(), accountA.String(), uuid.New().String(), accountB.String())
	requireNoErr(t, "seed group events", err)

	assertOptionalAccountGetAllCounts(t, "GroupEvent.GetAll", repo.GetAll, accountA, 3, 2)
}

func TestGroupEventRepo_SumUpcomingAdminObligations_OptionalAccountFilter(t *testing.T) {
	db := openSQLiteTestDB(t, groupEventSchema)
	repo := sqlite.NewSqliteGroupEventRepo(db)

	accountA := uuid.New()
	accountB := uuid.New()
	host := uuid.New()
	eventA := uuid.New()
	eventB := uuid.New()

	_, err := db.Exec(`INSERT INTO Friend (id, name) VALUES (?, 'host')`, host.String())
	requireNoErr(t, "seed friend", err)

	_, err = db.Exec(`
		INSERT INTO GroupEvent (id, account_id, title, date, total_amount, public_token, notes, host_friend_id)
		VALUES
		  (?, ?, 'ea', '2026-01-10T00:00:00Z', 1000, 'ta', NULL, ?),
		  (?, ?, 'eb', '2026-01-11T00:00:00Z', 1000, 'tb', NULL, ?)
	`, eventA.String(), accountA.String(), host.String(), eventB.String(), accountB.String(), host.String())
	requireNoErr(t, "seed events", err)

	_, err = db.Exec(`
		INSERT INTO GroupEventParticipant (event_id, friend_id, share_amount, is_confirmed)
		VALUES
		  (?, NULL, 100, 0),
		  (?, NULL, 200, 0)
	`, eventA.String(), eventB.String())
	requireNoErr(t, "seed participants", err)

	after := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	onOrBefore := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)

	sumAll, err := repo.SumUpcomingAdminObligations(nil, after, onOrBefore)
	requireNoErr(t, "SumUpcomingAdminObligations(nil)", err)
	requireI64(t, "sum all", sumAll, -300)

	sumA, err := repo.SumUpcomingAdminObligations(&accountA, after, onOrBefore)
	requireNoErr(t, "SumUpcomingAdminObligations(&accountA)", err)
	requireI64(t, "sum accountA", sumA, -100)
}
