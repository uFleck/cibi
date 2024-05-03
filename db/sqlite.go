package db

import (
	"database/sql"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

var Conn *sql.DB

func Init() error {
	var err error

	Conn, err = sql.Open("sqlite3", "./db/cibi-api.db")
	if err != nil {
		return fmt.Errorf("Error when opening database: %w", err)
	}

	_, err = Conn.Exec(`CREATE TABLE IF NOT EXISTS accounts (
		id VARCHAR primary key,
		name TEXT,
		balance DECIMAL,
		is_default INTEGER);`)
	if err != nil {
		return fmt.Errorf("Error when creating accounts table: %w ", err)
	}

	_, err = Conn.Exec(`CREATE TABLE IF NOT EXISTS transactions (
		id VARCHAR primary key,
		account_id VARCHAR,
		name TEXT,
		description TEXT,
		value DECIMAL,
		evaluates_at TIMESTAMP,
		evaluated_at TIMESTAMP,
		evaluated BOOLEAN,
		foreign key (account_id) references accounts(account_id));`)
	if err != nil {
		return fmt.Errorf("Error when creating transactions table: %w", err)
	}

	return nil
}
