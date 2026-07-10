package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upInstallmentTransactions, downInstallmentTransactions)
}

func upInstallmentTransactions(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE "Transaction" ADD COLUMN is_installment BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE "Transaction" ADD COLUMN total_installments INTEGER`,
		`ALTER TABLE "Transaction" ADD COLUMN paid_installments INTEGER NOT NULL DEFAULT 0`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downInstallmentTransactions(ctx context.Context, tx *sql.Tx) error {
	// Additive-only migration; SQLite DROP COLUMN support varies.
	// Rollback is intentionally a no-op for this migration.
	return nil
}
