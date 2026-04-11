package service

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/engine"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// TransactionsService handles business logic for transactions.
type TransactionsService struct {
	txnsRepo sqlite.TransactionsRepo
	accRepo  sqlite.AccountsRepo
}

// NewTransactionsService creates a new TransactionsService.
func NewTransactionsService(txnsRepo sqlite.TransactionsRepo, accRepo sqlite.AccountsRepo) *TransactionsService {
	return &TransactionsService{txnsRepo: txnsRepo, accRepo: accRepo}
}

// CreateTransaction validates and inserts a new transaction.
// anchor_date is required when is_recurring is true.
// frequency must be one of the defined FreqXxx constants when is_recurring is true.
func (s *TransactionsService) CreateTransaction(t sqlite.Transaction) error {
	if t.IsRecurring {
		if t.Frequency == nil || !sqlite.ValidFrequencies[*t.Frequency] {
			return fmt.Errorf("recurring transaction requires a valid frequency (weekly, bi-weekly, monthly, yearly)")
		}
		if t.AnchorDate == nil {
			return fmt.Errorf("recurring transaction requires anchor_date")
		}
		// Set initial next_occurrence = anchor_date if not provided.
		if t.NextOccurrence == nil {
			anchor := t.AnchorDate.UTC()
			t.NextOccurrence = &anchor
		}
	}

	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	if t.Timestamp.IsZero() {
		now := time.Now().UTC()
		t.Timestamp = now
	}

	if err := s.txnsRepo.Insert(t); err != nil {
		return fmt.Errorf("service.CreateTransaction: %w", err)
	}
	return nil
}

// ListTransactions returns all transactions for an account.
func (s *TransactionsService) ListTransactions(accountID uuid.UUID) ([]sqlite.Transaction, error) {
	txns, err := s.txnsRepo.GetByAccount(accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListTransactions: %w", err)
	}
	return txns, nil
}

// GetTransaction returns a single transaction by ID.
func (s *TransactionsService) GetTransaction(id uuid.UUID) (sqlite.Transaction, error) {
	t, err := s.txnsRepo.GetByID(id)
	if err != nil {
		return t, fmt.Errorf("service.GetTransaction: %w", err)
	}
	return t, nil
}

// UpdateTransaction patches the mutable fields of a transaction.
func (s *TransactionsService) UpdateTransaction(id uuid.UUID, upd sqlite.UpdateTransaction) error {
	if err := s.txnsRepo.Update(id, upd); err != nil {
		return fmt.Errorf("service.UpdateTransaction: %w", err)
	}
	return nil
}

// DeleteTransaction removes a transaction by ID.
func (s *TransactionsService) DeleteTransaction(id uuid.UUID) error {
	if err := s.txnsRepo.DeleteByID(id); err != nil {
		return fmt.Errorf("service.DeleteTransaction: %w", err)
	}
	return nil
}

// RecordDebit records a debit against a recurring transaction and atomically
// advances next_occurrence by one period. Guards against double-debit by
// requiring next_occurrence > now before advancing.
//
// Formula per TXN-02:
//   - weekly:    next = current_next + 7 days
//   - bi-weekly: next = current_next + 14 days
//   - monthly:   next = AddMonthClamped(current_next, 1)
//   - yearly:    next = AddMonthClamped(current_next, 12)
func (s *TransactionsService) RecordDebit(transactionID uuid.UUID) error {
	t, err := s.txnsRepo.GetByID(transactionID)
	if err != nil {
		return fmt.Errorf("service.RecordDebit: get transaction: %w", err)
	}
	if !t.IsRecurring {
		return fmt.Errorf("service.RecordDebit: transaction %v is not recurring", transactionID)
	}
	if t.Frequency == nil {
		return fmt.Errorf("service.RecordDebit: transaction %v has no frequency", transactionID)
	}
	if t.NextOccurrence == nil {
		return fmt.Errorf("service.RecordDebit: transaction %v has no next_occurrence", transactionID)
	}

	now := time.Now().UTC()

	// Double-debit guard: next_occurrence must be in the future (> now).
	if !t.NextOccurrence.After(now) {
		return fmt.Errorf("service.RecordDebit: next_occurrence is not in the future — possible double debit on %v", transactionID)
	}

	next := advanceOccurrence(*t.NextOccurrence, *t.Frequency)

	if err := s.txnsRepo.AdvanceNextOccurrence(transactionID, next, nil); err != nil {
		return fmt.Errorf("service.RecordDebit: advance next_occurrence: %w", err)
	}
	return nil
}

// advanceOccurrence computes the next occurrence after current based on frequency.
func advanceOccurrence(current time.Time, frequency string) time.Time {
	switch frequency {
	case engine.FreqWeekly:
		return current.AddDate(0, 0, 7)
	case engine.FreqBiWeekly:
		return current.AddDate(0, 0, 14)
	case engine.FreqMonthly:
		return engine.AddMonthClamped(current, 1)
	case engine.FreqYearly:
		return engine.AddMonthClamped(current, 12)
	default:
		// Fallback — treat as monthly
		return engine.AddMonthClamped(current, 1)
	}
}
