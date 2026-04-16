package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upProfileAndGroupHost, downProfileAndGroupHost)
}

func upProfileAndGroupHost(ctx context.Context, tx *sql.Tx) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS UserProfile (
	id           INTEGER PRIMARY KEY CHECK (id = 1),
	display_name TEXT NOT NULL
);`,
		`INSERT INTO UserProfile (id, display_name)
	 VALUES (1, 'Host')
	 ON CONFLICT(id) DO NOTHING;`,
		`ALTER TABLE GroupEvent ADD COLUMN host_friend_id TEXT REFERENCES Friend(id);`,
	}

	for _, q := range queries {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			// ignore duplicate-column case for idempotency on reruns
			if q == queries[2] && err != nil {
				// modernc/sqlite exposes this as a string error
				if err.Error() == "SQL logic error: duplicate column name: host_friend_id (1)" {
					continue
				}
			}
			return err
		}
	}
	return nil
}

func downProfileAndGroupHost(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `DROP TABLE IF EXISTS UserProfile;`); err != nil {
		return err
	}
	// host_friend_id column intentionally not removed (SQLite ALTER TABLE limits).
	return nil
}
