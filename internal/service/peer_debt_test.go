package service_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type mockPeerDebtRepo struct {
	insertFn                     func(d sqlite.PeerDebt) error
	getByFriendFn                func(friendID uuid.UUID, accountID *uuid.UUID) ([]sqlite.PeerDebt, error)
	getAllFn                     func(accountID *uuid.UUID) ([]sqlite.PeerDebt, error)
	getByIDFn                    func(id uuid.UUID) (sqlite.PeerDebt, error)
	updateFn                     func(id uuid.UUID, amount *int64, description *string, isConfirmed *bool, paidInstallments *int64) error
	deleteByIDFn                 func(id uuid.UUID) error
	getBalanceByFriendFn         func(friendID uuid.UUID, accountID *uuid.UUID) (sqlite.PeerDebtBalance, error)
	getGlobalBalanceFn           func(accountID *uuid.UUID) (sqlite.GlobalPeerBalance, error)
	sumUpcomingPeerFn            func(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error)
	sumNextUserPaymentFn         func(accountID *uuid.UUID) (int64, error)
	getActiveUserDebtsWithFriend func(accountID *uuid.UUID) ([]sqlite.ActiveUserDebt, error)
	confirmInstallmentFn         func(id uuid.UUID) error
}

func (m *mockPeerDebtRepo) Insert(d sqlite.PeerDebt) error {
	if m.insertFn != nil {
		return m.insertFn(d)
	}
	return nil
}

func (m *mockPeerDebtRepo) GetByFriend(friendID uuid.UUID, accountID *uuid.UUID) ([]sqlite.PeerDebt, error) {
	if m.getByFriendFn != nil {
		return m.getByFriendFn(friendID, accountID)
	}
	return nil, nil
}

func (m *mockPeerDebtRepo) GetAll(accountID *uuid.UUID) ([]sqlite.PeerDebt, error) {
	if m.getAllFn != nil {
		return m.getAllFn(accountID)
	}
	return nil, nil
}

func (m *mockPeerDebtRepo) GetByID(id uuid.UUID) (sqlite.PeerDebt, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(id)
	}
	return sqlite.PeerDebt{}, sql.ErrNoRows
}

func (m *mockPeerDebtRepo) Update(id uuid.UUID, amount *int64, description *string, isConfirmed *bool, paidInstallments *int64) error {
	if m.updateFn != nil {
		return m.updateFn(id, amount, description, isConfirmed, paidInstallments)
	}
	return nil
}

func (m *mockPeerDebtRepo) DeleteByID(id uuid.UUID) error {
	if m.deleteByIDFn != nil {
		return m.deleteByIDFn(id)
	}
	return nil
}

func (m *mockPeerDebtRepo) GetBalanceByFriend(friendID uuid.UUID, accountID *uuid.UUID) (sqlite.PeerDebtBalance, error) {
	if m.getBalanceByFriendFn != nil {
		return m.getBalanceByFriendFn(friendID, accountID)
	}
	return sqlite.PeerDebtBalance{}, nil
}

func (m *mockPeerDebtRepo) GetGlobalBalance(accountID *uuid.UUID) (sqlite.GlobalPeerBalance, error) {
	if m.getGlobalBalanceFn != nil {
		return m.getGlobalBalanceFn(accountID)
	}
	return sqlite.GlobalPeerBalance{}, nil
}

func (m *mockPeerDebtRepo) SumUpcomingPeerObligations(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	if m.sumUpcomingPeerFn != nil {
		return m.sumUpcomingPeerFn(accountID, after, onOrBefore)
	}
	return 0, nil
}

func (m *mockPeerDebtRepo) SumNextUserPayment(accountID *uuid.UUID) (int64, error) {
	if m.sumNextUserPaymentFn != nil {
		return m.sumNextUserPaymentFn(accountID)
	}
	return 0, nil
}

func (m *mockPeerDebtRepo) GetActiveUserDebtsWithFriend(accountID *uuid.UUID) ([]sqlite.ActiveUserDebt, error) {
	if m.getActiveUserDebtsWithFriend != nil {
		return m.getActiveUserDebtsWithFriend(accountID)
	}
	return nil, nil
}

func (m *mockPeerDebtRepo) ConfirmInstallment(id uuid.UUID) error {
	if m.confirmInstallmentFn != nil {
		return m.confirmInstallmentFn(id)
	}
	return nil
}

func TestGetFriendDebtBreakdown_InstallmentComputesNextPaymentDate(t *testing.T) {
	repo := &mockPeerDebtRepo{
		getActiveUserDebtsWithFriend: func(accountID *uuid.UUID) ([]sqlite.ActiveUserDebt, error) {
			return []sqlite.ActiveUserDebt{{
				FriendName:        "Ana",
				Amount:            -10000,
				IsInstallment:     true,
				TotalInstallments: 4,
				PaidInstallments:  2,
				Frequency:         "monthly",
				Date:              "2026-01-01T00:00:00Z",
			}}, nil
		},
	}

	svc := service.NewPeerDebtService(repo)
	items, err := svc.GetFriendDebtBreakdown(nil)
	if err != nil {
		t.Fatalf("GetFriendDebtBreakdown error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].NextPayment != 2500 {
		t.Fatalf("expected next payment 2500, got %d", items[0].NextPayment)
	}
	if items[0].NextPaymentDate == nil {
		t.Fatalf("expected next payment date")
	}
	if *items[0].NextPaymentDate != "2026-03-01T00:00:00Z" {
		t.Fatalf("expected next payment date 2026-03-01T00:00:00Z, got %s", *items[0].NextPaymentDate)
	}
}

func TestGetFriendDebtBreakdownByAccount_UsesScopedPath(t *testing.T) {
	accountID := uuid.New()
	var captured *uuid.UUID

	repo := &mockPeerDebtRepo{
		getActiveUserDebtsWithFriend: func(accountPtr *uuid.UUID) ([]sqlite.ActiveUserDebt, error) {
			captured = accountPtr
			return nil, nil
		},
	}

	svc := service.NewPeerDebtService(repo)
	_, err := svc.GetFriendDebtBreakdownByAccount(accountID)
	if err != nil {
		t.Fatalf("GetFriendDebtBreakdownByAccount error: %v", err)
	}
	if captured == nil {
		t.Fatalf("expected scoped account pointer, got nil")
	}
	if *captured != accountID {
		t.Fatalf("expected account %v, got %v", accountID, *captured)
	}
}

func TestSumNextUserPaymentByAccount_UsesOptionalAccountRepoCall(t *testing.T) {
	accountID := uuid.New()
	var captured *uuid.UUID

	repo := &mockPeerDebtRepo{
		sumNextUserPaymentFn: func(accountPtr *uuid.UUID) (int64, error) {
			captured = accountPtr
			return 4242, nil
		},
	}

	svc := service.NewPeerDebtService(repo)
	sum, err := svc.SumNextUserPaymentByAccount(accountID)
	if err != nil {
		t.Fatalf("SumNextUserPaymentByAccount error: %v", err)
	}
	if sum != 4242 {
		t.Fatalf("expected sum 4242, got %d", sum)
	}
	if captured == nil {
		t.Fatalf("expected scoped account pointer, got nil")
	}
	if *captured != accountID {
		t.Fatalf("expected account %v, got %v", accountID, *captured)
	}
}
