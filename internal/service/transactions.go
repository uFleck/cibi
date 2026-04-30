package service

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/engine"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// TransactionsService handles business logic for transactions.
type TransactionsService struct {
	db       *sql.DB
	txnsRepo sqlite.TransactionsRepo
	accRepo  sqlite.AccountsRepo
}

// NewTransactionsService creates a new TransactionsService.
func NewTransactionsService(db *sql.DB, txnsRepo sqlite.TransactionsRepo, accRepo sqlite.AccountsRepo) *TransactionsService {
	return &TransactionsService{db: db, txnsRepo: txnsRepo, accRepo: accRepo}
}

// CreateTransaction validates and inserts a new transaction.
// anchor_date is required when is_recurring is true.
// frequency must be one of the defined FreqXxx constants when is_recurring is true.
// D-01: Atomically creates transaction and updates balance when it should
// impact current cash-on-hand immediately.
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

	// If transaction is anchored in the future, keep current balance unchanged.
	// It will affect purchasing power via obligations and/or explicit confirmation.
	applyToBalance := true
	if t.AnchorDate != nil && t.AnchorDate.UTC().After(time.Now().UTC()) {
		applyToBalance = false
	}

	// IMPORTANT: with SQLite configured as MaxOpenConns(1), calling repository
	// methods that use s.db while a tx is open can deadlock waiting for a free
	// connection. Read account balance before opening the tx.
	var currentBalance int64
	if applyToBalance {
		acc, err := s.accRepo.GetByID(t.AccountID)
		if err != nil {
			return fmt.Errorf("service.CreateTransaction: get account: %w", err)
		}
		currentBalance = acc.CurrentBalance
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.CreateTransaction: begin tx: %w", err)
	}
	defer tx.Rollback()

	// Insert transaction with tx.
	if err := s.txnsRepo.Insert(t, tx); err != nil {
		return fmt.Errorf("service.CreateTransaction: insert: %w", err)
	}

	if applyToBalance {
		// Calculate new balance: balance increases for positive amounts (credit), decreases for negative (debit).
		newBalance := currentBalance + t.Amount

		// Update account balance.
		if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
			return fmt.Errorf("service.CreateTransaction: update balance: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("service.CreateTransaction: commit: %w", err)
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
// D-02: Recalculates account balance if amount changes.
func (s *TransactionsService) UpdateTransaction(id uuid.UUID, upd sqlite.UpdateTransaction) error {
	// D-02: If amount is being changed, recalculate balance atomically.
	if upd.Amount != nil {
		// Fetch old transaction to get old amount.
		oldTxn, err := s.txnsRepo.GetByID(id)
		if err != nil {
			return fmt.Errorf("service.UpdateTransaction: get old transaction: %w", err)
		}
		// Fetch account to get current balance.
		acc, err := s.accRepo.GetByID(oldTxn.AccountID)
		if err != nil {
			return fmt.Errorf("service.UpdateTransaction: get account: %w", err)
		}

		// Begin atomic transaction.
		tx, err := s.db.Begin()
		if err != nil {
			return fmt.Errorf("service.UpdateTransaction: begin tx: %w", err)
		}
		defer tx.Rollback()

		// Update transaction with tx.
		if err := s.txnsRepo.Update(id, upd, tx); err != nil {
			return fmt.Errorf("service.UpdateTransaction: update: %w", err)
		}

		// Calculate new balance: new = old_balance - old_amount + new_amount.
		newBalance := acc.CurrentBalance - oldTxn.Amount + *upd.Amount

		// Update account balance.
		if err := s.accRepo.UpdateBalance(oldTxn.AccountID, newBalance, tx); err != nil {
			return fmt.Errorf("service.UpdateTransaction: update balance: %w", err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("service.UpdateTransaction: commit: %w", err)
		}

		return nil
	}

	// No amount change - simple update without balance adjustment.
	if err := s.txnsRepo.Update(id, upd, nil); err != nil {
		return fmt.Errorf("service.UpdateTransaction: %w", err)
	}
	return nil
}

// DeleteTransaction removes a transaction by ID and atomically reverses account balance.
func (s *TransactionsService) DeleteTransaction(id uuid.UUID) error {
	t, err := s.txnsRepo.GetByID(id)
	if err != nil {
		return fmt.Errorf("service.DeleteTransaction: get transaction: %w", err)
	}

	acc, err := s.accRepo.GetByID(t.AccountID)
	if err != nil {
		return fmt.Errorf("service.DeleteTransaction: get account: %w", err)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.DeleteTransaction: begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.txnsRepo.DeleteByID(id, tx); err != nil {
		return fmt.Errorf("service.DeleteTransaction: delete: %w", err)
	}

	newBalance := acc.CurrentBalance - t.Amount
	if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.DeleteTransaction: update balance: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("service.DeleteTransaction: commit: %w", err)
	}

	return nil
}

// ConfirmRecurring confirms a recurring transaction, applies the debit to account
// balance, and advances next_occurrence. D-03: User must explicitly confirm before debiting.
// Returns the new next_occurrence time for UI update.
func (s *TransactionsService) ConfirmRecurring(transactionID uuid.UUID) (time.Time, error) {
	// Fetch transaction.
	t, err := s.txnsRepo.GetByID(transactionID)
	if err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: get transaction: %w", err)
	}

	// Verify it's recurring.
	if !t.IsRecurring {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: transaction %v is not recurring", transactionID)
	}

	// Fetch account.
	acc, err := s.accRepo.GetByID(t.AccountID)
	if err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: get account: %w", err)
	}

	// Begin atomic transaction.
	tx, err := s.db.Begin()
	if err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: begin tx: %w", err)
	}
	defer tx.Rollback()

	// Calculate new balance: amount is negative for debit, so adding it decreases balance.
	newBalance := acc.CurrentBalance + t.Amount

	// Update account balance.
	if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: update balance: %w", err)
	}

	// Calculate next occurrence.
	var next time.Time
	if t.NextOccurrence != nil && t.Frequency != nil {
		next = advanceOccurrence(*t.NextOccurrence, *t.Frequency)
		if err := s.txnsRepo.AdvanceNextOccurrence(transactionID, next, tx); err != nil {
			return time.Time{}, fmt.Errorf("service.ConfirmRecurring: advance next_occurrence: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: commit: %w", err)
	}

	return next, nil
}

// advanceOccurrence computes the next occurrence after current based on frequency.
func advanceOccurrence(current time.Time, frequency string) time.Time {
	switch frequency {
	case engine.FreqWeekly:
		return current.AddDate(0, 0, 7)
	case engine.FreqBiWeekly, "biweekly":
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
