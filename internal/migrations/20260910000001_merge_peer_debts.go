package migrations

import (
	"context"
	"database/sql"
	"strings"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upMergePeerDebts, downMergePeerDebts)
}

func upMergePeerDebts(ctx context.Context, tx *sql.Tx) error {
	// execIgnoreDup runs a query and ignores "duplicate column" errors, which
	// SQLite raises when ADD COLUMN is applied to a column that already exists.
	// All other errors are returned as-is.
	execIgnoreDup := func(q string) error {
		_, err := tx.ExecContext(ctx, q)
		if err != nil && strings.Contains(err.Error(), "duplicate column") {
			return nil
		}
		return err
	}

	// Step 1: Ensure requires_confirmation and confirmed_at exist on Transaction.
	// These columns may or may not exist depending on the deployment history.
	// Using ADD COLUMN with a safe default so existing rows are unaffected.
	if err := execIgnoreDup(`ALTER TABLE "Transaction" ADD COLUMN requires_confirmation BOOLEAN NOT NULL DEFAULT 0`); err != nil {
		return err
	}
	if err := execIgnoreDup(`ALTER TABLE "Transaction" ADD COLUMN confirmed_at TEXT`); err != nil {
		return err
	}

	queries := []string{
		// 2. Backup peer_debts before any structural changes.
		`CREATE TABLE peer_debts_backup AS SELECT * FROM PeerDebt`,

		// 3. Add type and friend_id columns to Transaction.
		`ALTER TABLE "Transaction" ADD COLUMN type TEXT NOT NULL DEFAULT 'personal'`,
		`ALTER TABLE "Transaction" ADD COLUMN friend_id TEXT REFERENCES Friend(id)`,

		// 4. Drop category column from Transaction.
		// SQLite >= 3.35.0 supports DROP COLUMN directly.
		`ALTER TABLE "Transaction" DROP COLUMN category`,

		// 5. Copy all PeerDebt rows into Transaction as type='peer'.
		`INSERT INTO "Transaction" (
			id, account_id, type, friend_id,
			amount, description, timestamp,
			is_recurring, frequency, anchor_date, next_occurrence,
			is_installment, total_installments, paid_installments,
			requires_confirmation, confirmed_at
		)
		SELECT
			id,
			account_id,
			'peer' AS type,
			friend_id,
			amount,
			description,
			date AS timestamp,
			CASE WHEN frequency IS NOT NULL THEN 1 ELSE 0 END AS is_recurring,
			frequency,
			anchor_date,
			NULL AS next_occurrence,
			is_installment,
			total_installments,
			paid_installments,
			1 AS requires_confirmation,
			CASE WHEN is_confirmed = 1 THEN date ELSE NULL END AS confirmed_at
		FROM PeerDebt`,

		// 6. Create backward-compat view.
		`CREATE VIEW peer_debts AS
			SELECT
				id, account_id, friend_id,
				amount, description,
				timestamp AS date,
				is_installment, total_installments, paid_installments,
				frequency, anchor_date,
				CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END AS is_confirmed
			FROM "Transaction"
			WHERE type = 'peer'`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downMergePeerDebts(ctx context.Context, tx *sql.Tx) error {
	// Structural migration; rollback not supported.
	return nil
}
