package sqlite

import (
	"database/sql"
	"fmt"
)

// SafetyBuffer mirrors the SafetyBuffer schema row.
type SafetyBuffer struct {
	MinThreshold int64 // cents; 0 = buffer disabled
}

// SafetyBufferRepo defines the data access contract for the safety buffer global config.
type SafetyBufferRepo interface {
	Get() (SafetyBuffer, error)
	Set(threshold int64) error
}

// SqliteSafetyBufferRepo implements SafetyBufferRepo.
type SqliteSafetyBufferRepo struct {
	db *sql.DB
}

// NewSqliteSafetyBufferRepo creates a new SqliteSafetyBufferRepo.
func NewSqliteSafetyBufferRepo(db *sql.DB) *SqliteSafetyBufferRepo {
	return &SqliteSafetyBufferRepo{db: db}
}

// Get returns the current SafetyBuffer. Returns a default of 0 if no row exists.
func (r *SqliteSafetyBufferRepo) Get() (SafetyBuffer, error) {
	var sb SafetyBuffer
	err := r.db.QueryRow(`SELECT min_threshold FROM SafetyBuffer LIMIT 1`).Scan(&sb.MinThreshold)
	if err == sql.ErrNoRows {
		// No row exists — buffer is 0 (disabled), which is valid per SCHEMA-04.
		return SafetyBuffer{MinThreshold: 0}, nil
	}
	if err != nil {
		return sb, fmt.Errorf("safety_buffer.Get: %w", err)
	}
	return sb, nil
}

// Set upserts the min_threshold value. Replaces any existing row.
func (r *SqliteSafetyBufferRepo) Set(threshold int64) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("safety_buffer.Set: begin: %w", err)
	}
	_, err = tx.Exec(`DELETE FROM SafetyBuffer`)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("safety_buffer.Set: delete: %w", err)
	}
	_, err = tx.Exec(`INSERT INTO SafetyBuffer (min_threshold) VALUES (?)`, threshold)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("safety_buffer.Set: insert: %w", err)
	}
	return tx.Commit()
}
