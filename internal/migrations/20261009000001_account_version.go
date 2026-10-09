package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upAccountVersion, downAccountVersion)
}

func upAccountVersion(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx,
		`ALTER TABLE Account ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
	)
	return err
}

func downAccountVersion(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `ALTER TABLE Account DROP COLUMN version`)
	return err
}
