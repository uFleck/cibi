package handler

import (
	_ "embed"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

//go:embed docs/openapi.yaml
var openAPIYAML []byte

// SetupRoutes registers all application routes on the provided Echo instance.
// Called from internal/app/app.go after echo.New().
func SetupRoutes(e *echo.Echo, accSvc *service.AccountsService, txnsSvc *service.TransactionsService, engineSvc *service.EngineService, psSvc *service.PayScheduleService) {
	ah := NewAccountsHandler(accSvc)
	th := NewTransactionsHandler(txnsSvc)
	ch := NewCheckHandler(engineSvc)
	psh := NewPayScheduleHandler(psSvc, ah.svc)

	api := e.Group("/api")

	acc := api.Group("/accounts")
	acc.GET("", ah.List)
	acc.POST("", ah.Create)
	acc.GET("/default", ah.GetDefault) // legacy shortcut; kept per <specifics>
	acc.GET("/:id", ah.GetByID)
	acc.POST("/:id/set-default", ah.SetDefault)
	acc.PATCH("/:id", ah.Update)
	acc.DELETE("/:id", ah.Delete)

	txn := api.Group("/transactions")
	txn.GET("", th.List)
	txn.POST("", th.Create)
	txn.PATCH("/:id", th.Update)
	txn.DELETE("/:id", th.Delete)

	api.POST("/check", ch.Check)

	ps := api.Group("/pay-schedules")
	ps.POST("", psh.Create)
	ps.GET("", psh.List)
	ps.PATCH("/:id", psh.Update)
	ps.DELETE("/:id", psh.Delete)

	api.GET("/docs", func(c echo.Context) error {
		return c.Blob(http.StatusOK, "application/yaml", openAPIYAML)
	})
}
