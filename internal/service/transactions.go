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

	if t.IsInstallment {
		if t.IsRecurring {
			return fmt.Errorf("is_installment and is_recurring are mutually exclusive")
		}
		if t.TotalInstallments == nil || *t.TotalInstallments <= 0 {
			return fmt.Errorf("installment transaction requires total_installments > 0")
		}
		if t.AnchorDate == nil {
			return fmt.Errorf("installment transaction requires anchor_date")
		}
		if t.Frequency == nil || (*t.Frequency != engine.FreqMonthly && *t.Frequency != engine.FreqWeekly) {
			return fmt.Errorf("installment transaction requires frequency of monthly or weekly")
		}
	}

	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	if t.Timestamp.IsZero() {
		now := time.Now().UTC()
		t.Timestamp = now
	}

	applyToBalance := shouldApplyBalanceOnCreate(t, time.Now().UTC())

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
	// D-02: If amount is being changed, recalculate balance atomically when
	// this transaction has already impacted account balance.
	if upd.Amount != nil {
		oldTxn, err := s.txnsRepo.GetByID(id)
		if err != nil {
			return fmt.Errorf("service.UpdateTransaction: get old transaction: %w", err)
		}

		if !hasAppliedToBalance(oldTxn, time.Now().UTC()) {
			if err := s.txnsRepo.Update(id, upd, nil); err != nil {
				return fmt.Errorf("service.UpdateTransaction: %w", err)
			}
			return nil
		}

		acc, err := s.accRepo.GetByID(oldTxn.AccountID)
		if err != nil {
			return fmt.Errorf("service.UpdateTransaction: get account: %w", err)
		}

		tx, err := s.db.Begin()
		if err != nil {
			return fmt.Errorf("service.UpdateTransaction: begin tx: %w", err)
		}
		defer tx.Rollback()

		if err := s.txnsRepo.Update(id, upd, tx); err != nil {
			return fmt.Errorf("service.UpdateTransaction: update: %w", err)
		}

		// Calculate new balance: new = old_balance - old_amount + new_amount.
		// For installments, only the paid portion has already hit the balance,
		// so we reverse/apply PaidInstallments * perInstallmentAmount.
		newBalance := acc.CurrentBalance - oldTxn.Amount + *upd.Amount
		if oldTxn.IsInstallment {
			newBalance = acc.CurrentBalance - (oldTxn.Amount * oldTxn.PaidInstallments) + (*upd.Amount * oldTxn.PaidInstallments)
		}
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

	if !hasAppliedToBalance(t, time.Now().UTC()) {
		if err := s.txnsRepo.DeleteByID(id, nil); err != nil {
			return fmt.Errorf("service.DeleteTransaction: delete: %w", err)
		}
		return nil
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

	// For installments, reverse all paid installments (paid_installments * amount).
	// For all other txns, reverse the single balance impact (amount).
	var balanceDelta int64
	if t.IsInstallment {
		balanceDelta = t.Amount * t.PaidInstallments
	} else {
		balanceDelta = t.Amount
	}
	newBalance := acc.CurrentBalance - balanceDelta
	if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.DeleteTransaction: update balance: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("service.DeleteTransaction: commit: %w", err)
	}

	return nil
}

// ConfirmRecurring confirms a recurring or one-time due transaction and applies
// its amount to account balance. For recurring transactions, it also advances
// next_occurrence. D-03: User must explicitly confirm before debiting.
func (s *TransactionsService) ConfirmRecurring(transactionID uuid.UUID) (time.Time, error) {
	t, err := s.txnsRepo.GetByID(transactionID)
	if err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: get transaction: %w", err)
	}

	if !t.IsRecurring && t.ConfirmedAt != nil {
		// Idempotent for already confirmed one-time pending payments.
		return time.Time{}, nil
	}

	isOneTimeDue := !t.IsRecurring && t.RequiresConfirmation && t.ConfirmedAt == nil
	if !t.IsRecurring && !isOneTimeDue {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: transaction %v is not confirmable", transactionID)
	}

	acc, err := s.accRepo.GetByID(t.AccountID)
	if err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: get account: %w", err)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: begin tx: %w", err)
	}
	defer tx.Rollback()

	newBalance := acc.CurrentBalance + t.Amount
	if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: update balance: %w", err)
	}

	var next time.Time
	if t.IsRecurring && t.NextOccurrence != nil && t.Frequency != nil {
		next = advanceOccurrence(*t.NextOccurrence, *t.Frequency)
		if err := s.txnsRepo.AdvanceNextOccurrence(transactionID, next, tx); err != nil {
			return time.Time{}, fmt.Errorf("service.ConfirmRecurring: advance next_occurrence: %w", err)
		}
	}
	if isOneTimeDue {
		if err := s.txnsRepo.MarkConfirmed(transactionID, time.Now().UTC(), tx); err != nil {
			return time.Time{}, fmt.Errorf("service.ConfirmRecurring: mark confirmed: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return time.Time{}, fmt.Errorf("service.ConfirmRecurring: commit: %w", err)
	}

	return next, nil
}

// shouldApplyBalanceOnCreate reports whether a transaction should impact the
// account balance immediately when created.
func shouldApplyBalanceOnCreate(t sqlite.Transaction, now time.Time) bool {
	if t.IsInstallment {
		return false // installment txns only debit balance on each confirm-installment
	}
	if t.RequiresConfirmation && t.ConfirmedAt == nil {
		return false
	}
	if t.IsRecurring && t.AnchorDate != nil && t.AnchorDate.UTC().After(now.UTC()) {
		return false
	}
	return true
}

// hasAppliedToBalance reports whether this stored transaction is currently
// represented in account balance.
func hasAppliedToBalance(t sqlite.Transaction, now time.Time) bool {
	if t.IsInstallment {
		return t.PaidInstallments > 0
	}
	if t.RequiresConfirmation && t.ConfirmedAt == nil {
		return false
	}
	if t.IsRecurring && t.AnchorDate != nil && t.AnchorDate.UTC().After(now.UTC()) {
		return false
	}
	return true
}

// ConfirmInstallment confirms one installment payment: debits the per-installment
// amount from the account balance and increments paid_installments.
func (s *TransactionsService) ConfirmInstallment(transactionID uuid.UUID) error {
	t, err := s.txnsRepo.GetByID(transactionID)
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: get transaction: %w", err)
	}

	if !t.IsInstallment {
		return fmt.Errorf("service.ConfirmInstallment: transaction %v is not an installment", transactionID)
	}
	if t.TotalInstallments == nil || t.PaidInstallments >= *t.TotalInstallments {
		return fmt.Errorf("service.ConfirmInstallment: all installments already paid for transaction %v", transactionID)
	}

	acc, err := s.accRepo.GetByID(t.AccountID)
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: get account: %w", err)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("service.ConfirmInstallment: begin tx: %w", err)
	}
	defer tx.Rollback()

	newBalance := acc.CurrentBalance + t.Amount
	if err := s.accRepo.UpdateBalance(t.AccountID, newBalance, tx); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: update balance: %w", err)
	}

	if err := s.txnsRepo.IncrementPaidInstallments(transactionID, tx); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: increment paid: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: commit: %w", err)
	}

	return nil
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
