package service

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/engine"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// FriendDebtItem is a computed summary for a single active debt the user owes a friend.
type FriendDebtItem struct {
	FriendName        string
	TotalAmount       int64 // abs cents — full debt amount
	NextPayment       int64 // abs cents — next installment or full lump-sum
	IsInstallment     bool
	PerInstallAmount  int64 // abs cents — same as NextPayment for installment debts
	TotalInstallments int64
	PaidInstallments  int64
	NextPaymentDate   *string // RFC3339; nil if unparseable
}

// PeerDebtService handles business logic for peer debts.
type PeerDebtService struct {
	repo sqlite.PeerDebtRepo
}

// NewPeerDebtService creates a new PeerDebtService.
func NewPeerDebtService(repo sqlite.PeerDebtRepo) *PeerDebtService {
	return &PeerDebtService{repo: repo}
}

// ListByFriend returns all debts for a given friend, optionally scoped by account.
func (s *PeerDebtService) ListByFriend(friendID uuid.UUID, accountID *uuid.UUID) ([]sqlite.PeerDebt, error) {
	debts, err := s.repo.GetByFriend(friendID, accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListByFriend: %w", err)
	}
	return debts, nil
}

// ListByFriendUnscoped returns all debts for a given friend without account filter.
func (s *PeerDebtService) ListByFriendUnscoped(friendID uuid.UUID) ([]sqlite.PeerDebt, error) {
	debts, err := s.repo.GetByFriend(friendID, nil)
	if err != nil {
		return nil, fmt.Errorf("service.ListByFriendUnscoped: %w", err)
	}
	return debts, nil
}

// ListByFriendByAccount returns all debts for a friend scoped by account.
func (s *PeerDebtService) ListByFriendByAccount(friendID, accountID uuid.UUID) ([]sqlite.PeerDebt, error) {
	debts, err := s.repo.GetByFriend(friendID, &accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListByFriendByAccount: %w", err)
	}
	return debts, nil
}

// ListAll returns all peer debts, optionally scoped by account.
func (s *PeerDebtService) ListAll(accountID *uuid.UUID) ([]sqlite.PeerDebt, error) {
	debts, err := s.repo.GetAll(accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListAll: %w", err)
	}
	return debts, nil
}

// ListAllUnscoped returns all peer debts across all accounts.
func (s *PeerDebtService) ListAllUnscoped() ([]sqlite.PeerDebt, error) {
	debts, err := s.repo.GetAll(nil)
	if err != nil {
		return nil, fmt.Errorf("service.ListAllUnscoped: %w", err)
	}
	return debts, nil
}

// ListAllByAccount returns all peer debts for one account.
func (s *PeerDebtService) ListAllByAccount(accountID uuid.UUID) ([]sqlite.PeerDebt, error) {
	debts, err := s.repo.GetAll(&accountID)
	if err != nil {
		return nil, fmt.Errorf("service.ListAllByAccount: %w", err)
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

// ToggleInstallmentConfirmation flips confirmation state with strict rollback semantics.
func (s *PeerDebtService) ToggleInstallmentConfirmation(id uuid.UUID) error {
	if err := s.repo.ToggleInstallmentConfirmation(id); err != nil {
		return fmt.Errorf("service.ToggleInstallmentConfirmation: %w", err)
	}
	return nil
}

// GetBalanceByFriend returns the balance summary for a specific friend.
func (s *PeerDebtService) GetBalanceByFriend(friendID uuid.UUID) (sqlite.PeerDebtBalance, error) {
	b, err := s.repo.GetBalanceByFriend(friendID, nil)
	if err != nil {
		return b, fmt.Errorf("service.GetBalanceByFriend: %w", err)
	}
	return b, nil
}

// GetGlobalBalance returns the aggregated balance summary, optionally scoped by account.
func (s *PeerDebtService) GetGlobalBalance(accountID *uuid.UUID) (sqlite.GlobalPeerBalance, error) {
	b, err := s.repo.GetGlobalBalance(accountID)
	if err != nil {
		return b, fmt.Errorf("service.GetGlobalBalance: %w", err)
	}
	return b, nil
}

// GetGlobalBalanceUnscoped returns global balance without account filter.
func (s *PeerDebtService) GetGlobalBalanceUnscoped() (sqlite.GlobalPeerBalance, error) {
	b, err := s.repo.GetGlobalBalance(nil)
	if err != nil {
		return b, fmt.Errorf("service.GetGlobalBalanceUnscoped: %w", err)
	}
	return b, nil
}

// GetGlobalBalanceByAccount returns global balance scoped by account.
func (s *PeerDebtService) GetGlobalBalanceByAccount(accountID uuid.UUID) (sqlite.GlobalPeerBalance, error) {
	b, err := s.repo.GetGlobalBalance(&accountID)
	if err != nil {
		return b, fmt.Errorf("service.GetGlobalBalanceByAccount: %w", err)
	}
	return b, nil
}

// GetFriendDebtBreakdown returns per-debt breakdown of active debts the user owes friends,
// with computed next payment amount and due date, optionally scoped by account.
func (s *PeerDebtService) GetFriendDebtBreakdown(accountID *uuid.UUID) ([]FriendDebtItem, error) {
	rows, err := s.repo.GetActiveUserDebtsWithFriend(accountID)
	if err != nil {
		return nil, fmt.Errorf("service.GetFriendDebtBreakdown: %w", err)
	}
	return buildFriendDebtItems(rows), nil
}

// GetFriendDebtBreakdownUnscoped returns debt breakdown without account filter.
func (s *PeerDebtService) GetFriendDebtBreakdownUnscoped() ([]FriendDebtItem, error) {
	rows, err := s.repo.GetActiveUserDebtsWithFriend(nil)
	if err != nil {
		return nil, fmt.Errorf("service.GetFriendDebtBreakdownUnscoped: %w", err)
	}
	return buildFriendDebtItems(rows), nil
}

// GetFriendDebtBreakdownByAccount returns debt breakdown scoped by account.
func (s *PeerDebtService) GetFriendDebtBreakdownByAccount(accountID uuid.UUID) ([]FriendDebtItem, error) {
	rows, err := s.repo.GetActiveUserDebtsWithFriend(&accountID)
	if err != nil {
		return nil, fmt.Errorf("service.GetFriendDebtBreakdownByAccount: %w", err)
	}
	return buildFriendDebtItems(rows), nil
}

func buildFriendDebtItems(rows []sqlite.ActiveUserDebt) []FriendDebtItem {
	items := make([]FriendDebtItem, 0, len(rows))
	for _, r := range rows {
		totalAbs := -r.Amount
		item := FriendDebtItem{
			FriendName:        r.FriendName,
			TotalAmount:       totalAbs,
			IsInstallment:     r.IsInstallment,
			TotalInstallments: r.TotalInstallments,
			PaidInstallments:  r.PaidInstallments,
		}
		if r.IsInstallment && r.TotalInstallments > 0 {
			perInst := totalAbs / r.TotalInstallments
			item.NextPayment = perInst
			item.PerInstallAmount = perInst
			anchorStr := r.Date
			if r.AnchorDate != nil && *r.AnchorDate != "" {
				anchorStr = *r.AnchorDate
			}
			firstDue, err := time.Parse(time.RFC3339, anchorStr)
			if err != nil {
				firstDue, err = time.Parse("2006-01-02", anchorStr)
			}
			if err == nil {
				nextDue := engine.NextInstallmentDue(firstDue, r.PaidInstallments, r.Frequency)
				s := nextDue.UTC().Format(time.RFC3339)
				item.NextPaymentDate = &s
			}
		} else {
			item.NextPayment = totalAbs
			item.PerInstallAmount = totalAbs
			d := r.Date
			item.NextPaymentDate = &d
		}
		items = append(items, item)
	}
	return items
}

// SumNextUserPayment returns the sum of the user's next payment for each active debt.
// For installment debts: one installment amount. For lump-sum debts: full amount.
// Optional account scope can be provided.
func (s *PeerDebtService) SumNextUserPayment(accountID *uuid.UUID) (int64, error) {
	v, err := s.repo.SumNextUserPayment(accountID)
	if err != nil {
		return 0, fmt.Errorf("service.SumNextUserPayment: %w", err)
	}
	return v, nil
}

// SumNextUserPaymentUnscoped returns next user payment without account filter.
func (s *PeerDebtService) SumNextUserPaymentUnscoped() (int64, error) {
	v, err := s.repo.SumNextUserPayment(nil)
	if err != nil {
		return 0, fmt.Errorf("service.SumNextUserPaymentUnscoped: %w", err)
	}
	return v, nil
}

// SumNextUserPaymentByAccount returns next user payment scoped by account.
func (s *PeerDebtService) SumNextUserPaymentByAccount(accountID uuid.UUID) (int64, error) {
	v, err := s.repo.SumNextUserPayment(&accountID)
	if err != nil {
		return 0, fmt.Errorf("service.SumNextUserPaymentByAccount: %w", err)
	}
	return v, nil
}
