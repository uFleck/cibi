package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upGoalsFoundation, downGoalsFoundation)
}

func upGoalsFoundation(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS Goal (
			id TEXT PRIMARY KEY,
			account_id TEXT NOT NULL REFERENCES Account(id),
			name TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('draft','active','completed','archived')),
			target_amount_cents INTEGER NOT NULL CHECK (target_amount_cents > 0),
			invested_total_cents INTEGER NOT NULL DEFAULT 0,
			start_date_utc TEXT NOT NULL,
			target_date_utc TEXT,
			notes TEXT,
			currency TEXT NOT NULL,
			created_at_utc TEXT NOT NULL,
			updated_at_utc TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_goal_account_id ON Goal(account_id);`,
		`CREATE TABLE IF NOT EXISTS GoalTargetAudit (
			id TEXT PRIMARY KEY,
			goal_id TEXT NOT NULL REFERENCES Goal(id),
			previous_target_amount_cents INTEGER NOT NULL,
			new_target_amount_cents INTEGER NOT NULL,
			changed_at_utc TEXT NOT NULL,
			note TEXT
		);`,
		`CREATE INDEX IF NOT EXISTS idx_goal_target_audit_goal_id ON GoalTargetAudit(goal_id);`,
		`CREATE TABLE IF NOT EXISTS GoalLedgerEntry (
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
		`CREATE INDEX IF NOT EXISTS idx_goal_ledger_goal_id ON GoalLedgerEntry(goal_id);`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func downGoalsFoundation(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP INDEX IF EXISTS idx_goal_ledger_goal_id;`,
		`DROP TABLE IF EXISTS GoalLedgerEntry;`,
		`DROP INDEX IF EXISTS idx_goal_target_audit_goal_id;`,
		`DROP TABLE IF EXISTS GoalTargetAudit;`,
		`DROP INDEX IF EXISTS idx_goal_account_id;`,
		`DROP TABLE IF EXISTS Goal;`,
	}
	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	return nil
}
