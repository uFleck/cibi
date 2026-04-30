package service_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type mockPayScheduleRepo struct {
	insertFn           func(ps sqlite.PaySchedule) error
	listByAccountIDFn  func(accountID uuid.UUID) ([]sqlite.PaySchedule, error)
	getByIDFn          func(id uuid.UUID) (sqlite.PaySchedule, error)
	updateByIDFn       func(id uuid.UUID, ps sqlite.PaySchedule) error
	updateAnchorDateFn func(id uuid.UUID, anchorDate time.Time, tx *sql.Tx) error
	deleteByIDFn       func(id uuid.UUID) error
}

func (m *mockPayScheduleRepo) Insert(ps sqlite.PaySchedule) error {
	if m.insertFn != nil {
		return m.insertFn(ps)
	}
	return nil
}

func (m *mockPayScheduleRepo) ListByAccountID(accountID uuid.UUID) ([]sqlite.PaySchedule, error) {
	if m.listByAccountIDFn != nil {
		return m.listByAccountIDFn(accountID)
	}
	return []sqlite.PaySchedule{}, nil
}

func (m *mockPayScheduleRepo) GetByID(id uuid.UUID) (sqlite.PaySchedule, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(id)
	}
	return sqlite.PaySchedule{}, sql.ErrNoRows
}

func (m *mockPayScheduleRepo) UpdateByID(id uuid.UUID, ps sqlite.PaySchedule) error {
	if m.updateByIDFn != nil {
		return m.updateByIDFn(id, ps)
	}
	return nil
}

func (m *mockPayScheduleRepo) UpdateAnchorDate(id uuid.UUID, anchorDate time.Time, tx *sql.Tx) error {
	if m.updateAnchorDateFn != nil {
		return m.updateAnchorDateFn(id, anchorDate, tx)
	}
	return nil
}

func (m *mockPayScheduleRepo) DeleteByID(id uuid.UUID) error {
	if m.deleteByIDFn != nil {
		return m.deleteByIDFn(id)
	}
	return nil
}

func TestPayScheduleService_ConfirmPayday_UpdatesBalanceAndAnchor(t *testing.T) {
	db := openTestDB(t)
	scheduleID := uuid.New()
	accountID := uuid.New()
	anchor := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)

	var gotBalance int64
	var gotAnchor time.Time
	var updateBalanceUsedTx bool
	var updateAnchorUsedTx bool

	psRepo := &mockPayScheduleRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.PaySchedule, error) {
			if id != scheduleID {
				t.Fatalf("unexpected schedule id: %v", id)
			}
			return sqlite.PaySchedule{
				ID:         scheduleID,
				AccountID:  accountID,
				Frequency:  "monthly",
				AnchorDate: anchor,
				Amount:     300000,
			}, nil
		},
		updateAnchorDateFn: func(id uuid.UUID, nextAnchor time.Time, tx *sql.Tx) error {
			if id != scheduleID {
				t.Fatalf("unexpected schedule id on update anchor: %v", id)
			}
			updateAnchorUsedTx = tx != nil
			gotAnchor = nextAnchor
			return nil
		},
	}

	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			if id != accountID {
				t.Fatalf("unexpected account id: %v", id)
			}
			return sqlite.Account{ID: accountID, CurrentBalance: 100000}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			if id != accountID {
				t.Fatalf("unexpected account id on update balance: %v", id)
			}
			updateBalanceUsedTx = tx != nil
			gotBalance = balance
			return nil
		},
	}

	svc := service.NewPayScheduleService(db, psRepo, accRepo)
	updated, err := svc.ConfirmPayday(scheduleID)
	if err != nil {
		t.Fatalf("ConfirmPayday error: %v", err)
	}

	if !updateBalanceUsedTx || !updateAnchorUsedTx {
		t.Fatalf("expected balance update and anchor update to use tx")
	}
	if gotBalance != 400000 {
		t.Fatalf("expected balance 400000, got %d", gotBalance)
	}
	if !gotAnchor.After(anchor) {
		t.Fatalf("expected anchor to advance after %v, got %v", anchor, gotAnchor)
	}
	if !updated.AnchorDate.Equal(gotAnchor) {
		t.Fatalf("expected returned anchor %v, got %v", gotAnchor, updated.AnchorDate)
	}
}

func TestPayScheduleService_ConfirmPayday_GetScheduleError(t *testing.T) {
	db := openTestDB(t)
	scheduleID := uuid.New()

	psRepo := &mockPayScheduleRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.PaySchedule, error) {
			return sqlite.PaySchedule{}, sql.ErrNoRows
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewPayScheduleService(db, psRepo, accRepo)
	_, err := svc.ConfirmPayday(scheduleID)
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
}

func TestCanIBuyIt_Stub(t *testing.T) {
	t.Skip("covered in engine service tests")
}

func TestWaitVerdict_Stub(t *testing.T) {
	t.Skip("covered in engine service tests")
}
