package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upProfilePublicBaseURL, downProfilePublicBaseURL)
}

func upProfilePublicBaseURL(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx,
		`ALTER TABLE AccountProfile ADD COLUMN public_base_url TEXT`,
	)
	return err
}

func downProfilePublicBaseURL(ctx context.Context, tx *sql.Tx) error {
	// SQLite ALTER TABLE DROP COLUMN requires SQLite ≥ 3.35.
	// modernc/sqlite bundles ≥ 3.40 so this is safe.
	_, err := tx.ExecContext(ctx, `ALTER TABLE AccountProfile DROP COLUMN public_base_url`)
	return err
}
