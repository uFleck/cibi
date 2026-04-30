package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

type mockPayScheduleService struct {
	createFn  func(accountID uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth2 *int, label *string, amount int64) (sqlite.PaySchedule, error)
	listFn    func(accountID uuid.UUID) ([]sqlite.PaySchedule, error)
	updateFn  func(id uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth2 *int, label *string, amount int64) error
	deleteFn  func(id uuid.UUID) error
	confirmFn func(id uuid.UUID) (sqlite.PaySchedule, error)
}

func (m *mockPayScheduleService) CreatePaySchedule(accountID uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth2 *int, label *string, amount int64) (sqlite.PaySchedule, error) {
	if m.createFn != nil {
		return m.createFn(accountID, frequency, anchorDate, dayOfMonth2, label, amount)
	}
	return sqlite.PaySchedule{}, nil
}

func (m *mockPayScheduleService) ListPaySchedules(accountID uuid.UUID) ([]sqlite.PaySchedule, error) {
	if m.listFn != nil {
		return m.listFn(accountID)
	}
	return []sqlite.PaySchedule{}, nil
}

func (m *mockPayScheduleService) UpdatePaySchedule(id uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth2 *int, label *string, amount int64) error {
	if m.updateFn != nil {
		return m.updateFn(id, frequency, anchorDate, dayOfMonth2, label, amount)
	}
	return nil
}

func (m *mockPayScheduleService) DeletePaySchedule(id uuid.UUID) error {
	if m.deleteFn != nil {
		return m.deleteFn(id)
	}
	return nil
}

func (m *mockPayScheduleService) ConfirmPayday(id uuid.UUID) (sqlite.PaySchedule, error) {
	if m.confirmFn != nil {
		return m.confirmFn(id)
	}
	return sqlite.PaySchedule{}, nil
}

func TestPayScheduleHandler_Confirm_Success(t *testing.T) {
	scheduleID := uuid.New()
	accountID := uuid.New()

	mock := &mockPayScheduleService{
		confirmFn: func(id uuid.UUID) (sqlite.PaySchedule, error) {
			if id != scheduleID {
				t.Fatalf("unexpected schedule id: %v", id)
			}
			return sqlite.PaySchedule{
				ID:         scheduleID,
				AccountID:  accountID,
				Frequency:  "monthly",
				AnchorDate: time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC),
				Amount:     250000,
			}, nil
		},
	}

	h := &PayScheduleHandler{svc: mock}
	rec, c := makeRequest(http.MethodPost, "/api/pay-schedule/"+scheduleID.String()+"/confirm", "")
	c.SetParamNames("id")
	c.SetParamValues(scheduleID.String())

	if err := h.Confirm(c); err != nil {
		t.Fatalf("Confirm returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp PayScheduleResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.ID != scheduleID.String() {
		t.Fatalf("expected id %s, got %s", scheduleID.String(), resp.ID)
	}
}

func TestPayScheduleHandler_Confirm_InvalidID(t *testing.T) {
	h := &PayScheduleHandler{svc: &mockPayScheduleService{}}
	rec := serveRequest(func(c echo.Context) error {
		return h.Confirm(c)
	}, http.MethodPost, "/api/pay-schedule/not-a-uuid/confirm", "")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestPayScheduleHandler_Confirm_NotFound(t *testing.T) {
	scheduleID := uuid.New()
	mock := &mockPayScheduleService{
		confirmFn: func(id uuid.UUID) (sqlite.PaySchedule, error) {
			return sqlite.PaySchedule{}, sql.ErrNoRows
		},
	}
	h := &PayScheduleHandler{svc: mock}

	rec := serveRequest(func(c echo.Context) error {
		c.SetParamNames("id")
		c.SetParamValues(scheduleID.String())
		return h.Confirm(c)
	}, http.MethodPost, "/api/pay-schedule/"+scheduleID.String()+"/confirm", "")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestPayScheduleHandler_Create_ConvertsAmountToCents(t *testing.T) {
	accountID := uuid.New()
	var gotAmount int64

	mock := &mockPayScheduleService{
		createFn: func(aid uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth2 *int, label *string, amount int64) (sqlite.PaySchedule, error) {
			gotAmount = amount
			return sqlite.PaySchedule{
				ID:          uuid.New(),
				AccountID:   aid,
				Frequency:   frequency,
				AnchorDate:  anchorDate,
				DayOfMonth2: dayOfMonth2,
				Label:       label,
				Amount:      amount,
			}, nil
		},
	}

	h := &PayScheduleHandler{svc: mock}
	body := `{"account_id":"` + accountID.String() + `","frequency":"monthly","anchor_date":"2026-04-10","amount":1234.56}`
	rec := serveRequest(h.Create, http.MethodPost, "/api/pay-schedule", body)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if gotAmount != 123456 {
		t.Fatalf("expected 123456 cents, got %d", gotAmount)
	}

	var resp PayScheduleResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Amount != 1234.56 {
		t.Fatalf("expected response amount 1234.56, got %.2f", resp.Amount)
	}
}

func TestPayScheduleHandler_Update_ConvertsAmountToCents(t *testing.T) {
	scheduleID := uuid.New()
	var gotAmount int64
	var gotAnchor time.Time

	mock := &mockPayScheduleService{
		updateFn: func(id uuid.UUID, frequency string, anchorDate time.Time, dayOfMonth2 *int, label *string, amount int64) error {
			if id != scheduleID {
				t.Fatalf("unexpected id: %v", id)
			}
			gotAmount = amount
			gotAnchor = anchorDate
			return nil
		},
	}

	h := &PayScheduleHandler{svc: mock}
	body := `{"frequency":"monthly","anchor_date":"2026-03-15","amount":99.99}`
	rec := serveRequest(func(c echo.Context) error {
		c.SetParamNames("id")
		c.SetParamValues(scheduleID.String())
		return h.Update(c)
	}, http.MethodPatch, "/api/pay-schedule/"+scheduleID.String(), body)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
	if gotAmount != 9999 {
		t.Fatalf("expected 9999 cents, got %d", gotAmount)
	}
	if gotAnchor.Format("2006-01-02") != "2026-03-15" {
		t.Fatalf("expected anchor 2026-03-15, got %s", gotAnchor.Format("2006-01-02"))
	}
}
