package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upAccountProfileSettings, downAccountProfileSettings)
}

func upAccountProfileSettings(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS AccountProfile (
	account_id    TEXT PRIMARY KEY REFERENCES Account(id) ON DELETE CASCADE,
	display_name  TEXT NOT NULL,
	pix_key       TEXT
);`,
		`INSERT INTO AccountProfile (account_id, display_name, pix_key)
		 SELECT a.id, COALESCE(u.display_name, 'Host'), u.pix_key
		 FROM Account a
		 LEFT JOIN UserProfile u ON u.id = 1
		 ON CONFLICT(account_id) DO NOTHING;`,
	}

	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downAccountProfileSettings(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `DROP TABLE IF EXISTS AccountProfile;`); err != nil {
		return err
	}
	return nil
}
