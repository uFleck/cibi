package migrations

import (
	"context"
	"database/sql"
	"strings"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upPixKeys, downPixKeys)
}

func upPixKeys(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE UserProfile ADD COLUMN pix_key TEXT;`,
		`ALTER TABLE Friend ADD COLUMN pix_key TEXT;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			if strings.Contains(err.Error(), "duplicate column name") {
				continue
			}
			return err
		}
	}
	return nil
}

func downPixKeys(_ context.Context, _ *sql.Tx) error {
	// no-op: SQLite cannot drop columns easily.
	return nil
}
