package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upSettlementOrigin, downSettlementOrigin)
}

func upSettlementOrigin(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE "Transaction" ADD COLUMN origin TEXT;`,
		`ALTER TABLE "Transaction" ADD COLUMN source_id TEXT;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downSettlementOrigin(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE "Transaction" RENAME TO Transaction_old;`,
		`CREATE TABLE "Transaction" (
			id TEXT PRIMARY KEY,
			account_id TEXT REFERENCES Account(id),
			amount INTEGER,
			description TEXT,
			category TEXT,
			timestamp TEXT,
			is_recurring BOOLEAN,
			frequency TEXT,
			anchor_date TEXT,
			next_occurrence TEXT
		);`,
		`INSERT INTO "Transaction"
		 (id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence)
		 SELECT id, account_id, amount, description, category, timestamp, is_recurring, frequency, anchor_date, next_occurrence
		 FROM Transaction_old;`,
		`DROP TABLE Transaction_old;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
