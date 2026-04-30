package migrations

import (
	"context"
	"database/sql"
	"embed"
	"fmt"

	"github.com/pressly/goose/v3"
)

//go:embed *.go
var embedMigrations embed.FS

// Run applies all embedded migrations using a background context.
func Run(db *sql.DB) error {
	return RunContext(context.Background(), db)
}

// RunContext applies all embedded migrations from internal/migrations.
func RunContext(ctx context.Context, db *sql.DB) error {
	goose.SetBaseFS(embedMigrations)
	goose.SetLogger(goose.NopLogger())

	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("set goose sqlite dialect: %w", err)
	}

	if err := goose.UpContext(ctx, db, "."); err != nil {
		return fmt.Errorf("run goose migrations: %w", err)
	}
	return nil
}
