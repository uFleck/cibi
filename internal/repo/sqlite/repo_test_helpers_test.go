package sqlite_test

import (
	"database/sql"
	"testing"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

func openSQLiteTestDB(t *testing.T, schema string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	return db
}

func requireNoErr(t *testing.T, label string, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
}

func requireLen(t *testing.T, label string, gotLen, want int) {
	t.Helper()
	if gotLen != want {
		t.Fatalf("%s count = %d, want %d", label, gotLen, want)
	}
}

func requireI64(t *testing.T, label string, got, want int64) {
	t.Helper()
	if got != want {
		t.Fatalf("%s = %d, want %d", label, got, want)
	}
}

func assertOptionalAccountGetAllCounts[T any](
	t *testing.T,
	label string,
	getAll func(*uuid.UUID) ([]T, error),
	accountID uuid.UUID,
	wantAll int,
	wantScoped int,
) {
	t.Helper()

	all, err := getAll(nil)
	requireNoErr(t, label+"(nil)", err)
	requireLen(t, label+"(nil)", len(all), wantAll)

	scoped, err := getAll(&accountID)
	requireNoErr(t, label+"(scoped)", err)
	requireLen(t, label+"(scoped)", len(scoped), wantScoped)
}
