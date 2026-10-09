package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upGroupEventTransactions, downGroupEventTransactions)
}

func upGroupEventTransactions(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS GroupEventTransaction (
			id          TEXT PRIMARY KEY,
			event_id    TEXT NOT NULL REFERENCES GroupEvent(id) ON DELETE CASCADE,
			description TEXT NOT NULL,
			amount      INTEGER NOT NULL,
			created_at  TEXT NOT NULL DEFAULT (datetime('now'))
		);`,
		`CREATE INDEX IF NOT EXISTS idx_get_event_id ON GroupEventTransaction(event_id);`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downGroupEventTransactions(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP INDEX IF EXISTS idx_get_event_id;`,
		`DROP TABLE IF EXISTS GroupEventTransaction;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
