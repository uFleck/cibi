package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upAccountSafetyBuffer, downAccountSafetyBuffer)
}

func upAccountSafetyBuffer(ctx context.Context, tx *sql.Tx) error {
	hasCol, err := hasAccountSafetyBufferColumn(ctx, tx)
	if err != nil {
		return err
	}
	if !hasCol {
		if _, err := tx.ExecContext(ctx, `ALTER TABLE Account ADD COLUMN safety_buffer INTEGER NOT NULL DEFAULT 1000`); err != nil {
			return err
		}
	}

	_, _ = tx.ExecContext(ctx, `
		UPDATE Account
		SET safety_buffer = COALESCE((SELECT min_threshold FROM SafetyBuffer LIMIT 1), 1000)
		WHERE safety_buffer IS NULL OR safety_buffer = 0
	`)

	_, _ = tx.ExecContext(ctx, `DROP TABLE IF EXISTS SafetyBuffer`)
	return nil
}

func hasAccountSafetyBufferColumn(ctx context.Context, tx *sql.Tx) (bool, error) {
	rows, err := tx.QueryContext(ctx, `PRAGMA table_info(Account)`)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return false, err
		}
		if name == "safety_buffer" {
			return true, nil
		}
	}
	return false, rows.Err()
}

func downAccountSafetyBuffer(ctx context.Context, tx *sql.Tx) error {
	_, _ = tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS SafetyBuffer (min_threshold INTEGER)`)
	return nil
}
