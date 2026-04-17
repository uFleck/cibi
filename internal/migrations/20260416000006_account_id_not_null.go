package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upAccountIDNotNull, downAccountIDNotNull)
}

// ADD NOT NULL account_id enforcement for PeerDebt and GroupEvent.
func upAccountIDNotNull(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP INDEX IF EXISTS idx_gep_host;`,
		`DROP INDEX IF EXISTS idx_peer_debt_account_id;`,
		`DROP INDEX IF EXISTS idx_group_event_account_id;`,

		`ALTER TABLE PeerDebt RENAME TO PeerDebt_old;`,
		`CREATE TABLE PeerDebt (
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
			is_confirmed       BOOLEAN NOT NULL DEFAULT 0,
			account_id         TEXT NOT NULL REFERENCES Account(id)
		);`,
		`INSERT INTO PeerDebt (
			id, friend_id, amount, description, date,
			is_installment, total_installments, paid_installments,
			frequency, anchor_date, is_confirmed, account_id
		)
		SELECT
			id, friend_id, amount, description, date,
			is_installment, total_installments, paid_installments,
			frequency, anchor_date, is_confirmed, account_id
		FROM PeerDebt_old;`,
		`DROP TABLE PeerDebt_old;`,

		`ALTER TABLE GroupEventParticipant RENAME TO GroupEventParticipant_old;`,
		`ALTER TABLE GroupEvent RENAME TO GroupEvent_old;`,
		`CREATE TABLE GroupEvent (
			id             TEXT PRIMARY KEY,
			title          TEXT NOT NULL,
			date           TEXT NOT NULL,
			total_amount   INTEGER NOT NULL,
			public_token   TEXT NOT NULL UNIQUE,
			notes          TEXT,
			host_friend_id TEXT REFERENCES Friend(id),
			account_id     TEXT NOT NULL REFERENCES Account(id)
		);`,
		`INSERT INTO GroupEvent (
			id, title, date, total_amount, public_token, notes, host_friend_id, account_id
		)
		SELECT
			id, title, date, total_amount, public_token, notes, host_friend_id, account_id
		FROM GroupEvent_old;`,
		`CREATE TABLE GroupEventParticipant (
			event_id     TEXT NOT NULL REFERENCES GroupEvent(id) ON DELETE CASCADE,
			friend_id    TEXT REFERENCES Friend(id),
			share_amount INTEGER NOT NULL,
			is_confirmed BOOLEAN NOT NULL DEFAULT 0
		);`,
		`INSERT INTO GroupEventParticipant (event_id, friend_id, share_amount, is_confirmed)
		 SELECT event_id, friend_id, share_amount, is_confirmed FROM GroupEventParticipant_old;`,
		`DROP TABLE GroupEventParticipant_old;`,
		`DROP TABLE GroupEvent_old;`,

		`CREATE UNIQUE INDEX IF NOT EXISTS idx_gep_host ON GroupEventParticipant(event_id) WHERE friend_id IS NULL;`,
		`CREATE INDEX IF NOT EXISTS idx_peer_debt_account_id ON PeerDebt(account_id);`,
		`CREATE INDEX IF NOT EXISTS idx_group_event_account_id ON GroupEvent(account_id);`,
	}

	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downAccountIDNotNull(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP INDEX IF EXISTS idx_gep_host;`,
		`DROP INDEX IF EXISTS idx_peer_debt_account_id;`,
		`DROP INDEX IF EXISTS idx_group_event_account_id;`,

		`ALTER TABLE PeerDebt RENAME TO PeerDebt_new;`,
		`CREATE TABLE PeerDebt (
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
			is_confirmed       BOOLEAN NOT NULL DEFAULT 0,
			account_id         TEXT REFERENCES Account(id)
		);`,
		`INSERT INTO PeerDebt (
			id, friend_id, amount, description, date,
			is_installment, total_installments, paid_installments,
			frequency, anchor_date, is_confirmed, account_id
		)
		SELECT
			id, friend_id, amount, description, date,
			is_installment, total_installments, paid_installments,
			frequency, anchor_date, is_confirmed, account_id
		FROM PeerDebt_new;`,
		`DROP TABLE PeerDebt_new;`,

		`ALTER TABLE GroupEventParticipant RENAME TO GroupEventParticipant_new;`,
		`ALTER TABLE GroupEvent RENAME TO GroupEvent_new;`,
		`CREATE TABLE GroupEvent (
			id             TEXT PRIMARY KEY,
			title          TEXT NOT NULL,
			date           TEXT NOT NULL,
			total_amount   INTEGER NOT NULL,
			public_token   TEXT NOT NULL UNIQUE,
			notes          TEXT,
			host_friend_id TEXT REFERENCES Friend(id),
			account_id     TEXT REFERENCES Account(id)
		);`,
		`INSERT INTO GroupEvent (
			id, title, date, total_amount, public_token, notes, host_friend_id, account_id
		)
		SELECT
			id, title, date, total_amount, public_token, notes, host_friend_id, account_id
		FROM GroupEvent_new;`,
		`CREATE TABLE GroupEventParticipant (
			event_id     TEXT NOT NULL REFERENCES GroupEvent(id) ON DELETE CASCADE,
			friend_id    TEXT REFERENCES Friend(id),
			share_amount INTEGER NOT NULL,
			is_confirmed BOOLEAN NOT NULL DEFAULT 0
		);`,
		`INSERT INTO GroupEventParticipant (event_id, friend_id, share_amount, is_confirmed)
		 SELECT event_id, friend_id, share_amount, is_confirmed FROM GroupEventParticipant_new;`,
		`DROP TABLE GroupEventParticipant_new;`,
		`DROP TABLE GroupEvent_new;`,

		`CREATE UNIQUE INDEX IF NOT EXISTS idx_gep_host ON GroupEventParticipant(event_id) WHERE friend_id IS NULL;`,
		`CREATE INDEX IF NOT EXISTS idx_peer_debt_account_id ON PeerDebt(account_id);`,
		`CREATE INDEX IF NOT EXISTS idx_group_event_account_id ON GroupEvent(account_id);`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
