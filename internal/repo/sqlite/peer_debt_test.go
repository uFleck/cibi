package sqlite_test

import (
	"database/sql"
	"testing"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

const peerDebtSchema = `
CREATE TABLE PeerDebt (
	id TEXT PRIMARY KEY,
	account_id TEXT,
	friend_id TEXT NOT NULL,
	amount INTEGER NOT NULL,
	description TEXT NOT NULL,
	date TEXT NOT NULL,
	is_installment INTEGER NOT NULL,
	total_installments INTEGER,
	paid_installments INTEGER NOT NULL DEFAULT 0,
	frequency TEXT,
	anchor_date TEXT,
	is_confirmed INTEGER NOT NULL DEFAULT 0
);
`

func seedPeerDebtRows(t *testing.T, db *sql.DB, accountA, accountB, friendA, friendB uuid.UUID) {
	t.Helper()
	rows := []struct {
		id        uuid.UUID
		accountID uuid.UUID
		friendID  uuid.UUID
	}{
		{uuid.New(), accountA, friendA},
		{uuid.New(), accountA, friendB},
		{uuid.New(), accountB, friendA},
	}

	for _, r := range rows {
		_, err := db.Exec(`
			INSERT INTO PeerDebt (
				id, account_id, friend_id, amount, description, date,
				is_installment, total_installments, paid_installments,
				frequency, anchor_date, is_confirmed
			) VALUES (?, ?, ?, -1000, 'seed', '2026-01-01T00:00:00Z', 0, NULL, 0, NULL, NULL, 0)
		`, r.id.String(), r.accountID.String(), r.friendID.String())
		requireNoErr(t, "seed row", err)
	}
}

func TestPeerDebtRepo_GetAll_OptionalAccountFilter(t *testing.T) {
	db := openSQLiteTestDB(t, peerDebtSchema)
	repo := sqlite.NewSqlitePeerDebtRepo(db)

	accountA := uuid.New()
	accountB := uuid.New()
	friendA := uuid.New()
	friendB := uuid.New()
	seedPeerDebtRows(t, db, accountA, accountB, friendA, friendB)

	assertOptionalAccountGetAllCounts(t, "PeerDebt.GetAll", repo.GetAll, accountA, 3, 2)
}

func TestPeerDebtRepo_GetByFriend_OptionalAccountFilter(t *testing.T) {
	db := openSQLiteTestDB(t, peerDebtSchema)
	repo := sqlite.NewSqlitePeerDebtRepo(db)

	accountA := uuid.New()
	accountB := uuid.New()
	friendA := uuid.New()
	friendB := uuid.New()
	seedPeerDebtRows(t, db, accountA, accountB, friendA, friendB)

	allByFriend, err := repo.GetByFriend(friendA, nil)
	requireNoErr(t, "GetByFriend(friendA, nil)", err)
	requireLen(t, "GetByFriend(friendA, nil)", len(allByFriend), 2)

	filteredByFriend, err := repo.GetByFriend(friendA, &accountB)
	requireNoErr(t, "GetByFriend(friendA, &accountB)", err)
	requireLen(t, "GetByFriend(friendA, &accountB)", len(filteredByFriend), 1)
}
