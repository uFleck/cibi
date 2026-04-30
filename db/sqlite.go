package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

const sqlitePragmas = "_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)"

func Init(dbPath string) (*sql.DB, error) {
	dsn := fmt.Sprintf("%s?%s", dbPath, sqlitePragmas)
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	database.SetMaxOpenConns(1)

	if err := database.Ping(); err != nil {
		database.Close()
		return nil, fmt.Errorf("ping sqlite database: %w", err)
	}

	return database, nil
}
