package sqlite_test

import (
	"database/sql"
	"testing"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	_ "modernc.org/sqlite"
)

func setupPeerDebtTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
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
	`)
	if err != nil {
		t.Fatalf("create schema: %v", err)
	}

	return db
}

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
		if err != nil {
			t.Fatalf("seed row: %v", err)
		}
	}
}

func TestPeerDebtRepo_GetAll_OptionalAccountFilter(t *testing.T) {
	db := setupPeerDebtTestDB(t)
	repo := sqlite.NewSqlitePeerDebtRepo(db)

	accountA := uuid.New()
	accountB := uuid.New()
	friendA := uuid.New()
	friendB := uuid.New()
	seedPeerDebtRows(t, db, accountA, accountB, friendA, friendB)

	all, err := repo.GetAll(nil)
	if err != nil {
		t.Fatalf("GetAll(nil): %v", err)
	}
	if got, want := len(all), 3; got != want {
		t.Fatalf("GetAll(nil) count = %d, want %d", got, want)
	}

	filtered, err := repo.GetAll(&accountA)
	if err != nil {
		t.Fatalf("GetAll(&accountA): %v", err)
	}
	if got, want := len(filtered), 2; got != want {
		t.Fatalf("GetAll(&accountA) count = %d, want %d", got, want)
	}
}

func TestPeerDebtRepo_GetByFriend_OptionalAccountFilter(t *testing.T) {
	db := setupPeerDebtTestDB(t)
	repo := sqlite.NewSqlitePeerDebtRepo(db)

	accountA := uuid.New()
	accountB := uuid.New()
	friendA := uuid.New()
	friendB := uuid.New()
	seedPeerDebtRows(t, db, accountA, accountB, friendA, friendB)

	allByFriend, err := repo.GetByFriend(friendA, nil)
	if err != nil {
		t.Fatalf("GetByFriend(friendA, nil): %v", err)
	}
	if got, want := len(allByFriend), 2; got != want {
		t.Fatalf("GetByFriend(friendA, nil) count = %d, want %d", got, want)
	}

	filteredByFriend, err := repo.GetByFriend(friendA, &accountB)
	if err != nil {
		t.Fatalf("GetByFriend(friendA, &accountB): %v", err)
	}
	if got, want := len(filteredByFriend), 1; got != want {
		t.Fatalf("GetByFriend(friendA, &accountB) count = %d, want %d", got, want)
	}
}
