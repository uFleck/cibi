package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upInitialSchema, downInitialSchema)
}

func upInitialSchema(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS Account (
			id TEXT PRIMARY KEY,
			name TEXT,
			current_balance INTEGER,
			currency TEXT,
			is_default BOOLEAN
		);`,
		`CREATE TABLE IF NOT EXISTS Transaction (
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
		`CREATE TABLE IF NOT EXISTS PaySchedule (
			id TEXT PRIMARY KEY,
			account_id TEXT REFERENCES Account(id),
			frequency TEXT,
			anchor_date TEXT,
			day_of_month2 INTEGER,
			label TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS SafetyBuffer (
			min_threshold INTEGER
		);`,
	}

	for _, query := range queries {
		if _, err := tx.ExecContext(ctx, query); err != nil {
			return err
		}
	}
	return nil
}

func downInitialSchema(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`DROP TABLE IF EXISTS SafetyBuffer;`,
		`DROP TABLE IF EXISTS PaySchedule;`,
		`DROP TABLE IF EXISTS Transaction;`,
		`DROP TABLE IF EXISTS Account;`,
	}

	for _, query := range queries {
		if _, err := tx.ExecContext(ctx, query); err != nil {
			return err
		}
	}
	return nil
}
