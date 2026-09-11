package service_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type mockGroupEventRepo struct {
	insertFn                    func(e sqlite.GroupEvent) error
	getAllFn                    func(accountID *uuid.UUID) ([]sqlite.GroupEvent, error)
	getByIDFn                   func(id uuid.UUID) (sqlite.GroupEvent, error)
	getByTokenFn                func(token string) (sqlite.GroupEvent, error)
	getByFriendFn               func(friendID uuid.UUID) ([]sqlite.GroupEvent, error)
	updateFn                    func(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error
	deleteByIDFn                func(id uuid.UUID) error
	setParticipantsFn           func(eventID uuid.UUID, participants []sqlite.GroupEventParticipant, hostFriendID *uuid.UUID) error
	setParticipantConfirmedFn   func(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error
	toggleParticipantFn         func(eventID uuid.UUID, friendID uuid.UUID) error
	getParticipantsFn           func(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error)
	sumUpcomingAdminFn          func(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error)
	getAdminPendingExpensesFn   func(accountID *uuid.UUID) ([]sqlite.AdminGroupExpense, error)
	getPendingBalanceForAdminFn func(accountID *uuid.UUID) (sqlite.GroupEventBalance, error)
}

func (m *mockGroupEventRepo) Insert(e sqlite.GroupEvent) error {
	if m.insertFn != nil {
		return m.insertFn(e)
	}
	return nil
}

func (m *mockGroupEventRepo) GetAll(accountID *uuid.UUID) ([]sqlite.GroupEvent, error) {
	if m.getAllFn != nil {
		return m.getAllFn(accountID)
	}
	return nil, nil
}

func (m *mockGroupEventRepo) GetByID(id uuid.UUID) (sqlite.GroupEvent, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(id)
	}
	return sqlite.GroupEvent{}, sql.ErrNoRows
}

func (m *mockGroupEventRepo) GetByToken(token string) (sqlite.GroupEvent, error) {
	if m.getByTokenFn != nil {
		return m.getByTokenFn(token)
	}
	return sqlite.GroupEvent{}, sql.ErrNoRows
}

func (m *mockGroupEventRepo) GetByFriend(friendID uuid.UUID) ([]sqlite.GroupEvent, error) {
	if m.getByFriendFn != nil {
		return m.getByFriendFn(friendID)
	}
	return nil, nil
}

func (m *mockGroupEventRepo) Update(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error {
	if m.updateFn != nil {
		return m.updateFn(id, title, date, totalAmount, notes)
	}
	return nil
}

func (m *mockGroupEventRepo) DeleteByID(id uuid.UUID) error {
	if m.deleteByIDFn != nil {
		return m.deleteByIDFn(id)
	}
	return nil
}

func (m *mockGroupEventRepo) SetParticipants(eventID uuid.UUID, participants []sqlite.GroupEventParticipant, hostFriendID *uuid.UUID) error {
	if m.setParticipantsFn != nil {
		return m.setParticipantsFn(eventID, participants, hostFriendID)
	}
	return nil
}

func (m *mockGroupEventRepo) SetParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID, isConfirmed bool) error {
	if m.setParticipantConfirmedFn != nil {
		return m.setParticipantConfirmedFn(eventID, friendID, isConfirmed)
	}
	return nil
}

func (m *mockGroupEventRepo) ToggleParticipantConfirmed(eventID uuid.UUID, friendID uuid.UUID) error {
	if m.toggleParticipantFn != nil {
		return m.toggleParticipantFn(eventID, friendID)
	}
	return nil
}

func (m *mockGroupEventRepo) GetParticipants(eventID uuid.UUID) ([]sqlite.GroupEventParticipant, error) {
	if m.getParticipantsFn != nil {
		return m.getParticipantsFn(eventID)
	}
	return nil, nil
}

func (m *mockGroupEventRepo) SumUpcomingAdminObligations(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	if m.sumUpcomingAdminFn != nil {
		return m.sumUpcomingAdminFn(accountID, after, onOrBefore)
	}
	return 0, nil
}

func (m *mockGroupEventRepo) GetAdminPendingExpenses(accountID *uuid.UUID) ([]sqlite.AdminGroupExpense, error) {
	if m.getAdminPendingExpensesFn != nil {
		return m.getAdminPendingExpensesFn(accountID)
	}
	return nil, nil
}

func (m *mockGroupEventRepo) GetPendingBalanceForAdmin(accountID *uuid.UUID) (sqlite.GroupEventBalance, error) {
	if m.getPendingBalanceForAdminFn != nil {
		return m.getPendingBalanceForAdminFn(accountID)
	}
	return sqlite.GroupEventBalance{}, nil
}

func (m *mockGroupEventRepo) InsertTransaction(t sqlite.GroupEventTransaction) error {
	return nil
}

func (m *mockGroupEventRepo) DeleteTransactionByID(id uuid.UUID) error {
	return nil
}

func (m *mockGroupEventRepo) GetTransactionsByEvent(eventID uuid.UUID) ([]sqlite.GroupEventTransaction, error) {
	return nil, nil
}

func TestListEventsByAccount_UsesScopedRepoPath(t *testing.T) {
	accountID := uuid.New()
	var captured *uuid.UUID

	repo := &mockGroupEventRepo{
		getAllFn: func(accountPtr *uuid.UUID) ([]sqlite.GroupEvent, error) {
			captured = accountPtr
			return nil, nil
		},
	}

	svc := service.NewGroupEventService(repo, nil)
	_, err := svc.ListEventsByAccount(accountID)
	if err != nil {
		t.Fatalf("ListEventsByAccount error: %v", err)
	}
	if captured == nil {
		t.Fatalf("expected scoped account pointer, got nil")
	}
	if *captured != accountID {
		t.Fatalf("expected account %v, got %v", accountID, *captured)
	}
}

func TestGetPendingBalanceForAdminByAccount_UsesScopedRepoPath(t *testing.T) {
	accountID := uuid.New()
	var captured *uuid.UUID

	repo := &mockGroupEventRepo{
		getPendingBalanceForAdminFn: func(accountPtr *uuid.UUID) (sqlite.GroupEventBalance, error) {
			captured = accountPtr
			return sqlite.GroupEventBalance{TheyOweAdmin: 1200, AdminOwesHost: 300}, nil
		},
	}

	svc := service.NewGroupEventService(repo, nil)
	b, err := svc.GetPendingBalanceForAdminByAccount(accountID)
	if err != nil {
		t.Fatalf("GetPendingBalanceForAdminByAccount error: %v", err)
	}
	if b.TheyOweAdmin != 1200 || b.AdminOwesHost != 300 {
		t.Fatalf("unexpected balance: %+v", b)
	}
	if captured == nil {
		t.Fatalf("expected scoped account pointer, got nil")
	}
	if *captured != accountID {
		t.Fatalf("expected account %v, got %v", accountID, *captured)
	}
}

func TestEqualSplitAmounts_RemainderGoesToFirstParticipant(t *testing.T) {
	svc := service.NewGroupEventService(&mockGroupEventRepo{}, nil)
	shares := svc.EqualSplitAmounts(100, 3)
	if len(shares) != 3 {
		t.Fatalf("expected 3 shares, got %d", len(shares))
	}
	if shares[0] != 34 || shares[1] != 33 || shares[2] != 33 {
		t.Fatalf("expected [34 33 33], got %v", shares)
	}
}
