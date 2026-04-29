package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upGoalRecurringContributions, downGoalRecurringContributions)
}

func upGoalRecurringContributions(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS GoalRecurringContribution (
			id TEXT PRIMARY KEY,
			goal_id TEXT NOT NULL REFERENCES Goal(id),
			amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
			frequency TEXT NOT NULL CHECK (frequency IN ('weekly','bi-weekly','monthly','yearly')),
			anchor_date_utc TEXT NOT NULL,
			next_due_utc TEXT NOT NULL,
			active BOOLEAN NOT NULL DEFAULT 1,
			created_at_utc TEXT NOT NULL,
			updated_at_utc TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_goal_recurring_goal_id ON GoalRecurringContribution(goal_id);`,
		`CREATE INDEX IF NOT EXISTS idx_goal_recurring_next_due ON GoalRecurringContribution(next_due_utc);`,
		`ALTER TABLE GoalLedgerEntry RENAME TO GoalLedgerEntry_old;`,
		`CREATE TABLE GoalLedgerEntry (
			id TEXT PRIMARY KEY,
			goal_id TEXT NOT NULL REFERENCES Goal(id),
			amount_cents INTEGER NOT NULL,
			type TEXT NOT NULL CHECK (type IN ('contribution','withdrawal','adjustment')),
			source TEXT NOT NULL CHECK (source IN ('manual','system','recurring')),
			note TEXT,
			reverses_entry_id TEXT REFERENCES GoalLedgerEntry(id),
			timestamp_utc TEXT NOT NULL,
			created_at_utc TEXT NOT NULL
		);`,
		`INSERT INTO GoalLedgerEntry (id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc)
		 SELECT id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc
		 FROM GoalLedgerEntry_old;`,
		`DROP TABLE GoalLedgerEntry_old;`,
		`CREATE INDEX IF NOT EXISTS idx_goal_ledger_goal_id ON GoalLedgerEntry(goal_id);`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downGoalRecurringContributions(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`ALTER TABLE GoalLedgerEntry RENAME TO GoalLedgerEntry_old;`,
		`CREATE TABLE GoalLedgerEntry (
			id TEXT PRIMARY KEY,
			goal_id TEXT NOT NULL REFERENCES Goal(id),
			amount_cents INTEGER NOT NULL,
			type TEXT NOT NULL CHECK (type IN ('contribution','withdrawal','adjustment')),
			source TEXT NOT NULL CHECK (source IN ('manual','system')),
			note TEXT,
			reverses_entry_id TEXT REFERENCES GoalLedgerEntry(id),
			timestamp_utc TEXT NOT NULL,
			created_at_utc TEXT NOT NULL
		);`,
		`INSERT INTO GoalLedgerEntry (id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc)
		 SELECT id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc
		 FROM GoalLedgerEntry_old
		 WHERE source IN ('manual','system');`,
		`DROP TABLE GoalLedgerEntry_old;`,
		`CREATE INDEX IF NOT EXISTS idx_goal_ledger_goal_id ON GoalLedgerEntry(goal_id);`,
		`DROP INDEX IF EXISTS idx_goal_recurring_next_due;`,
		`DROP INDEX IF EXISTS idx_goal_recurring_goal_id;`,
		`DROP TABLE IF EXISTS GoalRecurringContribution;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
