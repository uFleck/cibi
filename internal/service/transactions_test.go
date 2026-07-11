package service_test

import (
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	"github.com/ufleck/cibi/internal/engine"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

type mockTransactionsRepo struct {
	insertFn                    func(t sqlite.Transaction, tx *sql.Tx) error
	getByAccountFn              func(accountID uuid.UUID) ([]sqlite.Transaction, error)
	getByIDFn                   func(id uuid.UUID) (sqlite.Transaction, error)
	updateFn                    func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error
	deleteByIDFn                func(id uuid.UUID, tx *sql.Tx) error
	advanceNextOccurrenceFn     func(id uuid.UUID, next time.Time, tx *sql.Tx) error
	markConfirmedFn             func(id uuid.UUID, confirmedAt time.Time, tx *sql.Tx) error
	sumUpcomingFn               func(accountID uuid.UUID, after, onOrBefore time.Time) (int64, error)
	incrementPaidInstallmentsFn func(id uuid.UUID, tx *sql.Tx) error
}

func (m *mockTransactionsRepo) Insert(t sqlite.Transaction, tx *sql.Tx) error {
	if m.insertFn != nil {
		return m.insertFn(t, tx)
	}
	return nil
}

func (m *mockTransactionsRepo) GetByAccount(accountID uuid.UUID) ([]sqlite.Transaction, error) {
	if m.getByAccountFn != nil {
		return m.getByAccountFn(accountID)
	}
	return nil, nil
}

func (m *mockTransactionsRepo) GetByID(id uuid.UUID) (sqlite.Transaction, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(id)
	}
	return sqlite.Transaction{}, sql.ErrNoRows
}

func (m *mockTransactionsRepo) Update(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error {
	if m.updateFn != nil {
		return m.updateFn(id, upd, tx)
	}
	return nil
}

func (m *mockTransactionsRepo) DeleteByID(id uuid.UUID, tx *sql.Tx) error {
	if m.deleteByIDFn != nil {
		return m.deleteByIDFn(id, tx)
	}
	return nil
}

func (m *mockTransactionsRepo) AdvanceNextOccurrence(id uuid.UUID, next time.Time, tx *sql.Tx) error {
	if m.advanceNextOccurrenceFn != nil {
		return m.advanceNextOccurrenceFn(id, next, tx)
	}
	return nil
}

func (m *mockTransactionsRepo) MarkConfirmed(id uuid.UUID, confirmedAt time.Time, tx *sql.Tx) error {
	if m.markConfirmedFn != nil {
		return m.markConfirmedFn(id, confirmedAt, tx)
	}
	return nil
}

func (m *mockTransactionsRepo) SumUpcomingObligations(accountID uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	if m.sumUpcomingFn != nil {
		return m.sumUpcomingFn(accountID, after, onOrBefore)
	}
	return 0, nil
}

func (m *mockTransactionsRepo) IncrementPaidInstallments(id uuid.UUID, tx *sql.Tx) error {
	if m.incrementPaidInstallmentsFn != nil {
		return m.incrementPaidInstallmentsFn(id, tx)
	}
	return nil
}

type mockAccountsRepo struct {
	insertFn             func(a sqlite.Account) error
	getAllFn             func() ([]sqlite.Account, error)
	getDefaultFn         func() (sqlite.Account, error)
	getByIDFn            func(id uuid.UUID) (sqlite.Account, error)
	updateBalanceFn      func(id uuid.UUID, balance int64, tx *sql.Tx) error
	updateNameFn         func(id uuid.UUID, name string) error
	updateSafetyBufferFn func(id uuid.UUID, safetyBuffer int64) error
	updateDefaultFn      func(id uuid.UUID, isDefault bool) error
	deleteByIDFn         func(id uuid.UUID) error
	unsetDefaultsFn      func(tx *sql.Tx) error
}

func (m *mockAccountsRepo) Insert(a sqlite.Account) error {
	if m.insertFn != nil {
		return m.insertFn(a)
	}
	return nil
}

func (m *mockAccountsRepo) GetAll() ([]sqlite.Account, error) {
	if m.getAllFn != nil {
		return m.getAllFn()
	}
	return nil, nil
}

func (m *mockAccountsRepo) GetDefault() (sqlite.Account, error) {
	if m.getDefaultFn != nil {
		return m.getDefaultFn()
	}
	return sqlite.Account{}, sql.ErrNoRows
}

func (m *mockAccountsRepo) GetByID(id uuid.UUID) (sqlite.Account, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(id)
	}
	return sqlite.Account{}, sql.ErrNoRows
}

func (m *mockAccountsRepo) UpdateBalance(id uuid.UUID, balance int64, tx *sql.Tx) error {
	if m.updateBalanceFn != nil {
		return m.updateBalanceFn(id, balance, tx)
	}
	return nil
}

func (m *mockAccountsRepo) UpdateName(id uuid.UUID, name string) error {
	if m.updateNameFn != nil {
		return m.updateNameFn(id, name)
	}
	return nil
}

func (m *mockAccountsRepo) UpdateSafetyBuffer(id uuid.UUID, safetyBuffer int64) error {
	if m.updateSafetyBufferFn != nil {
		return m.updateSafetyBufferFn(id, safetyBuffer)
	}
	return nil
}

func (m *mockAccountsRepo) UpdateIsDefault(id uuid.UUID, isDefault bool) error {
	if m.updateDefaultFn != nil {
		return m.updateDefaultFn(id, isDefault)
	}
	return nil
}

func (m *mockAccountsRepo) DeleteByID(id uuid.UUID) error {
	if m.deleteByIDFn != nil {
		return m.deleteByIDFn(id)
	}
	return nil
}

func (m *mockAccountsRepo) IncrementVersion(id uuid.UUID, tx *sql.Tx) error {
	return nil
}

func (m *mockAccountsRepo) UnsetDefaults(tx *sql.Tx) error {
	if m.unsetDefaultsFn != nil {
		return m.unsetDefaultsFn(tx)
	}
	return nil
}

func newScopedAccountRepo(t *testing.T, expectedID uuid.UUID, startingBalance int64, gotNewBalance *int64, txUsed *bool) *mockAccountsRepo {
	t.Helper()
	return &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			if id != expectedID {
				t.Fatalf("unexpected account id: %v", id)
			}
			return sqlite.Account{ID: expectedID, CurrentBalance: startingBalance}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			if id != expectedID {
				t.Fatalf("unexpected account id on update: %v", id)
			}
			if tx == nil {
				t.Fatalf("expected tx in UpdateBalance")
			}
			if txUsed != nil {
				*txUsed = true
			}
			if gotNewBalance != nil {
				*gotNewBalance = balance
			}
			return nil
		},
	}
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestCreateTransaction_UpdatesBalanceAtomically(t *testing.T) {
	db := openTestDB(t)
	accountID := uuid.New()
	startingBalance := int64(10000)
	txnAmount := int64(-2500)

	var gotNewBalance int64
	var insertUsedTx bool
	var updateUsedTx bool

	txnsRepo := &mockTransactionsRepo{
		insertFn: func(txn sqlite.Transaction, tx *sql.Tx) error {
			insertUsedTx = tx != nil
			if txn.Amount != txnAmount {
				t.Fatalf("expected amount %d, got %d", txnAmount, txn.Amount)
			}
			return nil
		},
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, &updateUsedTx)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.CreateTransaction(sqlite.Transaction{AccountID: accountID, Amount: txnAmount})
	if err != nil {
		t.Fatalf("CreateTransaction error: %v", err)
	}

	if !insertUsedTx || !updateUsedTx {
		t.Fatalf("expected insert and update to use tx")
	}
	if gotNewBalance != 7500 {
		t.Fatalf("expected new balance 7500, got %d", gotNewBalance)
	}
}

func TestCreateTransaction_FutureAnchorDate_DoesNotUpdateBalance(t *testing.T) {
	db := openTestDB(t)
	accountID := uuid.New()
	txnAmount := int64(-2500)
	futureAnchor := time.Now().UTC().Add(24 * time.Hour)

	var insertUsedTx bool
	var updateBalanceCalled bool

	txnsRepo := &mockTransactionsRepo{
		insertFn: func(txn sqlite.Transaction, tx *sql.Tx) error {
			insertUsedTx = tx != nil
			if txn.Amount != txnAmount {
				t.Fatalf("expected amount %d, got %d", txnAmount, txn.Amount)
			}
			if txn.AnchorDate == nil || !txn.AnchorDate.UTC().Equal(futureAnchor.UTC()) {
				t.Fatalf("expected anchor_date %v, got %v", futureAnchor.UTC(), txn.AnchorDate)
			}
			return nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			return sqlite.Account{ID: accountID, CurrentBalance: 10000}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			updateBalanceCalled = true
			return nil
		},
	}

	freq := engine.FreqMonthly
	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.CreateTransaction(sqlite.Transaction{
		AccountID:   accountID,
		Amount:      txnAmount,
		AnchorDate:  &futureAnchor,
		IsRecurring: true,
		Frequency:   &freq,
		Timestamp:   time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("CreateTransaction error: %v", err)
	}

	if !insertUsedTx {
		t.Fatalf("expected insert to use tx")
	}
	if updateBalanceCalled {
		t.Fatalf("expected balance to remain unchanged for future-anchored transaction")
	}
}

func TestCreateTransaction_PendingPayment_DoesNotUpdateBalance(t *testing.T) {
	db := openTestDB(t)
	accountID := uuid.New()
	txnAmount := int64(-2500)

	var insertUsedTx bool
	var accountReadCalled bool
	var updateBalanceCalled bool

	txnsRepo := &mockTransactionsRepo{
		insertFn: func(txn sqlite.Transaction, tx *sql.Tx) error {
			insertUsedTx = tx != nil
			if !txn.RequiresConfirmation {
				t.Fatalf("expected requires_confirmation=true")
			}
			return nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			accountReadCalled = true
			return sqlite.Account{ID: accountID, CurrentBalance: 10000}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			updateBalanceCalled = true
			return nil
		},
	}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.CreateTransaction(sqlite.Transaction{
		AccountID:            accountID,
		Amount:               txnAmount,
		RequiresConfirmation: true,
		Timestamp:            time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("CreateTransaction error: %v", err)
	}

	if !insertUsedTx {
		t.Fatalf("expected insert to use tx")
	}
	if accountReadCalled {
		t.Fatalf("expected no account read for unconfirmed pending payment")
	}
	if updateBalanceCalled {
		t.Fatalf("expected no balance update for unconfirmed pending payment")
	}
}

func TestUpdateTransaction_RecalculatesBalanceWhenAmountChanges(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	oldAmount := int64(-2000)
	newAmount := int64(-5000)
	startingBalance := int64(10000)

	var gotNewBalance int64
	var updateUsedTx bool

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			if id != txnID {
				t.Fatalf("unexpected txn id: %v", id)
			}
			return sqlite.Transaction{ID: txnID, AccountID: accountID, Amount: oldAmount}, nil
		},
		updateFn: func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error {
			if id != txnID {
				t.Fatalf("unexpected txn id on update: %v", id)
			}
			if upd.Amount == nil || *upd.Amount != newAmount {
				t.Fatalf("expected update amount %d", newAmount)
			}
			updateUsedTx = tx != nil
			return nil
		},
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.UpdateTransaction(txnID, sqlite.UpdateTransaction{Amount: &newAmount})
	if err != nil {
		t.Fatalf("UpdateTransaction error: %v", err)
	}

	if !updateUsedTx {
		t.Fatalf("expected txn update to use tx")
	}
	if gotNewBalance != 7000 {
		t.Fatalf("expected new balance 7000, got %d", gotNewBalance)
	}
}

func TestUpdateTransaction_PendingPaymentAmount_DoesNotAdjustBalanceBeforeConfirmation(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	oldAmount := int64(-2000)
	newAmount := int64(-5000)

	var updateUsedTx bool
	var updateBalanceCalled bool

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			if id != txnID {
				t.Fatalf("unexpected txn id: %v", id)
			}
			return sqlite.Transaction{ID: txnID, AccountID: accountID, Amount: oldAmount, RequiresConfirmation: true}, nil
		},
		updateFn: func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error {
			if id != txnID {
				t.Fatalf("unexpected txn id on update: %v", id)
			}
			if upd.Amount == nil || *upd.Amount != newAmount {
				t.Fatalf("expected update amount %d", newAmount)
			}
			updateUsedTx = tx != nil
			return nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			t.Fatalf("unexpected account read")
			return sqlite.Account{}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			updateBalanceCalled = true
			return nil
		},
	}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.UpdateTransaction(txnID, sqlite.UpdateTransaction{Amount: &newAmount})
	if err != nil {
		t.Fatalf("UpdateTransaction error: %v", err)
	}
	if updateUsedTx {
		t.Fatalf("expected non-atomic update (no balance impact yet)")
	}
	if updateBalanceCalled {
		t.Fatalf("expected no balance change before pending payment confirmation")
	}
}

func TestUpdateTransaction_InstallmentWithPaidInstallments_UsesCorrectBalanceDelta(t *testing.T) {
	// Scenario: installment transaction, amount per installment changes from -5000 to -6000,
	// with 3 installments already paid. The balance impact already applied is 3 * (-5000) = -15000.
	// After the update the correct new impact is 3 * (-6000) = -18000.
	// So the balance should decrease by an extra 3000 (delta = 3 * 1000).
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	oldAmount := int64(-5000)
	newAmount := int64(-6000)
	paidInstallments := int64(3)
	total := int64(12)
	startingBalance := int64(100000) // after 3 installments of 5000 already applied

	var gotNewBalance int64

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				AccountID:         accountID,
				Amount:            oldAmount,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paidInstallments,
			}, nil
		},
		updateFn: func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error {
			return nil
		},
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.UpdateTransaction(txnID, sqlite.UpdateTransaction{Amount: &newAmount})
	if err != nil {
		t.Fatalf("UpdateTransaction error: %v", err)
	}

	// Expected: 100000 - (3 * -5000) + (3 * -6000) = 100000 - (-15000) + (-18000) = 100000 + 15000 - 18000 = 97000
	// Delta from old balance: -3000 (paid 3000 more than before)
	expectedBalance := startingBalance - (oldAmount * paidInstallments) + (newAmount * paidInstallments)
	if gotNewBalance != expectedBalance {
		t.Fatalf("expected new balance %d, got %d", expectedBalance, gotNewBalance)
	}
	// Sanity check: balance delta is 3 * (newAmount - oldAmount) = 3 * (-1000) = -3000
	balanceDelta := gotNewBalance - startingBalance
	expectedDelta := paidInstallments * (newAmount - oldAmount) // 3 * (-6000 - -5000) = 3 * -1000 = -3000
	if balanceDelta != expectedDelta {
		t.Fatalf("expected balance delta %d, got %d", expectedDelta, balanceDelta)
	}
}

func TestDeleteTransaction_ReversesBalance(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(10000)
	txnAmount := int64(-3000)

	var gotNewBalance int64
	var deleteUsedTx bool

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			if id != txnID {
				t.Fatalf("unexpected txn id: %v", id)
			}
			return sqlite.Transaction{ID: txnID, AccountID: accountID, Amount: txnAmount}, nil
		},
		deleteByIDFn: func(id uuid.UUID, tx *sql.Tx) error {
			if id != txnID {
				t.Fatalf("unexpected txn id on delete: %v", id)
			}
			deleteUsedTx = tx != nil
			return nil
		},
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.DeleteTransaction(txnID)
	if err != nil {
		t.Fatalf("DeleteTransaction error: %v", err)
	}

	if !deleteUsedTx {
		t.Fatalf("expected delete to use tx")
	}
	if gotNewBalance != 13000 {
		t.Fatalf("expected new balance 13000, got %d", gotNewBalance)
	}
}

func TestDeleteTransaction_PendingPayment_DoesNotAdjustBalanceBeforeConfirmation(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	txnAmount := int64(-3000)

	var deleteUsedTx bool
	var updateBalanceCalled bool

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			if id != txnID {
				t.Fatalf("unexpected txn id: %v", id)
			}
			return sqlite.Transaction{ID: txnID, AccountID: accountID, Amount: txnAmount, RequiresConfirmation: true}, nil
		},
		deleteByIDFn: func(id uuid.UUID, tx *sql.Tx) error {
			if id != txnID {
				t.Fatalf("unexpected txn id on delete: %v", id)
			}
			deleteUsedTx = tx != nil
			return nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			t.Fatalf("unexpected account read")
			return sqlite.Account{}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			updateBalanceCalled = true
			return nil
		},
	}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.DeleteTransaction(txnID)
	if err != nil {
		t.Fatalf("DeleteTransaction error: %v", err)
	}
	if deleteUsedTx {
		t.Fatalf("expected non-atomic delete (no balance impact yet)")
	}
	if updateBalanceCalled {
		t.Fatalf("expected no balance change before pending payment confirmation")
	}
}

func TestConfirmRecurring_UpdatesBalanceAndAdvancesOccurrence(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(10000)
	amount := int64(-1500)
	freq := engine.FreqWeekly
	nextOccurrence := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	var gotNewBalance int64
	var gotAdvanced time.Time
	var advanceUsedTx bool

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			if id != txnID {
				t.Fatalf("unexpected txn id: %v", id)
			}
			return sqlite.Transaction{
				ID:             txnID,
				AccountID:      accountID,
				Amount:         amount,
				IsRecurring:    true,
				Frequency:      &freq,
				NextOccurrence: &nextOccurrence,
			}, nil
		},
		advanceNextOccurrenceFn: func(id uuid.UUID, next time.Time, tx *sql.Tx) error {
			if id != txnID {
				t.Fatalf("unexpected txn id on advance: %v", id)
			}
			advanceUsedTx = tx != nil
			gotAdvanced = next
			return nil
		},
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	next, err := svc.ConfirmRecurring(txnID)
	if err != nil {
		t.Fatalf("ConfirmRecurring error: %v", err)
	}

	expectedNext := time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC)
	if !advanceUsedTx {
		t.Fatalf("expected advance next occurrence to use tx")
	}
	if gotNewBalance != 8500 {
		t.Fatalf("expected new balance 8500, got %d", gotNewBalance)
	}
	if !gotAdvanced.Equal(expectedNext) {
		t.Fatalf("expected advanced occurrence %v, got %v", expectedNext, gotAdvanced)
	}
	if !next.Equal(expectedNext) {
		t.Fatalf("expected returned next occurrence %v, got %v", expectedNext, next)
	}
}

func TestConfirmRecurring_PendingPayment_UpdatesBalanceAndMarksConfirmed(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(10000)
	amount := int64(-1200)

	var gotNewBalance int64
	var markConfirmedCalled bool
	var markConfirmedUsedTx bool

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			if id != txnID {
				t.Fatalf("unexpected txn id: %v", id)
			}
			return sqlite.Transaction{
				ID:                   txnID,
				AccountID:            accountID,
				Amount:               amount,
				IsRecurring:          false,
				RequiresConfirmation: true,
			}, nil
		},
		markConfirmedFn: func(id uuid.UUID, confirmedAt time.Time, tx *sql.Tx) error {
			if id != txnID {
				t.Fatalf("unexpected txn id on mark confirmed: %v", id)
			}
			if confirmedAt.IsZero() {
				t.Fatalf("expected confirmed timestamp")
			}
			markConfirmedCalled = true
			markConfirmedUsedTx = tx != nil
			return nil
		},
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	next, err := svc.ConfirmRecurring(txnID)
	if err != nil {
		t.Fatalf("ConfirmRecurring error: %v", err)
	}

	if !next.IsZero() {
		t.Fatalf("expected zero next occurrence for one-time pending payment, got %v", next)
	}
	if gotNewBalance != 8800 {
		t.Fatalf("expected new balance 8800, got %d", gotNewBalance)
	}
	if !markConfirmedCalled || !markConfirmedUsedTx {
		t.Fatalf("expected mark confirmed to be called in tx")
	}
}

func TestConfirmRecurring_PendingPaymentAlreadyConfirmed_IsIdempotent(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	confirmedAt := time.Now().UTC()

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			if id != txnID {
				t.Fatalf("unexpected txn id: %v", id)
			}
			return sqlite.Transaction{ID: txnID, IsRecurring: false, ConfirmedAt: &confirmedAt}, nil
		},
	}
	accRepo := &mockAccountsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Account, error) {
			t.Fatalf("unexpected account read")
			return sqlite.Account{}, nil
		},
		updateBalanceFn: func(id uuid.UUID, balance int64, tx *sql.Tx) error {
			t.Fatalf("unexpected balance update")
			return nil
		},
	}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	next, err := svc.ConfirmRecurring(txnID)
	if err != nil {
		t.Fatalf("ConfirmRecurring error: %v", err)
	}
	if !next.IsZero() {
		t.Fatalf("expected zero next occurrence, got %v", next)
	}
}

func TestConfirmInstallment_DebitsBalanceAndIncrementsCount(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(100000)
	amount := int64(-5000) // -$50.00 per installment
	total := int64(12)
	paid := int64(2)
	freq := engine.FreqMonthly

	var gotNewBalance int64
	var incrementCalled bool
	var incrementUsedTx bool

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				AccountID:         accountID,
				Amount:            amount,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
				Frequency:         &freq,
			}, nil
		},
		incrementPaidInstallmentsFn: func(id uuid.UUID, tx *sql.Tx) error {
			incrementCalled = true
			incrementUsedTx = tx != nil
			return nil
		},
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.ConfirmInstallment(txnID)
	if err != nil {
		t.Fatalf("ConfirmInstallment error: %v", err)
	}

	if !incrementCalled || !incrementUsedTx {
		t.Fatalf("expected IncrementPaidInstallments to be called in a tx")
	}
	if gotNewBalance != 95000 {
		t.Fatalf("expected new balance 95000, got %d", gotNewBalance)
	}
}

func TestConfirmInstallment_AlreadyComplete_ReturnsError(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	total := int64(3)
	paid := int64(3) // fully paid

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
			}, nil
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.ConfirmInstallment(txnID)
	if err == nil {
		t.Fatal("expected error for fully paid installment, got nil")
	}
}

func TestConfirmInstallment_NonInstallment_ReturnsError(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{ID: txnID, IsInstallment: false}, nil
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.ConfirmInstallment(txnID)
	if err == nil {
		t.Fatal("expected error for non-installment txn, got nil")
	}
}

func TestUpdateTransaction_TotalInstallments_CanIncrease(t *testing.T) {
	// total_installments goes from 12 → 15 with paid=3; should succeed.
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	total := int64(12)
	paid := int64(3)
	newTotal := int64(15)

	var updatedTotal *int64

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				AccountID:         accountID,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
			}, nil
		},
		updateFn: func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error {
			updatedTotal = upd.TotalInstallments
			return nil
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.UpdateTransaction(txnID, sqlite.UpdateTransaction{TotalInstallments: &newTotal})
	if err != nil {
		t.Fatalf("expected no error increasing total_installments, got: %v", err)
	}
	if updatedTotal == nil || *updatedTotal != newTotal {
		t.Fatalf("expected total_installments=%d to be passed to repo, got %v", newTotal, updatedTotal)
	}
}

func TestUpdateTransaction_TotalInstallments_CannotBecomeLessThanPaid(t *testing.T) {
	// total_installments → 2 with paid=3; should return error.
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	total := int64(12)
	paid := int64(3)
	newTotal := int64(2) // less than paid

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				AccountID:         accountID,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
			}, nil
		},
		updateFn: func(id uuid.UUID, upd sqlite.UpdateTransaction, tx *sql.Tx) error {
			t.Fatal("repo Update should not be called when validation fails")
			return nil
		},
	}
	accRepo := &mockAccountsRepo{}

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	err := svc.UpdateTransaction(txnID, sqlite.UpdateTransaction{TotalInstallments: &newTotal})
	if err == nil {
		t.Fatal("expected error when total_installments < paid_installments, got nil")
	}
	if !strings.Contains(err.Error(), "cannot be less than") {
		t.Fatalf("expected error to contain 'cannot be less than', got: %v", err)
	}
}

func TestDeleteInstallment_ReversesAllPaidInstallments(t *testing.T) {
	db := openTestDB(t)
	txnID := uuid.New()
	accountID := uuid.New()
	startingBalance := int64(100000)
	amount := int64(-5000) // -$50.00 per installment
	total := int64(12)
	paid := int64(3)

	var gotNewBalance int64

	txnsRepo := &mockTransactionsRepo{
		getByIDFn: func(id uuid.UUID) (sqlite.Transaction, error) {
			return sqlite.Transaction{
				ID:                txnID,
				AccountID:         accountID,
				Amount:            amount,
				IsInstallment:     true,
				TotalInstallments: &total,
				PaidInstallments:  paid,
			}, nil
		},
		deleteByIDFn: func(id uuid.UUID, tx *sql.Tx) error { return nil },
	}
	accRepo := newScopedAccountRepo(t, accountID, startingBalance, &gotNewBalance, nil)

	svc := service.NewTransactionsService(db, txnsRepo, accRepo)
	if err := svc.DeleteTransaction(txnID); err != nil {
		t.Fatalf("DeleteTransaction error: %v", err)
	}

	// Reversed: 3 * (-$50) = -$150 removed from balance → balance goes up by $150
	if gotNewBalance != 115000 {
		t.Fatalf("expected new balance 115000 (reversed 3 installments), got %d", gotNewBalance)
	}
}
