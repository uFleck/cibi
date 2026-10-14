package sqlite_test

import (
	"database/sql"
	"testing"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

const peerDebtSchema = `
CREATE TABLE "Transaction" (
	id TEXT PRIMARY KEY,
	account_id TEXT NOT NULL,
	type TEXT NOT NULL DEFAULT 'personal',
	friend_id TEXT,
	amount INTEGER NOT NULL,
	description TEXT NOT NULL,
	timestamp TEXT NOT NULL,
	is_recurring BOOLEAN NOT NULL,
	frequency TEXT,
	anchor_date TEXT,
	next_occurrence TEXT,
	requires_confirmation BOOLEAN NOT NULL DEFAULT 0,
	confirmed_at TEXT,
	is_installment BOOLEAN NOT NULL DEFAULT FALSE,
	total_installments INTEGER,
	paid_installments INTEGER NOT NULL DEFAULT 0
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
			INSERT INTO "Transaction" (
				id, account_id, type, friend_id, amount, description, timestamp,
				is_recurring, frequency, anchor_date, is_installment,
				total_installments, paid_installments, requires_confirmation, confirmed_at
			) VALUES (?, ?, 'peer', ?, -1000, 'seed', '2026-01-01T00:00:00Z', 0, NULL, NULL, 0, NULL, 0, 1, NULL)
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

// TestPeerDebtRepo_GetBalanceByFriend_ExcludesConfirmed verifies that confirmed
// non-installment debts and fully-paid installment debts are excluded from balance.
func TestPeerDebtRepo_GetBalanceByFriend_ExcludesConfirmed(t *testing.T) {
	db := openSQLiteTestDB(t, peerDebtSchema)
	repo := sqlite.NewSqlitePeerDebtRepo(db)

	friendID := uuid.New()
	accountID := uuid.New()

	// Active non-installment debt (owed to user): +500 — should be included.
	_, err := db.Exec(`INSERT INTO "Transaction"
		(id, account_id, type, friend_id, amount, description, timestamp, is_recurring, is_installment, total_installments, paid_installments, frequency, anchor_date, requires_confirmation, confirmed_at)
		VALUES (?, ?, 'peer', ?, 500, 'active', '2026-01-01T00:00:00Z', 0, 0, NULL, 0, NULL, NULL, 1, NULL)`,
		uuid.New().String(), accountID.String(), friendID.String())
	requireNoErr(t, "insert active debt", err)

	// Confirmed non-installment debt: +1000 — must be EXCLUDED.
	_, err = db.Exec(`INSERT INTO "Transaction"
		(id, account_id, type, friend_id, amount, description, timestamp, is_recurring, is_installment, total_installments, paid_installments, frequency, anchor_date, requires_confirmation, confirmed_at)
		VALUES (?, ?, 'peer', ?, 1000, 'confirmed', '2026-01-01T00:00:00Z', 0, 0, NULL, 0, NULL, NULL, 1, '2026-01-01T00:00:00Z')`,
		uuid.New().String(), accountID.String(), friendID.String())
	requireNoErr(t, "insert confirmed debt", err)

	// Active installment debt (2 of 3 paid): +300 — should be included.
	// Installment remaining = amount/total*(total-paid) = 300/3*1 = 100.
	_, err = db.Exec(`INSERT INTO "Transaction"
		(id, account_id, type, friend_id, amount, description, timestamp, is_recurring, is_installment, total_installments, paid_installments, frequency, anchor_date, requires_confirmation, confirmed_at)
		VALUES (?, ?, 'peer', ?, 300, 'installment-active', '2026-01-01T00:00:00Z', 1, 1, 3, 2, 'monthly', '2026-01-01T00:00:00Z', 1, NULL)`,
		uuid.New().String(), accountID.String(), friendID.String())
	requireNoErr(t, "insert active installment", err)

	// Fully-paid installment debt: +300 — must be EXCLUDED.
	_, err = db.Exec(`INSERT INTO "Transaction"
		(id, account_id, type, friend_id, amount, description, timestamp, is_recurring, is_installment, total_installments, paid_installments, frequency, anchor_date, requires_confirmation, confirmed_at)
		VALUES (?, ?, 'peer', ?, 300, 'installment-done', '2026-01-01T00:00:00Z', 1, 1, 2, 2, 'monthly', '2026-01-01T00:00:00Z', 1, NULL)`,
		uuid.New().String(), accountID.String(), friendID.String())
	requireNoErr(t, "insert paid installment", err)

	balance, err := repo.GetBalanceByFriend(friendID, nil)
	requireNoErr(t, "GetBalanceByFriend", err)
	// Only active (500) + installment remainder (100) = 600 owed to user.
	requireI64(t, "FriendOwesUser", balance.FriendOwesUser, 600)
}

// TestPeerDebtRepo_GetGlobalBalance_ExcludesConfirmed mirrors the friend-balance
// filter test but through the global aggregate query.
func TestPeerDebtRepo_GetGlobalBalance_ExcludesConfirmed(t *testing.T) {
	db := openSQLiteTestDB(t, peerDebtSchema)
	repo := sqlite.NewSqlitePeerDebtRepo(db)

	friendID := uuid.New()
	accountID := uuid.New()

	// Active: +500.
	_, err := db.Exec(`INSERT INTO "Transaction"
		(id, account_id, type, friend_id, amount, description, timestamp, is_recurring, is_installment, total_installments, paid_installments, frequency, anchor_date, requires_confirmation, confirmed_at)
		VALUES (?, ?, 'peer', ?, 500, 'active', '2026-01-01T00:00:00Z', 0, 0, NULL, 0, NULL, NULL, 1, NULL)`,
		uuid.New().String(), accountID.String(), friendID.String())
	requireNoErr(t, "insert active", err)

	// Confirmed (paid): +1000 — must be EXCLUDED.
	_, err = db.Exec(`INSERT INTO "Transaction"
		(id, account_id, type, friend_id, amount, description, timestamp, is_recurring, is_installment, total_installments, paid_installments, frequency, anchor_date, requires_confirmation, confirmed_at)
		VALUES (?, ?, 'peer', ?, 1000, 'confirmed', '2026-01-01T00:00:00Z', 0, 0, NULL, 0, NULL, NULL, 1, '2026-01-01T00:00:00Z')`,
		uuid.New().String(), accountID.String(), friendID.String())
	requireNoErr(t, "insert confirmed", err)

	balance, err := repo.GetGlobalBalance(nil)
	requireNoErr(t, "GetGlobalBalance", err)
	requireI64(t, "TotalOwedToUser", balance.TotalOwedToUser, 500)
}
