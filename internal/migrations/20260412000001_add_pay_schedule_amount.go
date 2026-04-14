package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upAddPayScheduleAmount, downAddPayScheduleAmount)
}

func upAddPayScheduleAmount(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx,
		`ALTER TABLE PaySchedule ADD COLUMN amount INTEGER NOT NULL DEFAULT 0;`)
	return err
}

func downAddPayScheduleAmount(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx,
		`ALTER TABLE PaySchedule DROP COLUMN amount;`)
	return err
}
