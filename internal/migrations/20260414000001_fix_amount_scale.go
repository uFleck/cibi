package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upFixAmountScale, downFixAmountScale)
}

// upFixAmountScale divides Transaction and Account amounts by 100.
// Root cause: the web form sent cents to the API, which then multiplied by 100
// again (dollars→cents), resulting in values stored at 100× the correct scale.
// PaySchedule amounts were stored correctly (no handler multiplication) and are
// left untouched.
func upFixAmountScale(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`UPDATE "Transaction" SET amount = amount / 100;`,
		`UPDATE Account SET current_balance = current_balance / 100;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downFixAmountScale(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`UPDATE "Transaction" SET amount = amount * 100;`,
		`UPDATE Account SET current_balance = current_balance * 100;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
