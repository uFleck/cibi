package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upLedger, downLedger)
}

func upLedger(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS ledger (
			id              TEXT PRIMARY KEY,
			account_id      TEXT NOT NULL REFERENCES Account(id) ON DELETE CASCADE,
			transaction_id  TEXT REFERENCES "Transaction"(id),
			pay_schedule_id TEXT REFERENCES PaySchedule(id),
			entry_type      TEXT NOT NULL CHECK(entry_type IN (
				'payment', 'income', 'opening_balance', 'manual_adjustment'
			)),
			amount          INTEGER NOT NULL,
			description     TEXT NOT NULL,
			posted_at       TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_ledger_account_id ON ledger(account_id)`,
		`CREATE INDEX IF NOT EXISTS idx_ledger_posted_at  ON ledger(posted_at)`,
		`INSERT INTO ledger (id, account_id, entry_type, amount, description, posted_at)
		 SELECT lower(hex(randomblob(16))), id, 'opening_balance', current_balance,
		        'Opening balance', datetime('now')
		 FROM Account`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downLedger(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP INDEX IF EXISTS idx_ledger_posted_at`,
		`DROP INDEX IF EXISTS idx_ledger_account_id`,
		`DROP TABLE IF EXISTS ledger`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
