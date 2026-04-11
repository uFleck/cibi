package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

func Init(dbPath string) (*sql.DB, error) {
	dsn := fmt.Sprintf("%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("error when opening database: %w", err)
	}

	db.SetMaxOpenConns(1)

	return db, nil
}

