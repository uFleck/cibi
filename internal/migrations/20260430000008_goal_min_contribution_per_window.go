package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upGoalMinContributionPerWindow, downGoalMinContributionPerWindow)
}

func upGoalMinContributionPerWindow(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `ALTER TABLE Goal ADD COLUMN min_contribution_per_window_cents INTEGER NOT NULL DEFAULT 0;`)
	return err
}

func downGoalMinContributionPerWindow(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `UPDATE Goal SET min_contribution_per_window_cents = 0;`)
	return err
}
