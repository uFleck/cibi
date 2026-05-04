package migrations

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	cibidb "github.com/ufleck/cibi/db"
)

func openTempDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := cibidb.Init(filepath.Join(t.TempDir(), "cibi.db"))
	if err != nil {
		t.Fatalf("db.Init returned error: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func TestMigrationsCreateInitialSchemaOnFreshDatabase(t *testing.T) {
	database := openTempDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := RunContext(ctx, database); err != nil {
		t.Fatalf("RunContext returned error: %v", err)
	}

	for _, table := range []string{"Account", "Transaction", "PaySchedule", "goose_db_version"} {
		t.Run(table, func(t *testing.T) {
			var name string
			err := database.QueryRowContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&name)
			if err != nil {
				t.Fatalf("table %s missing after migrations: %v", table, err)
			}
		})
	}
}

func TestMigrationsAreIdempotent(t *testing.T) {
	database := openTempDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := RunContext(ctx, database); err != nil {
		t.Fatalf("first RunContext returned error: %v", err)
	}
	if err := RunContext(ctx, database); err != nil {
		t.Fatalf("second RunContext returned error: %v", err)
	}
}

func TestForeignKeysEnabledForSQLiteConnector(t *testing.T) {
	database := openTempDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := RunContext(ctx, database); err != nil {
		t.Fatalf("RunContext returned error: %v", err)
	}

	var enabled int
	if err := database.QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&enabled); err != nil {
		t.Fatalf("query PRAGMA foreign_keys: %v", err)
	}
	if enabled != 1 {
		t.Fatalf("PRAGMA foreign_keys = %d, want 1", enabled)
	}

	_, err := database.ExecContext(ctx, `INSERT INTO "Transaction" (id, account_id, amount) VALUES (?, ?, ?)`, "txn-1", "missing-account", 100)
	if err == nil {
		t.Fatal("insert with missing Account foreign key succeeded, want failure")
	}
	if errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("unexpected sentinel error: %v", err)
	}
}
