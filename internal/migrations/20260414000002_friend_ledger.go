package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upFriendLedger, downFriendLedger)
}

// upFriendLedger creates the Friend, PeerDebt, GroupEvent, and GroupEventParticipant tables.
func upFriendLedger(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS Friend (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    public_token TEXT NOT NULL UNIQUE,
    notes        TEXT
);`,
		`CREATE TABLE IF NOT EXISTS PeerDebt (
    id                 TEXT PRIMARY KEY,
    friend_id          TEXT NOT NULL REFERENCES Friend(id) ON DELETE CASCADE,
    amount             INTEGER NOT NULL,
    description        TEXT NOT NULL,
    date               TEXT NOT NULL,
    is_installment     BOOLEAN NOT NULL DEFAULT 0,
    total_installments INTEGER,
    paid_installments  INTEGER NOT NULL DEFAULT 0,
    frequency          TEXT,
    anchor_date        TEXT,
    is_confirmed       BOOLEAN NOT NULL DEFAULT 0
);`,
		`CREATE TABLE IF NOT EXISTS GroupEvent (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    date         TEXT NOT NULL,
    total_amount INTEGER NOT NULL,
    public_token TEXT NOT NULL UNIQUE,
    notes        TEXT
);`,
		`CREATE TABLE IF NOT EXISTS GroupEventParticipant (
    event_id     TEXT NOT NULL REFERENCES GroupEvent(id) ON DELETE CASCADE,
    friend_id    TEXT REFERENCES Friend(id),
    share_amount INTEGER NOT NULL,
    is_confirmed BOOLEAN NOT NULL DEFAULT 0
);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_gep_host
    ON GroupEventParticipant(event_id) WHERE friend_id IS NULL;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

// downFriendLedger drops all Friend Ledger tables in reverse order.
func downFriendLedger(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP INDEX IF EXISTS idx_gep_host;`,
		`DROP TABLE IF EXISTS GroupEventParticipant;`,
		`DROP TABLE IF EXISTS GroupEvent;`,
		`DROP TABLE IF EXISTS PeerDebt;`,
		`DROP TABLE IF EXISTS Friend;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
