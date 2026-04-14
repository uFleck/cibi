package service

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// PeerDebtService handles business logic for peer debts.
type PeerDebtService struct {
	repo sqlite.PeerDebtRepo
}

// NewPeerDebtService creates a new PeerDebtService.
func NewPeerDebtService(repo sqlite.PeerDebtRepo) *PeerDebtService {
	return &PeerDebtService{repo: repo}
}

// ListByFriend returns all debts for a given friend.
func (s *PeerDebtService) ListByFriend(friendID uuid.UUID) ([]sqlite.PeerDebt, error) {
	debts, err := s.repo.GetByFriend(friendID)
	if err != nil {
		return nil, fmt.Errorf("service.ListByFriend: %w", err)
	}
	return debts, nil
}

// ListAll returns all peer debts across all friends.
func (s *PeerDebtService) ListAll() ([]sqlite.PeerDebt, error) {
	debts, err := s.repo.GetAll()
	if err != nil {
		return nil, fmt.Errorf("service.ListAll: %w", err)
	}
	return debts, nil
}

// CreateDebt creates a new peer debt with an assigned UUID.
func (s *PeerDebtService) CreateDebt(d sqlite.PeerDebt) (sqlite.PeerDebt, error) {
	d.ID = uuid.New()
	if err := s.repo.Insert(d); err != nil {
		return sqlite.PeerDebt{}, fmt.Errorf("service.CreateDebt: %w", err)
	}
	return d, nil
}

// UpdateDebt patches amount and/or description on a peer debt.
// Pass nil for fields that should not change.
func (s *PeerDebtService) UpdateDebt(id uuid.UUID, amount *int64, description *string) error {
	if err := s.repo.Update(id, amount, description, nil, nil); err != nil {
		return fmt.Errorf("service.UpdateDebt: %w", err)
	}
	return nil
}

// DeleteDebt removes a peer debt by ID.
func (s *PeerDebtService) DeleteDebt(id uuid.UUID) error {
	if err := s.repo.DeleteByID(id); err != nil {
		return fmt.Errorf("service.DeleteDebt: %w", err)
	}
	return nil
}

// ConfirmInstallment confirms or increments an installment payment atomically.
// - Installment debt: increments paid_installments by 1, capped at total_installments.
// - Non-installment debt: sets is_confirmed = true.
// The update is performed in a single SQL statement to avoid lost-update races.
func (s *PeerDebtService) ConfirmInstallment(id uuid.UUID) error {
	if err := s.repo.ConfirmInstallment(id); err != nil {
		return fmt.Errorf("service.ConfirmInstallment: %w", err)
	}
	return nil
}

// GetBalanceByFriend returns the balance summary for a specific friend.
func (s *PeerDebtService) GetBalanceByFriend(friendID uuid.UUID) (sqlite.PeerDebtBalance, error) {
	b, err := s.repo.GetBalanceByFriend(friendID)
	if err != nil {
		return b, fmt.Errorf("service.GetBalanceByFriend: %w", err)
	}
	return b, nil
}

// GetGlobalBalance returns the aggregated balance summary across all friends.
func (s *PeerDebtService) GetGlobalBalance() (sqlite.GlobalPeerBalance, error) {
	b, err := s.repo.GetGlobalBalance()
	if err != nil {
		return b, fmt.Errorf("service.GetGlobalBalance: %w", err)
	}
	return b, nil
}
