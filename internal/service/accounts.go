package service

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// AccountsService handles business logic for accounts.
type AccountsService struct {
	accRepo sqlite.AccountsRepo
}

// NewAccountsService creates a new AccountsService.
func NewAccountsService(accRepo sqlite.AccountsRepo) *AccountsService {
	return &AccountsService{accRepo: accRepo}
}

// ListAccounts returns all accounts.
func (s *AccountsService) ListAccounts() ([]sqlite.Account, error) {
	accs, err := s.accRepo.GetAll()
	if err != nil {
		return nil, fmt.Errorf("service.ListAccounts: %w", err)
	}
	return accs, nil
}

// CreateAccount inserts a new account.
func (s *AccountsService) CreateAccount(a sqlite.Account) error {
	if err := s.accRepo.Insert(a); err != nil {
		return fmt.Errorf("service.CreateAccount: %w", err)
	}
	return nil
}

// GetDefault returns the default account.
func (s *AccountsService) GetDefault() (sqlite.Account, error) {
	acc, err := s.accRepo.GetDefault()
	if err != nil {
		return acc, fmt.Errorf("service.GetDefault: %w", err)
	}
	return acc, nil
}

// SetDefault marks the given account as the default.
func (s *AccountsService) SetDefault(id uuid.UUID) error {
	if err := s.accRepo.UpdateIsDefault(id, true); err != nil {
		return fmt.Errorf("service.SetDefault: %w", err)
	}
	return nil
}

// DeleteAccount removes an account and its transactions.
func (s *AccountsService) DeleteAccount(id uuid.UUID) error {
	if err := s.accRepo.DeleteByID(id); err != nil {
		return fmt.Errorf("service.DeleteAccount: %w", err)
	}
	return nil
}

// GetByID returns a single account by ID.
// Returns sql.ErrNoRows (wrapped) when the account does not exist.
func (s *AccountsService) GetByID(id uuid.UUID) (sqlite.Account, error) {
	acc, err := s.accRepo.GetByID(id)
	if err != nil {
		return acc, fmt.Errorf("service.GetByID: %w", err)
	}
	return acc, nil
}

// UpdateAccount patches mutable fields on an account.
// Pass nil for fields that should not change.
// name: nil = no change; balance: nil = no change.
func (s *AccountsService) UpdateAccount(id uuid.UUID, name *string, balance *int64) error {
	if name != nil {
		if err := s.accRepo.UpdateName(id, *name); err != nil {
			return fmt.Errorf("service.UpdateAccount: name: %w", err)
		}
	}
	if balance != nil {
		if err := s.accRepo.UpdateBalance(id, *balance, nil); err != nil {
			return fmt.Errorf("service.UpdateAccount: balance: %w", err)
		}
	}
	return nil
}
