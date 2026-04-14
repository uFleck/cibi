package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// --- mock services ---

// mockAccountsService satisfies the AccountsServiceIface for handler tests.
type mockAccountsService struct {
	listFn         func() ([]sqlite.Account, error)
	createFn       func(a sqlite.Account) error
	getDefaultFn   func() (sqlite.Account, error)
	getByIDFn      func(id uuid.UUID) (sqlite.Account, error)
	updateFn       func(id uuid.UUID, name *string, balance *int64) error
	deleteFn       func(id uuid.UUID) error
	setDefaultFn   func(id uuid.UUID) error
}

func (m *mockAccountsService) ListAccounts() ([]sqlite.Account, error) {
	if m.listFn != nil {
		return m.listFn()
	}
	panic("not implemented")
}

func (m *mockAccountsService) CreateAccount(a sqlite.Account) error {
	if m.createFn != nil {
		return m.createFn(a)
	}
	panic("not implemented")
}

func (m *mockAccountsService) GetDefault() (sqlite.Account, error) {
	if m.getDefaultFn != nil {
		return m.getDefaultFn()
	}
	panic("not implemented")
}

func (m *mockAccountsService) GetByID(id uuid.UUID) (sqlite.Account, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(id)
	}
	panic("not implemented")
}

func (m *mockAccountsService) UpdateAccount(id uuid.UUID, name *string, balance *int64) error {
	if m.updateFn != nil {
		return m.updateFn(id, name, balance)
	}
	panic("not implemented")
}

func (m *mockAccountsService) DeleteAccount(id uuid.UUID) error {
	if m.deleteFn != nil {
		return m.deleteFn(id)
	}
	panic("not implemented")
}

func (m *mockAccountsService) SetDefault(id uuid.UUID) error {
	if m.setDefaultFn != nil {
		return m.setDefaultFn(id)
	}
	panic("not implemented")
}

// mockTransactionsService satisfies the TransactionsServiceIface for handler tests.
type mockTransactionsService struct {
	listFn      func(accountID uuid.UUID) ([]sqlite.Transaction, error)
	createFn    func(t sqlite.Transaction) error
	getByIDFn   func(id uuid.UUID) (sqlite.Transaction, error)
	updateFn    func(id uuid.UUID, upd sqlite.UpdateTransaction) error
	deleteFn    func(id uuid.UUID) error
}

func (m *mockTransactionsService) ListTransactions(accountID uuid.UUID) ([]sqlite.Transaction, error) {
	if m.listFn != nil {
		return m.listFn(accountID)
	}
	panic("not implemented")
}

func (m *mockTransactionsService) CreateTransaction(t sqlite.Transaction) error {
	if m.createFn != nil {
		return m.createFn(t)
	}
	panic("not implemented")
}

func (m *mockTransactionsService) GetTransaction(id uuid.UUID) (sqlite.Transaction, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(id)
	}
	panic("not implemented")
}

func (m *mockTransactionsService) UpdateTransaction(id uuid.UUID, upd sqlite.UpdateTransaction) error {
	if m.updateFn != nil {
		return m.updateFn(id, upd)
	}
	panic("not implemented")
}

func (m *mockTransactionsService) DeleteTransaction(id uuid.UUID) error {
	if m.deleteFn != nil {
		return m.deleteFn(id)
	}
	panic("not implemented")
}

// mockEngineService satisfies the EngineServiceIface for handler tests.
type mockEngineService struct {
	canIBuyItDefaultFn func(itemPrice int64) (service.EngineResult, error)
}

func (m *mockEngineService) CanIBuyItDefault(itemPrice int64) (service.EngineResult, error) {
	if m.canIBuyItDefaultFn != nil {
		return m.canIBuyItDefaultFn(itemPrice)
	}
	panic("not implemented")
}

// --- test helpers ---

// newTestEcho creates an *echo.Echo with CustomValidator and CustomHTTPErrorHandler
// registered — mirrors what Plan 02 wires in app.go.
func newTestEcho() *echo.Echo {
	e := echo.New()
	e.Validator = NewCustomValidator()
	e.HTTPErrorHandler = CustomHTTPErrorHandler
	return e
}

// makeRequest creates an HTTP request + ResponseRecorder pair ready for handler
// method calls. body may be empty string for requests without a payload.
func makeRequest(method, path, body string) (*httptest.ResponseRecorder, echo.Context) {
	e := newTestEcho()
	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, bodyReader)
	if body != "" {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return rec, c
}

// makeRequestWithHeaders creates a request with custom headers.
func makeRequestWithHeaders(method, path, body string, headers map[string]string) (*httptest.ResponseRecorder, echo.Context) {
	e := newTestEcho()
	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, bodyReader)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return rec, c
}

// respondJSON is a test helper to trigger the echo error handler via ServeHTTP.
// It registers a route and fires an actual HTTP request through the engine
// so the HTTPErrorHandler middleware runs end-to-end.
func serveRequest(handler echo.HandlerFunc, method, path, body string) *httptest.ResponseRecorder {
	e := newTestEcho()
	e.Add(method, path, handler)
	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, bodyReader)
	if body != "" {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

// httpStatusOK is a tiny sentinel to silence "http imported but not used" lint.
var _ = http.StatusOK
