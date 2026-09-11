package service

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// LedgerService manages the account ledger and keeps account balance in sync.
type LedgerService struct {
	db         *sql.DB
	ledgerRepo sqlite.LedgerRepo
	accRepo    sqlite.AccountsRepo
}

func NewLedgerService(db *sql.DB, ledgerRepo sqlite.LedgerRepo, accRepo sqlite.AccountsRepo) *LedgerService {
	return &LedgerService{db: db, ledgerRepo: ledgerRepo, accRepo: accRepo}
}

// RecordEntry inserts a ledger row then updates the account balance to the
// SUM of all ledger entries for that account. If outerTx is non-nil, all
// work runs inside it; otherwise a new transaction is opened and committed.
func (s *LedgerService) RecordEntry(entry sqlite.LedgerEntry, outerTx *sql.Tx) error {
	run := func(tx *sql.Tx) error {
		if err := s.ledgerRepo.Insert(entry, tx); err != nil {
			return fmt.Errorf("insert ledger: %w", err)
		}
		newBalance, err := s.ledgerRepo.SumByAccount(entry.AccountID, tx)
		if err != nil {
			return fmt.Errorf("sum ledger: %w", err)
		}
		if err := s.accRepo.UpdateBalance(entry.AccountID, newBalance, tx); err != nil {
			return fmt.Errorf("update balance: %w", err)
		}
		return nil
	}

	if outerTx != nil {
		return run(outerTx)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.LedgerService.RecordEntry: begin tx: %w", err)
	}
	defer tx.Rollback()
	if err := run(tx); err != nil {
		return fmt.Errorf("service.LedgerService.RecordEntry: %w", err)
	}
	return tx.Commit()
}

// Delete removes a ledger entry by ID and recomputes the account balance.
func (s *LedgerService) Delete(id uuid.UUID) error {
	entry, err := s.ledgerRepo.FindByID(id)
	if err != nil {
		return fmt.Errorf("service.LedgerService.Delete: find: %w", err)
	}
	if entry == nil {
		return nil
	}
	accountID := entry.AccountID

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.LedgerService.Delete: begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.ledgerRepo.DeleteByID(id, tx); err != nil {
		return fmt.Errorf("service.LedgerService.Delete: delete: %w", err)
	}
	newBalance, err := s.ledgerRepo.SumByAccount(accountID, tx)
	if err != nil {
		return fmt.Errorf("service.LedgerService.Delete: sum: %w", err)
	}
	if err := s.accRepo.UpdateBalance(accountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.LedgerService.Delete: update balance: %w", err)
	}
	return tx.Commit()
}

// DeleteByTransactionID finds the ledger entry for a transaction and deletes it.
// It is a no-op when no ledger entry exists.
func (s *LedgerService) DeleteByTransactionID(txnID uuid.UUID) error {
	entry, err := s.ledgerRepo.FindByTransactionID(txnID)
	if err != nil {
		return fmt.Errorf("service.LedgerService.DeleteByTransactionID: find: %w", err)
	}
	if entry == nil {
		return nil
	}
	return s.Delete(entry.ID)
}

// FindByTransactionID returns the ledger entry linked to a transaction, or nil.
func (s *LedgerService) FindByTransactionID(id uuid.UUID) (*sqlite.LedgerEntry, error) {
	return s.ledgerRepo.FindByTransactionID(id)
}

// List returns all ledger entries for an account ordered by posted_at.
func (s *LedgerService) List(accountID uuid.UUID) ([]sqlite.LedgerEntry, error) {
	return s.ledgerRepo.ListByAccount(accountID)
}

// RecordIncome records an income ledger entry tied to a pay schedule.
func (s *LedgerService) RecordIncome(accountID, payScheduleID uuid.UUID, amount int64, description string) error {
	return s.RecordEntry(sqlite.LedgerEntry{
		AccountID:     accountID,
		PayScheduleID: &payScheduleID,
		EntryType:     "income",
		Amount:        amount,
		Description:   description,
		PostedAt:      time.Now().UTC(),
	}, nil)
}

// RecomputeBalance sets the account balance to the sum of all its ledger entries.
func (s *LedgerService) RecomputeBalance(accountID uuid.UUID) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.LedgerService.RecomputeBalance: begin tx: %w", err)
	}
	defer tx.Rollback()
	newBalance, err := s.ledgerRepo.SumByAccount(accountID, tx)
	if err != nil {
		return fmt.Errorf("service.LedgerService.RecomputeBalance: sum: %w", err)
	}
	if err := s.accRepo.UpdateBalance(accountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.LedgerService.RecomputeBalance: update balance: %w", err)
	}
	return tx.Commit()
}

// UpdateEntryAmount updates a ledger entry's amount and recomputes the account balance atomically.
func (s *LedgerService) UpdateEntryAmount(id uuid.UUID, amount int64) error {
	entry, err := s.ledgerRepo.FindByID(id)
	if err != nil {
		return fmt.Errorf("service.LedgerService.UpdateEntryAmount: find: %w", err)
	}
	if entry == nil {
		return fmt.Errorf("service.LedgerService.UpdateEntryAmount: entry %v not found", id)
	}
	accountID := entry.AccountID

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.LedgerService.UpdateEntryAmount: begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.ledgerRepo.UpdateAmount(id, amount, tx); err != nil {
		return fmt.Errorf("service.LedgerService.UpdateEntryAmount: update amount: %w", err)
	}
	newBalance, err := s.ledgerRepo.SumByAccount(accountID, tx)
	if err != nil {
		return fmt.Errorf("service.LedgerService.UpdateEntryAmount: sum: %w", err)
	}
	if err := s.accRepo.UpdateBalance(accountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.LedgerService.UpdateEntryAmount: update balance: %w", err)
	}
	return tx.Commit()
}
