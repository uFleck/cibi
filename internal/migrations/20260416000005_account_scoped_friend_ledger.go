package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upAccountScopedFriendLedger, downAccountScopedFriendLedger)
}

func upAccountScopedFriendLedger(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE PeerDebt ADD COLUMN account_id TEXT REFERENCES Account(id);`,
		`ALTER TABLE GroupEvent ADD COLUMN account_id TEXT REFERENCES Account(id);`,
		`UPDATE PeerDebt
		 SET account_id = COALESCE(
		   (SELECT id FROM Account WHERE is_default = 1 LIMIT 1),
		   (SELECT id FROM Account LIMIT 1)
		 )
		 WHERE account_id IS NULL;`,
		`UPDATE GroupEvent
		 SET account_id = COALESCE(
		   (SELECT id FROM Account WHERE is_default = 1 LIMIT 1),
		   (SELECT id FROM Account LIMIT 1)
		 )
		 WHERE account_id IS NULL;`,
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

func downAccountScopedFriendLedger(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP INDEX IF EXISTS idx_group_event_account_id;`,
		`DROP INDEX IF EXISTS idx_peer_debt_account_id;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
