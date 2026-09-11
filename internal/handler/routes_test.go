package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ufleck/cibi/internal/service"
)

func TestRoutesRegistersAPIEndpointsWithInjectedServices(t *testing.T) {
	e := newTestEcho()

	SetupRoutes(
		e,
		service.NewAccountsService(nil, nil),
		service.NewTransactionsService(nil, nil, nil, nil),
		service.NewGoalsService(nil, nil, nil),
		service.NewEngineService(nil, nil, nil, nil, nil, nil),
		service.NewPayScheduleService(nil, nil, nil),
		service.NewFriendService(nil),
		service.NewPeerDebtService(nil),
		service.NewGroupEventService(nil, nil),
		service.NewProfileService(nil),
		nil,
		"",
	)

	routes := map[string]bool{}
	for _, route := range e.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	for _, route := range []string{
		"GET /api/accounts",
		"POST /api/accounts",
		"GET /api/accounts/:id",
		"POST /api/check",
		"GET /api/docs",
		"GET /public/friend/:token",
	} {
		if !routes[route] {
			t.Fatalf("expected route %q to be registered", route)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/docs", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/docs status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if rec.Body.Len() == 0 {
		t.Fatal("GET /api/docs returned an empty body")
	}
}
