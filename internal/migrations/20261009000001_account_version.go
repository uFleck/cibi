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
	hasCol, err := hasAccountVersionColumn(ctx, tx)
	if err != nil {
		return err
	}
	if hasCol {
		return nil
	}
	_, err = tx.ExecContext(ctx,
		`ALTER TABLE Account ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
	)
	return err
}

func hasAccountVersionColumn(ctx context.Context, tx *sql.Tx) (bool, error) {
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
		if name == "version" {
			return true, nil
		}
	}
	return false, rows.Err()
}

func downAccountVersion(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `ALTER TABLE Account DROP COLUMN version`)
	return err
}
